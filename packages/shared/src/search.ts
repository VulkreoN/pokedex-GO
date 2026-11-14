/**
 * Builds Pokémon GO storage search strings.
 *
 * Syntax (Scopely help center + GO Hub cheat sheet):
 *   ","  OR      "&"  AND      "!"  NOT
 *   "1-151" dex range, "25" single dex number
 *   shiny, costume, female, male, alola, galar, hisui, paldea, gigantamax
 * Commas are evaluated inside ampersands: "1,4&shiny" = (1 OR 4) AND shiny.
 * There is no way to OR two AND-groups, so each modifier combination is its own string.
 * A third-party tool reports a 200-character limit on the in-game field, so strings are split in batches.
 */
import type { Gender, Variant } from './types.js';

export type Region = 'alola' | 'galar' | 'hisui' | 'paldea';

export interface SearchTarget {
  dex: number;
  shiny?: boolean;
  costume?: boolean;
  gender?: Gender | null;
  region?: Region | null;
  gmax?: boolean;
}

export interface SearchString {
  /** Modifiers applied with "&", in display order. Empty for plain dex lists. */
  modifiers: string[];
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

/** Turns a dataset variant into a search target. Pass genderDiff of the species to decide whether a gender filter is meaningful. */
export function targetFromVariant(v: Variant, shiny: boolean, genderDiff: boolean): SearchTarget {
  return {
    dex: v.dex,
    shiny,
    costume: v.kind === 'costume',
    gender: genderDiff && v.gender ? v.gender : null,
    region: v.kind === 'regional' ? regionOfForm(v.form) : null,
    gmax: v.kind === 'gmax',
  };
}

function modifiersOf(t: SearchTarget): string[] {
  const mods: string[] = [];
  if (t.region) mods.push(t.region);
  if (t.costume) mods.push('costume');
  if (t.gmax) mods.push('gigantamax');
  if (t.gender === 'f') mods.push('female');
  else if (t.gender === 'm') mods.push('male');
  if (t.shiny) mods.push('shiny');
  return mods;
}

export function buildSearchStrings(
  targets: SearchTarget[],
  options: { maxLength?: number } = {},
): SearchString[] {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
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
  for (const g of ordered) {
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

function countDex(tokens: string[]): number {
  return tokens.reduce((n, t) => {
    const [a, b] = t.split('-').map(Number);
    return n + (b !== undefined ? b - a! + 1 : 1);
  }, 0);
}
