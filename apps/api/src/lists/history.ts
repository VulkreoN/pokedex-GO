import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { ListEvent, ListEventItem, ListEventKind } from '@mydexpogo/shared';
import { db, schema } from '../db/index.js';

const MERGE_WINDOW_MS = 10 * 60_000;
const ITEMS_KEPT = 12;
const EVENTS_KEPT = 200;

/** Records an action on a collection. The same person doing the same thing within minutes adds to the last line. */
export async function recordListEvent(listId: string, actorId: string, kind: ListEventKind, items: ListEventItem[] = [], data?: Record<string, unknown>) {
  const sample = items.slice(0, ITEMS_KEPT).map(({ variantKey, gender, shiny, tag }) => ({ variantKey, gender, shiny, tag }));
  const mergeable = kind !== 'renamed' && kind !== 'visibility' && kind !== 'created';
  if (mergeable) {
    const [last] = await db
      .select()
      .from(schema.listEvents)
      .where(and(eq(schema.listEvents.listId, listId), gt(schema.listEvents.createdAt, new Date(Date.now() - MERGE_WINDOW_MS))))
      .orderBy(desc(schema.listEvents.id))
      .limit(1);
    if (last && last.kind === kind && last.actorId === actorId) {
      await db
        .update(schema.listEvents)
        .set({ count: last.count + Math.max(items.length, 1), items: [...sample, ...last.items].slice(0, ITEMS_KEPT), createdAt: new Date() })
        .where(eq(schema.listEvents.id, last.id));
      return;
    }
  }
  const [row] = await db.insert(schema.listEvents).values({ listId, actorId, kind, count: Math.max(items.length, 1), items: sample, data: data ?? null }).returning({ id: schema.listEvents.id });
  // Only the recent past is kept.
  if (row && row.id % 20 === 0) {
    await db.execute(sql`delete from list_events where list_id = ${listId} and id < (select id from list_events where list_id = ${listId} order by id desc offset ${EVENTS_KEPT} limit 1)`);
  }
}

/** Newest first, a page at a time (before = the id of the last event already shown). */
export async function listHistory(listId: string, before?: number, limit = 30): Promise<ListEvent[]> {
  const rows = await db
    .select({ e: schema.listEvents, actorName: schema.users.username })
    .from(schema.listEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.listEvents.actorId))
    .where(and(eq(schema.listEvents.listId, listId), before ? lt(schema.listEvents.id, before) : undefined))
    .orderBy(desc(schema.listEvents.id))
    .limit(limit);
  return rows.map(({ e, actorName }) => ({ id: e.id, kind: e.kind, actorName, count: e.count, items: e.items, data: e.data, at: e.createdAt.toISOString() }));
}
