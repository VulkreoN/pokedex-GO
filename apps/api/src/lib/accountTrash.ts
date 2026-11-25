/**
 * Deleted accounts, kept whole for 30 days so an admin can bring one back: the account (password included, so the
 * player logs in as before), its collections, friends, pending requests, PvP Pokémon and trashed collections.
 * Not kept: sessions, devices for push, notifications.
 */
import { eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { TRASH_DAYS } from './trash.js';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];
type Snapshot = {
  user: Row<typeof schema.users>;
  lists: Row<typeof schema.lists>[];
  entries: Row<typeof schema.listEntries>[];
  events: Row<typeof schema.listEvents>[];
  offers: Row<typeof schema.listOffers>[];
  unfollows: Row<typeof schema.listUnfollows>[];
  favorites: Row<typeof schema.listFavorites>[];
  friendships: Row<typeof schema.friendships>[];
  requests: Row<typeof schema.friendRequests>[];
  pvp: Row<typeof schema.pvpPokemon>[];
  trashedLists: Row<typeof schema.deletedLists>[];
};

/** Copies the account to the trash, then deletes it. */
export async function trashAccount(userId: string, deletedBy: string | null): Promise<{ username: string } | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) return null;
    const lists = await tx.select().from(schema.lists).where(eq(schema.lists.ownerId, userId));
    const ids = lists.map((l) => l.id);
    const onLists = <T>(q: (ids: string[]) => Promise<T[]>) => (ids.length ? q(ids) : Promise.resolve([] as T[]));
    const [entries, events, offers, unfollows, favorites, friendships, requests, pvp, trashedLists] = await Promise.all([
      onLists((i) => tx.select().from(schema.listEntries).where(inArray(schema.listEntries.listId, i))),
      onLists((i) => tx.select().from(schema.listEvents).where(inArray(schema.listEvents.listId, i))),
      onLists((i) => tx.select().from(schema.listOffers).where(inArray(schema.listOffers.listId, i))),
      tx.select().from(schema.listUnfollows).where(or(eq(schema.listUnfollows.userId, userId), ...(ids.length ? [inArray(schema.listUnfollows.listId, ids)] : []))),
      tx.select().from(schema.listFavorites).where(or(eq(schema.listFavorites.userId, userId), ...(ids.length ? [inArray(schema.listFavorites.listId, ids)] : []))),
      tx.select().from(schema.friendships).where(or(eq(schema.friendships.userId, userId), eq(schema.friendships.friendId, userId))),
      tx.select().from(schema.friendRequests).where(or(eq(schema.friendRequests.fromId, userId), eq(schema.friendRequests.toId, userId))),
      tx.select().from(schema.pvpPokemon).where(eq(schema.pvpPokemon.userId, userId)),
      tx.select().from(schema.deletedLists).where(eq(schema.deletedLists.ownerId, userId)),
    ]);
    const snapshot: Snapshot = { user, lists, entries, events, offers, unfollows, favorites, friendships, requests, pvp, trashedLists };
    const values = { username: user.username, friendCode: user.friendCode, deletedBy, deletedAt: new Date(), snapshot: snapshot as unknown as Record<string, unknown> };
    await tx.insert(schema.deletedUsers).values({ id: user.id, ...values }).onConflictDoUpdate({ target: schema.deletedUsers.id, set: values });
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
    return { username: user.username };
  });
}

export type RestoreResult = { ok: true; username: string } | { ok: false; error: 'not_found' | 'username_taken' | 'friend_code_taken' };

const at = (v: unknown) => (v ? new Date(v as string) : null);

/** Brings a trashed account back. Its name and friend code must still be free; links to deleted players are skipped. */
export async function restoreAccount(id: string): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.deletedUsers).where(eq(schema.deletedUsers.id, id)).limit(1);
    if (!row) return { ok: false, error: 'not_found' } as const;
    const s = row.snapshot as unknown as Snapshot;
    const [nameTaken] = await tx.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.username}) = lower(${s.user.username})`).limit(1);
    if (nameTaken) return { ok: false, error: 'username_taken' } as const;
    const [codeTaken] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.friendCode, s.user.friendCode)).limit(1);
    if (codeTaken) return { ok: false, error: 'friend_code_taken' } as const;

    const u = s.user;
    await tx.insert(schema.users).values({ ...u, resetExpiresAt: at(u.resetExpiresAt), createdAt: at(u.createdAt)!, lastSeenAt: at(u.lastSeenAt), onboardedAt: at(u.onboardedAt), suspendedAt: at(u.suspendedAt), suspendedUntil: at(u.suspendedUntil) });
    // Only links to players still here.
    const others = [...new Set([...s.friendships.flatMap((f) => [f.userId, f.friendId]), ...s.requests.flatMap((r) => [r.fromId, r.toId]), ...s.unfollows.map((x) => x.userId), ...s.favorites.map((x) => x.userId), ...s.offers.map((o) => o.userId)])].filter((x) => x !== id);
    const alive = new Set([id, ...(others.length ? (await tx.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.id, others))).map((r) => r.id) : [])]);
    const ownLists = new Set(s.lists.map((l) => l.id));

    if (s.lists.length) await tx.insert(schema.lists).values(s.lists.map((l) => ({ ...l, createdAt: at(l.createdAt)!, updatedAt: at(l.updatedAt)! })));
    if (s.entries.length) await tx.insert(schema.listEntries).values(s.entries.map((e) => ({ ...e, updatedAt: at(e.updatedAt)! })));
    if (s.events.length) await tx.insert(schema.listEvents).values(s.events.map(({ id: _id, ...e }) => ({ ...e, actorId: e.actorId && alive.has(e.actorId) ? e.actorId : null, createdAt: at(e.createdAt)! })));
    const offers = s.offers.filter((o) => alive.has(o.userId) && ownLists.has(o.listId));
    if (offers.length) await tx.insert(schema.listOffers).values(offers.map((o) => ({ ...o, createdAt: at(o.createdAt)! })));
    // Follows and pins: the player's own on lists still here, and friends' on the player's lists.
    const keep = async <T extends { userId: string; listId: string; createdAt: unknown }>(rows: T[]) => {
      const listIds = [...new Set(rows.map((r) => r.listId).filter((l) => !ownLists.has(l)))];
      const existing = new Set([...ownLists, ...(listIds.length ? (await tx.select({ id: schema.lists.id }).from(schema.lists).where(inArray(schema.lists.id, listIds))).map((r) => r.id) : [])]);
      return rows.filter((r) => alive.has(r.userId) && existing.has(r.listId)).map((r) => ({ ...r, createdAt: at(r.createdAt)! }));
    };
    const unfollows = await keep(s.unfollows);
    const favorites = await keep(s.favorites);
    if (unfollows.length) await tx.insert(schema.listUnfollows).values(unfollows);
    if (favorites.length) await tx.insert(schema.listFavorites).values(favorites);
    const friendships = s.friendships.filter((f) => alive.has(f.userId) && alive.has(f.friendId));
    if (friendships.length) await tx.insert(schema.friendships).values(friendships.map((f) => ({ ...f, createdAt: at(f.createdAt)! }))).onConflictDoNothing();
    const requests = s.requests.filter((r) => alive.has(r.fromId) && alive.has(r.toId));
    if (requests.length) await tx.insert(schema.friendRequests).values(requests.map((r) => ({ ...r, createdAt: at(r.createdAt)!, respondedAt: at(r.respondedAt) }))).onConflictDoNothing();
    if (s.pvp.length) await tx.insert(schema.pvpPokemon).values(s.pvp.map((p) => ({ ...p, createdAt: at(p.createdAt)! })));
    if (s.trashedLists.length) await tx.insert(schema.deletedLists).values(s.trashedLists.map((l) => ({ ...l, deletedBy: l.deletedBy && alive.has(l.deletedBy) ? l.deletedBy : null, deletedAt: at(l.deletedAt)! }))).onConflictDoNothing();
    await tx.delete(schema.deletedUsers).where(eq(schema.deletedUsers.id, id));
    return { ok: true, username: u.username } as const;
  });
}

/** Past 30 days, gone for good. */
export async function purgeAccountTrash() {
  await db.delete(schema.deletedUsers).where(lt(schema.deletedUsers.deletedAt, new Date(Date.now() - TRASH_DAYS * 86400_000)));
}
