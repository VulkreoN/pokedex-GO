import { useQuery } from '@tanstack/react-query';
import { neutralKey, variantImageUrl, type Dataset, type EntryGender, type PvpPokemon, type Species, type Variant } from '@mydexpogo/shared';

export interface DatasetIndex {
  ds: Dataset;
  speciesByDex: Map<number, Species>;
  variantsByDex: Map<number, Variant[]>;
  variantByKey: Map<string, Variant>;
  /** The variant used as the species picture: base male if any, else the first one. */
  coverOf: Map<number, Variant>;
  searchText: Map<number, string>;
  /** PvP forms by key (base stats, rank 1 IVs). */
  pvpByKey: Map<string, PvpPokemon>;
}

export function buildIndex(ds: Dataset): DatasetIndex {
  const speciesByDex = new Map(ds.species.map((s) => [s.dex, s]));
  const variantsByDex = new Map<number, Variant[]>();
  const variantByKey = new Map<string, Variant>();
  for (const v of ds.variants) {
    variantByKey.set(v.key, v);
    const arr = variantsByDex.get(v.dex);
    if (arr) arr.push(v);
    else variantsByDex.set(v.dex, [v]);
  }
  const coverOf = new Map<number, Variant>();
  for (const [dex, vs] of variantsByDex) {
    coverOf.set(dex, vs.find((v) => v.kind === 'base' && v.gender !== 'f') ?? vs[0]!);
  }
  const searchText = new Map(ds.species.map((s) => [s.dex, normalize(`${s.dex} ${s.name.en} ${s.name.fr ?? ''}`)]));
  const pvpByKey = new Map((ds.pvp?.pokemon ?? []).map((p) => [p.key, p]));
  return { ds, speciesByDex, variantsByDex, variantByKey, coverOf, searchText, pvpByKey };
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function useDataset() {
  return useQuery({
    queryKey: ['dataset'],
    queryFn: async () => {
      const res = await fetch('/api/data/pokedex.json');
      if (!res.ok) throw new Error('dataset');
      return buildIndex((await res.json()) as Dataset);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function imageUrl(idx: DatasetIndex, v: Variant, shiny = false): string | null {
  return variantImageUrl(idx.ds, v, shiny);
}

/** Human label for an entry tag; "bg:<id>" resolves to the background name. */
export function tagLabel(idx: DatasetIndex | undefined, tag: string, t: { [k: string]: unknown }): string {
  if (tag.startsWith('bg:')) return idx?.ds.backgrounds?.[tag.slice(3)]?.label ?? tag.slice(3);
  return (t[`tag_${tag}`] as string | undefined) ?? tag;
}

export function matchesQuery(idx: DatasetIndex, dex: number, q: string): boolean {
  if (!q) return true;
  const text = idx.searchText.get(dex) ?? '';
  if (/^\d+$/.test(q)) return String(dex) === q || text.startsWith(`${q} `) === false && String(dex).startsWith(q);
  return text.includes(q);
}

/** Genders a list entry of this variant can have ('' alone = genderless), from the game master. */
export function entryGenders(idx: DatasetIndex, key: string): EntryGender[] {
  const v = idx.variantByKey.get(neutralKey(key));
  const g = v?.genders ?? ['m', 'f'];
  return g.length ? g : [''];
}

/** The picture of an entry: the female one when the Pokémon has a distinct female look. */
export function entryVariant(idx: DatasetIndex, key: string, gender: EntryGender): Variant | undefined {
  const k = neutralKey(key);
  return (gender === 'f' ? idx.variantByKey.get(`${k}.g2`) : undefined) ?? idx.variantByKey.get(k);
}

export const genderSymbol = (g: EntryGender | null | undefined) => (g === 'm' ? '♂' : g === 'f' ? '♀' : '');

/**
 * Family order: each evolution family sits at its lowest dex number, members by evolution stage then dex
 * (Pichu, Pikachu, Raichu at #25; Eevee then every Eeveelution at #133).
 */
export function familyOrder(idx: DatasetIndex, species: Species[]): Species[] {
  const familyMin = new Map<string, number>();
  for (const s of idx.ds.species) familyMin.set(s.family, Math.min(familyMin.get(s.family) ?? Infinity, s.dex));
  const stage = (s: Species): number => {
    let n = 0;
    let cur: Species | undefined = s;
    const seen = new Set<number>();
    while (cur?.parent && !seen.has(cur.dex) && n < 10) {
      seen.add(cur.dex);
      cur = idx.speciesByDex.get(cur.parent);
      n++;
    }
    return n;
  };
  return [...species].sort(
    (a, b) =>
      (familyMin.get(a.family) ?? a.dex) - (familyMin.get(b.family) ?? b.dex) || a.family.localeCompare(b.family) || stage(a) - stage(b) || a.dex - b.dex,
  );
}

/** PvP form of a variant: its own form, else the species' (costumes and Gigantamax share the base stats). Megas: none. */
export function pvpOf(idx: DatasetIndex, v: Variant): PvpPokemon | undefined {
  if (v.kind === 'mega') return undefined;
  return idx.pvpByKey.get(neutralKey(v.key)) ?? idx.pvpByKey.get(String(v.dex));
}
