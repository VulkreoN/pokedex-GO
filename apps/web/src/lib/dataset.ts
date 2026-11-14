import { useQuery } from '@tanstack/react-query';
import { variantImageUrl, type Dataset, type Species, type Variant } from '@mydexpogo/shared';

export interface DatasetIndex {
  ds: Dataset;
  speciesByDex: Map<number, Species>;
  variantsByDex: Map<number, Variant[]>;
  variantByKey: Map<string, Variant>;
  /** The variant used as the species picture: base male if any, else the first one. */
  coverOf: Map<number, Variant>;
  searchText: Map<number, string>;
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
  return { ds, speciesByDex, variantsByDex, variantByKey, coverOf, searchText };
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

export function matchesQuery(idx: DatasetIndex, dex: number, q: string): boolean {
  if (!q) return true;
  const text = idx.searchText.get(dex) ?? '';
  if (/^\d+$/.test(q)) return String(dex) === q || text.startsWith(`${q} `) === false && String(dex).startsWith(q);
  return text.includes(q);
}
