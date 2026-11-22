/**
 * Checks generated search strings against a model of the in-game storage search:
 * "&" separates clauses that must all hold, "," separates alternatives inside a clause, "!" negates a term,
 * a term is a dex number, a dex range "a-b" or a keyword. (Same rules as the Bottle Cap candidate string from g47ix.)
 * For random lists, every string must only catch wanted Pokémon, and all strings together must catch all of them.
 */
import { describe, expect, it } from 'vitest';
import { buildSearchStrings, type Region, type SearchTarget } from './search.js';
import type { EntryTag } from './types.js';

interface Mon {
  dex: number;
  shiny: boolean;
  costume: boolean;
  gender: 'm' | 'f' | null;
  region: Region | null;
  gmax: boolean;
  tag: EntryTag;
}

function termMatches(term: string, p: Mon): boolean {
  const neg = term.startsWith('!');
  const t = neg ? term.slice(1) : term;
  let ok: boolean;
  const range = /^(\d+)-(\d+)$/.exec(t);
  if (range) ok = p.dex >= Number(range[1]) && p.dex <= Number(range[2]);
  else if (/^\d+$/.test(t)) ok = p.dex === Number(t);
  else if (t === 'shiny') ok = p.shiny;
  else if (t === 'costume') ok = p.costume;
  else if (t === 'male') ok = p.gender === 'm';
  else if (t === 'female') ok = p.gender === 'f';
  else if (t === 'gigantamax') ok = p.gmax;
  else if (t === 'alola' || t === 'galar' || t === 'hisui' || t === 'paldea') ok = p.region === t;
  else if (t === 'background') ok = p.tag === 'background' || p.tag.startsWith('bg:');
  else if (['lucky', 'shadow', 'purified', 'dynamax', 'xxl', 'xxs'].includes(t)) ok = p.tag === t;
  else throw new Error(`unknown search term "${t}"`);
  return neg ? !ok : ok;
}

export function gameSearch(text: string, p: Mon): boolean {
  return text.split('&').every((clause) => clause.split(',').some((term) => termMatches(term, p)));
}

function wanted(t: SearchTarget, p: Mon): boolean {
  return (
    p.dex === t.dex &&
    (!t.shiny || p.shiny) &&
    (!t.costume || p.costume) &&
    (!t.gender || p.gender === t.gender) &&
    (!t.region || p.region === t.region) &&
    (!t.gmax || p.gmax) &&
    (!t.tag || (t.tag.startsWith('bg:') ? p.tag === 'background' || p.tag.startsWith('bg:') : p.tag === t.tag))
  );
}

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const TAGS: EntryTag[] = ['', 'lucky', 'shadow', 'background', 'xxl'];
const REGIONS: (Region | null)[] = [null, null, 'alola', 'galar'];

/** Every combination of attributes for a few dex numbers: the "storage" the strings are run against. */
function storage(dexes: number[]): Mon[] {
  const out: Mon[] = [];
  for (const dex of dexes)
    for (const shiny of [false, true])
      for (const costume of [false, true])
        for (const gender of ['m', 'f', null] as const)
          for (const region of REGIONS.slice(1).concat([null]))
            for (const tag of TAGS) out.push({ dex, shiny, costume, gender, region, gmax: false, tag });
  return out;
}

function check(targets: SearchTarget[], maxLength?: number) {
  const dexes = [...new Set(targets.map((t) => t.dex)).add(999)]; // 999: a Pokémon nobody hunts
  const mons = storage(dexes);
  const strings = buildSearchStrings(targets, maxLength ? { maxLength } : {});
  for (const s of strings) {
    if (maxLength) expect(s.text.length, s.text).toBeLessThanOrEqual(maxLength);
    for (const p of mons) if (gameSearch(s.text, p)) expect(targets.some((t) => wanted(t, p)), `"${s.text}" catches unwanted ${JSON.stringify(p)}`).toBe(true);
  }
  for (const p of mons) if (targets.some((t) => wanted(t, p))) expect(strings.some((s) => gameSearch(s.text, p)), `nothing catches ${JSON.stringify(p)}`).toBe(true);
  return strings;
}

describe('search strings behave like the in-game search', () => {
  it('Pikachu male + Charmander female: one string, exactly those two', () => {
    const strings = check([{ dex: 25, gender: 'm' }, { dex: 4, gender: 'f' }]);
    expect(strings).toHaveLength(1);
  });

  it('mixed shiny / gender / costume / region / traits', () => {
    check([
      { dex: 25, gender: 'm' },
      { dex: 4, gender: 'f', shiny: true },
      { dex: 1 },
      { dex: 19, region: 'alola', gender: 'f' },
      { dex: 133, costume: true, tag: 'lucky' },
      { dex: 7, tag: 'shadow' },
      { dex: 150 },
    ]);
  });

  it('the same Pokémon in several versions', () => {
    check([
      { dex: 25 },
      { dex: 25, shiny: true },
      { dex: 25, costume: true, shiny: true, gender: 'f' },
      { dex: 26, gender: 'm' },
      { dex: 26, gender: 'f', shiny: true },
    ]);
  });

  it('holds on 300 random lists, including long ones split under the length limit', () => {
    const r = rng(42);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
    for (let n = 0; n < 300; n++) {
      const size = 1 + Math.floor(r() * 8);
      const targets: SearchTarget[] = Array.from({ length: size }, () => ({
        dex: 1 + Math.floor(r() * 12),
        shiny: r() < 0.3,
        costume: r() < 0.2,
        gender: pick([null, null, 'm', 'f'] as const),
        region: pick(REGIONS),
        tag: pick(TAGS),
      }));
      check(targets, n % 3 === 0 ? 40 : undefined);
    }
  });
});
