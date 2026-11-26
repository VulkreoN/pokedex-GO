import { zValidator } from '@hono/zod-validator';
import { VIVILLON_PATTERNS, isVivillonPattern, vivillonPatternFromKey, type PostcardFriendSuggestion, type UserPostcard, type VivillonPattern } from '@mydexpogo/shared';
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { newId, normalizeFriendCode } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';
import { friendIdsOf, listSummaries } from './lists.js';
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
      .select({ user: schema.users, since: schema.friendships.createdAt, favorite: schema.friendships.favorite, lucky: schema.friendships.lucky })
      .from(schema.friendships)
      .innerJoin(schema.users, eq(schema.users.id, schema.friendships.friendId))
      .where(eq(schema.friendships.userId, me.id))
      // Lucky friends & pinned friends first.
      .orderBy(desc(schema.friendships.lucky), desc(schema.friendships.favorite), schema.users.username);
    // How many of their collections I can see + their declared Vivillon postcards.
    const ids = rows.map((r) => r.user.id);
    const [counts, postcardRows] = ids.length
      ? await Promise.all([
          db.select({ owner: schema.lists.ownerId, n: sql<number>`count(*)`.mapWith(Number) }).from(schema.lists).where(and(inArray(schema.lists.ownerId, ids), ne(schema.lists.visibility, 'private'))).groupBy(schema.lists.ownerId),
          db
            .select({ userId: schema.userPostcards.userId, pattern: schema.userPostcards.pattern, quantity: schema.userPostcards.quantity })
            .from(schema.userPostcards)
            .where(inArray(schema.userPostcards.userId, ids))
            .orderBy(asc(schema.userPostcards.pattern)),
        ])
      : [[], []];
    const listCount = new Map(counts.map((r) => [r.owner, r.n]));
    const postcardsByUser = new Map<string, UserPostcard[]>();
    for (const r of postcardRows) {
      if (!isVivillonPattern(r.pattern)) continue;
      (postcardsByUser.get(r.userId) ?? postcardsByUser.set(r.userId, []).get(r.userId)!).push({
        pattern: r.pattern,
        quantity: r.quantity,
      });
    }
    return c.json({
      friends: rows.map((r) => ({
        ...pub(r.user),
        since: r.since.toISOString(),
        favorite: r.favorite,
        lucky: r.lucky,
        lists: listCount.get(r.user.id) ?? 0,
        postcards: postcardsByUser.get(r.user.id) ?? [],
      })),
    });
  })
  /** My declared regional Vivillon (Prismillon) gift postcards. */
  .get('/postcards', async (c) => {
    const me = c.get('user');
    const rows = await db
      .select({ pattern: schema.userPostcards.pattern, quantity: schema.userPostcards.quantity })
      .from(schema.userPostcards)
      .where(eq(schema.userPostcards.userId, me.id))
      .orderBy(asc(schema.userPostcards.pattern));
    const postcards: UserPostcard[] = rows
      .filter((r) => isVivillonPattern(r.pattern))
      .map((r) => ({ pattern: r.pattern as VivillonPattern, quantity: r.quantity }));
    return c.json({ postcards });
  })
  /** Replace the signed-in trainer's declared regional Vivillon gift postcards (null quantity = home region / unlimited). */
  .put(
    '/postcards',
    zValidator(
      'json',
      z.object({
        postcards: z
          .array(
            z.object({
              pattern: z.enum(VIVILLON_PATTERNS),
              quantity: z.number().int().min(1).max(999).nullable(),
            }),
          )
          .max(18),
      }),
    ),
    async (c) => {
      const me = c.get('user');
      const dedup = new Map<VivillonPattern, number | null>();
      for (const p of c.req.valid('json').postcards) dedup.set(p.pattern, p.quantity);
      const next: UserPostcard[] = [...dedup.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pattern, quantity]) => ({ pattern, quantity }));
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.delete(schema.userPostcards).where(eq(schema.userPostcards.userId, me.id));
        if (next.length) {
          await tx.insert(schema.userPostcards).values(
            next.map((p) => ({
              userId: me.id,
              pattern: p.pattern,
              quantity: p.quantity,
              updatedAt: now,
            })),
          );
        }
      });
      const fids = await friendIdsOf(me.id);
      if (fids.length) hub.emit(fids, { type: 'friends' });
      return c.json({ postcards: next });
    },
  )
  /** Discover non-friend trainers offering Vivillon postcards matching the player's missing patterns (or chosen filters). */
  .get('/postcards/discover', async (c) => {
    const me = c.get('user');
    const allMode = c.req.query('all') === '1';
    const rawPatterns = (c.req.query('patterns') ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(isVivillonPattern);
    const queryPatterns = [...new Set(rawPatterns)];

    const [wantedRows, friendRows] = await Promise.all([
      db
        .select({ variantKey: schema.listEntries.variantKey })
        .from(schema.listEntries)
        .innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId))
        .where(and(eq(schema.lists.ownerId, me.id), eq(schema.listEntries.done, false), sql`${schema.listEntries.variantKey} LIKE '666.f%'`)),
      db.select({ friendId: schema.friendships.friendId }).from(schema.friendships).where(eq(schema.friendships.userId, me.id)),
    ]);

    const wantedSet = new Set<VivillonPattern>();
    for (const r of wantedRows) {
      const p = vivillonPatternFromKey(r.variantKey);
      if (p) wantedSet.add(p);
    }
    const wantedPatterns = [...wantedSet].sort();

    const excludedIds = new Set<string>([me.id, ...friendRows.map((r) => r.friendId)]);
    const now = new Date();
    const cardRows = await db
      .select({
        userId: schema.users.id,
        username: schema.users.username,
        friendCode: schema.users.friendCode,
        pattern: schema.userPostcards.pattern,
        quantity: schema.userPostcards.quantity,
        updatedAt: schema.userPostcards.updatedAt,
      })
      .from(schema.userPostcards)
      .innerJoin(schema.users, eq(schema.users.id, schema.userPostcards.userId))
      .where(and(ne(schema.users.id, me.id), or(isNull(schema.users.suspendedAt), lt(schema.users.suspendedUntil, now))));

    const byUser = new Map<
      string,
      { user: { id: string; username: string; friendCode: string }; postcards: UserPostcard[]; latestUpdated: number }
    >();
    for (const r of cardRows) {
      if (excludedIds.has(r.userId) || !isVivillonPattern(r.pattern)) continue;
      const entry =
        byUser.get(r.userId) ??
        (() => {
          const v = { user: { id: r.userId, username: r.username, friendCode: r.friendCode }, postcards: [] as UserPostcard[], latestUpdated: 0 };
          byUser.set(r.userId, v);
          return v;
        })();
      entry.postcards.push({ pattern: r.pattern, quantity: r.quantity });
      const ts = r.updatedAt.getTime();
      if (ts > entry.latestUpdated) entry.latestUpdated = ts;
    }

    const filterPatterns = allMode ? [] : queryPatterns.length ? queryPatterns : wantedPatterns;
    const filterSet = new Set(filterPatterns);
    const highlightSet = !allMode && queryPatterns.length ? new Set(queryPatterns) : wantedSet;

    const ranked = [...byUser.values()]
      .map((u) => {
        u.postcards.sort((a, b) => a.pattern.localeCompare(b.pattern));
        const matchedPatterns = u.postcards.map((p) => p.pattern).filter((p) => highlightSet.has(p));
        const passesFilter = !filterSet.size || u.postcards.some((p) => filterSet.has(p.pattern));
        return { ...u, matchedPatterns, passesFilter };
      })
      .filter((u) => u.passesFilter)
      .sort(
        (a, b) =>
          b.matchedPatterns.length - a.matchedPatterns.length ||
          b.postcards.length - a.postcards.length ||
          b.latestUpdated - a.latestUpdated ||
          a.user.username.localeCompare(b.user.username),
      )
      .slice(0, 40);

    const candidateIds = ranked.map((r) => r.user.id);
    const pendingReqs = candidateIds.length
      ? await db
          .select()
          .from(schema.friendRequests)
          .where(
            and(
              eq(schema.friendRequests.status, 'pending'),
              or(
                and(eq(schema.friendRequests.fromId, me.id), inArray(schema.friendRequests.toId, candidateIds)),
                and(inArray(schema.friendRequests.fromId, candidateIds), eq(schema.friendRequests.toId, me.id)),
              ),
            ),
          )
      : [];

    const reqByOther = new Map<string, { status: 'outgoing' | 'incoming'; id: string }>();
    for (const r of pendingReqs) {
      if (r.fromId === me.id) reqByOther.set(r.toId, { status: 'outgoing', id: r.id });
      else reqByOther.set(r.fromId, { status: 'incoming', id: r.id });
    }

    const suggestions: PostcardFriendSuggestion[] = ranked.map((r) => {
      const req = reqByOther.get(r.user.id);
      return {
        user: r.user,
        postcards: r.postcards,
        matchedPatterns: r.matchedPatterns,
        requestStatus: req?.status ?? 'none',
        ...(req ? { requestId: req.id } : {}),
      };
    });

    return c.json({ wantedPatterns, suggestions });
  })
  /** Pin a friend to the top of my friends (and of their collections), or unpin them. */
  .put('/:id/favorite', zValidator('json', z.object({ on: z.boolean() })), async (c) => {
    const me = c.get('user');
    const r = await db
      .update(schema.friendships)
      .set({ favorite: c.req.valid('json').on })
      .where(and(eq(schema.friendships.userId, me.id), eq(schema.friendships.friendId, c.req.param('id'))))
      .returning();
    if (!r.length) return c.json({ error: 'not_friends' }, 404);
    return c.json({ ok: true });
  })
  /** Mark or unmark a friend as Lucky Friends (private per player). */
  .put('/:id/lucky', zValidator('json', z.object({ on: z.boolean() })), async (c) => {
    const me = c.get('user');
    const r = await db
      .update(schema.friendships)
      .set({ lucky: c.req.valid('json').on })
      .where(and(eq(schema.friendships.userId, me.id), eq(schema.friendships.friendId, c.req.param('id'))))
      .returning();
    if (!r.length) return c.json({ error: 'not_friends' }, 404);
    return c.json({ ok: true });
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
    const [link] = await db
      .select({ since: schema.friendships.createdAt, favorite: schema.friendships.favorite, lucky: schema.friendships.lucky })
      .from(schema.friendships)
      .where(and(eq(schema.friendships.userId, me.id), eq(schema.friendships.friendId, other)))
      .limit(1);
    if (!link) return c.json({ error: 'not_friends' }, 403);
    const [friend] = await db.select().from(schema.users).where(eq(schema.users.id, other)).limit(1);
    if (!friend) return c.json({ error: 'not_found' }, 404);
    const [lists, unfollowedRows, postcardRows, caughtRows, [friendCount], [pvpMonCount], [pvpTeamCount]] = await Promise.all([
      listSummaries(and(eq(schema.lists.ownerId, other), inArray(schema.lists.visibility, ['friends', 'link']))!),
      db.select({ id: schema.listUnfollows.listId }).from(schema.listUnfollows).where(eq(schema.listUnfollows.userId, me.id)),
      db
        .select({ pattern: schema.userPostcards.pattern, quantity: schema.userPostcards.quantity })
        .from(schema.userPostcards)
        .where(eq(schema.userPostcards.userId, other))
        .orderBy(asc(schema.userPostcards.pattern)),
      db
        .select({
          variantKey: schema.listEntries.variantKey,
          shiny: schema.listEntries.shiny,
          tag: schema.listEntries.tag,
          done: schema.listEntries.done,
        })
        .from(schema.listEntries)
        .innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId))
        .where(and(eq(schema.lists.ownerId, other), inArray(schema.lists.visibility, ['friends', 'link']), eq(schema.listEntries.done, true))),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.friendships).where(eq(schema.friendships.userId, other)),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.pvpPokemon).where(eq(schema.pvpPokemon.userId, other)),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.pvpTeams).where(eq(schema.pvpTeams.userId, other)),
    ]);
    const unfollowed = new Set(unfollowedRows.map((r) => r.id));
    const postcards: UserPostcard[] = postcardRows
      .filter((r) => isVivillonPattern(r.pattern))
      .map((r) => ({ pattern: r.pattern as VivillonPattern, quantity: r.quantity }));
    return c.json({
      friend: {
        ...pub(friend),
        since: link.since.toISOString(),
        favorite: link.favorite,
        lucky: link.lucky,
        postcards,
      },
      lists: lists.map((l) => ({ ...l, following: !unfollowed.has(l.id) })),
      profile: {
        friendsCount: friendCount?.n ?? 0,
        pvpCount: (pvpMonCount?.n ?? 0) + (pvpTeamCount?.n ?? 0),
        completedLists: lists.filter((l) => l.entryCount > 0 && l.doneCount === l.entryCount).length,
        entries: caughtRows,
      },
    });
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
