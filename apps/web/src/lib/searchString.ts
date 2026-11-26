/** The in-game search for a list, with the player's saved settings: shared by the sheet, the PDF and the image. */
import { buildSearchStrings, plainTargets, regionOfForm, safePreEvolutions, speciesSearchInfo, targetFromVariant, type EntryGender, type GameLang, type ListEntry, type Variant } from '@mydexpogo/shared';
import type { DatasetIndex } from './dataset.js';

/** Left out of the whole search, each one a choice. Unticking shiny or costume keeps those entries in the search. */
export const TRADE_EXCLUSIONS = ['traded', '4*', 'shiny', 'costume', 'shadow', 'purified', 'lucky'];

/** The search bar only understands the game's own language: remembered per device, defaults to the app's. */
export function savedGameLang(appLang: string): GameLang {
  try {
    const saved = localStorage.getItem('gameLang');
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {}
  return appLang === 'fr' ? 'fr' : 'en';
}
export function saveGameLang(l: GameLang) {
  try {
    localStorage.setItem('gameLang', l);
  } catch {}
}

/** On by default: what cannot be traded for a lucky. The rest (shiny, shadow...) is each player's choice. */
export const DEFAULT_EXCLUSIONS = ['traded', 'lucky'];
/** Saved per device. A new key: choices saved before also held shiny and costume, then forced on. */
const EXCLUDE_KEY = 'searchExclude2';
export function savedExclusions(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(EXCLUDE_KEY) ?? 'null') as string[] | null;
    if (Array.isArray(saved)) return saved;
  } catch {}
  return [...DEFAULT_EXCLUSIONS];
}
export function saveExclusions(list: string[]) {
  try {
    localStorage.setItem(EXCLUDE_KEY, JSON.stringify(list));
  } catch {}
}

const speciesCache = new WeakMap<DatasetIndex, ReturnType<typeof speciesSearchInfo>>();
/** What each species can be (regional forms, costumes, genders): computed once per dataset. */
export function speciesInfo(idx: DatasetIndex) {
  let s = speciesCache.get(idx);
  if (!s) speciesCache.set(idx, (s = speciesSearchInfo(idx.ds.variants)));
  return s;
}

/**
 * Cut long searches into several, each at most this long (0 = never). The game documents no limit; iOS text
 * replacements, where many keep their searches, refuse more than 2,000 characters.
 */
export const MAX_LENGTHS = [0, 2000, 1000, 500] as const;
export function savedMaxLength(): number {
  try {
    const n = Number(localStorage.getItem('searchMaxLength'));
    if ((MAX_LENGTHS as readonly number[]).includes(n)) return n;
  } catch {}
  return 0;
}
export function saveMaxLength(n: number) {
  try {
    localStorage.setItem('searchMaxLength', String(n));
  } catch {}
}

/** "With pre-evolutions", remembered per device: off by default. */
export function savedPreEvolutions(): boolean {
  try {
    return localStorage.getItem('searchPreEvo') === '1';
  } catch {
    return false;
  }
}
export function savePreEvolutions(on: boolean) {
  try {
    localStorage.setItem('searchPreEvo', on ? '1' : '0');
  } catch {}
}

/**
 * The versions that safely evolve into this one: a Scatterbug or Spewpa becomes the wanted Vivillon, a Galarian
 * Meowth becomes Perrserker (never Kanto Meowth), an evolvable costume only matches the same costume, a Mega expands
 * to its Mega-capable plain species + base pre-evolutions, and Gigantamax / raid-only regional evolutions return nothing.
 */
export function preEvolutions(idx: DatasetIndex, v: Variant): Variant[] {
  return safePreEvolutions(idx.hunt, v.key)
    .map((k) => idx.variantByKey.get(k))
    .filter((x): x is Variant => !!x);
}

export function listSearch(idx: DatasetIndex, entries: ListEntry[], opts: { onlyMissing: boolean; gameLang: GameLang; exclude: string[]; preEvolutions?: boolean; maxLength?: number }) {
  const species = speciesInfo(idx);
  const target = (v: Variant, e: ListEntry) => {
    // A gender the pre-evolution does not have (Kirlia for a Gallade...) is not a filter there.
    const gender: EntryGender = e.gender && (v.genders ?? ['m', 'f']).includes(e.gender as 'm' | 'f') ? e.gender : '';
    return targetFromVariant(v, e.shiny, gender, e.tag, species.get(v.dex)?.regions ?? []);
  };
  const wanted = entries.filter((e) => !opts.onlyMissing || !e.done);
  const all = wanted
    .flatMap((e) => {
      const v = idx.variantByKey.get(e.variantKey);
      if (!v) return [];
      return [target(v, e), ...(opts.preEvolutions ? preEvolutions(idx, v).map((p) => target(p, e)) : [])];
    });
  const keepShiny = !opts.exclude.includes('shiny');
  const keepCostume = !opts.exclude.includes('costume');
  // Shiny and costumed entries leave the string while those are excluded, and come back when they are not.
  const { targets, dropped } = plainTargets(all, { shiny: keepShiny, costume: keepCostume });
  const out = TRADE_EXCLUSIONS.filter((d) => opts.exclude.includes(d));
  const kept = wanted.filter((e) => {
    const v = idx.variantByKey.get(e.variantKey);
    return !!v && (keepShiny || !e.shiny) && (keepCostume || v.kind !== 'costume');
  });
  return {
    strings: buildSearchStrings(targets, { lang: opts.gameLang, species, exclude: out, ...(opts.maxLength ? { maxLength: opts.maxLength } : {}) }),
    dropped,
    blind: formBlind(idx, kept),
  };
}

/**
 * The wanted Pokémon the game's search cannot tell apart from their other forms or costumes: it has no word for
 * Squawkabilly's plumages, Minior's core colours, Vivillon's patterns, Paldean Tauros breeds, Mega forms or which hat
 * Pikachu wears, so the search shows them all. One per form or costume.
 */
export function formBlind(idx: DatasetIndex, entries: ListEntry[]): Variant[] {
  const out = new Map<string, Variant>();
  for (const e of entries) {
    const v = idx.variantByKey.get(e.variantKey);
    if (!v) continue;
    const kin = (idx.variantsByDex.get(v.dex) ?? []).filter((x) => !x.key.endsWith('.g2'));
    const releasedForms = new Set(kin.filter((x) => x.kind === 'form' && !x.datamined).map((x) => x.form));
    const costumes = new Set(kin.filter((x) => x.kind === 'costume').map((x) => x.costume ?? x.form ?? x.key));
    const region = v.kind === 'regional' ? regionOfForm(v.form) : null;
    const sameRegion = region ? new Set(kin.filter((x) => x.kind === 'regional' && regionOfForm(x.form) === region).map((x) => x.form)) : null;
    const gmax = new Set(kin.filter((x) => x.kind === 'gmax').map((x) => x.form));
    const blind =
      v.kind === 'form' ||
      v.kind === 'mega' ||
      (v.kind === 'base' && releasedForms.size > 0) ||
      (v.kind === 'costume' && costumes.size > 1) ||
      (sameRegion !== null && sameRegion.size > 1) ||
      (v.kind === 'gmax' && gmax.size > 1);
    const id = `${v.dex}|${v.kind}|${v.form ?? ''}|${v.costume ?? ''}`;
    if (blind && !out.has(id)) out.set(id, v);
  }
  return [...out.values()].sort((a, b) => a.dex - b.dex || a.key.localeCompare(b.key));
}

export interface SearchSettings { onlyMissing: boolean; gameLang: GameLang; exclude: string[]; preEvolutions: boolean; maxLength: number }

/** The search for exports, with the settings shown next to it (the same as "Copy for the game"). */
export function exportSearch(idx: DatasetIndex, entries: ListEntry[], settings: SearchSettings): { text: string | null; blind: Variant[] } {
  let res = listSearch(idx, entries, settings);
  // A collection of shinies or costumes only would get no search at all with those excluded: keep them then.
  if (!res.strings.length) res = listSearch(idx, entries, { ...settings, exclude: settings.exclude.filter((d) => d !== 'shiny' && d !== 'costume') });
  return { text: res.strings.length ? res.strings.map((s) => s.text).join('\n') : null, blind: res.strings.length ? res.blind : [] };
}

export function exportSearchText(idx: DatasetIndex, entries: ListEntry[], settings: SearchSettings): string | null {
  return exportSearch(idx, entries, settings).text;
}
