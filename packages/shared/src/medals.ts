/**
 * Trainer medals (Bronze / Silver / Gold / Platinum) & collection progress stats.
 * Mirrors Pokémon GO's in-game Pokédex categories, iconic collector badges (Unown, Vivillon, Mega Guru…)
 * and regional Pokédexes (Kanto → Paldea), with dynamic Platinum thresholds scaled to the released Pokédex.
 */
import { neutralKey } from './keys.js';
import type { Dataset, MembershipEntry, Species, Variant, VariantKind } from './types.js';
import { vivillonPatternFromKey } from './vivillon.js';

export type MedalTier = 0 | 1 | 2 | 3 | 4; // locked | bronze | silver | gold | platinum

export type MedalCategory = 'pokedex' | 'challenge' | 'region';

export type MedalId =
  // In-game Pokédex categories (9)
  | 'national_dex'
  | 'shiny_dex'
  | 'variants_dex'
  | 'lucky_dex'
  | 'shadow_dex'
  | 'purified_dex'
  | 'mega_dex'
  | 'max_dex'
  | 'costume_dex'
  // Iconic Pokémon GO & collector challenges (8)
  | 'unown'
  | 'vivillon'
  | 'regional_dex'
  | 'legendary'
  | 'shiny_legendary'
  | 'shiny_costume'
  | 'size_dex'
  | 'completed_lists'
  // Regional Pokédexes Gen 1–9 (9)
  | `gen_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** Minimum entries a collection must have to count toward the Completionist medal (prevents 1-Pokémon list cheese). */
export const MEDAL_MIN_LIST_ENTRIES = 25;

export interface Medal {
  id: MedalId;
  category: MedalCategory;
  gen?: number;
  value: number;
  thresholds: readonly [number, number, number, number];
  tier: MedalTier;
  next: number | null;
  /** 0..1 progress within the current tier toward the next tier (or 1 when platinum). */
  progress: number;
}

export interface MedalsInput {
  entries: Pick<MembershipEntry, 'variantKey' | 'shiny' | 'tag' | 'done'>[];
  completedLists: number;
  /** Kept optional for backwards compatibility with older profile payloads. */
  friendsCount?: number;
  pvpCount?: number;
}

export interface CollectionStats {
  total: number;
  done: number;
  pct: number;
  shinyTotal: number;
  shinyDone: number;
  byGen: { gen: number; total: number; done: number }[];
  byKind: { kind: VariantKind; total: number; done: number }[];
  byTag: { tag: string; total: number; done: number }[];
}

/** Fixed thresholds for medals whose real game pool is not enumerated per-species in Dataset (or is exact in Pokémon GO). */
const FIXED_THRESHOLDS = {
  shadow_dex: [25, 100, 225, 400] as const,
  purified_dex: [25, 100, 225, 400] as const,
  max_dex: [15, 45, 100, 200] as const,
  unown: [3, 10, 26, 28] as const,        // Exact Pokémon GO Unown medal
  vivillon: [1, 9, 15, 18] as const,      // Exact Pokémon GO Vivillon Collector medal
  size_dex: [15, 75, 200, 500] as const,  // Matches Pokémon GO 500 Platinum for Jumbo/Tiny
  completed_lists: [1, 3, 7, 15] as const,
};

/** Computes strictly increasing Bronze / Silver / Gold / Platinum thresholds scaled to the live released pool. */
export function scaledThresholds(
  cap: number,
  ratios: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const c = Math.max(4, cap);
  const t4 = Math.max(4, Math.round(c * ratios[3]));
  const t3 = Math.min(t4 - 1, Math.max(3, Math.round(c * ratios[2])));
  const t2 = Math.min(t3 - 1, Math.max(2, Math.round(c * ratios[1])));
  const t1 = Math.min(t2 - 1, Math.max(1, Math.round(c * ratios[0])));
  return [t1, t2, t3, t4];
}

export function tierFor(value: number, thresholds: readonly [number, number, number, number]): { tier: MedalTier; next: number | null; progress: number } {
  let tier: MedalTier = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]!) tier = (i + 1) as MedalTier;
  }
  const next = tier < 4 ? thresholds[tier as 0 | 1 | 2 | 3] : null;
  const prev = tier > 0 ? thresholds[(tier - 1) as 0 | 1 | 2 | 3] : 0;
  const progress = next === null ? 1 : next === prev ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
  return { tier, next, progress };
}

function makeMedal(
  id: MedalId,
  category: MedalCategory,
  value: number,
  thresholds: readonly [number, number, number, number],
  gen?: number,
): Medal {
  const { tier, next, progress } = tierFor(value, thresholds);
  return { id, category, ...(gen ? { gen } : {}), value, thresholds, tier, next, progress };
}

/** Computes all Pokédex, Pokémon GO challenge, and regional (Gen 1–9) trainer medals from deduplicated caught entries. */
export function computeMedals(
  ds: Pick<Dataset, 'species' | 'variants'>,
  input: MedalsInput,
): { pokedex: Medal[]; challenges: Medal[]; regions: Medal[]; summary: Record<MedalTier, number> } {
  const speciesByDex = new Map<number, Species>(ds.species.map((s) => [s.dex, s]));
  const variantByKey = new Map<string, Variant>();
  for (const v of ds.variants) {
    const k = neutralKey(v.key);
    const prev = variantByKey.get(k);
    if (!prev || (prev.datamined && !v.datamined)) variantByKey.set(k, v);
  }

  const isVariantReleased = (v: Variant) => !!speciesByDex.get(v.dex)?.released && !v.datamined;
  const isVariantShinyReleased = (v: Variant) =>
    isVariantReleased(v) && v.hasShiny && v.shinyReleased !== false && speciesByDex.get(v.dex)?.shinyReleased !== false;

  // Live released pools for dynamic thresholds.
  let releasedSpecies = 0;
  let releasedRare = 0;
  const releasedByGen = new Map<number, number>();
  for (const s of ds.species) {
    if (!s.released) continue;
    releasedSpecies++;
    if (s.rarity !== 'normal') releasedRare++;
    if (s.gen >= 1 && s.gen <= 9) releasedByGen.set(s.gen, (releasedByGen.get(s.gen) ?? 0) + 1);
  }

  let releasedVariants = 0;
  let releasedMegas = 0;
  let releasedCostumes = 0;
  let releasedShinyCostumes = 0;
  let releasedRegionals = 0;
  const releasedShinySpeciesSet = new Set<number>();
  const releasedShinyRareSet = new Set<number>();

  for (const v of variantByKey.values()) {
    if (!isVariantReleased(v)) continue;
    releasedVariants++;
    if (v.kind === 'mega') releasedMegas++;
    if (v.kind === 'costume') releasedCostumes++;
    if (v.kind === 'regional') releasedRegionals++;
    if (isVariantShinyReleased(v)) {
      releasedShinySpeciesSet.add(v.dex);
      if (speciesByDex.get(v.dex)?.rarity !== 'normal') releasedShinyRareSet.add(v.dex);
      if (v.kind === 'costume') releasedShinyCostumes++;
    }
  }

  // Deduplicated caught sets (only released entries count toward released-pool medals).
  const caughtSpecies = new Set<number>();
  const caughtShinySpecies = new Set<number>();
  const caughtVariants = new Set<string>();
  const caughtLuckySpecies = new Set<number>();
  const caughtShadowSpecies = new Set<number>();
  const caughtPurifiedSpecies = new Set<number>();
  const caughtMegas = new Set<string>();
  const caughtMax = new Set<string>();
  const caughtCostumes = new Set<string>();
  const caughtShinyCostumes = new Set<string>();
  const caughtRegionals = new Set<string>();
  const caughtUnowns = new Set<string>();
  const caughtVivillons = new Set<string>();
  const caughtRare = new Set<number>();
  const caughtShinyRare = new Set<number>();
  const caughtSizes = new Set<string>();
  const caughtDexByGen = new Map<number, Set<number>>();

  for (const e of input.entries) {
    if (!e.done) continue;
    const k = neutralKey(e.variantKey);
    const v = variantByKey.get(k);
    const dex = v?.dex ?? Number(k.split('.')[0]);
    const sp = speciesByDex.get(dex);
    const spReleased = !!sp?.released;
    const varReleased = v ? isVariantReleased(v) : spReleased;
    const shinyEligible = e.shiny && spReleased && sp.shinyReleased !== false && (!v || isVariantShinyReleased(v));

    if (spReleased && sp) {
      caughtSpecies.add(sp.dex);
      if (sp.gen >= 1 && sp.gen <= 9) {
        (caughtDexByGen.get(sp.gen) ?? caughtDexByGen.set(sp.gen, new Set()).get(sp.gen)!).add(sp.dex);
      }
      if (sp.rarity !== 'normal') caughtRare.add(sp.dex);
      if (e.tag === 'lucky') caughtLuckySpecies.add(sp.dex);
      if (e.tag === 'shadow') caughtShadowSpecies.add(sp.dex);
      if (e.tag === 'purified') caughtPurifiedSpecies.add(sp.dex);
      if (e.tag === 'dynamax') caughtMax.add(`dmax:${sp.dex}`);
      if (e.tag === 'xxl' || e.tag === 'xxs') caughtSizes.add(`${sp.dex}|${e.tag}`);
    }

    if (shinyEligible && sp) {
      caughtShinySpecies.add(sp.dex);
      if (sp.rarity !== 'normal') caughtShinyRare.add(sp.dex);
    }

    if (v && varReleased) {
      caughtVariants.add(k);
      if (v.kind === 'mega') caughtMegas.add(k);
      if (v.kind === 'gmax') caughtMax.add(`gmax:${k}`);
      if (v.kind === 'costume') {
        caughtCostumes.add(k);
        if (shinyEligible) caughtShinyCostumes.add(k);
      }
      if (v.kind === 'regional') caughtRegionals.add(k);
    }

    if (dex === 201 && !v?.datamined && (v?.form || k.includes('.f'))) {
      caughtUnowns.add(v?.form ?? k);
    }
    const vivPattern = vivillonPatternFromKey(k);
    if (vivPattern) caughtVivillons.add(vivPattern);
  }

  const pokedex: Medal[] = [
    makeMedal('national_dex', 'pokedex', caughtSpecies.size, scaledThresholds(releasedSpecies, [0.2, 0.5, 0.85, 1])),
    makeMedal('shiny_dex', 'pokedex', caughtShinySpecies.size, scaledThresholds(releasedShinySpeciesSet.size, [0.15, 0.4, 0.75, 0.95])),
    makeMedal('variants_dex', 'pokedex', caughtVariants.size, scaledThresholds(releasedVariants, [0.2, 0.5, 0.8, 0.95])),
    makeMedal('lucky_dex', 'pokedex', caughtLuckySpecies.size, scaledThresholds(releasedSpecies, [0.1, 0.3, 0.6, 0.85])),
    makeMedal('shadow_dex', 'pokedex', caughtShadowSpecies.size, FIXED_THRESHOLDS.shadow_dex),
    makeMedal('purified_dex', 'pokedex', caughtPurifiedSpecies.size, FIXED_THRESHOLDS.purified_dex),
    makeMedal('mega_dex', 'pokedex', caughtMegas.size, scaledThresholds(releasedMegas, [0.2, 0.5, 0.8, 1])),
    makeMedal('max_dex', 'pokedex', caughtMax.size, FIXED_THRESHOLDS.max_dex),
    makeMedal('costume_dex', 'pokedex', caughtCostumes.size, scaledThresholds(releasedCostumes, [0.15, 0.4, 0.75, 0.95])),
  ];

  const challenges: Medal[] = [
    makeMedal('unown', 'challenge', caughtUnowns.size, FIXED_THRESHOLDS.unown),
    makeMedal('vivillon', 'challenge', caughtVivillons.size, FIXED_THRESHOLDS.vivillon),
    makeMedal('regional_dex', 'challenge', caughtRegionals.size, scaledThresholds(releasedRegionals, [0.25, 0.55, 0.85, 1])),
    makeMedal('legendary', 'challenge', caughtRare.size, scaledThresholds(releasedRare, [0.25, 0.55, 0.85, 1])),
    makeMedal('shiny_legendary', 'challenge', caughtShinyRare.size, scaledThresholds(releasedShinyRareSet.size, [0.15, 0.4, 0.75, 0.95])),
    makeMedal('shiny_costume', 'challenge', caughtShinyCostumes.size, scaledThresholds(releasedShinyCostumes, [0.1, 0.3, 0.6, 0.85])),
    makeMedal('size_dex', 'challenge', caughtSizes.size, FIXED_THRESHOLDS.size_dex),
    makeMedal('completed_lists', 'challenge', input.completedLists, FIXED_THRESHOLDS.completed_lists),
  ];

  // Regional Pokédex medals (Gen 1–9): Gold at 85 %, Platinum at 100 % of released species in each region.
  const regions: Medal[] = [];
  for (let gen = 1; gen <= 9; gen++) {
    const cap = releasedByGen.get(gen) ?? 100;
    const count = caughtDexByGen.get(gen)?.size ?? 0;
    regions.push(
      makeMedal(
        `gen_${gen as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`,
        'region',
        count,
        scaledThresholds(cap, [0.2, 0.5, 0.85, 1]),
        gen,
      ),
    );
  }

  const summary: Record<MedalTier, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const m of [...pokedex, ...challenges, ...regions]) summary[m.tier]++;
  return { pokedex, challenges, regions, summary };
}

/** Breakdown of one collection by generation, variant kind, shiny status, and special tags. */
export function computeCollectionStats(
  ds: Pick<Dataset, 'species' | 'variants'>,
  entries: Pick<MembershipEntry, 'variantKey' | 'shiny' | 'tag' | 'done'>[],
): CollectionStats {
  const speciesByDex = new Map<number, Species>(ds.species.map((s) => [s.dex, s]));
  const variantByKey = new Map<string, Variant>();
  for (const v of ds.variants) {
    const k = neutralKey(v.key);
    if (!variantByKey.has(k)) variantByKey.set(k, v);
  }

  let done = 0;
  let shinyTotal = 0;
  let shinyDone = 0;
  const genMap = new Map<number, { total: number; done: number }>();
  const kindMap = new Map<VariantKind, { total: number; done: number }>();
  const tagMap = new Map<string, { total: number; done: number }>();

  for (const e of entries) {
    if (e.done) done++;
    if (e.shiny) {
      shinyTotal++;
      if (e.done) shinyDone++;
    }
    const k = neutralKey(e.variantKey);
    const v = variantByKey.get(k);
    const dex = v?.dex ?? Number(k.split('.')[0]);
    const sp = speciesByDex.get(dex);
    if (sp && sp.gen >= 1 && sp.gen <= 9) {
      const g = genMap.get(sp.gen) ?? genMap.set(sp.gen, { total: 0, done: 0 }).get(sp.gen)!;
      g.total++;
      if (e.done) g.done++;
    }
    if (v) {
      const kd = kindMap.get(v.kind) ?? kindMap.set(v.kind, { total: 0, done: 0 }).get(v.kind)!;
      kd.total++;
      if (e.done) kd.done++;
    }
    if (e.tag) {
      const tgKey = e.tag.startsWith('bg:') ? 'background' : e.tag;
      const tg = tagMap.get(tgKey) ?? tagMap.set(tgKey, { total: 0, done: 0 }).get(tgKey)!;
      tg.total++;
      if (e.done) tg.done++;
    }
  }

  const KIND_ORDER: VariantKind[] = ['base', 'regional', 'form', 'costume', 'mega', 'gmax'];
  return {
    total: entries.length,
    done,
    pct: entries.length ? Math.round((done / entries.length) * 100) : 0,
    shinyTotal,
    shinyDone,
    byGen: [...genMap.entries()].sort((a, b) => a[0] - b[0]).map(([gen, v]) => ({ gen, ...v })),
    byKind: KIND_ORDER.filter((k) => kindMap.has(k)).map((kind) => ({ kind, ...kindMap.get(kind)! })),
    byTag: [...tagMap.entries()].sort((a, b) => b[1].total - a[1].total).map(([tag, v]) => ({ tag, ...v })),
  };
}
