/**
 * Keeps players' collections consistent when a manager modifies a variant in the Pokédex:
 * - Variant hidden (removed from Pokédex) -> removes entries for that variant.
 * - Variant marked not released -> removes entries for that variant.
 * - Shiny marked not available -> removes shiny entries for that variant.
 * - Genders changed -> migrates stored entries to the valid genders.
 * Broadcasts live SSE events so every connected client sees the updated Pokédex and collections immediately.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { neutralKey, type Variant } from '@mydexpogo/shared';
import { db, schema } from '../db/index.js';
import { hub } from '../notify/hub.js';
import { friendIdsOf } from '../routes/lists.js';
import { migrateStoredGendersDetailed } from './genders.js';

export interface PrunedCollectionEntry {
  listId: string;
  variantKey: string;
  gender: string;
  shiny: boolean;
  tag: string;
  done: boolean;
  note: string | null;
  position: number;
}

export interface VariantOverrideTransition {
  key: string;
  was: { released: boolean; shinyReleased: boolean; genders: string[] | null; hidden: boolean } | null;
  now: { released: boolean; shinyReleased: boolean; genders: string[] | null; hidden: boolean } | null;
  /** Explicit override values set in this action (used to prune stale entries even if auto detection already matched). */
  explicit?: { released?: boolean | null; shinyReleased?: boolean | null; hidden?: boolean | null; genders?: string[] | null };
}

export interface SyncCollectionsResult {
  listsUpdated: number;
  entriesRemoved: number;
  gendersMigrated: number;
  prunedByKey: Map<string, PrunedCollectionEntry[]>;
}

const MAX_PRUNED_AUDIT = 2000;

async function notifyListsUpdated(listIds: Iterable<string>) {
  const ids = [...new Set(listIds)];
  if (!ids.length) return;
  const now = new Date();
  await db.update(schema.lists).set({ updatedAt: now }).where(inArray(schema.lists.id, ids));
  const lists = await db
    .select({ id: schema.lists.id, ownerId: schema.lists.ownerId })
    .from(schema.lists)
    .where(inArray(schema.lists.id, ids));
  const friendsCache = new Map<string, string[]>();
  for (const l of lists) {
    let friends = friendsCache.get(l.ownerId);
    if (!friends) {
      friends = await friendIdsOf(l.ownerId);
      friendsCache.set(l.ownerId, friends);
    }
    hub.emit([l.ownerId, ...friends], { type: 'list', listId: l.id, ownerId: l.ownerId });
  }
}

export async function syncCollectionsForOverrides(
  transitions: VariantOverrideTransition[],
  variants: Map<string, Variant> | null,
): Promise<SyncCollectionsResult> {
  const affectedLists = new Set<string>();
  const prunedByKey = new Map<string, PrunedCollectionEntry[]>();
  const seenNeutral = new Set<string>();
  let entriesRemoved = 0;
  let needGenderMigration = false;

  for (const tr of transitions) {
    const nk = neutralKey(tr.key);
    const gendersChanged = JSON.stringify(tr.was?.genders ?? null) !== JSON.stringify(tr.now?.genders ?? null);
    if (gendersChanged || tr.explicit?.genders !== undefined) needGenderMigration = true;

    if (seenNeutral.has(nk)) continue;
    seenNeutral.add(nk);

    const becameHidden = tr.now?.hidden === true || tr.explicit?.hidden === true;
    const becameUnreleased = (tr.was?.released === true && tr.now?.released === false) || tr.explicit?.released === false;
    const becameNoShiny = (tr.was?.shinyReleased === true && tr.now?.shinyReleased === false) || tr.explicit?.shinyReleased === false;

    let deleted: PrunedCollectionEntry[] = [];
    if (becameHidden || becameUnreleased) {
      deleted = await db
        .delete(schema.listEntries)
        .where(eq(schema.listEntries.variantKey, nk))
        .returning({
          listId: schema.listEntries.listId,
          variantKey: schema.listEntries.variantKey,
          gender: schema.listEntries.gender,
          shiny: schema.listEntries.shiny,
          tag: schema.listEntries.tag,
          done: schema.listEntries.done,
          note: schema.listEntries.note,
          position: schema.listEntries.position,
        });
    } else if (becameNoShiny) {
      deleted = await db
        .delete(schema.listEntries)
        .where(and(eq(schema.listEntries.variantKey, nk), eq(schema.listEntries.shiny, true)))
        .returning({
          listId: schema.listEntries.listId,
          variantKey: schema.listEntries.variantKey,
          gender: schema.listEntries.gender,
          shiny: schema.listEntries.shiny,
          tag: schema.listEntries.tag,
          done: schema.listEntries.done,
          note: schema.listEntries.note,
          position: schema.listEntries.position,
        });
    }

    if (deleted.length) {
      entriesRemoved += deleted.length;
      for (const row of deleted) affectedLists.add(row.listId);
      prunedByKey.set(nk, deleted.slice(0, MAX_PRUNED_AUDIT));
    }
  }

  let gendersMigrated = 0;
  if (needGenderMigration && variants) {
    const migrated = await migrateStoredGendersDetailed(variants);
    gendersMigrated = migrated.changed;
    for (const id of migrated.listIds) affectedLists.add(id);
  }

  await notifyListsUpdated(affectedLists);
  hub.emitAll({ type: 'dataset' });

  return {
    listsUpdated: affectedLists.size,
    entriesRemoved,
    gendersMigrated,
    prunedByKey,
  };
}

/** Restores entries previously pruned by a manager override when an admin undoes that override from the journal. */
export async function restorePrunedEntries(pruned: PrunedCollectionEntry[] | undefined): Promise<number> {
  if (!Array.isArray(pruned) || !pruned.length) return 0;
  const listIds = [...new Set(pruned.map((p) => p.listId))];
  const existingLists = new Set(
    (await db.select({ id: schema.lists.id }).from(schema.lists).where(inArray(schema.lists.id, listIds))).map((r) => r.id),
  );
  const valid = pruned.filter((p) => existingLists.has(p.listId));
  if (!valid.length) return 0;
  const now = new Date();
  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500);
    await db
      .insert(schema.listEntries)
      .values(
        chunk.map((e) => ({
          listId: e.listId,
          variantKey: e.variantKey,
          gender: e.gender,
          shiny: e.shiny,
          tag: e.tag,
          done: e.done,
          note: e.note ?? null,
          position: e.position ?? 0,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }
  await notifyListsUpdated(valid.map((p) => p.listId));
  return valid.length;
}
