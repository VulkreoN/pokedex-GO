import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { isValidVariantKey } from '@mydexpogo/shared';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthEnv } from '../auth.js';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';
import { feedService } from '../feed/service.js';
import { resetEventDetailsCache } from '../game/eventDetails.js';
import { resetPromoCache } from '../game/promo.js';
import { resetPvpokeCache } from '../game/pvpRankings.js';
import { resetResearchCache } from '../game/research.js';
import { audit } from '../lib/audit.js';
import { sourceHealth, type SourceName } from '../lib/health.js';
import { hashToken, newFriendCode, newId, normalizeFriendCode } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { hub } from '../notify/hub.js';
import { runHuntAlerts } from '../notify/huntAlerts.js';
import { pushToUser } from '../notify/push.js';
import { runRaidAlerts } from '../notify/raidAlerts.js';
import { notifyAccount, notifyStaff } from '../notify/service.js';
import { overrideState } from './data.js';
import { alias } from 'drizzle-orm/pg-core';
import { TRASH_DAYS, restoreList, trashList } from '../lib/trash.js';
import { restoreAccount, trashAccount } from '../lib/accountTrash.js';

/** Accounts, collections, Pokédex corrections, or the rest of the admin work. */
function auditWhere(kind: string | undefined) {
  const a = schema.auditLog.action;
  return kind === 'accounts' ? sql`(${a} like 'account.%' or ${a} like 'user.%')`
    : kind === 'lists' ? sql`${a} like 'list.%'`
    : kind === 'data' ? sql`(${a} like 'override.%' or ${a} like 'report.%')`
    : kind === 'admin' ? sql`not (${a} like 'account.%' or ${a} like 'user.%' or ${a} like 'list.%' or ${a} like 'override.%' or ${a} like 'report.%')`
    : undefined;
}

/** After an account comes back: its deletion is marked undone in the journal, the restore journaled, the player told. */
async function accountRestored(id: string, username: string, adminId: string) {
  await db.update(schema.auditLog).set({ undoneAt: new Date() }).where(and(inArray(schema.auditLog.action, ['user.delete', 'account.delete']), eq(schema.auditLog.targetId, id), sql`${schema.auditLog.undoneAt} is null`));
  await audit(adminId, 'user.restore', 'user', id, { username });
  await notifyAccount(id, adminId, 'restored');
}

/** The journal line of a collection's deletion shows it was brought back. */
const markListDeleteUndone = (listId: string) =>
  db.update(schema.auditLog).set({ undoneAt: new Date() }).where(and(eq(schema.auditLog.action, 'list.delete'), eq(schema.auditLog.targetId, listId), sql`${schema.auditLog.undoneAt} is null`));

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
    const [users, active7, active30, lists, entries, friendships, luckyFriends, pvpTeams, pushDevices, raidAlerts7, errorsToday, openReports, pendingFeed, weeks] = await Promise.all([
      count(db.select({ n }).from(schema.users)),
      count(db.select({ n }).from(schema.users).where(gt(schema.users.lastSeenAt, days(7)))),
      count(db.select({ n }).from(schema.users).where(gt(schema.users.lastSeenAt, days(30)))),
      count(db.select({ n }).from(schema.lists)),
      count(db.select({ n }).from(schema.listEntries)),
      count(db.select({ n }).from(schema.friendships)),
      count(db.select({ n }).from(schema.friendships).where(eq(schema.friendships.lucky, true))),
      count(db.select({ n }).from(schema.pvpTeams)),
      count(db.select({ n }).from(schema.pushSubscriptions)),
      count(db.select({ n }).from(schema.raidAlerts).where(gt(schema.raidAlerts.alertedAt, days(7)))),
      count(db.select({ n }).from(schema.clientErrors).where(gt(schema.clientErrors.lastSeen, days(1)))),
      count(db.select({ n }).from(schema.reports).where(eq(schema.reports.status, 'open'))),
      count(db.select({ n }).from(schema.feedItems).where(eq(schema.feedItems.status, 'new'))),
      // Sign-ups per week, the last 8 weeks (oldest first, weeks without any included).
      db.execute<{ week: string; n: number }>(sql`
        select to_char(w.week, 'YYYY-MM-DD') as week, count(u.id)::int as n
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as w(week)
        left join users u on date_trunc('week', u.created_at) = w.week
        group by w.week order by w.week`),
    ]);
    return c.json({
      users,
      active7,
      active30,
      lists,
      entries,
      friendships: Math.round(friendships / 2),
      luckyFriends,
      pvpTeams,
      pushDevices,
      raidAlerts7,
      errorsToday,
      openReports,
      pendingFeed,
      signupsByWeek: [...weeks].map((w) => ({ week: w.week, n: Number(w.n) })),
    });
  })

  /* ---------- Health ---------- */
  .get('/health', async (c) => {
    const data = dataService.getStatus();
    let dbSizeMb: number | null = null;
    try {
      const [row] = [...(await db.execute<{ bytes: string }>(sql`select pg_database_size(current_database())::text as bytes`))];
      if (row?.bytes) dbSizeMb = Math.round((Number(row.bytes) / 1_048_576) * 10) / 10;
    } catch {}
    return c.json({
      version: env.appVersion,
      startedAt: new Date(started).toISOString(),
      dataset: data,
      sources: sourceHealth(),
      runtime: {
        memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
        dbSizeMb,
        sseConnections: hub.connections(),
      },
    });
  })
  .post('/health/:source/refresh', async (c) => {
    const source = c.req.param('source') as SourceName;
    const me = c.get('user');
    const run: Partial<Record<SourceName, () => Promise<unknown>>> = {
      dataset: () => dataService.refresh(`manual by ${me.username}`),
      promo: async () => resetPromoCache(),
      research: async () => resetResearchCache(),
      pvpoke: async () => resetPvpokeCache(),
      events: async () => resetEventDetailsCache(),
      raids: () => runRaidAlerts(),
      hunts: () => runHuntAlerts(),
      feed: () => feedService.poll(`manual by ${me.username}`),
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
  /** Sends a test Web Push to the current admin's subscribed devices to verify VAPID/SW delivery. */
  .post('/push-test', async (c) => {
    const me = c.get('user');
    const sent = await pushToUser(me.id, {
      title: 'MyDexPoGo · Test',
      body: 'Les notifications push fonctionnent sur cet appareil.',
      url: '/admin?tab=health',
      tag: 'admin-push-test',
    });
    return c.json({ sent });
  })

  /* ---------- Accounts ---------- */
  .get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) return c.json({ error: 'not_found' }, 404);
    const [lists, entries, friends, sessions, devices, pvp, pvpTeams] = await Promise.all([
      count(db.select({ n }).from(schema.lists).where(eq(schema.lists.ownerId, id))),
      count(db.select({ n }).from(schema.listEntries).innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId)).where(eq(schema.lists.ownerId, id))),
      count(db.select({ n }).from(schema.friendships).where(eq(schema.friendships.userId, id))),
      count(db.select({ n }).from(schema.sessions).where(and(eq(schema.sessions.userId, id), gt(schema.sessions.expiresAt, new Date())))),
      count(db.select({ n }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, id))),
      count(db.select({ n }).from(schema.pvpPokemon).where(eq(schema.pvpPokemon.userId, id))),
      count(db.select({ n }).from(schema.pvpTeams).where(eq(schema.pvpTeams.userId, id))),
    ]);
    // Its open sessions (which browser, last used) and its friends.
    const [sessionRows, friendRows] = await Promise.all([
      db.select().from(schema.sessions).where(and(eq(schema.sessions.userId, id), gt(schema.sessions.expiresAt, new Date()))).orderBy(desc(schema.sessions.lastUsedAt)).limit(20),
      db.select({ id: schema.users.id, username: schema.users.username }).from(schema.friendships).innerJoin(schema.users, eq(schema.users.id, schema.friendships.friendId)).where(eq(schema.friendships.userId, id)).orderBy(schema.users.username),
    ]);
    // Why and by whom a suspended account was suspended: the latest suspension in the journal.
    const [why] = u.suspendedAt
      ? await db.select({ data: schema.auditLog.data, by: schema.users.username }).from(schema.auditLog).leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId)).where(and(eq(schema.auditLog.action, 'user.suspend'), eq(schema.auditLog.targetId, id))).orderBy(desc(schema.auditLog.createdAt)).limit(1)
      : [];
    return c.json({
      user: { id: u.id, username: u.username, role: u.role, friendCode: u.friendCode, createdAt: u.createdAt.toISOString(), lastSeenAt: iso(u.lastSeenAt), suspendedAt: iso(u.suspendedAt), suspendedUntil: iso(u.suspendedUntil), suspendedBy: why?.by ?? null, suspendReason: (why?.data.reason as string | null | undefined) ?? null },
      sessions: sessionRows.map((s) => ({ createdAt: s.createdAt.toISOString(), lastUsedAt: iso(s.lastUsedAt), expiresAt: s.expiresAt.toISOString(), userAgent: s.userAgent })),
      friends: friendRows,
      counts: { lists, entries, friends, sessions, devices, pvp, pvpTeams },
    });
  })
  /**
   * Renames an account, or changes its friend code: one typed in, or a new random one ("random"). Both must be free.
   * The player is told; friends made before stay friends.
   */
  .patch('/users/:id', zValidator('json', z.object({ username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(), friendCode: z.string().max(40).optional() })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    const b = c.req.valid('json');
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) return c.json({ error: 'not_found' }, 404);
    if (b.username !== undefined && b.username !== u.username) {
      const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.username}) = lower(${b.username}) and ${schema.users.id} <> ${id}`).limit(1);
      if (taken) return c.json({ error: 'username_taken' }, 409);
      try {
        await db.update(schema.users).set({ username: b.username }).where(eq(schema.users.id, id));
      } catch {
        return c.json({ error: 'username_taken' }, 409);
      }
      await audit(me.id, 'user.rename', 'user', id, { username: b.username, before: u.username, after: b.username });
      if (id !== me.id) await notifyAccount(id, me.id, 'renamed', { value: b.username });
    }
    if (b.friendCode !== undefined) {
      const random = b.friendCode === 'random';
      let code = random ? newFriendCode() : normalizeFriendCode(b.friendCode);
      if (!code) return c.json({ error: 'invalid_code' }, 400);
      if (code !== u.friendCode) {
        for (let i = 0; ; i++) {
          const [clash] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.friendCode, code)).limit(1);
          if (!clash) break;
          if (!random || i > 5) return c.json({ error: 'friend_code_taken' }, 409);
          code = newFriendCode();
        }
        try {
          await db.update(schema.users).set({ friendCode: code }).where(eq(schema.users.id, id));
        } catch {
          return c.json({ error: 'friend_code_taken' }, 409);
        }
        await audit(me.id, 'user.friend_code', 'user', id, { username: b.username ?? u.username, before: u.friendCode, after: code, random });
        if (id !== me.id) await notifyAccount(id, me.id, 'friend_code', { value: code.replace(/(\d{4})(?=\d)/g, '$1 ') });
      }
    }
    return c.json({ ok: true });
  })
  /** A player's collections, to rename or remove one (an offensive name, a duplicate made by mistake). */
  .get('/users/:id/lists', async (c) => {
    const rows = await db
      .select({ id: schema.lists.id, name: schema.lists.name, visibility: schema.lists.visibility, entries: sql<number>`(select count(*) from ${schema.listEntries} where ${schema.listEntries.listId} = ${schema.lists.id})`.mapWith(Number) })
      .from(schema.lists)
      .where(eq(schema.lists.ownerId, c.req.param('id')))
      .orderBy(schema.lists.position, schema.lists.createdAt);
    return c.json({ lists: rows });
  })
  .patch('/lists/:id', zValidator('json', z.object({ name: z.string().trim().min(1).max(60) })), async (c) => {
    const me = c.get('user');
    const [l] = await db.select({ name: schema.lists.name, ownerId: schema.lists.ownerId, owner: schema.users.username }).from(schema.lists).innerJoin(schema.users, eq(schema.users.id, schema.lists.ownerId)).where(eq(schema.lists.id, c.req.param('id'))).limit(1);
    if (!l) return c.json({ error: 'not_found' }, 404);
    const name = c.req.valid('json').name;
    if (name === l.name) return c.json({ ok: true });
    await db.update(schema.lists).set({ name, updatedAt: new Date() }).where(eq(schema.lists.id, c.req.param('id')));
    await audit(me.id, 'list.rename', 'list', c.req.param('id'), { username: l.owner, before: l.name, after: name });
    if (l.ownerId !== me.id) await notifyAccount(l.ownerId, me.id, 'list_renamed', { value: name });
    return c.json({ ok: true });
  })
  .delete('/lists/:id', async (c) => {
    const me = c.get('user');
    const [l] = await db.select({ name: schema.lists.name, ownerId: schema.lists.ownerId, owner: schema.users.username }).from(schema.lists).innerJoin(schema.users, eq(schema.users.id, schema.lists.ownerId)).where(eq(schema.lists.id, c.req.param('id'))).limit(1);
    if (!l) return c.json({ error: 'not_found' }, 404);
    const gone = await trashList(c.req.param('id'), me.id);
    await audit(me.id, 'list.delete', 'list', c.req.param('id'), { username: l.owner, name: l.name, entries: gone?.entries ?? 0 });
    if (l.ownerId !== me.id) await notifyAccount(l.ownerId, me.id, 'list_deleted', { value: l.name });
    return c.json({ ok: true });
  })
  /** The account's deleted collections still in the trash (30 days), by them or by an admin. */
  .get('/users/:id/trash', async (c) => {
    const by = alias(schema.users, 'by');
    const rows = await db
      .select({ id: schema.deletedLists.id, name: schema.deletedLists.name, entries: schema.deletedLists.entries, deletedAt: schema.deletedLists.deletedAt, by: by.username })
      .from(schema.deletedLists)
      .leftJoin(by, eq(by.id, schema.deletedLists.deletedBy))
      .where(eq(schema.deletedLists.ownerId, c.req.param('id')))
      .orderBy(desc(schema.deletedLists.deletedAt));
    return c.json({ lists: rows.map((r) => ({ ...r, deletedAt: r.deletedAt.toISOString(), purgeAt: new Date(r.deletedAt.getTime() + TRASH_DAYS * 86400_000).toISOString() })) });
  })
  .post('/trash/:id/restore', async (c) => {
    const me = c.get('user');
    const back = await restoreList(c.req.param('id'));
    if (!back) return c.json({ error: 'not_found' }, 404);
    await markListDeleteUndone(c.req.param('id'));
    const [owner] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, back.ownerId)).limit(1);
    await audit(me.id, 'list.restore', 'list', c.req.param('id'), { username: owner?.username, name: back.name });
    if (back.ownerId !== me.id) await notifyAccount(back.ownerId, me.id, 'list_restored', { value: back.name });
    return c.json({ ok: true });
  })
  /** A message from the admins, in the player's notifications (and pushed). */
  .post('/users/:id/message', zValidator('json', z.object({ message: z.string().trim().min(2).max(500) })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    const [u] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) return c.json({ error: 'not_found' }, 404);
    const { message } = c.req.valid('json');
    await notifyAccount(id, me.id, 'message', { value: message });
    await audit(me.id, 'user.message', 'user', id, { username: u.username, message });
    return c.json({ ok: true });
  })
  /** Accounts deleted less than 30 days ago, by the player or an admin. */
  .get('/trash/accounts', async (c) => {
    const by = alias(schema.users, 'by');
    const rows = await db
      .select({ id: schema.deletedUsers.id, username: schema.deletedUsers.username, deletedAt: schema.deletedUsers.deletedAt, by: by.username })
      .from(schema.deletedUsers)
      .leftJoin(by, eq(by.id, schema.deletedUsers.deletedBy))
      .orderBy(desc(schema.deletedUsers.deletedAt))
      .limit(100);
    return c.json({ accounts: rows.map((r) => ({ ...r, deletedAt: r.deletedAt.toISOString(), purgeAt: new Date(r.deletedAt.getTime() + TRASH_DAYS * 86400_000).toISOString() })) });
  })
  .post('/trash/accounts/:id/restore', async (c) => {
    const r = await restoreAccount(c.req.param('id'));
    if (!r.ok) return c.json({ error: r.error }, r.error === 'not_found' ? 404 : 409);
    await accountRestored(c.req.param('id'), r.username, c.get('user').id);
    return c.json({ ok: true });
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
  .post('/users/:id/suspend', zValidator('json', z.object({ suspended: z.boolean(), reason: z.string().trim().max(300).optional(), days: z.number().int().min(1).max(365).optional() })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    if (id === me.id) return c.json({ error: 'self' }, 400);
    const { suspended, reason, days } = c.req.valid('json');
    const until = suspended && days ? new Date(Date.now() + days * 86400_000) : null;
    const [u] = await db.update(schema.users).set({ suspendedAt: suspended ? new Date() : null, suspendedUntil: until }).where(eq(schema.users.id, id)).returning({ username: schema.users.username, role: schema.users.role });
    if (!u) return c.json({ error: 'not_found' }, 404);
    if (suspended) await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    await audit(me.id, suspended ? 'user.suspend' : 'user.unsuspend', 'user', id, { username: u.username, reason: reason || null, ...(suspended ? { days: days ?? null, until: until?.toISOString() ?? null } : {}) });
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
    // Kept 30 days in the trash, then gone for good.
    await trashAccount(id, me.id);
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
    const q = (c.req.query('q') ?? '').trim();
    const kindCond = auditWhere(c.req.query('kind'));
    const searchCond = q
      ? sql`lower(coalesce(${schema.users.username}, '') || ' ' || ${schema.auditLog.action} || ' ' || coalesce(${schema.auditLog.targetId}, '') || ' ' || ${schema.auditLog.data}::text) like lower(${'%' + q + '%'})`
      : undefined;
    const where = kindCond && searchCond ? and(kindCond, searchCond) : kindCond ?? searchCond;
    const rows = await db
      .select({ a: schema.auditLog, actor: schema.users.username })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
      .where(where)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(50)
      .offset(offset);
    return c.json({
      entries: rows.map(({ a, actor }) => ({
        id: a.id, actor, action: a.action, targetType: a.targetType, targetId: a.targetId, data: a.data, createdAt: a.createdAt.toISOString(), undoneAt: iso(a.undoneAt),
        // A deleted collection or account, while still in the trash.
        undoable: !a.undoneAt && (a.action.startsWith('override.') || (['list.delete', 'user.delete', 'account.delete'].includes(a.action) && a.createdAt.getTime() > Date.now() - TRASH_DAYS * 86400_000)),
      })),
      offset,
    });
  })
  /** The whole journal (or one filter of it) as a spreadsheet, newest first, at most 20,000 lines. */
  .get('/audit.csv', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const kindCond = auditWhere(c.req.query('kind'));
    const searchCond = q
      ? sql`lower(coalesce(${schema.users.username}, '') || ' ' || ${schema.auditLog.action} || ' ' || coalesce(${schema.auditLog.targetId}, '') || ' ' || ${schema.auditLog.data}::text) like lower(${'%' + q + '%'})`
      : undefined;
    const where = kindCond && searchCond ? and(kindCond, searchCond) : kindCond ?? searchCond;
    const rows = await db
      .select({ a: schema.auditLog, actor: schema.users.username })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
      .where(where)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(20_000);
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      // Quoted, and no formula can run when the file opens in a spreadsheet.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const lines = [['date', 'auteur', 'action', 'cible', 'id cible', 'détails', 'annulé le'].map(cell).join(',')];
    for (const { a, actor } of rows) lines.push([a.createdAt.toISOString(), actor ?? (a.data as { username?: string }).username ?? '', a.action, a.targetType, a.targetId, a.data, a.undoneAt?.toISOString()].map(cell).join(','));
    await audit(c.get('user').id, 'audit.export', 'audit', null, { kind: c.req.query('kind') ?? 'all', lines: rows.length });
    return c.body(`\ufeff${lines.join('\r\n')}\r\n`, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="journal-${new Date().toISOString().slice(0, 10)}.csv"` });
  })
  /** Puts a variant correction back as it was before this entry. */
  .post('/audit/:id/undo', async (c) => {
    const [e] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.id, c.req.param('id'))).limit(1);
    if ((e?.action === 'user.delete' || e?.action === 'account.delete') && !e.undoneAt && e.targetId) {
      const r = await restoreAccount(e.targetId);
      if (!r.ok) return c.json({ error: r.error === 'not_found' ? 'not_undoable' : r.error }, r.error === 'not_found' ? 400 : 409);
      await accountRestored(e.targetId, r.username, c.get('user').id);
      return c.json({ ok: true });
    }
    if (e?.action === 'list.delete' && !e.undoneAt && e.targetId) {
      const back = await restoreList(e.targetId);
      if (!back) return c.json({ error: 'not_undoable' }, 400);
      await markListDeleteUndone(e.targetId);
      await audit(c.get('user').id, 'list.restore', 'list', e.targetId, { username: (e.data as { username?: string }).username, name: back.name });
      if (back.ownerId !== c.get('user').id) await notifyAccount(back.ownerId, c.get('user').id, 'list_restored', { value: back.name });
      return c.json({ ok: true });
    }
    if (!e || !e.action.startsWith('override.') || e.undoneAt || !e.targetId) return c.json({ error: 'not_undoable' }, 400);
    const key = e.targetId;
    const before = e.data.before as ReturnType<typeof overrideState> | null;
    const [current] = await db.select().from(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key)).limit(1);
    const was = await dataService.shownState(key);
    if (!before) await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key));
    else {
      const values = { variantKey: key, released: before.released, labelEn: before.label?.en ?? null, labelFr: before.label?.fr ?? null, genders: before.genders, shinyReleased: before.shinyReleased ?? null, noEvolve: before.noEvolve ?? null, noMega: before.noMega ?? null, kind: before.kind ?? null, hidden: before.hidden ?? null, updatedBy: c.get('user').id, updatedAt: new Date() };
      await db.insert(schema.variantOverrides).values(values).onConflictDoUpdate({ target: schema.variantOverrides.variantKey, set: values });
    }
    dataService.invalidateOverrides();
    await db.update(schema.auditLog).set({ undoneAt: new Date() }).where(eq(schema.auditLog.id, e.id));
    await audit(c.get('user').id, 'override.undo', 'variant', key, { before: current ? overrideState(current) : null, after: before, undoes: e.id, was, now: await dataService.shownState(key) });
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
    void notifyStaff({ kind: 'report', variant: dataService.variantName(b.variantKey), reportKind: b.kind, by: c.get('user').username }, c.get('user').id);
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
