/** The in-game search for a list, with the player's saved settings: shared by the sheet, the PDF and the image. */
import { buildSearchStrings, plainTargets, speciesSearchInfo, targetFromVariant, type GameLang, type ListEntry } from '@mydexpogo/shared';
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

export function listSearch(idx: DatasetIndex, entries: ListEntry[], opts: { onlyMissing: boolean; gameLang: GameLang; exclude: string[] }) {
  const species = speciesInfo(idx);
  const all = entries
    .filter((e) => !opts.onlyMissing || !e.done)
    .flatMap((e) => {
      const v = idx.variantByKey.get(e.variantKey);
      return v ? [targetFromVariant(v, e.shiny, e.gender, e.tag, species.get(v.dex)?.regions ?? [])] : [];
    });
  // Shiny and costumed entries leave the string while those are excluded, and come back when they are not.
  const { targets, dropped } = plainTargets(all, { shiny: !opts.exclude.includes('shiny'), costume: !opts.exclude.includes('costume') });
  const out = TRADE_EXCLUSIONS.filter((d) => opts.exclude.includes(d));
  return { strings: buildSearchStrings(targets, { lang: opts.gameLang, species, exclude: out }), dropped };
}

/** The missing Pokémon's search with this device's settings, for exports. */
export function exportSearchText(idx: DatasetIndex, entries: ListEntry[], appLang: string): string | null {
  const exclude = savedExclusions();
  let { strings } = listSearch(idx, entries, { onlyMissing: true, gameLang: savedGameLang(appLang), exclude });
  // A collection of shinies or costumes only would get no search at all with those excluded: keep them then.
  if (!strings.length) ({ strings } = listSearch(idx, entries, { onlyMissing: true, gameLang: savedGameLang(appLang), exclude: exclude.filter((d) => d !== 'shiny' && d !== 'costume') }));
  return strings.length ? strings.map((s) => s.text).join('\n') : null;
}
