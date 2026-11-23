import { zValidator } from '@hono/zod-validator';
import { desc, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireRole, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { rateLimit } from '../lib/ratelimit.js';

/** Kept for a month; the same error seen again only bumps its count and date. */
const KEEP_DAYS = 30;

const report = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().max(500).optional(),
  appVersion: z.string().max(64).optional(),
});

/** Same bug, same row: message and the first stack frame without its line/column (they move with each build). */
export function errorId(message: string, stack?: string): string {
  const frame = (stack ?? '').split('\n').find((l) => /\bat\b|@/.test(l))?.replace(/:\d+:\d+\)?$/, '').replace(/-[A-Za-z0-9_-]{8}\.js/, '.js') ?? '';
  return createHash('sha256').update(`${message}\n${frame.trim()}`).digest('hex').slice(0, 24);
}

/** JavaScript errors from players' browsers: anyone can report (rate-limited), admins read and clear. */
export const clientErrorRoutes = new Hono<AuthEnv>()
  .post('/', rateLimit({ windowMs: 10 * 60_000, max: 20 }), zValidator('json', report), async (c) => {
    const r = c.req.valid('json');
    // Only the path: a query string or a share token has no place in an error log.
    let url: string | null = null;
    try {
      url = r.url ? new URL(r.url).pathname.replace(/^\/s\/[^/]+/, '/s/…') : null;
    } catch {}
    const values = {
      id: errorId(r.message, r.stack),
      message: r.message,
      stack: r.stack ?? null,
      url,
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
      appVersion: r.appVersion ?? null,
    };
    await db
      .insert(schema.clientErrors)
      .values(values)
      .onConflictDoUpdate({ target: schema.clientErrors.id, set: { count: sql`${schema.clientErrors.count} + 1`, lastSeen: sql`now()`, url, userAgent: values.userAgent, appVersion: values.appVersion } });
    return c.json({ ok: true });
  })
  .get('/', requireRole('admin'), async (c) => {
    await db.delete(schema.clientErrors).where(lt(schema.clientErrors.lastSeen, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
    const rows = await db.select().from(schema.clientErrors).orderBy(desc(schema.clientErrors.lastSeen)).limit(50);
    return c.json({ errors: rows.map((e) => ({ ...e, firstSeen: e.firstSeen.toISOString(), lastSeen: e.lastSeen.toISOString() })) });
  })
  .delete('/', requireRole('admin'), async (c) => {
    await db.delete(schema.clientErrors);
    return c.json({ ok: true });
  });
