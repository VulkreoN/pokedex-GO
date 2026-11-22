/**
 * Builds Pokémon GO storage search strings.
 *
 * Syntax (Scopely help center + GO Hub cheat sheet):
 *   ","  OR      "&"  AND      "!"  NOT
 *   "1-151" dex range, "25" single dex number
 *   shiny, costume, female, male, alola, galar, hisui, paldea, gigantamax
 * Commas are evaluated inside ampersands: "1,4&shiny" = (1 OR 4) AND shiny (a conjunction of OR-clauses).
 * "Pikachu male OR Charmander female" has no direct form, but when the groups' dex numbers do not overlap it can be
 * written as clauses: "4,25&male,4&female,25" = (Charmander or Pikachu) and (male or Charmander) and (female or
 * Pikachu). Groups are packed that way while the string stays short; overlapping groups get their own string.
 * A third-party tool reports a 200-character limit on the in-game field, so strings are split in batches.
 */
import type { EntryGender, EntryTag, Gender, Variant } from './types.js';

export type Region = 'alola' | 'galar' | 'hisui' | 'paldea';

export interface SearchTarget {
  dex: number;
  shiny?: boolean;
  costume?: boolean;
  gender?: Gender | null;
  region?: Region | null;
  gmax?: boolean;
  tag?: EntryTag;
}

export interface SearchString {
  /** Modifiers applied with "&", in display order. Empty for plain dex lists and for combined strings (see parts). */
  modifiers: string[];
  /** Combined string: the modifier groups it covers, each with its dex count. */
  parts?: { modifiers: string[]; count: number }[];
  text: string;
  /** Number of distinct dex numbers covered by this string. */
  count: number;
  /** 1-based index when a group had to be split in several batches. */
  batch: number;
  batches: number;
}

export const DEFAULT_MAX_LENGTH = 200;

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
export function targetFromVariant(v: Variant, shiny: boolean, gender: EntryGender | null, tag: EntryTag = ''): SearchTarget {
  const both = (v.genders ?? ['m', 'f']).length > 1;
  return {
    dex: v.dex,
    shiny,
    tag,
    costume: v.kind === 'costume',
    gender: both && gender ? gender : null,
    region: v.kind === 'regional' ? regionOfForm(v.form) : null,
    gmax: v.kind === 'gmax',
  };
}

function modifiersOf(t: SearchTarget): string[] {
  const mods: string[] = [];
  if (t.region) mods.push(t.region);
  if (t.costume) mods.push('costume');
  if (t.gmax) mods.push('gigantamax');
  if (t.gender === 'm') mods.push('male');
  if (t.gender === 'f') mods.push('female');
  if (t.shiny) mods.push('shiny');
  if (t.tag) mods.push(t.tag.startsWith('bg:') ? 'background' : t.tag); // lucky, background, shadow, purified, xxl, xxs are in-game keywords
  return mods;
}

export function buildSearchStrings(
  targets: SearchTarget[],
  options: { maxLength?: number } = {},
): SearchString[] {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  // Hunting both the male and the female of the same thing: one string without a gender filter covers both.
  const genderless = (t: SearchTarget) => JSON.stringify({ ...t, gender: null });
  const genders = new Map<string, Set<Gender | null | undefined>>();
  for (const t of targets) (genders.get(genderless(t)) ?? genders.set(genderless(t), new Set()).get(genderless(t))!).add(t.gender);
  targets = targets.map((t) => {
    const g = genders.get(genderless(t))!;
    return t.gender && g.has('m') && g.has('f') ? { ...t, gender: null } : t;
  });

  const groups = new Map<string, { modifiers: string[]; dex: Set<number> }>();
  for (const t of targets) {
    const modifiers = modifiersOf(t);
    const id = modifiers.join('&');
    let g = groups.get(id);
    if (!g) {
      g = { modifiers, dex: new Set() };
      groups.set(id, g);
    }
    g.dex.add(t.dex);
  }

  const result: SearchString[] = [];
  const ordered = [...groups.values()].sort((a, b) => a.modifiers.length - b.modifiers.length || a.modifiers.join().localeCompare(b.modifiers.join()));

  // Pack groups whose dex numbers do not overlap into one string, while it fits.
  const bundles: Group[][] = [];
  for (const g of ordered) {
    const fit = bundles.find((b) => b.every((x) => disjoint(x.dex, g.dex)) && renderBundle([...b, g]).length <= maxLength);
    if (fit) fit.push(g);
    else bundles.push([g]);
  }

  for (const bundle of bundles) {
    if (bundle.length > 1) {
      result.push({
        modifiers: [],
        parts: bundle.map((g) => ({ modifiers: g.modifiers, count: g.dex.size })),
        text: renderBundle(bundle),
        count: bundle.reduce((n, g) => n + g.dex.size, 0),
        batch: 1,
        batches: 1,
      });
      continue;
    }
    const g = bundle[0]!;
    const suffix = g.modifiers.map((m) => `&${m}`).join('');
    const tokens = dexRanges([...g.dex]);
    const batches: string[][] = [];
    let current: string[] = [];
    let currentLen = 0;
    for (const tok of tokens) {
      const extra = current.length ? tok.length + 1 : tok.length;
      if (current.length && currentLen + extra + suffix.length > maxLength) {
        batches.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(tok);
      currentLen += current.length === 1 ? tok.length : tok.length + 1;
    }
    if (current.length) batches.push(current);
    batches.forEach((b, i) => {
      result.push({
        modifiers: g.modifiers,
        text: b.join(',') + suffix,
        count: countDex(b),
        batch: i + 1,
        batches: batches.length,
      });
    });
  }
  return result;
}

type Group = { modifiers: string[]; dex: Set<number> };

function disjoint(a: Set<number>, b: Set<number>): boolean {
  for (const x of a) if (b.has(x)) return false;
  return true;
}

/**
 * One string for groups with disjoint dex numbers: every listed dex, then for each modifier "m, <dex of the groups
 * that do not need m>". A Pokémon of group G passes the clause of a modifier G needs only by having it, and passes
 * the clauses of modifiers G does not need through its own dex number.
 */
function renderBundle(groups: Group[]): string {
  const all = groups.flatMap((g) => [...g.dex]);
  const mods: string[] = [];
  for (const g of groups) for (const m of g.modifiers) if (!mods.includes(m)) mods.push(m);
  const clauses = [dexRanges(all).join(',')];
  for (const m of mods) {
    const without = groups.filter((g) => !g.modifiers.includes(m)).flatMap((g) => [...g.dex]);
    clauses.push(without.length ? `${m},${dexRanges(without).join(',')}` : m);
  }
  return clauses.join('&');
}

function countDex(tokens: string[]): number {
  return tokens.reduce((n, t) => {
    const [a, b] = t.split('-').map(Number);
    return n + (b !== undefined ? b - a! + 1 : 1);
  }, 0);
}
