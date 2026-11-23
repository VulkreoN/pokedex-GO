import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { newId, normalizeFriendCode } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';
import { listSummaries } from './lists.js';
import { hub } from '../notify/hub.js';
import { notify } from '../notify/service.js';

const notifyAccepted = (requesterId: string, accepter: { id: string; username: string }) =>
  notify({
    userId: requesterId,
    type: 'friend_accepted',
    actorId: accepter.id,
    push: () => ({ title: `${accepter.username} a accepté ta demande`, body: 'Vous pouvez voir vos collections.', url: `/friends/${accepter.id}`, tag: `friend-${accepter.id}` }),
  });

const pub = (u: typeof schema.users.$inferSelect) => ({ id: u.id, username: u.username, friendCode: u.friendCode, createdAt: u.createdAt.toISOString() });

export async function areFriends(a: string, b: string): Promise<boolean> {
  const rows = await db.select({ userId: schema.friendships.userId }).from(schema.friendships).where(and(eq(schema.friendships.userId, a), eq(schema.friendships.friendId, b))).limit(1);
  return rows.length > 0;
}

export const friendRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const me = c.get('user');
    const rows = await db
      .select({ user: schema.users, since: schema.friendships.createdAt })
      .from(schema.friendships)
      .innerJoin(schema.users, eq(schema.users.id, schema.friendships.friendId))
      .where(eq(schema.friendships.userId, me.id))
      .orderBy(schema.users.username);
    return c.json({ friends: rows.map((r) => ({ ...pub(r.user), since: r.since.toISOString() })) });
  })
  .get('/requests', async (c) => {
    const me = c.get('user');
    const rows = await db
      .select()
      .from(schema.friendRequests)
      .where(and(or(eq(schema.friendRequests.toId, me.id), eq(schema.friendRequests.fromId, me.id)), eq(schema.friendRequests.status, 'pending')))
      .orderBy(desc(schema.friendRequests.createdAt));
    const ids = [...new Set(rows.flatMap((r) => [r.fromId, r.toId]))];
    const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
    const byId = new Map(users.map((u) => [u.id, pub(u)]));
    return c.json({
      requests: rows.map((r) => ({ id: r.id, from: byId.get(r.fromId), to: byId.get(r.toId), status: r.status, createdAt: r.createdAt.toISOString() })),
    });
  })
  .post('/requests', rateLimit({ windowMs: 60_000, max: 20 }), zValidator('json', z.object({ friendCode: z.string().max(40) })), async (c) => {
    const me = c.get('user');
    const code = normalizeFriendCode(c.req.valid('json').friendCode);
    if (!code) return c.json({ error: 'invalid_code' }, 400);
    const [target] = await db.select().from(schema.users).where(eq(schema.users.friendCode, code)).limit(1);
    if (!target) return c.json({ error: 'not_found' }, 404);
    if (target.id === me.id) return c.json({ error: 'self' }, 400);
    if (await areFriends(me.id, target.id)) return c.json({ error: 'already_friends' }, 409);
    // If they already asked us, accept directly.
    const [reverse] = await db
      .select()
      .from(schema.friendRequests)
      .where(and(eq(schema.friendRequests.fromId, target.id), eq(schema.friendRequests.toId, me.id), eq(schema.friendRequests.status, 'pending')))
      .limit(1);
    if (reverse) {
      await acceptRequest(reverse.id, target.id, me.id);
      await notifyAccepted(target.id, me);
      hub.emit([me.id, target.id], { type: 'friends' });
      return c.json({ accepted: true, friend: pub(target) });
    }
    const [existing] = await db
      .select()
      .from(schema.friendRequests)
      .where(and(eq(schema.friendRequests.fromId, me.id), eq(schema.friendRequests.toId, target.id), eq(schema.friendRequests.status, 'pending')))
      .limit(1);
    if (existing) return c.json({ error: 'already_requested' }, 409);
    await db.insert(schema.friendRequests).values({ id: newId(), fromId: me.id, toId: target.id });
    await notify({
      userId: target.id,
      type: 'friend_request',
      actorId: me.id,
      push: () => ({ title: `${me.username} veut être ton ami`, body: 'Accepte pour voir vos collections.', url: '/friends', tag: `friend-request-${me.id}` }),
    });
    hub.emit([me.id, target.id], { type: 'friends' });
    return c.json({ accepted: false, to: pub(target) }, 201);
  })
  .post('/requests/:id/accept', async (c) => {
    const me = c.get('user');
    const [req] = await db.select().from(schema.friendRequests).where(eq(schema.friendRequests.id, c.req.param('id'))).limit(1);
    if (!req || req.toId !== me.id || req.status !== 'pending') return c.json({ error: 'not_found' }, 404);
    await acceptRequest(req.id, req.fromId, req.toId);
    await notifyAccepted(req.fromId, me);
    hub.emit([req.fromId, req.toId], { type: 'friends' });
    return c.json({ ok: true });
  })
  .post('/requests/:id/decline', async (c) => {
    const me = c.get('user');
    const [req] = await db.select().from(schema.friendRequests).where(eq(schema.friendRequests.id, c.req.param('id'))).limit(1);
    if (!req || (req.toId !== me.id && req.fromId !== me.id) || req.status !== 'pending') return c.json({ error: 'not_found' }, 404);
    await db.update(schema.friendRequests).set({ status: 'declined', respondedAt: new Date() }).where(eq(schema.friendRequests.id, req.id));
    hub.emit([req.fromId, req.toId], { type: 'friends' });
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const me = c.get('user');
    const other = c.req.param('id');
    await db.delete(schema.friendships).where(
      or(and(eq(schema.friendships.userId, me.id), eq(schema.friendships.friendId, other)), and(eq(schema.friendships.userId, other), eq(schema.friendships.friendId, me.id))),
    );
    // Their "I have it" marks on each other's lists go too.
    for (const [owner, offerer] of [[me.id, other], [other, me.id]] as const) {
      await db.delete(schema.listOffers).where(
        and(eq(schema.listOffers.userId, offerer), inArray(schema.listOffers.listId, db.select({ id: schema.lists.id }).from(schema.lists).where(eq(schema.lists.ownerId, owner)))),
      );
    }
    hub.emit([me.id, other], { type: 'friends' });
    return c.json({ ok: true });
  })
  .get('/:id/lists', async (c) => {
    const me = c.get('user');
    const other = c.req.param('id');
    if (!(await areFriends(me.id, other))) return c.json({ error: 'not_friends' }, 403);
    const [friend] = await db.select().from(schema.users).where(eq(schema.users.id, other)).limit(1);
    if (!friend) return c.json({ error: 'not_found' }, 404);
    const lists = await listSummaries(and(eq(schema.lists.ownerId, other), inArray(schema.lists.visibility, ['friends', 'link']))!);
    const unfollowed = new Set(
      (await db.select({ id: schema.listUnfollows.listId }).from(schema.listUnfollows).where(eq(schema.listUnfollows.userId, me.id))).map((r) => r.id),
    );
    return c.json({ friend: pub(friend), lists: lists.map((l) => ({ ...l, following: !unfollowed.has(l.id) })) });
  });

async function acceptRequest(requestId: string, fromId: string, toId: string) {
  await db.transaction(async (tx) => {
    await tx.update(schema.friendRequests).set({ status: 'accepted', respondedAt: new Date() }).where(eq(schema.friendRequests.id, requestId));
    await tx
      .insert(schema.friendships)
      .values([
        { userId: fromId, friendId: toId },
        { userId: toId, friendId: fromId },
      ])
      .onConflictDoNothing();
  });
}
