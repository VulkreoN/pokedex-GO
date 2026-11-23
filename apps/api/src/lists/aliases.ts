/**
 * When the dataset folds a variant into another (a formless duplicate of a form), saved entries, "I have it" marks
 * and reports move to the replacing key; an entry already there wins.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export async function migrateAliases(aliases: Record<string, string> | undefined): Promise<number> {
  let moved = 0;
  for (const [from, to] of Object.entries(aliases ?? {})) {
    await db.transaction(async (tx) => {
      const copied = await tx.execute(sql`
        insert into list_entries (list_id, variant_key, shiny, tag, gender, done, note, position, updated_at)
        select list_id, ${to}, shiny, tag, gender, done, note, position, updated_at from list_entries where variant_key = ${from}
        on conflict do nothing`);
      await tx.execute(sql`
        insert into list_offers (list_id, variant_key, shiny, tag, gender, user_id, created_at)
        select list_id, ${to}, shiny, tag, gender, user_id, created_at from list_offers where variant_key = ${from}
        on conflict do nothing`);
      await tx.execute(sql`delete from list_offers where variant_key = ${from}`);
      await tx.execute(sql`delete from list_entries where variant_key = ${from}`);
      await tx.execute(sql`update reports set variant_key = ${to} where variant_key = ${from}`);
      moved += copied.count ?? 0;
    });
  }
  return moved;
}
