import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { isValidVariantKey } from '@mydexpogo/shared';
import { z } from 'zod';
import { requireRole, type AuthEnv } from '../auth.js';
import { dataService } from '../data/service.js';
import { feedService } from '../feed/service.js';
import { db, schema } from '../db/index.js';

/** Public: the generated dataset, the event archive, and the freshness status. */
export const dataRoutes = new Hono<AuthEnv>()
  .get('/pokedex.json', async (c) => {
    const served = await dataService.getServed();
    if (!served) return c.json({ error: 'dataset_not_ready', status: dataService.getStatus() }, 503);
    if (c.req.header('if-none-match') === served.etag) return c.body(null, 304);
    c.header('etag', served.etag);
    c.header('cache-control', 'no-cache'); // always revalidate: the ETag makes it a cheap 304
    c.header('content-type', 'application/json; charset=utf-8');
    return c.body(served.body);
  })
  .get('/events-archive.json', (c) => {
    c.header('cache-control', 'no-cache');
    c.header('content-type', 'application/json; charset=utf-8');
    return c.body(dataService.getEventsBody());
  })
  .get('/status', (c) => c.json({ ...dataService.getStatus(), feed: feedService.status }))
  .post('/refresh', requireRole('admin'), async (c) => {
    const started = await dataService.refresh(`manual by ${c.get('user').username}`);
    return c.json({ started, status: dataService.getStatus() }, started ? 202 : 409);
  });

const overrideBody = z.object({
  released: z.boolean().nullable().optional(),
  label: z.object({ en: z.string().trim().min(1).max(60), fr: z.string().trim().max(60).optional() }).nullable().optional(),
});

/** Managers: force a variant released / not released, or rename it. */
export const overrideRoutes = new Hono<AuthEnv>()
  .get('/', async (c) => {
    const rows = await db
      .select({ o: schema.variantOverrides, by: schema.users.username })
      .from(schema.variantOverrides)
      .leftJoin(schema.users, eq(schema.users.id, schema.variantOverrides.updatedBy))
      .orderBy(sql`${schema.variantOverrides.updatedAt} desc`);
    return c.json({
      overrides: rows.map(({ o, by }) => ({ variantKey: o.variantKey, released: o.released, label: o.labelEn ? { en: o.labelEn, fr: o.labelFr ?? undefined } : null, updatedBy: by, updatedAt: o.updatedAt.toISOString() })),
    });
  })
  .put('/:key', requireRole('manager'), zValidator('json', overrideBody), async (c) => {
    const key = c.req.param('key');
    if (!isValidVariantKey(key)) return c.json({ error: 'invalid_variant_key' }, 400);
    const body = c.req.valid('json');
    const values = {
      variantKey: key,
      released: body.released ?? null,
      labelEn: body.label?.en ?? null,
      labelFr: body.label?.fr ?? null,
      updatedBy: c.get('user').id,
      updatedAt: new Date(),
    };
    if (values.released === null && !values.labelEn) {
      await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key));
    } else {
      await db.insert(schema.variantOverrides).values(values).onConflictDoUpdate({ target: schema.variantOverrides.variantKey, set: values });
    }
    dataService.invalidateOverrides();
    return c.json({ ok: true });
  })
  .delete('/:key', requireRole('manager'), async (c) => {
    await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, c.req.param('key')));
    dataService.invalidateOverrides();
    return c.json({ ok: true });
  });

/** Admin: promote or demote accounts. */
export const userRoutes = new Hono<AuthEnv>()
  .use(requireRole('admin'))
  .get('/', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const rows = await db
      .select({ id: schema.users.id, username: schema.users.username, role: schema.users.role, createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(q ? sql`lower(${schema.users.username}) like lower(${'%' + q + '%'})` : sql`${schema.users.role} <> 'user'`)
      .orderBy(schema.users.username)
      .limit(50);
    return c.json({ users: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })) });
  })
  .patch('/:id/role', zValidator('json', z.object({ role: z.enum(['user', 'manager', 'admin']) })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    if (id === me.id) return c.json({ error: 'self' }, 400);
    const [u] = await db.update(schema.users).set({ role: c.req.valid('json').role }).where(eq(schema.users.id, id)).returning();
    if (!u) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true, role: u.role });
  });
