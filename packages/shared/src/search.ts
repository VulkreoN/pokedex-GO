/**
 * Builds Pokémon GO storage search strings.
 *
 * Syntax (Scopely help center + GO Hub cheat sheet):
 *   ","  OR      "&"  AND      "!"  NOT
 *   "1-151" dex range, "25" single dex number
 *   shiny, costume, female, male, alola, galar, hisui, paldea, gigantamax
 * Commas are evaluated inside ampersands: "1,4&shiny" = (1 OR 4) AND shiny, a conjunction of OR-clauses.
 * A "!" at the start of a block negates the whole block: "!hisui,100" = neither Hisuian nor #100 (seen in game:
 * Hisuian Voltorb vanished from such a string). Negations are therefore only written alone ("&!costume").
 *
 * So a whole list fits in ONE string. For each Pokémon, the versions wanted ("Growlithe male, not Hisuian",
 * "Pikachu: male normal or female shiny") are turned into clauses (conjunctive normal form); a clause about dex d
 * also lists every other dex number, so it only binds d:
 *   1,58,83&femelle,1,58&galar,1,58&mâle,1,83
 *   = (Bulbasaur, Growlithe or Farfetch'd) and (female, or Bulbasaur/Growlithe) and (Galarian, or ...) and (male, or ...)
 * Numbers that cannot break a clause are left out of it (no need to list Bulbasaur under "!hisui": there is no
 * Hisuian Bulbasaur), which keeps the string short. No length limit by default: players use much longer strings.
 */
import type { EntryGender, EntryTag, Gender, Variant } from './types.js';

export type Region = 'alola' | 'galar' | 'hisui' | 'paldea';

/**
 * One wanted version. true = must have it, false = must not, undefined = either.
 * A list entry is exact: "Pikachu normal" is not shiny and not costumed.
 */
export interface SearchTarget {
  dex: number;
  shiny?: boolean;
  costume?: boolean;
  gender?: Gender | null;
  region?: Region | null;
  gmax?: boolean;
  tag?: EntryTag;
  /** Regional forms to leave out: a plain Growlithe entry must not catch Hisuian Growlithe. */
  excludeRegions?: Region[];
}

export interface SearchString {
  /** Filters this list needs but the game's language has no keyword for: left out, so the string shows extra Pokémon. */
  unsupported?: string[];
  /** Exclusions asked for the whole search (traded, 4*...) left out because the list wants that very version. */
  skippedExclusions?: string[];
  /** Exclusions that could not stay in one string (another Pokémon of the list wants that version): also shown. */
  looser?: { dim: string; dex: number[] }[];
  /** Kept for single-filter strings; see parts. */
  modifiers: string[];
  /** What the string covers: each combination of filters with its number of Pokémon. */
  parts?: { modifiers: string[]; count: number }[];
  text: string;
  /** Number of distinct dex numbers covered by this string. */
  count: number;
  /** 1-based index when a group had to be split in several batches. */
  batch: number;
  batches: number;
}

/** No limit by default: players paste strings of several hundred characters. */
export const DEFAULT_MAX_LENGTH = Number.POSITIVE_INFINITY;

/** "1,2,3,5,7,8,9" -> "1-3,5,7-9". Dedupes and sorts. */
export function compressDexNumbers(nums: number[]): string {
  return dexRanges(nums).join(',');
}

export function dexRanges(nums: number[]): string[] {
  const sorted = [...new Set(nums.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    const a = sorted[i]!;
    const b = sorted[j]!;
    if (b - a >= 2) out.push(`${a}-${b}`);
    else if (b - a === 1) out.push(String(a), String(b));
    else out.push(String(a));
    i = j + 1;
  }
  return out;
}

export function regionOfForm(form: string | null): Region | null {
  if (!form) return null;
  if (form.startsWith('ALOLA')) return 'alola';
  if (form.startsWith('GALAR')) return 'galar';
  if (form.startsWith('HISUI')) return 'hisui';
  if (form.startsWith('PALDEA')) return 'paldea';
  return null;
}

/**
 * Turns a list entry's variant into a search target. The gender filter is only added when the variant exists in
 * both genders: a female-only Pokémon needs no "female".
 */
export function targetFromVariant(v: Variant, shiny: boolean, gender: EntryGender | null, tag: EntryTag = '', speciesRegions: Region[] = []): SearchTarget {
  const region = v.kind === 'regional' ? regionOfForm(v.form) : null;
  // Exact: a normal entry is not shiny, a plain or regional form is not a costume.
  const both = (v.genders ?? ['m', 'f']).length > 1;
  return {
    dex: v.dex,
    shiny,
    tag,
    costume: v.kind === 'costume',
    gender: both && gender ? gender : null,
    region,
    gmax: v.kind === 'gmax',
    ...(!region && speciesRegions.length ? { excludeRegions: speciesRegions } : {}),
  };
}

/** Regional forms each species has, from the dataset variants (Growlithe: hisui). */
export function regionsByDex(variants: Variant[]): Map<number, Region[]> {
  const out = new Map<number, Region[]>();
  for (const v of variants) {
    if (v.kind !== 'regional') continue;
    const r = regionOfForm(v.form);
    if (!r) continue;
    const list = out.get(v.dex) ?? [];
    if (!list.includes(r)) list.push(r);
    out.set(v.dex, list);
  }
  return out;
}

/**
 * The search bar only understands keywords in the game's own language. French ones come from French guides
 * (Pokébip, Pokékalos, Breakflip); null = no known keyword in that language: the filter is left out, so the string
 * shows a bit more than wanted instead of nothing.
 */
export type GameLang = 'en' | 'fr';
const KEYWORDS: Record<GameLang, Record<string, string | null>> = {
  en: {},
  fr: {
    traded: 'échangé',
    '4*': '4*',
    shiny: 'chromatique',
    male: 'mâle',
    female: 'femelle',
    lucky: 'chanceux',
    shadow: 'obscur',
    purified: 'purifié',
    costume: 'costume',
    xxl: 'xxl',
    xxs: 'xxs',
    alola: 'alola',
    galar: 'galar',
    hisui: 'hisui',
    paldea: 'paldea',
    background: null,
    dynamax: null,
    gigantamax: null,
  },
};
export const keyword = (id: string, lang: GameLang = 'en'): string | null => {
  if (id.startsWith('!')) {
    const k = keyword(id.slice(1), lang);
    return k === null ? null : `!${k}`;
  }
  return lang === 'en' ? id : KEYWORDS[lang][id] === undefined ? id : KEYWORDS[lang][id]!;
};

/** What a species can be, to leave out numbers that cannot break a clause (no Hisuian Bulbasaur...). */
export interface SpeciesSearchInfo {
  regions: Region[];
  costumes: boolean;
  /** Genders it exists in ([] = genderless). */
  genders: Gender[];
}

/** Per species: regional forms, costumes, genders, from the dataset. */
export function speciesSearchInfo(variants: Variant[]): Map<number, SpeciesSearchInfo> {
  const out = new Map<number, SpeciesSearchInfo>();
  for (const v of variants) {
    const info = out.get(v.dex) ?? { regions: [], costumes: false, genders: [] };
    const r = v.kind === 'regional' ? regionOfForm(v.form) : null;
    if (r && !info.regions.includes(r)) info.regions.push(r);
    if (v.kind === 'costume') info.costumes = true;
    for (const g of v.genders ?? ['m', 'f']) if (!info.genders.includes(g)) info.genders.push(g);
    out.set(v.dex, info);
  }
  return out;
}

type Lit = { dim: string; pos: boolean };
const litKey = (l: Lit) => `${l.pos ? '' : '!'}${l.dim}`;

/** The literals a target requires (keyword ids, before translation). */
function cubeOf(t: SearchTarget): Lit[] {
  const lits: Lit[] = [];
  if (t.region) lits.push({ dim: t.region, pos: true });
  for (const r of t.excludeRegions ?? []) lits.push({ dim: r, pos: false });
  if (t.costume !== undefined) lits.push({ dim: 'costume', pos: t.costume });
  if (t.gmax) lits.push({ dim: 'gigantamax', pos: true });
  if (t.gender === 'm') lits.push({ dim: 'male', pos: true });
  if (t.gender === 'f') lits.push({ dim: 'female', pos: true });
  if (t.shiny !== undefined) lits.push({ dim: 'shiny', pos: t.shiny });
  if (t.tag) lits.push({ dim: t.tag.startsWith('bg:') ? 'background' : t.tag, pos: true }); // lucky, shadow, purified, xxl, xxs...
  return lits;
}

/** True when every Pokémon of this species satisfies the literal, so it never needs listing for it. */
function alwaysTrue(l: Lit, info: SpeciesSearchInfo | undefined): boolean {
  if (!info) return false;
  if ((['alola', 'galar', 'hisui', 'paldea'] as string[]).includes(l.dim)) return !l.pos && !info.regions.includes(l.dim as Region);
  if (l.dim === 'costume') return !l.pos && !info.costumes;
  if (l.dim === 'male') return l.pos ? info.genders.length === 1 && info.genders[0] === 'm' : !info.genders.includes('m');
  if (l.dim === 'female') return l.pos ? info.genders.length === 1 && info.genders[0] === 'f' : !info.genders.includes('f');
  return false;
}

const MAX_CLAUSES_PER_DEX = 256;

/**
 * Conjunctive normal form of "one of these cubes": distribute, drop tautologies and subsumed clauses.
 * Too many targets with too many filters on one Pokémon: fall back to one clause per filter fixed by all of them
 * (shows a few extra versions, never misses one).
 */
function cnfOf(cubes: Lit[][], info?: SpeciesSearchInfo): Lit[][] {
  if (cubes.some((c) => c.length === 0)) return [];
  let clauses: Lit[][] = [[]];
  for (const cube of cubes) {
    const next: Lit[][] = [];
    for (const c of clauses) for (const l of cube) if (!c.some((x) => litKey(x) === litKey(l))) next.push([...c, l]);
      else next.push(c);
    clauses = next.filter((c) => !c.some((x) => c.some((y) => x.dim === y.dim && x.pos !== y.pos)));
    if (clauses.length > MAX_CLAUSES_PER_DEX) {
      const fixed = new Map<string, Lit>();
      for (const l of cubes[0]!) if (cubes.every((cb) => cb.some((x) => litKey(x) === litKey(l)))) fixed.set(litKey(l), l);
      return [...fixed.values()].map((l) => [l]);
    }
  }
  // "male or female" holds for every Pokémon of a species that has both genders.
  const both = info?.genders.length === 2;
  clauses = clauses.filter((c) => !(both && c.some((l) => l.dim === 'male' && l.pos) && c.some((l) => l.dim === 'female' && l.pos)));
  const keyed = [...new Map(clauses.map((c) => [c.map(litKey).sort().join('|'), c])).values()];
  return keyed.filter((c) => !keyed.some((o) => o !== c && o.length < c.length && o.every((l) => c.some((x) => litKey(x) === litKey(l)))));
}

export function buildSearchStrings(
  targets: SearchTarget[],
  options: {
    maxLength?: number;
    lang?: GameLang;
    species?: Map<number, SpeciesSearchInfo>;
    regionsByDex?: Map<number, Region[]>;
    /** Put at the start of the string, e.g. ['traded', '4*', 'shiny', 'costume', 'shadow', 'purified'] for trades. */
    exclude?: string[];
  } = {},
): SearchString[] {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const lang = options.lang ?? 'en';
  const species =
    options.species ??
    (options.regionsByDex ? new Map([...options.regionsByDex].map(([d, regions]) => [d, { regions, costumes: true, genders: ['m', 'f'] as Gender[] }])) : undefined);
  if (!targets.length) return [];

  const dexes = [...new Set(targets.map((t) => t.dex))].sort((a, b) => a - b);
  // Whole-search exclusions, unless the list wants that very thing (a shiny entry with "not shiny" would vanish).
  const wants = (dim: string) =>
    targets.some((t) => (dim === 'shiny' && t.shiny) || (dim === 'costume' && t.costume) || (['shadow', 'purified', 'lucky'].includes(dim) && t.tag === dim));
  const askedOut = (options.exclude ?? []).filter((d) => keyword(d, lang) !== null);
  const prefix = askedOut.filter((d) => !wants(d));
  const skipped = askedOut.filter((d) => wants(d));
  const render = (subset: number[]) => {
    const r = renderString(targets.filter((t) => subset.includes(t.dex)), lang, species);
    if (!prefix.length && !skipped.length) return r;
    const blocks = r.text.split('&');
    const pre = prefix.map((d) => `!${keyword(d, lang)!}`);
    const text = [...pre, ...blocks.filter((b) => !pre.includes(b))].join('&');
    return { ...r, text, ...(skipped.length ? { skippedExclusions: skipped } : {}) };
  };
  const whole = render(dexes);
  if (whole.text.length <= maxLength) return [whole];

  // Too long for the limit asked: split by Pokémon (each string stays exact for its own Pokémon).
  const out: SearchString[] = [];
  let chunk: number[] = [];
  for (const d of dexes) {
    const tryChunk = [...chunk, d];
    if (chunk.length && render(tryChunk).text.length > maxLength) {
      out.push(render(chunk));
      chunk = [d];
    } else chunk = tryChunk;
  }
  if (chunk.length) out.push(render(chunk));
  return out.map((s, i) => ({ ...s, batch: i + 1, batches: out.length }));
}

function renderString(targets: SearchTarget[], lang: GameLang, species?: Map<number, SpeciesSearchInfo>): SearchString {
  const unsupported = new Set<string>();
  const byDex = new Map<number, Lit[][]>();
  for (const t of targets) {
    const cube = cubeOf(t).filter((l) => {
      if (keyword(l.dim, lang) !== null) return true;
      unsupported.add(l.dim);
      return false;
    });
    // Literals the species always satisfies say nothing about it.
    const info = species?.get(t.dex);
    const useful = cube.filter((l) => !alwaysTrue(l, info));
    (byDex.get(t.dex) ?? byDex.set(t.dex, []).get(t.dex)!).push(useful);
  }
  const dexes = [...byDex.keys()].sort((a, b) => a - b);
  const othersOf = (lits: Lit[], dex: Set<number>) => dexes.filter((e) => !dex.has(e) && !lits.some((l) => alwaysTrue(l, species?.get(e))));

  // In game, "!" at the start of a block negates the WHOLE block ("!hisui,100" = neither Hisuian nor #100), so a
  // negation is only safe alone in its block. When an exclusion cannot be global (another Pokémon of the list wants
  // that very version), it is dropped for the Pokémon concerned: the string shows a bit more, never less.
  const relaxed = new Map<string, Set<number>>(); // dim -> dex whose "not dim" was dropped
  let clauses = new Map<string, { lits: Lit[]; dex: Set<number> }>();
  for (;;) {
    clauses = new Map();
    for (const [d, cubes] of byDex) {
      const kept = cubes.map((c) => c.filter((l) => l.pos || !relaxed.get(l.dim)?.has(d)));
      for (const c of cnfOf(kept, species?.get(d))) {
        const lits = [...c].sort((a, b) => litKey(a).localeCompare(litKey(b)));
        const key = lits.map(litKey).join('|');
        (clauses.get(key) ?? clauses.set(key, { lits, dex: new Set() }).get(key)!).dex.add(d);
      }
    }
    let changed = false;
    for (const { lits, dex } of clauses.values()) {
      if (!lits.some((l) => !l.pos)) continue;
      if (lits.length === 1 && othersOf(lits, dex).length === 0) continue; // "&!costume": fine
      for (const l of lits) {
        if (l.pos) continue;
        const set = relaxed.get(l.dim) ?? relaxed.set(l.dim, new Set()).get(l.dim)!;
        for (const d of dex) if (!set.has(d)) (set.add(d), (changed = true));
      }
    }
    if (!changed) break;
  }

  const kw = (l: Lit) => `${l.pos ? '' : '!'}${keyword(l.dim, lang)!}`;
  const parts = [dexRanges(dexes).join(',')];
  const ordered = [...clauses.values()].sort((a, b) => {
    const neg = (x: { lits: Lit[] }) => (x.lits.every((l) => !l.pos) ? 2 : x.lits.every((l) => l.pos) ? 0 : 1);
    return neg(a) - neg(b) || a.lits.map(litKey).join().localeCompare(b.lits.map(litKey).join());
  });
  for (const { lits, dex } of ordered) {
    // Pokémon this clause is not about pass it through their own number, unless they satisfy it anyway.
    parts.push([...lits.map(kw), ...dexRanges(othersOf(lits, dex))].join(','));
  }
  // What the string shows on top of the list, per filter: the Pokémon whose exclusion had to go.
  const looser = [...relaxed]
    .map(([dim, ds]) => ({ dim, dex: [...ds].filter((d) => byDex.get(d)!.some((c) => c.some((l) => l.dim === dim && !l.pos))).sort((a, b) => a - b) }))
    .filter((x) => x.dex.length);

  // Label: each combination of filters with its number of Pokémon.
  const combos = new Map<string, { modifiers: string[]; dex: Set<number> }>();
  for (const t of targets) {
    const mods = cubeOf(t)
      .filter((l) => l.pos || (['alola', 'galar', 'hisui', 'paldea'] as string[]).includes(l.dim))
      .filter((l) => keyword(l.dim, lang) !== null)
      .map(litKey);
    const key = mods.join('&');
    (combos.get(key) ?? combos.set(key, { modifiers: mods, dex: new Set() }).get(key)!).dex.add(t.dex);
  }
  const partsInfo = [...combos.values()]
    .sort((a, b) => a.modifiers.filter((m) => !m.startsWith('!')).length - b.modifiers.filter((m) => !m.startsWith('!')).length)
    .map((c) => ({ modifiers: c.modifiers, count: c.dex.size }));

  return {
    modifiers: partsInfo.length === 1 ? partsInfo[0]!.modifiers : [],
    parts: partsInfo,
    text: parts.join('&'),
    count: dexes.length,
    batch: 1,
    batches: 1,
    ...(unsupported.size ? { unsupported: [...unsupported] } : {}),
    ...(looser.length ? { looser } : {}),
  };
}
