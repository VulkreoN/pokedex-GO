/**
 * Trainer medals (Bronze / Silver / Gold / Platinum) & collection progress stats.
 * Computed purely from a player's caught entries, completed collections, friends and saved PvP items.
 */
import { neutralKey } from './keys.js';
import type { Dataset, MembershipEntry, Species, Variant, VariantKind } from './types.js';

export type MedalTier = 0 | 1 | 2 | 3 | 4; // locked | bronze | silver | gold | platinum

export type MedalId =
  | 'collector'
  | 'shiny'
  | 'costume'
  | 'regional'
  | 'mega_max'
  | 'shadow'
  | 'completed_lists'
  | 'friends'
  | 'pvp'
  | `gen_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface Medal {
  id: MedalId;
  category: 'core' | 'region';
  gen?: number;
  value: number;
  thresholds: readonly [number, number, number, number];
  tier: MedalTier;
  next: number | null;
  /** 0..1 progress within the whole medal toward the next tier (or 1 when platinum). */
  progress: number;
}

export interface MedalsInput {
  entries: Pick<MembershipEntry, 'variantKey' | 'shiny' | 'tag' | 'done'>[];
  completedLists: number;
  friendsCount: number;
  pvpCount: number;
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

const CORE_THRESHOLDS: Record<Exclude<MedalId, `gen_${number}`>, readonly [number, number, number, number]> = {
  collector: [10, 100, 400, 1000],
  shiny: [5, 25, 100, 300],
  costume: [5, 20, 60, 150],
  regional: [5, 20, 45, 90],
  mega_max: [3, 15, 40, 80],
  shadow: [5, 25, 75, 200],
  completed_lists: [1, 3, 5, 10],
  friends: [1, 5, 15, 30],
  pvp: [3, 10, 25, 50],
};

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

function makeMedal(id: MedalId, category: 'core' | 'region', value: number, thresholds: readonly [number, number, number, number], gen?: number): Medal {
  const { tier, next, progress } = tierFor(value, thresholds);
  return { id, category, ...(gen ? { gen } : {}), value, thresholds, tier, next, progress };
}

/** Computes all core & regional (Gen 1–9) trainer medals from deduplicated caught entries and account counts. */
export function computeMedals(
  ds: Pick<Dataset, 'species' | 'variants'>,
  input: MedalsInput,
): { core: Medal[]; regions: Medal[]; summary: Record<MedalTier, number> } {
  const speciesByDex = new Map<number, Species>(ds.species.map((s) => [s.dex, s]));
  const variantByKey = new Map<string, Variant>();
  for (const v of ds.variants) {
    const k = neutralKey(v.key);
    if (!variantByKey.has(k)) variantByKey.set(k, v);
  }

  const caughtVariants = new Set<string>();
  const caughtShinies = new Set<string>();
  const caughtCostumes = new Set<string>();
  const caughtRegionals = new Set<string>();
  const caughtMegaMax = new Set<string>();
  const caughtShadows = new Set<string>();
  const caughtDexByGen = new Map<number, Set<number>>();

  for (const e of input.entries) {
    if (!e.done) continue;
    const k = neutralKey(e.variantKey);
    const v = variantByKey.get(k);
    const dex = v?.dex ?? Number(k.split('.')[0]);
    const sp = speciesByDex.get(dex);
    caughtVariants.add(`${k}|${e.shiny ? 1 : 0}|${e.tag}`);
    if (e.shiny) caughtShinies.add(k);
    if (v?.kind === 'costume') caughtCostumes.add(k);
    if (v?.kind === 'regional') caughtRegionals.add(k);
    if (v?.kind === 'mega' || v?.kind === 'gmax' || e.tag === 'dynamax') caughtMegaMax.add(`${k}|${e.tag === 'dynamax' ? 'dmax' : ''}`);
    if (e.tag === 'shadow' || e.tag === 'purified') caughtShadows.add(`${k}|${e.tag}`);
    if (sp && sp.gen >= 1 && sp.gen <= 9) {
      (caughtDexByGen.get(sp.gen) ?? caughtDexByGen.set(sp.gen, new Set()).get(sp.gen)!).add(sp.dex);
    }
  }

  const core: Medal[] = [
    makeMedal('collector', 'core', caughtVariants.size, CORE_THRESHOLDS.collector),
    makeMedal('shiny', 'core', caughtShinies.size, CORE_THRESHOLDS.shiny),
    makeMedal('costume', 'core', caughtCostumes.size, CORE_THRESHOLDS.costume),
    makeMedal('regional', 'core', caughtRegionals.size, CORE_THRESHOLDS.regional),
    makeMedal('mega_max', 'core', caughtMegaMax.size, CORE_THRESHOLDS.mega_max),
    makeMedal('shadow', 'core', caughtShadows.size, CORE_THRESHOLDS.shadow),
    makeMedal('completed_lists', 'core', input.completedLists, CORE_THRESHOLDS.completed_lists),
    makeMedal('friends', 'core', input.friendsCount, CORE_THRESHOLDS.friends),
    makeMedal('pvp', 'core', input.pvpCount, CORE_THRESHOLDS.pvp),
  ];

  // Regional Pokédex medals (Gen 1–9): dynamic thresholds scaled to released species in each generation.
  const releasedByGen = new Map<number, number>();
  for (const s of ds.species) {
    if (s.released && s.gen >= 1 && s.gen <= 9) releasedByGen.set(s.gen, (releasedByGen.get(s.gen) ?? 0) + 1);
  }
  const regions: Medal[] = [];
  for (let gen = 1; gen <= 9; gen++) {
    const cap = Math.max(4, releasedByGen.get(gen) ?? 100);
    const t1 = Math.max(1, Math.round(cap * 0.25));
    const t2 = Math.max(t1 + 1, Math.round(cap * 0.5));
    const t3 = Math.max(t2 + 1, Math.round(cap * 0.75));
    const t4 = Math.max(t3 + 1, cap);
    const count = caughtDexByGen.get(gen)?.size ?? 0;
    regions.push(makeMedal(`gen_${gen as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`, 'region', count, [t1, t2, t3, t4], gen));
  }

  const summary: Record<MedalTier, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const m of [...core, ...regions]) summary[m.tier]++;
  return { core, regions, summary };
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
