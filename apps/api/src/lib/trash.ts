/** Deleted collections, kept whole for 30 days so an admin can restore one. */
import { eq, inArray, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const TRASH_DAYS = 30;

type Snapshot = {
  list: typeof schema.lists.$inferSelect;
  entries: (typeof schema.listEntries.$inferSelect)[];
  events: (typeof schema.listEvents.$inferSelect)[];
  unfollows: (typeof schema.listUnfollows.$inferSelect)[];
  favorites: (typeof schema.listFavorites.$inferSelect)[];
};

/** Copies the collection to the trash, then deletes it. */
export async function trashList(listId: string, deletedBy: string | null): Promise<{ name: string; entries: number } | null> {
  return db.transaction(async (tx) => {
    const [list] = await tx.select().from(schema.lists).where(eq(schema.lists.id, listId)).limit(1);
    if (!list) return null;
    const [entries, events, unfollows, favorites] = await Promise.all([
      tx.select().from(schema.listEntries).where(eq(schema.listEntries.listId, listId)),
      tx.select().from(schema.listEvents).where(eq(schema.listEvents.listId, listId)),
      tx.select().from(schema.listUnfollows).where(eq(schema.listUnfollows.listId, listId)),
      tx.select().from(schema.listFavorites).where(eq(schema.listFavorites.listId, listId)),
    ]);
    const snapshot: Snapshot = { list, entries, events, unfollows, favorites };
    await tx
      .insert(schema.deletedLists)
      .values({ id: list.id, ownerId: list.ownerId, name: list.name, entries: entries.length, deletedBy, snapshot: snapshot as unknown as Record<string, unknown> })
      .onConflictDoUpdate({ target: schema.deletedLists.id, set: { name: list.name, entries: entries.length, deletedBy, deletedAt: new Date(), snapshot: snapshot as unknown as Record<string, unknown> } });
    await tx.delete(schema.lists).where(eq(schema.lists.id, listId));
    return { name: list.name, entries: entries.length };
  });
}

const date = (v: unknown) => (v ? new Date(v as string) : new Date());

/** Puts a trashed collection back, first in its owner's order. Null when it is no longer in the trash. */
export async function restoreList(id: string): Promise<{ ownerId: string; name: string } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.deletedLists).where(eq(schema.deletedLists.id, id)).limit(1);
    if (!row) return null;
    const s = row.snapshot as unknown as Snapshot;
    const [top] = await tx.select({ min: sql<number>`coalesce(min(${schema.lists.position}), 0)`.mapWith(Number) }).from(schema.lists).where(eq(schema.lists.ownerId, row.ownerId));
    await tx.insert(schema.lists).values({ ...s.list, alertPreEvolutions: s.list.alertPreEvolutions ?? false, position: (top?.min ?? 0) - 1, createdAt: date(s.list.createdAt), updatedAt: new Date() });
    if (s.entries.length) await tx.insert(schema.listEntries).values(s.entries.map((e) => ({ ...e, updatedAt: date(e.updatedAt) })));
    // History rows get new ids; their dates stay.
    if (s.events.length) await tx.insert(schema.listEvents).values(s.events.map(({ id: _id, ...e }) => ({ ...e, createdAt: date(e.createdAt) })));
    // Follows and pins of players still around.
    const alive = async (ids: string[]) => new Set(ids.length ? (await tx.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.id, ids))).map((u) => u.id) : []);
    const people = await alive([...new Set([...s.unfollows, ...s.favorites].map((x) => x.userId))]);
    const unf = s.unfollows.filter((x) => people.has(x.userId));
    const fav = s.favorites.filter((x) => people.has(x.userId));
    if (unf.length) await tx.insert(schema.listUnfollows).values(unf.map((x) => ({ ...x, createdAt: date(x.createdAt) })));
    if (fav.length) await tx.insert(schema.listFavorites).values(fav.map((x) => ({ ...x, createdAt: date(x.createdAt) })));
    await tx.delete(schema.deletedLists).where(eq(schema.deletedLists.id, id));
    return { ownerId: row.ownerId, name: row.name };
  });
}

/** Past 30 days, gone for good. */
export async function purgeTrash() {
  await db.delete(schema.deletedLists).where(lt(schema.deletedLists.deletedAt, new Date(Date.now() - TRASH_DAYS * 86400_000)));
}
