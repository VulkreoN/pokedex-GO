import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { neutralKey, type EntryGender, type ListEvent, type ListEventItem, type ListEventKind, type Variant } from '@mydexpogo/shared';
import { db, schema } from '../db/index.js';
import type { ListEventUndoEntry, ListEventUndoPayload } from '../db/schema.js';
import { normalizeEntries } from './genders.js';

const MERGE_WINDOW_MS = 10 * 60_000;
const ITEMS_KEPT = 12;
const UNDO_ENTRIES_CAP = 5000;
const EVENTS_KEPT = 200;

const undoEntryKey = (e: { variantKey: string; gender: string; shiny: boolean; tag: string }) =>
  `${neutralKey(e.variantKey)}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`;

function mergeUndoEntries(prev: ListEventUndoEntry[] | undefined, next: ListEventUndoEntry[] | undefined): ListEventUndoEntry[] | undefined {
  if (!prev?.length && !next?.length) return undefined;
  const map = new Map<string, ListEventUndoEntry>();
  // Preserve earlier snapshot first (e.g. original done/note before removal), then add newer unique entries.
  for (const e of prev ?? []) map.set(undoEntryKey(e), e);
  for (const e of next ?? []) {
    const k = undoEntryKey(e);
    if (!map.has(k)) map.set(k, e);
  }
  return [...map.values()].slice(0, UNDO_ENTRIES_CAP);
}

/** Records an action on a collection. The same person doing the same thing within minutes adds to the last line. */
export async function recordListEvent(
  listId: string,
  actorId: string,
  kind: ListEventKind,
  items: ListEventItem[] = [],
  data?: Record<string, unknown>,
  undoPayload?: ListEventUndoPayload,
) {
  const sample = items.slice(0, ITEMS_KEPT).map(({ variantKey, gender, shiny, tag }) => ({ variantKey, gender, shiny, tag }));
  const payload: ListEventUndoPayload | null = undoPayload
    ? {
        ...(undoPayload.entries ? { entries: undoPayload.entries.slice(0, UNDO_ENTRIES_CAP) } : {}),
        ...(undoPayload.from !== undefined ? { from: undoPayload.from } : {}),
        ...(undoPayload.to !== undefined ? { to: undoPayload.to } : {}),
      }
    : null;
  const mergeable = kind !== 'renamed' && kind !== 'visibility' && kind !== 'created';
  if (mergeable) {
    const [last] = await db
      .select()
      .from(schema.listEvents)
      .where(
        and(
          eq(schema.listEvents.listId, listId),
          gt(schema.listEvents.createdAt, new Date(Date.now() - MERGE_WINDOW_MS)),
          isNull(schema.listEvents.undoneAt),
        ),
      )
      .orderBy(desc(schema.listEvents.id))
      .limit(1);
    if (last && last.kind === kind && last.actorId === actorId) {
      const mergedEntries = mergeUndoEntries(last.undoPayload?.entries, payload?.entries);
      const nextUndo: ListEventUndoPayload | null = mergedEntries ? { entries: mergedEntries } : last.undoPayload ?? payload;
      await db
        .update(schema.listEvents)
        .set({
          count: last.count + Math.max(items.length, 1),
          items: [...sample, ...last.items].slice(0, ITEMS_KEPT),
          undoPayload: nextUndo,
          createdAt: new Date(),
        })
        .where(eq(schema.listEvents.id, last.id));
      return;
    }
  }
  const [row] = await db
    .insert(schema.listEvents)
    .values({ listId, actorId, kind, count: Math.max(items.length, 1), items: sample, data: data ?? null, undoPayload: payload })
    .returning({ id: schema.listEvents.id });
  // Only the recent past is kept.
  if (row && row.id % 20 === 0) {
    await db.execute(sql`delete from list_events where list_id = ${listId} and id < (select id from list_events where list_id = ${listId} order by id desc offset ${EVENTS_KEPT} limit 1)`);
  }
}

export function isListEventUndoable(e: typeof schema.listEvents.$inferSelect): boolean {
  if (e.undoneAt) return false;
  switch (e.kind) {
    case 'created':
    case 'offer':
      return false;
    case 'renamed':
      return typeof (e.undoPayload?.from ?? e.data?.from) === 'string' && String(e.undoPayload?.from ?? e.data?.from).trim().length > 0;
    case 'visibility': {
      const target = e.undoPayload?.from ?? e.data?.from ?? (e.data?.to === 'private' ? 'friends' : e.data?.to === 'friends' ? 'private' : null);
      return target === 'private' || target === 'friends';
    }
    case 'added':
    case 'removed':
    case 'caught':
    case 'uncaught':
      if (e.undoPayload?.entries?.length) return true;
      // Legacy events recorded before undo_payload existed are still undoable when nothing was truncated.
      return e.items.length > 0 && e.count <= e.items.length;
    default:
      return false;
  }
}

/** Newest first, a page at a time (before = the id of the last event already shown). */
export async function listHistory(listId: string, before?: number, limit = 30, isOwner = false): Promise<ListEvent[]> {
  const rows = await db
    .select({ e: schema.listEvents, actorName: schema.users.username })
    .from(schema.listEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.listEvents.actorId))
    .where(and(eq(schema.listEvents.listId, listId), before ? lt(schema.listEvents.id, before) : undefined))
    .orderBy(desc(schema.listEvents.id))
    .limit(limit);
  return rows.map(({ e, actorName }) => ({
    id: e.id,
    kind: e.kind,
    actorName,
    count: e.count,
    items: e.items,
    data: e.data,
    at: e.createdAt.toISOString(),
    undoneAt: e.undoneAt?.toISOString() ?? null,
    undoable: isOwner && isListEventUndoable(e),
  }));
}

export async function undoListEvent(
  listId: string,
  eventId: number,
  variants: Map<string, Variant> | null,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'not_undoable' }> {
  return db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(schema.listEvents)
      .where(and(eq(schema.listEvents.id, eventId), eq(schema.listEvents.listId, listId)))
      .limit(1);
    if (!e) return { ok: false, error: 'not_found' } as const;
    if (!isListEventUndoable(e)) return { ok: false, error: 'not_undoable' } as const;

    const now = new Date();
    // Claim the event atomically so concurrent double-clicks cannot undo the same event twice.
    const claimed = await tx
      .update(schema.listEvents)
      .set({ undoneAt: now })
      .where(and(eq(schema.listEvents.id, eventId), eq(schema.listEvents.listId, listId), isNull(schema.listEvents.undoneAt)))
      .returning({ id: schema.listEvents.id });
    if (!claimed.length) return { ok: false, error: 'not_undoable' } as const;

    const entriesFromEvent = (): ListEventUndoEntry[] =>
      e.undoPayload?.entries?.length
        ? e.undoPayload.entries
        : e.items.map((it) => ({ variantKey: neutralKey(it.variantKey), gender: it.gender ?? '', shiny: it.shiny, tag: it.tag }));

    if (e.kind === 'renamed') {
      const from = String(e.undoPayload?.from ?? e.data?.from ?? '').trim().slice(0, 60);
      if (from) await tx.update(schema.lists).set({ name: from, updatedAt: now }).where(eq(schema.lists.id, listId));
    } else if (e.kind === 'visibility') {
      const rawFrom = e.undoPayload?.from ?? e.data?.from ?? (e.data?.to === 'private' ? 'friends' : 'private');
      const vis = rawFrom === 'private' ? 'private' : 'friends';
      await tx
        .update(schema.lists)
        .set({ visibility: vis, ...(vis === 'private' ? { shareToken: null } : {}), updatedAt: now })
        .where(eq(schema.lists.id, listId));
    } else if (e.kind === 'added') {
      for (const it of entriesFromEvent()) {
        await tx
          .delete(schema.listEntries)
          .where(
            and(
              eq(schema.listEntries.listId, listId),
              eq(schema.listEntries.variantKey, neutralKey(it.variantKey)),
              eq(schema.listEntries.shiny, it.shiny),
              eq(schema.listEntries.tag, it.tag),
              eq(schema.listEntries.gender, it.gender),
            ),
          );
      }
      await tx.update(schema.lists).set({ updatedAt: now }).where(eq(schema.lists.id, listId));
    } else if (e.kind === 'removed') {
      const raw = entriesFromEvent();
      let toInsert: ListEventUndoEntry[] = raw;
      // Legacy removed events might have omitted gender ('') on gendered species: expand safely when dataset is ready.
      if (!e.undoPayload?.entries?.length && variants) {
        toInsert = [];
        for (const it of raw) {
          try {
            const expanded = normalizeEntries(
              [{ variantKey: it.variantKey, gender: (it.gender || undefined) as EntryGender | undefined }],
              variants,
            );
            for (const x of expanded) toInsert.push({ ...it, variantKey: x.variantKey, gender: x.gender });
          } catch {
            // Variant no longer exists in the Pokédex: skip safely.
          }
        }
      }
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(position), 0)`.mapWith(Number) })
        .from(schema.listEntries)
        .where(eq(schema.listEntries.listId, listId));
      let position = maxRow?.max ?? 0;
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        await tx
          .insert(schema.listEntries)
          .values(
            chunk.map((it) => ({
              listId,
              variantKey: neutralKey(it.variantKey),
              gender: it.gender,
              shiny: it.shiny,
              tag: it.tag,
              done: !!it.done,
              note: it.note ?? null,
              position: it.position ?? ++position,
              updatedAt: now,
            })),
          )
          .onConflictDoNothing();
      }
      await tx.update(schema.lists).set({ updatedAt: now }).where(eq(schema.lists.id, listId));
    } else if (e.kind === 'caught' || e.kind === 'uncaught') {
      const targetDone = e.kind === 'uncaught';
      for (const it of entriesFromEvent()) {
        await tx
          .update(schema.listEntries)
          .set({ done: targetDone, updatedAt: now })
          .where(
            and(
              eq(schema.listEntries.listId, listId),
              eq(schema.listEntries.variantKey, neutralKey(it.variantKey)),
              eq(schema.listEntries.shiny, it.shiny),
              eq(schema.listEntries.tag, it.tag),
              eq(schema.listEntries.gender, it.gender),
            ),
          );
      }
      await tx.update(schema.lists).set({ updatedAt: now }).where(eq(schema.lists.id, listId));
    }
    return { ok: true } as const;
  });
}
