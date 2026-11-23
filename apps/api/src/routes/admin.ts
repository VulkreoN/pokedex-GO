import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { isValidVariantKey } from '@mydexpogo/shared';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthEnv } from '../auth.js';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';
import { resetPromoCache } from '../game/promo.js';
import { resetPvpokeCache } from '../game/pvpRankings.js';
import { resetResearchCache } from '../game/research.js';
import { audit } from '../lib/audit.js';
import { sourceHealth, type SourceName } from '../lib/health.js';
import { hashToken, newId } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { hub } from '../notify/hub.js';
import { pushToUser } from '../notify/push.js';
import { runRaidAlerts } from '../notify/raidAlerts.js';
import { notifyAccount } from '../notify/service.js';
import { overrideState } from './data.js';

const started = Date.now();
const count = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
const n = sql<number>`count(*)`.mapWith(Number);
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Admins only: the panel in "Me". */
export const adminRoutes = new Hono<AuthEnv>()
  .use(requireRole('admin'))

  /* ---------- Dashboard ---------- */
  .get('/stats', async (c) => {
    const days = (d: number) => new Date(Date.now() - d * 86_400_000);
    const [users, active7, active30, lists, entries, friendships, pushDevices, raidAlerts7, errorsToday, openReports, weeks] = await Promise.all([
      count(db.select({ n }).from(schema.users)),
      count(db.select({ n }).from(schema.users).where(gt(schema.users.lastSeenAt, days(7)))),
      count(db.select({ n }).from(schema.users).where(gt(schema.users.lastSeenAt, days(30)))),
      count(db.select({ n }).from(schema.lists)),
      count(db.select({ n }).from(schema.listEntries)),
      count(db.select({ n }).from(schema.friendships)),
      count(db.select({ n }).from(schema.pushSubscriptions)),
      count(db.select({ n }).from(schema.raidAlerts).where(gt(schema.raidAlerts.alertedAt, days(7)))),
      count(db.select({ n }).from(schema.clientErrors).where(gt(schema.clientErrors.lastSeen, days(1)))),
      count(db.select({ n }).from(schema.reports).where(eq(schema.reports.status, 'open'))),
      // Sign-ups per week, the last 8 weeks (oldest first, weeks without any included).
      db.execute<{ week: string; n: number }>(sql`
        select to_char(w.week, 'YYYY-MM-DD') as week, count(u.id)::int as n
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as w(week)
        left join users u on date_trunc('week', u.created_at) = w.week
        group by w.week order by w.week`),
    ]);
    return c.json({ users, active7, active30, lists, entries, friendships: Math.round(friendships / 2), pushDevices, raidAlerts7, errorsToday, openReports, signupsByWeek: [...weeks].map((w) => ({ week: w.week, n: Number(w.n) })) });
  })

  /* ---------- Health ---------- */
  .get('/health', (c) => {
    const data = dataService.getStatus();
    return c.json({ version: env.appVersion, startedAt: new Date(started).toISOString(), dataset: data, sources: sourceHealth() });
  })
  .post('/health/:source/refresh', async (c) => {
    const source = c.req.param('source') as SourceName;
    const me = c.get('user');
    const run: Partial<Record<SourceName, () => Promise<unknown>>> = {
      dataset: () => dataService.refresh(`manual by ${me.username}`),
      promo: async () => resetPromoCache(),
      research: async () => resetResearchCache(),
      pvpoke: async () => resetPvpokeCache(),
      raids: () => runRaidAlerts(),
    };
    if (!run[source]) return c.json({ error: 'not_found' }, 404);
    try {
      await run[source]!();
    } catch (e) {
      return c.json({ error: 'failed', message: (e as Error).message }, 502);
    }
    await audit(me.id, 'source.refresh', 'source', source);
    return c.json({ ok: true });
  })

  /* ---------- Accounts ---------- */
  .get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) return c.json({ error: 'not_found' }, 404);
    const [lists, entries, friends, sessions, devices, pvp] = await Promise.all([
      count(db.select({ n }).from(schema.lists).where(eq(schema.lists.ownerId, id))),
      count(db.select({ n }).from(schema.listEntries).innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId)).where(eq(schema.lists.ownerId, id))),
      count(db.select({ n }).from(schema.friendships).where(eq(schema.friendships.userId, id))),
      count(db.select({ n }).from(schema.sessions).where(and(eq(schema.sessions.userId, id), gt(schema.sessions.expiresAt, new Date())))),
      count(db.select({ n }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, id))),
      count(db.select({ n }).from(schema.pvpPokemon).where(eq(schema.pvpPokemon.userId, id))),
    ]);
    return c.json({
      user: { id: u.id, username: u.username, role: u.role, friendCode: u.friendCode, createdAt: u.createdAt.toISOString(), lastSeenAt: iso(u.lastSeenAt), suspendedAt: iso(u.suspendedAt) },
      counts: { lists, entries, friends, sessions, devices, pvp },
    });
  })
  .post('/users/:id/logout', async (c) => {
    const id = c.req.param('id');
    const [u] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) return c.json({ error: 'not_found' }, 404);
    const gone = await db.delete(schema.sessions).where(eq(schema.sessions.userId, id)).returning({ id: schema.sessions.id });
    await audit(c.get('user').id, 'user.logout_all', 'user', id, { username: u.username, sessions: gone.length });
    await notifyAccount(id, c.get('user').id, 'logout_all');
    return c.json({ ok: true, sessions: gone.length });
  })
  .post('/users/:id/suspend', zValidator('json', z.object({ suspended: z.boolean() })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    if (id === me.id) return c.json({ error: 'self' }, 400);
    const { suspended } = c.req.valid('json');
    const [u] = await db.update(schema.users).set({ suspendedAt: suspended ? new Date() : null }).where(eq(schema.users.id, id)).returning({ username: schema.users.username, role: schema.users.role });
    if (!u) return c.json({ error: 'not_found' }, 404);
    if (suspended) await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    await audit(me.id, suspended ? 'user.suspend' : 'user.unsuspend', 'user', id, { username: u.username });
    if (!suspended) await notifyAccount(id, me.id, 'unsuspended');
    return c.json({ ok: true });
  })
  .delete('/users/:id', async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    if (id === me.id) return c.json({ error: 'self' }, 400);
    const [u] = await db.select({ username: schema.users.username, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) return c.json({ error: 'not_found' }, 404);
    if (u.role === 'admin') return c.json({ error: 'admin' }, 400); // demote first: no admin removes another by mistake
    await db.delete(schema.users).where(eq(schema.users.id, id));
    await audit(me.id, 'user.delete', 'user', id, { username: u.username });
    return c.json({ ok: true });
  })

  /* ---------- Sign-ups ---------- */
  .get('/signups', async (c) => {
    const invites = await db.select().from(schema.inviteCodes).orderBy(desc(schema.inviteCodes.createdAt)).limit(50);
    return c.json({
      settings: await getSetting('signups'),
      invites: invites.map((i) => ({ id: i.id, note: i.note, maxUses: i.maxUses, uses: i.uses, expiresAt: iso(i.expiresAt), createdAt: i.createdAt.toISOString() })),
    });
  })
  .put('/signups', zValidator('json', z.object({ mode: z.enum(['open', 'invite', 'closed']), dailyCap: z.number().int().min(1).max(10000).nullable() })), async (c) => {
    const before = await getSetting('signups');
    const after = c.req.valid('json');
    await setSetting('signups', after, c.get('user').id);
    await audit(c.get('user').id, 'settings.signups', 'settings', 'signups', { before, after });
    return c.json({ settings: after });
  })
  .post('/invites', zValidator('json', z.object({ note: z.string().trim().max(60).optional(), maxUses: z.number().int().min(1).max(100).default(1), days: z.number().int().min(1).max(90).default(14) })), async (c) => {
    const b = c.req.valid('json');
    const code = randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-');
    const id = newId();
    await db.insert(schema.inviteCodes).values({ id, codeHash: hashToken(code.replace(/-/g, '')), note: b.note || null, maxUses: b.maxUses, expiresAt: new Date(Date.now() + b.days * 86_400_000), createdBy: c.get('user').id });
    await audit(c.get('user').id, 'invite.create', 'invite', id, { note: b.note ?? null, maxUses: b.maxUses, days: b.days });
    return c.json({ id, code }, 201);
  })
  .delete('/invites/:id', async (c) => {
    await db.delete(schema.inviteCodes).where(eq(schema.inviteCodes.id, c.req.param('id')));
    await audit(c.get('user').id, 'invite.delete', 'invite', c.req.param('id'));
    return c.json({ ok: true });
  })

  /* ---------- Journal ---------- */
  .get('/audit', async (c) => {
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
    const rows = await db
      .select({ a: schema.auditLog, actor: schema.users.username })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(50)
      .offset(offset);
    return c.json({
      entries: rows.map(({ a, actor }) => ({ id: a.id, actor, action: a.action, targetType: a.targetType, targetId: a.targetId, data: a.data, createdAt: a.createdAt.toISOString(), undoneAt: iso(a.undoneAt), undoable: a.action.startsWith('override.') && !a.undoneAt })),
      offset,
    });
  })
  /** Puts a variant correction back as it was before this entry. */
  .post('/audit/:id/undo', async (c) => {
    const [e] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.id, c.req.param('id'))).limit(1);
    if (!e || !e.action.startsWith('override.') || e.undoneAt || !e.targetId) return c.json({ error: 'not_undoable' }, 400);
    const key = e.targetId;
    const before = e.data.before as ReturnType<typeof overrideState> | null;
    const [current] = await db.select().from(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key)).limit(1);
    if (!before) await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key));
    else {
      const values = { variantKey: key, released: before.released, labelEn: before.label?.en ?? null, labelFr: before.label?.fr ?? null, genders: before.genders, updatedBy: c.get('user').id, updatedAt: new Date() };
      await db.insert(schema.variantOverrides).values(values).onConflictDoUpdate({ target: schema.variantOverrides.variantKey, set: values });
    }
    dataService.invalidateOverrides();
    await db.update(schema.auditLog).set({ undoneAt: new Date() }).where(eq(schema.auditLog.id, e.id));
    await audit(c.get('user').id, 'override.undo', 'variant', key, { before: current ? overrideState(current) : null, after: before, undoes: e.id });
    return c.json({ ok: true });
  })

  /* ---------- Announcements ---------- */
  .get('/announcements', async (c) => {
    const rows = await db.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt)).limit(30);
    const [devices] = await db.select({ n: sql<number>`count(distinct ${schema.pushSubscriptions.userId})`.mapWith(Number) }).from(schema.pushSubscriptions);
    return c.json({ announcements: rows.map(publicAnnouncement), pushAccounts: devices?.n ?? 0 });
  })
  .post('/announcements', zValidator('json', z.object({ message: z.string().trim().min(3).max(280), level: z.enum(['info', 'warning']).default('info'), link: z.string().trim().max(200).regex(/^(\/|https:\/\/)/).optional(), push: z.boolean().default(false) })), async (c) => {
    const me = c.get('user');
    const b = c.req.valid('json');
    const id = newId();
    // One live banner at a time: a new one replaces the previous.
    await db.update(schema.announcements).set({ active: false }).where(eq(schema.announcements.active, true));
    await db.insert(schema.announcements).values({ id, message: b.message, level: b.level, link: b.link ?? null, createdBy: me.id });
    hub.emit(await everyone(), { type: 'announcement' });
    let pushed = 0;
    if (b.push) {
      // Each account once, and only accounts that kept announcements on.
      const accounts = await db.selectDistinct({ id: schema.pushSubscriptions.userId, prefs: schema.users.notifyPrefs }).from(schema.pushSubscriptions).innerJoin(schema.users, eq(schema.users.id, schema.pushSubscriptions.userId));
      for (const a of accounts) {
        if (a.prefs.announcement === false) continue;
        pushed += await pushToUser(a.id, { title: 'MyDexPoGo', body: b.message, url: b.link ?? '/', tag: `announcement-${id}` }).catch(() => 0);
      }
      await db.update(schema.announcements).set({ pushedAt: new Date(), pushCount: pushed }).where(eq(schema.announcements.id, id));
    }
    await audit(me.id, 'announcement.create', 'announcement', id, { message: b.message, push: b.push, pushed });
    return c.json({ id, pushed }, 201);
  })
  .patch('/announcements/:id', zValidator('json', z.object({ active: z.boolean() })), async (c) => {
    const { active } = c.req.valid('json');
    if (active) await db.update(schema.announcements).set({ active: false }).where(eq(schema.announcements.active, true));
    await db.update(schema.announcements).set({ active }).where(eq(schema.announcements.id, c.req.param('id')));
    hub.emit(await everyone(), { type: 'announcement' });
    await audit(c.get('user').id, active ? 'announcement.show' : 'announcement.hide', 'announcement', c.req.param('id'));
    return c.json({ ok: true });
  });

async function everyone(): Promise<string[]> {
  return (await db.select({ id: schema.users.id }).from(schema.users)).map((u) => u.id);
}

const publicAnnouncement = (a: typeof schema.announcements.$inferSelect) => ({ id: a.id, message: a.message, level: a.level, link: a.link, active: a.active, createdAt: a.createdAt.toISOString(), pushedAt: iso(a.pushedAt), pushCount: a.pushCount });

/** Public: the banner everyone sees. */
export const announcementRoutes = new Hono<AuthEnv>().get('/', async (c) => {
  const [a] = await db.select().from(schema.announcements).where(eq(schema.announcements.active, true)).orderBy(desc(schema.announcements.createdAt)).limit(1);
  c.header('cache-control', 'no-cache');
  return c.json({ announcement: a ? publicAnnouncement(a) : null });
});

/** Players report a data mistake on a Pokémon page; managers handle the reports. */
export const reportRoutes = new Hono<AuthEnv>()
  .post('/', requireAuth, rateLimit({ windowMs: 60 * 60_000, max: 20 }), zValidator('json', z.object({ variantKey: z.string().refine(isValidVariantKey), kind: z.enum(['name', 'released', 'gender', 'picture', 'other']), message: z.string().trim().max(300).optional() })), async (c) => {
    const b = c.req.valid('json');
    const id = newId();
    await db.insert(schema.reports).values({ id, userId: c.get('user').id, variantKey: b.variantKey, kind: b.kind, message: b.message || null });
    return c.json({ id }, 201);
  })
  .get('/', requireRole('manager'), async (c) => {
    const status = c.req.query('status') === 'handled' ? 'handled' : 'open';
    const rows = await db
      .select({ r: schema.reports, by: schema.users.username })
      .from(schema.reports)
      .leftJoin(schema.users, eq(schema.users.id, schema.reports.userId))
      .where(status === 'open' ? eq(schema.reports.status, 'open') : isNotNull(schema.reports.handledAt))
      .orderBy(desc(schema.reports.createdAt))
      .limit(100);
    return c.json({ reports: rows.map(({ r, by }) => ({ id: r.id, variantKey: r.variantKey, kind: r.kind, message: r.message, status: r.status, by, createdAt: r.createdAt.toISOString(), handledAt: iso(r.handledAt) })) });
  })
  .patch('/:id', requireRole('manager'), zValidator('json', z.object({ status: z.enum(['resolved', 'dismissed', 'open']) })), async (c) => {
    const { status } = c.req.valid('json');
    const open = status === 'open';
    const [r] = await db.update(schema.reports).set({ status, handledBy: open ? null : c.get('user').id, handledAt: open ? null : new Date() }).where(eq(schema.reports.id, c.req.param('id'))).returning();
    if (!r) return c.json({ error: 'not_found' }, 404);
    await audit(c.get('user').id, `report.${status}`, 'variant', r.variantKey, { kind: r.kind, message: r.message });
    return c.json({ ok: true });
  });
