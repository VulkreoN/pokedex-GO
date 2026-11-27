/**
 * List entries carry their gender apart from the variant key: "26.g2" (female picture) becomes key "26" + gender "f".
 * Which genders a variant exists in comes from the game master (Variant.genders): a female-only Pokémon cannot get a
 * male entry, a genderless one has gender ''.
 */
import { and, eq, like, sql } from 'drizzle-orm';
import { neutralKey, type EntryGender, type Gender, type Variant } from '@mydexpogo/shared';
import { db, schema } from '../db/index.js';

export class GenderError extends Error {
  constructor(public code: 'unknown_variant' | 'invalid_gender', public variantKey: string) {
    super(code);
  }
}

/** Genders an entry of this key may have, or null when the dataset is not loaded or does not know the key. */
export function gendersOf(key: string, variants: Map<string, Variant> | null): Gender[] | null {
  const v = variants?.get(neutralKey(key));
  if (!v) return null;
  return v.genders ?? ['m', 'f'];
}

export interface EntryIn {
  variantKey: string;
  gender?: EntryGender;
}

/**
 * Validates and expands incoming entries. No gender on a Pokémon that has both = one entry per gender.
 * Throws GenderError on a gender the variant does not exist in, or on an unknown variant.
 */
export function normalizeEntries<T extends EntryIn>(entries: T[], variants: Map<string, Variant> | null): (T & { variantKey: string; gender: EntryGender })[] {
  const out: (T & { variantKey: string; gender: EntryGender })[] = [];
  for (const e of entries) {
    const key = neutralKey(e.variantKey);
    let gender: EntryGender = e.gender ?? '';
    if (e.variantKey.endsWith('.g2') && !gender) gender = 'f'; // older app versions send the female picture's key
    if (!variants) {
      out.push({ ...e, variantKey: key, gender });
      continue;
    }
    const allowed = gendersOf(key, variants);
    if (!allowed) throw new GenderError('unknown_variant', e.variantKey);
    if (!allowed.length) {
      if (gender) throw new GenderError('invalid_gender', e.variantKey);
      out.push({ ...e, variantKey: key, gender: '' });
    } else if (!gender) {
      for (const g of allowed) out.push({ ...e, variantKey: key, gender: g });
    } else if (!allowed.includes(gender)) {
      throw new GenderError('invalid_gender', e.variantKey);
    } else out.push({ ...e, variantKey: key, gender });
  }
  return out;
}

/**
 * One-time (and idempotent) conversion of entries saved before genders existed:
 * - "X.g2" rows become X + 'f' (merged into an existing row if any);
 * - '' rows of a Pokémon with a distinct female picture were the male card: they become 'm';
 * - '' rows of other gendered Pokémon become one row per possible gender, keeping their state.
 */
export async function migrateStoredGendersDetailed(variants: Map<string, Variant>): Promise<{ changed: number; listIds: string[] }> {
  let changed = 0;
  const listIds = new Set<string>();
  await db.transaction(async (tx) => {
    const g2 = await tx.select().from(schema.listEntries).where(like(schema.listEntries.variantKey, '%.g2'));
    const blank = await tx.select().from(schema.listEntries).where(and(eq(schema.listEntries.gender, ''), sql`${schema.listEntries.variantKey} not like '%.g2'`));
    for (const e of blank) {
      const allowed = gendersOf(e.variantKey, variants);
      if (!allowed?.length) continue; // genderless or unknown: stays ''
      const hasFemalePicture = variants.has(`${e.variantKey}.g2`);
      const genders: Gender[] = hasFemalePicture ? (allowed.includes('m') ? ['m'] : allowed) : allowed;
      for (const g of genders) {
        await tx
          .insert(schema.listEntries)
          .values({ ...e, gender: g })
          .onConflictDoUpdate({
            target: [schema.listEntries.listId, schema.listEntries.variantKey, schema.listEntries.shiny, schema.listEntries.tag, schema.listEntries.gender],
            set: { done: sql`${schema.listEntries.done} or excluded.done` },
          });
      }
      await tx.delete(schema.listEntries).where(and(eq(schema.listEntries.listId, e.listId), eq(schema.listEntries.variantKey, e.variantKey), eq(schema.listEntries.shiny, e.shiny), eq(schema.listEntries.tag, e.tag), eq(schema.listEntries.gender, '')));
      listIds.add(e.listId);
      changed++;
    }
    for (const e of g2) {
      const key = neutralKey(e.variantKey);
      await tx
        .insert(schema.listEntries)
        .values({ ...e, variantKey: key, gender: 'f' })
        .onConflictDoUpdate({
          target: [schema.listEntries.listId, schema.listEntries.variantKey, schema.listEntries.shiny, schema.listEntries.tag, schema.listEntries.gender],
          set: { done: sql`${schema.listEntries.done} or excluded.done` },
        });
      await tx.delete(schema.listEntries).where(and(eq(schema.listEntries.listId, e.listId), eq(schema.listEntries.variantKey, e.variantKey), eq(schema.listEntries.shiny, e.shiny), eq(schema.listEntries.tag, e.tag), eq(schema.listEntries.gender, e.gender)));
      listIds.add(e.listId);
      changed++;
    }
    // Entries whose gender the variant turned out not to have (a manager set "male only" on a new costume):
    // moved to the remaining gender, or dropped when that one is already listed.
    const gendered = await tx.select().from(schema.listEntries).where(sql`${schema.listEntries.gender} <> ''`);
    for (const e of gendered) {
      const allowed = gendersOf(e.variantKey, variants);
      if (!allowed || allowed.includes(e.gender as Gender)) continue;
      const where = and(eq(schema.listEntries.listId, e.listId), eq(schema.listEntries.variantKey, e.variantKey), eq(schema.listEntries.shiny, e.shiny), eq(schema.listEntries.tag, e.tag), eq(schema.listEntries.gender, e.gender));
      // Not in a two-gender list, so the variant has one gender or none.
      const target: EntryGender = allowed[0] ?? '';
      const exists =
        (await tx.select().from(schema.listEntries).where(and(eq(schema.listEntries.listId, e.listId), eq(schema.listEntries.variantKey, e.variantKey), eq(schema.listEntries.shiny, e.shiny), eq(schema.listEntries.tag, e.tag), eq(schema.listEntries.gender, target))).limit(1)).length > 0;
      if (exists) await tx.delete(schema.listEntries).where(where);
      else await tx.update(schema.listEntries).set({ gender: target }).where(where);
      listIds.add(e.listId);
      changed++;
    }
  });
  if (changed) console.log(`lists: ${changed} entries converted to per-gender entries`);
  return { changed, listIds: [...listIds] };
}

export async function migrateStoredGenders(variants: Map<string, Variant>): Promise<number> {
  return (await migrateStoredGendersDetailed(variants)).changed;
}
