/**
 * Starter templates for creating or filling a collection in one tap (Living Dex, Shinies, Costumes, Megas, Gen 1..9…).
 */
import { neutralKey, type EntryTag, type Variant } from '@mydexpogo/shared';
import type { DatasetIndex } from './dataset.js';
import type { EntryInput } from './lists.js';

export type ListTemplateId =
  | 'empty'
  | 'living_released'
  | 'shiny_released'
  | 'costumes'
  | 'regional'
  | 'mega_gmax'
  | 'lucky_released'
  | 'gen1'
  | 'gen2'
  | 'gen3'
  | 'gen4'
  | 'gen5'
  | 'gen6'
  | 'gen7'
  | 'gen8'
  | 'gen9';

export const LIST_TEMPLATES: readonly ListTemplateId[] = [
  'empty',
  'living_released',
  'shiny_released',
  'costumes',
  'regional',
  'mega_gmax',
  'lucky_released',
  'gen1',
  'gen2',
  'gen3',
  'gen4',
  'gen5',
  'gen6',
  'gen7',
  'gen8',
  'gen9',
];

/** Builds deduplicated gender-neutral entries for a collection template. */
export function buildTemplateEntries(idx: DatasetIndex, id: ListTemplateId): EntryInput[] {
  if (id === 'empty') return [];
  const genMatch = /^gen(\d)$/.exec(id);
  const targetGen = genMatch ? Number(genMatch[1]) : 0;

  const isReleased = (v: Variant) => {
    const sp = idx.speciesByDex.get(v.dex);
    return !!sp?.released && !v.datamined;
  };
  const isShinyOut = (v: Variant) => {
    const sp = idx.speciesByDex.get(v.dex);
    return isReleased(v) && v.hasShiny && v.shinyReleased !== false && sp?.shinyReleased !== false;
  };

  let shiny = false;
  let tag: EntryTag = '';
  let picked: Variant[] = [];

  if (id === 'living_released' || id === 'lucky_released') {
    if (id === 'lucky_released') tag = 'lucky';
    picked = idx.ds.variants.filter((v) => v.kind === 'base' && isReleased(v));
  } else if (id === 'shiny_released') {
    shiny = true;
    picked = idx.ds.variants.filter((v) => v.kind === 'base' && isShinyOut(v));
  } else if (id === 'costumes') {
    picked = idx.ds.variants.filter((v) => v.kind === 'costume' && isReleased(v));
  } else if (id === 'regional') {
    picked = idx.ds.variants.filter((v) => v.kind === 'regional' && isReleased(v));
  } else if (id === 'mega_gmax') {
    picked = idx.ds.variants.filter((v) => (v.kind === 'mega' || v.kind === 'gmax') && isReleased(v));
  } else if (targetGen > 0) {
    picked = idx.ds.variants.filter((v) => {
      const sp = idx.speciesByDex.get(v.dex);
      return v.kind === 'base' && sp?.gen === targetGen && isReleased(v);
    });
  }

  // Deduplicate on neutralKey (male + female art share one neutral key; server expands genders per game master).
  const keys = new Set<string>();
  const out: EntryInput[] = [];
  for (const v of picked) {
    const key = neutralKey(v.key);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({ variantKey: key, shiny, tag, done: false });
  }
  return out;
}
