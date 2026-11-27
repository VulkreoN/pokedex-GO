/**
 * Checks generated search strings against a model of the in-game storage search:
 * "&" separates clauses that must all hold, "," separates alternatives inside a clause, "!" negates a term,
 * a term is a dex number, a dex range "a-b" or a keyword. (Same rules as the Bottle Cap candidate string from g47ix.)
 * For random lists, every string must only catch wanted Pokémon, and all strings together must catch all of them.
 */
import { describe, expect, it } from 'vitest';
import { buildSearchStrings, type GameLang, type Region, type SearchTarget, type SpeciesSearchInfo } from './search.js';
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
  else if (t === 'shiny' || t === 'chromatique') ok = p.shiny;
  else if (t === 'costume') ok = p.costume;
  else if (t === 'male' || t === 'mâle') ok = p.gender === 'm';
  else if (t === 'female' || t === 'femelle') ok = p.gender === 'f';
  else if (t === 'chanceux') ok = p.tag === 'lucky';
  else if (t === 'obscur') ok = p.tag === 'shadow';
  else if (t === 'purifié') ok = p.tag === 'purified';
  else if (t === 'gigantamax' || t === 'gigamax') ok = p.gmax;
  else if (t === 'alola' || t === 'galar' || t === 'hisui' || t === 'paldea') ok = p.region === t;
  else if (t === 'background') ok = p.tag === 'background' || p.tag.startsWith('bg:');
  else if (['lucky', 'shadow', 'purified', 'dynamax', 'xxl', 'xxs'].includes(t)) ok = p.tag === t;
  else throw new Error(`unknown search term "${t}"`);
  return neg ? !ok : ok;
}

/** As seen in game: a "!" starting a block negates the whole block ("!hisui,100" = neither Hisuian nor #100). */
export function gameSearch(text: string, p: Mon): boolean {
  return text.split('&').every((clause) => {
    if (clause.startsWith('!') && clause.includes(',')) return !clause.slice(1).split(',').some((term) => termMatches(term, p));
    return clause.split(',').some((term) => termMatches(term, p));
  });
}

function wanted(t: SearchTarget, p: Mon): boolean {
  return (
    p.dex === t.dex &&
    (t.shiny === undefined || p.shiny === t.shiny) &&
    (t.costume === undefined || p.costume === t.costume) &&
    (!t.gender || p.gender === t.gender) &&
    (t.region ? p.region === t.region : !(p.region && t.excludeRegions?.includes(p.region))) &&
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

/** Regional forms per species, like the real ones (Growlithe: Hisui, Farfetch'd: Galar, Meowth: Alola and Galar). */
const REGIONAL = new Map<number, Region[]>([
  [3, ['alola']], [6, ['galar']], [8, ['alola', 'hisui']], [11, ['hisui']],
  [19, ['alola']], [52, ['alola', 'galar']], [58, ['hisui']], [83, ['galar']], [100, ['hisui']],
]);
/** What the app does: a target without a region leaves the species' regional forms out. */
const asApp = (t: SearchTarget): SearchTarget => (t.region ? t : { ...t, ...(REGIONAL.get(t.dex)?.length ? { excludeRegions: REGIONAL.get(t.dex) } : {}) });

/** Like in the game, a species either has genders or has none (Voltorb, Magnemite...). */
const GENDERLESS = new Set([5, 10, 100]);

/** Every combination of attributes for a few dex numbers: the "storage" the strings are run against. */
function storage(dexes: number[]): Mon[] {
  const out: Mon[] = [];
  for (const dex of dexes)
    for (const shiny of [false, true])
      for (const costume of [false, true])
        for (const gender of GENDERLESS.has(dex) ? [null] : (['m', 'f'] as const))
          for (const region of [null, ...(REGIONAL.get(dex) ?? [])])
            for (const tag of TAGS) out.push({ dex, shiny, costume, gender, region, gmax: false, tag });
  return out;
}

/** A French game has no keyword for these: strings leave them out, so they may show extra Pokémon there, never fewer. */
const loosened = (t: SearchTarget, lang: GameLang): SearchTarget =>
  lang === 'fr' ? { ...t, gmax: false, tag: t.tag === 'background' || t.tag?.startsWith('bg:') ? '' : t.tag } : t;

function check(targets: SearchTarget[], maxLength?: number, lang: GameLang = 'en') {
  const dexes = [...new Set(targets.map((t) => t.dex)).add(999)]; // 999: a Pokémon nobody hunts
  const mons = storage(dexes);
  targets = targets.map(asApp);
  const species = new Map<number, SpeciesSearchInfo>(
    dexes.map((d) => [d, { regions: REGIONAL.get(d) ?? [], costumes: true, genders: GENDERLESS.has(d) ? [] : ['m', 'f'] }]),
  );
  const strings = buildSearchStrings(targets, { ...(maxLength ? { maxLength } : {}), lang, species });
  for (const s of strings) {
    // Negations only ever stand alone in their block.
    for (const block of s.text.split('&')) if (block.includes('!')) expect(block, s.text).toMatch(/^![^,]+$/);
    // A single Pokémon with all its filters cannot be split further; everything else must fit.
    if (maxLength && s.count > 1) expect(s.text.length, s.text).toBeLessThanOrEqual(maxLength);
    // Extras are only allowed where the string says so (exclusions it had to drop, keywords the language lacks).
    const looser = (t: SearchTarget): SearchTarget => {
      const dims = new Set((s.looser ?? []).filter((x) => x.dex.includes(t.dex)).map((x) => x.dim));
      return {
        ...t,
        ...(dims.has('shiny') && t.shiny === false ? { shiny: undefined } : {}),
        ...(dims.has('costume') && t.costume === false ? { costume: undefined } : {}),
        ...(t.excludeRegions ? { excludeRegions: t.excludeRegions.filter((r) => !dims.has(r)) } : {}),
      };
    };
    for (const p of mons) if (gameSearch(s.text, p)) expect(targets.some((t) => wanted(loosened(looser(t), lang), p)), `"${s.text}" catches unwanted ${JSON.stringify(p)}`).toBe(true);
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

  it('speaks the game language: a French game gets mâle / femelle / chromatique', () => {
    // The list from the report: Bulbasaur and Tentacool (both genders), Growlithe ♂, Galarian Farfetch'd ♀, Hisuian Voltorb.
    const targets: SearchTarget[] = [
      { dex: 1, gender: 'm' }, { dex: 1, gender: 'f' },
      { dex: 58, gender: 'm' },
      { dex: 72, gender: 'm' }, { dex: 72, gender: 'f' },
      { dex: 83, region: 'galar', gender: 'f' },
      { dex: 100, region: 'hisui' },
    ];
    const [s] = check(targets, undefined, 'fr');
    expect(s!.text).toContain('mâle');
    expect(s!.text).toContain('femelle');
    expect(s!.text).not.toMatch(/\bmale\b|\bfemale\b/);
    expect(buildSearchStrings([{ dex: 25, shiny: true }], { lang: 'fr' })[0]!.text).toBe('25&chromatique');
  });

  it('a plain Growlithe leaves Hisuian Growlithe out, and the whole list is one string', () => {
    const targets: SearchTarget[] = [
      { dex: 1, gender: 'm' }, { dex: 1, gender: 'f' },
      { dex: 58, gender: 'm' },
      { dex: 72, gender: 'm' }, { dex: 72, gender: 'f' },
      { dex: 83, region: 'galar', gender: 'f' },
      { dex: 100, region: 'hisui' },
    ];
    const strings = check(targets, undefined, 'fr');
    // Voltorb wants Hisui, so "not Hisuian" cannot be a block of its own: Hisuian Growlithe also shows, and the
    // string says so. Before, "!hisui,100" hid Hisuian Voltorb in game.
    expect(strings.map((s) => s.text)).toEqual(['1,58,72,83,100&femelle,1,58,72,100&galar,1,58,72,100&hisui,1,58,72,83&mâle,1,72,83,100']);
    expect(strings[0]!.looser).toEqual([{ dim: 'hisui', dex: [58] }]);
  });

  it('leaves out filters a French game has no keyword for, and says so', () => {
    const [s] = buildSearchStrings([{ dex: 6, tag: 'background', shiny: true }], { lang: 'fr' });
    expect(s!.text).toBe('6&chromatique');
    expect(s!.unsupported).toEqual(['background']);
  });

  it('finds Dynamax in a French game ("dynamax")', () => {
    const [s] = buildSearchStrings([{ dex: 6, tag: 'dynamax', shiny: true }], { lang: 'fr' });
    expect(s!.text).toBe('6&dynamax&chromatique');
    expect(s!.unsupported).toBeUndefined();
  });

  it('finds only Gigantamax in a French game ("gigamax")', () => {
    const strings = buildSearchStrings([3, 6, 25].map((dex) => ({ dex, gmax: true, shiny: true })), { lang: 'fr', exclude: ['costume'] });
    expect(strings).toHaveLength(1);
    expect(strings[0]!.text.split('&')).toContain('gigamax');
    expect(strings[0]!.unsupported).toBeUndefined();
    for (const gmax of [true, false]) expect(gameSearch(strings[0]!.text, { dex: 6, shiny: true, costume: false, gender: null, region: null, gmax, tag: '' })).toBe(gmax);
  });

  it('holds on 300 random lists in French too', () => {
    const r = rng(7);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
    for (let n = 0; n < 300; n++) {
      const targets: SearchTarget[] = Array.from({ length: 1 + Math.floor(r() * 8) }, () => ({
        dex: 1 + Math.floor(r() * 12),
        shiny: r() < 0.3,
        costume: r() < 0.2,
        gender: null as 'm' | 'f' | null,
        region: null as Region | null,
        tag: pick([...TAGS, 'purified' as EntryTag]),
      }));
      for (const t of targets) {
        if (!GENDERLESS.has(t.dex)) t.gender = pick([null, null, 'm', 'f'] as const);
        const regions = REGIONAL.get(t.dex) ?? [];
        if (regions.length && r() < 0.4) t.region = pick(regions);
      }
      check(targets, n % 3 === 0 ? 40 : undefined, 'fr');
    }
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
        gender: null as 'm' | 'f' | null,
        region: null as Region | null,
        tag: pick(TAGS),
      }));
      for (const t of targets) {
        if (!GENDERLESS.has(t.dex)) t.gender = pick([null, null, 'm', 'f'] as const);
        const regions = REGIONAL.get(t.dex) ?? [];
        if (regions.length && r() < 0.4) t.region = pick(regions);
      }
      check(targets, n % 3 === 0 ? 40 : undefined);
    }
  });
});
