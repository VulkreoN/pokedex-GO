import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { isEntryTag, isValidVariantKey, neutralKey, type EntryGender, type EntryTag, type ListDetail, type ListOffer, type ListSummary } from '@mydexpogo/shared';
import { z } from 'zod';
import { requireAuth, userFromRequest, type AuthEnv, type AuthUser } from '../auth.js';
import { db, schema } from '../db/index.js';
import { newId, newShareToken } from '../lib/ids.js';
import { hub } from '../notify/hub.js';
import { notify } from '../notify/service.js';
import { GenderError, normalizeEntries } from '../lists/genders.js';
import { dataService } from '../data/service.js';

export async function friendIdsOf(userId: string): Promise<string[]> {
  const rows = await db.select({ id: schema.friendships.friendId }).from(schema.friendships).where(eq(schema.friendships.userId, userId));
  return rows.map((r) => r.id);
}

/** Tells the owner's other tabs and every friend that this list changed. */
async function broadcastList(list: { id: string; ownerId: string }, deleted = false) {
  hub.emit([list.ownerId, ...(await friendIdsOf(list.ownerId))], { type: 'list', listId: list.id, ownerId: list.ownerId, ...(deleted ? { deleted } : {}) });
}

const entryId = (e: { variantKey: string; shiny: boolean; tag: string; gender: string }) => `${e.variantKey}|${e.shiny}|${e.tag}|${e.gender}`;
const gender = z.enum(['', 'm', 'f']);

/** "Anyone with the link" is gone as a visibility; the share link itself still works on lists friends can see. */
const visibility = z.enum(['private', 'friends']);
const listBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: visibility.optional(),
});
const entryBody = z.object({
  variantKey: z.string().refine(isValidVariantKey, 'invalid variant key'),
  shiny: z.boolean().default(false),
  tag: z.string().refine(isEntryTag, 'invalid tag').default(''),
  /** Omitted on a Pokémon that has both genders = one entry per gender. */
  gender: gender.optional(),
  done: z.boolean().default(false),
  note: z.string().trim().max(200).nullable().optional(),
});

export async function listSummaries(where: SQL): Promise<ListSummary[]> {
  const rows = await db
    .select({
      list: schema.lists,
      ownerName: schema.users.username,
      entryCount: sql<number>`(select count(*) from ${schema.listEntries} e where e.list_id = ${schema.lists.id})`.mapWith(Number),
      doneCount: sql<number>`(select count(*) from ${schema.listEntries} e where e.list_id = ${schema.lists.id} and e.done)`.mapWith(Number),
    })
    .from(schema.lists)
    .innerJoin(schema.users, eq(schema.users.id, schema.lists.ownerId))
    .where(where)
    .orderBy(desc(schema.lists.updatedAt));
  return rows.map((r) => toSummary(r.list, r.ownerName, r.entryCount, r.doneCount));
}

function toSummary(l: typeof schema.lists.$inferSelect, ownerName: string, entryCount: number, doneCount: number): ListSummary {
  return {
    id: l.id,
    name: l.name,
    description: l.description,
    visibility: l.visibility,
    ownerId: l.ownerId,
    ownerName,
    entryCount,
    doneCount,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    shareToken: l.shareToken,
  };
}

/** viewerId: who is looking. The owner sees every friend's "I have it", a friend only their own. */
async function listDetail(id: string, viewerIsOwner: boolean, viewerId: string | null = null): Promise<ListDetail | null> {
  const [summary] = await listSummaries(eq(schema.lists.id, id));
  if (!summary) return null;
  const entries = await db
    .select()
    .from(schema.listEntries)
    .where(eq(schema.listEntries.listId, id))
    .orderBy(schema.listEntries.position, schema.listEntries.variantKey, schema.listEntries.shiny, schema.listEntries.tag, schema.listEntries.gender);
  const offers = viewerId
    ? await db
        .select({ o: schema.listOffers, username: schema.users.username })
        .from(schema.listOffers)
        .innerJoin(schema.users, eq(schema.users.id, schema.listOffers.userId))
        .where(and(eq(schema.listOffers.listId, id), viewerIsOwner ? sql`true` : eq(schema.listOffers.userId, viewerId)))
    : [];
  const byEntry = new Map<string, ListOffer[]>();
  for (const { o, username } of offers) {
    const k = entryId(o);
    (byEntry.get(k) ?? byEntry.set(k, []).get(k)!).push({ userId: o.userId, username });
  }
  return {
    ...summary,
    shareToken: viewerIsOwner ? summary.shareToken : null,
    entries: entries.map((e) => {
      const mine = byEntry.get(entryId(e));
      const base = { variantKey: e.variantKey, gender: e.gender as EntryGender, shiny: e.shiny, tag: e.tag as EntryTag, done: e.done, note: e.note };
      if (!viewerId) return base;
      return viewerIsOwner ? { ...base, ...(mine?.length ? { offers: mine } : {}) } : { ...base, offeredByMe: !!mine?.length };
    }),
  };
}

type Access = 'owner' | 'friend' | 'none';
async function accessOf(list: typeof schema.lists.$inferSelect, viewer: AuthUser | null): Promise<Access> {
  if (viewer && list.ownerId === viewer.id) return 'owner';
  if (!viewer || list.visibility === 'private') return 'none';
  const rows = await db
    .select({ u: schema.friendships.userId })
    .from(schema.friendships)
    .where(and(eq(schema.friendships.userId, viewer.id), eq(schema.friendships.friendId, list.ownerId)))
    .limit(1);
  return rows.length ? 'friend' : 'none';
}

async function getList(id: string) {
  const [l] = await db.select().from(schema.lists).where(eq(schema.lists.id, id)).limit(1);
  return l ?? null;
}

async function touch(id: string) {
  await db.update(schema.lists).set({ updatedAt: new Date() }).where(eq(schema.lists.id, id));
}

/** Copies a list (entries reset to "not done") into the viewer's account. */
async function copyList(source: typeof schema.lists.$inferSelect, owner: AuthUser) {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.lists).values({ id, ownerId: owner.id, name: source.name.slice(0, 60), description: source.description, visibility: 'friends' });
    const entries = await tx.select().from(schema.listEntries).where(eq(schema.listEntries.listId, source.id));
    if (entries.length) {
      await tx.insert(schema.listEntries).values(entries.map((e) => ({ listId: id, variantKey: e.variantKey, gender: e.gender, shiny: e.shiny, tag: e.tag, done: false, note: null, position: e.position })));
    }
  });
  return listDetail(id, true, owner.id);
}

export const listRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json({ lists: await listSummaries(eq(schema.lists.ownerId, c.get('user').id)) }))
  /** Lists my friends show, read-only, minus the ones I stopped following. */
  .get('/friends', async (c) => {
    const me = c.get('user');
    const ids = await friendIdsOf(me.id);
    if (!ids.length) return c.json({ lists: [] });
    const unfollowed = db.select({ id: schema.listUnfollows.listId }).from(schema.listUnfollows).where(eq(schema.listUnfollows.userId, me.id));
    return c.json({ lists: await listSummaries(and(inArray(schema.lists.ownerId, ids), sql`${schema.lists.visibility} <> 'private'`, sql`${schema.lists.id} not in ${unfollowed}`)!) });
  })
  .post('/', zValidator('json', listBody), async (c) => {
    const me = c.get('user');
    const body = c.req.valid('json');
    const id = newId();
    await db.insert(schema.lists).values({ id, ownerId: me.id, name: body.name, description: body.description ?? null, visibility: body.visibility ?? 'friends' });
    return c.json({ list: await listDetail(id, true, me.id) }, 201);
  })
  .get('/:id', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list) return c.json({ error: 'not_found' }, 404);
    const access = await accessOf(list, me);
    if (access === 'none') return c.json({ error: 'forbidden' }, 403);
    const following = access === 'friend' ? !(await isUnfollowed(me.id, list.id)) : undefined;
    return c.json({ list: await listDetail(list.id, access === 'owner', me.id), access, ...(following !== undefined ? { following } : {}) });
  })
  /** Friends' lists are followed by default; these stop / restart showing one in "Friends' lists". */
  .post('/:id/follow', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || (await accessOf(list, me)) !== 'friend') return c.json({ error: 'not_found' }, 404);
    await db.delete(schema.listUnfollows).where(and(eq(schema.listUnfollows.userId, me.id), eq(schema.listUnfollows.listId, list.id)));
    return c.json({ following: true });
  })
  .delete('/:id/follow', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || (await accessOf(list, me)) !== 'friend') return c.json({ error: 'not_found' }, 404);
    await db.insert(schema.listUnfollows).values({ userId: me.id, listId: list.id }).onConflictDoNothing();
    return c.json({ following: false });
  })
  .patch('/:id', zValidator('json', listBody.partial()), async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || list.ownerId !== me.id) return c.json({ error: 'not_found' }, 404);
    const body = c.req.valid('json');
    await db
      .update(schema.lists)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        // Going private revokes the share link too: "private" means nobody but the owner.
        ...(body.visibility !== undefined ? { visibility: body.visibility, ...(body.visibility === 'private' ? { shareToken: null } : {}) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.lists.id, list.id));
    void broadcastList(list);
    return c.json({ list: await listDetail(list.id, true, me.id) });
  })
  .delete('/:id', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || list.ownerId !== me.id) return c.json({ error: 'not_found' }, 404);
    await db.delete(schema.lists).where(eq(schema.lists.id, list.id));
    void broadcastList(list, true);
    return c.json({ ok: true });
  })
  .put('/:id/entries', zValidator('json', z.object({ entries: z.array(entryBody).min(1).max(3000) })), async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || list.ownerId !== me.id) return c.json({ error: 'not_found' }, 404);
    let entries;
    try {
      // Keys of forms the dataset folded away (an older page, a saved basket) go to the form that replaced them.
      const aliases = dataService.aliases() ?? {};
      const incoming = c.req.valid('json').entries.map((e) => (aliases[neutralKey(e.variantKey)] ? { ...e, variantKey: aliases[neutralKey(e.variantKey)]! } : e));
      entries = normalizeEntries(incoming, await dataService.variants());
    } catch (e) {
      if (e instanceof GenderError) return c.json({ error: e.code, variantKey: e.variantKey }, 400);
      throw e;
    }
    // One row per target: the last occurrence wins (an upsert cannot touch the same row twice).
    entries = [...new Map(entries.map((e) => [entryId(e), e])).values()];
    const before = new Map((await db.select().from(schema.listEntries).where(eq(schema.listEntries.listId, list.id))).map((e) => [entryId(e), e.done]));
    const [row] = await db.select({ max: sql<number>`coalesce(max(position), 0)`.mapWith(Number) }).from(schema.listEntries).where(eq(schema.listEntries.listId, list.id));
    let position = row?.max ?? 0;
    await db.transaction(async (tx) => {
      for (const chunk of chunks(entries, 500)) {
        await tx
          .insert(schema.listEntries)
          .values(chunk.map((e) => ({ listId: list.id, variantKey: e.variantKey, gender: e.gender, shiny: e.shiny, tag: e.tag as string, done: e.done, note: e.note ?? null, position: ++position })))
          .onConflictDoUpdate({
            target: [schema.listEntries.listId, schema.listEntries.variantKey, schema.listEntries.shiny, schema.listEntries.tag, schema.listEntries.gender],
            set: { done: sql`excluded.done`, note: sql`excluded.note`, updatedAt: new Date() },
          });
      }
      await tx.update(schema.lists).set({ updatedAt: new Date() }).where(eq(schema.lists.id, list.id));
    });
    const caught = entries.filter((e) => e.done && !before.get(entryId(e)));
    if (caught.length) await tellOfferersItIsCaught(list, me, caught);
    void broadcastList(list);
    return c.json({ list: await listDetail(list.id, true, me.id) });
  })
  .delete('/:id/entries', zValidator('json', z.object({ entries: z.array(z.object({ variantKey: z.string(), shiny: z.boolean(), tag: z.string().refine(isEntryTag, 'invalid tag').default(''), gender: gender.optional() })).min(1).max(3000) })), async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || list.ownerId !== me.id) return c.json({ error: 'not_found' }, 404);
    const { entries } = c.req.valid('json');
    await db.transaction(async (tx) => {
      for (const e of entries) {
        // Without a gender, every gender of that target goes.
        await tx
          .delete(schema.listEntries)
          .where(
            and(
              eq(schema.listEntries.listId, list.id),
              eq(schema.listEntries.variantKey, neutralKey(e.variantKey)),
              eq(schema.listEntries.shiny, e.shiny),
              eq(schema.listEntries.tag, e.tag),
              e.gender !== undefined ? eq(schema.listEntries.gender, e.gender) : sql`true`,
            ),
          );
      }
    });
    await touch(list.id);
    void broadcastList(list);
    return c.json({ list: await listDetail(list.id, true, me.id) });
  })
  /** A friend says they have (or no longer have) one of the entries. */
  .post('/:id/offers', zValidator('json', z.object({ variantKey: z.string().refine(isValidVariantKey), gender: gender.default(''), shiny: z.boolean(), tag: z.string().refine(isEntryTag).default(''), on: z.boolean() })), async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list) return c.json({ error: 'not_found' }, 404);
    if ((await accessOf(list, me)) !== 'friend') return c.json({ error: 'forbidden' }, 403);
    const b = c.req.valid('json');
    const [entry] = await db
      .select()
      .from(schema.listEntries)
      .where(and(eq(schema.listEntries.listId, list.id), eq(schema.listEntries.variantKey, b.variantKey), eq(schema.listEntries.gender, b.gender), eq(schema.listEntries.shiny, b.shiny), eq(schema.listEntries.tag, b.tag)))
      .limit(1);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    if (b.on && entry.done) return c.json({ error: 'already_caught' }, 409);
    const key = { listId: list.id, variantKey: b.variantKey, gender: b.gender, shiny: b.shiny, tag: b.tag, userId: me.id };
    if (b.on) {
      const inserted = await db.insert(schema.listOffers).values(key).onConflictDoNothing().returning();
      if (inserted.length) {
        const variant = { key: b.variantKey, gender: b.gender, shiny: b.shiny, tag: b.tag };
        await notify({
          userId: list.ownerId,
          type: 'offer',
          actorId: me.id,
          listId: list.id,
          data: { count: 1, variants: [variant] },
          // A friend ticking several entries in a row makes one notification, not one per tick.
          merge: (prev) => {
            const variants = [...((prev.variants as unknown[]) ?? []), variant].slice(-20);
            return { count: Number(prev.count ?? 1) + 1, variants };
          },
          push: () => ({ title: `${me.username} a un Pokémon pour toi`, body: `Dans ta liste « ${list.name} »`, url: `/lists/${list.id}`, tag: `offer-${list.id}-${me.id}` }),
        });
      }
    } else {
      await db
        .delete(schema.listOffers)
        .where(and(eq(schema.listOffers.listId, list.id), eq(schema.listOffers.variantKey, b.variantKey), eq(schema.listOffers.gender, b.gender), eq(schema.listOffers.shiny, b.shiny), eq(schema.listOffers.tag, b.tag), eq(schema.listOffers.userId, me.id)));
    }
    hub.emit([list.ownerId, me.id], { type: 'list', listId: list.id, ownerId: list.ownerId });
    return c.json({ list: await listDetail(list.id, false, me.id) });
  })
  .post('/:id/share', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || list.ownerId !== me.id) return c.json({ error: 'not_found' }, 404);
    if (list.visibility === 'private') return c.json({ error: 'private_list' }, 409);
    const shareToken = list.shareToken ?? newShareToken();
    await db.update(schema.lists).set({ shareToken }).where(eq(schema.lists.id, list.id));
    return c.json({ shareToken });
  })
  .delete('/:id/share', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list || list.ownerId !== me.id) return c.json({ error: 'not_found' }, 404);
    await db.update(schema.lists).set({ shareToken: null }).where(eq(schema.lists.id, list.id));
    return c.json({ ok: true });
  })
  .post('/:id/copy', async (c) => {
    const me = c.get('user');
    const list = await getList(c.req.param('id'));
    if (!list) return c.json({ error: 'not_found' }, 404);
    if ((await accessOf(list, me)) === 'none') return c.json({ error: 'forbidden' }, 403);
    return c.json({ list: await copyList(list, me) }, 201);
  });

/** Lists reachable through a share link. No login needed to read, login needed to copy. */
export const sharedRoutes = new Hono<AuthEnv>()
  .get('/:token', async (c) => {
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.shareToken, c.req.param('token'))).limit(1);
    if (!list || list.visibility === 'private') return c.json({ error: 'not_found' }, 404);
    const viewer = await userFromRequest(c);
    return c.json({ list: await listDetail(list.id, viewer?.id === list.ownerId, viewer?.id === list.ownerId ? viewer.id : null), access: viewer?.id === list.ownerId ? 'owner' : 'link' });
  })
  .post('/:token/copy', requireAuth, async (c) => {
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.shareToken, c.req.param('token'))).limit(1);
    if (!list || list.visibility === 'private') return c.json({ error: 'not_found' }, 404);
    return c.json({ list: await copyList(list, c.get('user')) }, 201);
  });

async function isUnfollowed(userId: string, listId: string) {
  const rows = await db.select().from(schema.listUnfollows).where(and(eq(schema.listUnfollows.userId, userId), eq(schema.listUnfollows.listId, listId))).limit(1);
  return rows.length > 0;
}

/**
 * The owner just caught entries some friends said they had: tell each of them (one grouped notification per
 * friend and list) that they no longer need to keep it, then clear those marks.
 */
async function tellOfferersItIsCaught(list: { id: string; name: string; ownerId: string }, owner: { id: string; username: string }, caught: { variantKey: string; gender: string; shiny: boolean; tag: string }[]) {
  const ids = new Set(caught.map(entryId));
  const offers = (await db.select().from(schema.listOffers).where(eq(schema.listOffers.listId, list.id))).filter((o) => ids.has(entryId(o)));
  if (!offers.length) return;
  const byUser = new Map<string, typeof offers>();
  for (const o of offers) (byUser.get(o.userId) ?? byUser.set(o.userId, []).get(o.userId)!).push(o);
  for (const [userId, os] of byUser) {
    const variants = os.map((o) => ({ key: o.variantKey, gender: o.gender, shiny: o.shiny, tag: o.tag }));
    await notify({
      userId,
      type: 'offer_caught',
      actorId: owner.id,
      listId: list.id,
      data: { count: variants.length, variants },
      merge: (prev) => ({ count: Number(prev.count ?? 0) + variants.length, variants: [...((prev.variants as unknown[]) ?? []), ...variants].slice(-20) }),
      push: (d) => ({
        title: `${owner.username} a attrapé ${Number(d.count) > 1 ? `${d.count} Pokémon` : 'un Pokémon'} que tu avais`,
        body: 'Tu n’as plus besoin de le garder pour lui.',
        url: `/lists/${list.id}`,
        tag: `caught-${list.id}-${owner.id}`,
      }),
    });
  }
  for (const o of offers) {
    await db
      .delete(schema.listOffers)
      .where(and(eq(schema.listOffers.listId, o.listId), eq(schema.listOffers.variantKey, o.variantKey), eq(schema.listOffers.gender, o.gender), eq(schema.listOffers.shiny, o.shiny), eq(schema.listOffers.tag, o.tag), eq(schema.listOffers.userId, o.userId)));
  }
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
