import { describe, expect, it } from 'vitest';
import { buildSearchStrings, compressDexNumbers, dexRanges, plainTargets } from './search.js';
import { makeVariantKey, parseVariantKey } from './keys.js';

describe('dex ranges', () => {
  it('compresses consecutive runs of three or more', () => {
    expect(compressDexNumbers([1, 2, 3, 5, 7, 8, 9, 9, 12])).toBe('1-3,5,7-9,12');
  });
  it('keeps pairs as two numbers', () => {
    expect(dexRanges([4, 5])).toEqual(['4', '5']);
  });
  it('ignores junk', () => {
    expect(dexRanges([0, -1, 2.5, 3])).toEqual(['3']);
  });
});

describe('buildSearchStrings', () => {
  it('puts the whole list in one string, overlapping Pokémon included', () => {
    const out = buildSearchStrings([
      { dex: 25, shiny: true },
      { dex: 1 },
      { dex: 4 },
      { dex: 26, shiny: true },
      { dex: 25, costume: true, shiny: true },
    ]);
    // Shiny Pikachu (any) already covers costumed shiny Pikachu.
    expect(out.map((s) => s.text)).toEqual(['1,4,25,26&shiny,1,4']);
    expect(out[0]!.parts).toEqual([{ modifiers: [], count: 2 }, { modifiers: ['shiny'], count: 2 }, { modifiers: ['costume', 'shiny'], count: 1 }]);
  });
  it('writes "Pikachu male or Charmander female" as one string', () => {
    expect(buildSearchStrings([{ dex: 25, gender: 'm' }, { dex: 4, gender: 'f' }]).map((s) => s.text)).toEqual(['4,25&female,25&male,4']);
  });
  it('splits long groups into batches that keep the suffix', () => {
    const targets = Array.from({ length: 120 }, (_, i) => ({ dex: i * 2 + 1, shiny: true }));
    const out = buildSearchStrings(targets, { maxLength: 60 });
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) {
      expect(s.text.length).toBeLessThanOrEqual(60);
      expect(s.text.endsWith('&shiny')).toBe(true);
      expect(s.batches).toBe(out.length);
    }
    expect(out.reduce((n, s) => n + s.count, 0)).toBe(120);
  });
  it('filters by gender; "male or female" is dropped when the species has both', () => {
    expect(buildSearchStrings([{ dex: 41, gender: 'm' }, { dex: 42, gender: 'f' }]).map((s) => s.text)).toEqual(['41,42&female,41&male,42']);
    // Both genders of the same target: one string, no filter.
    const targets = [{ dex: 25, gender: 'm' as const }, { dex: 25, gender: 'f' as const }, { dex: 26, gender: 'f' as const }];
    expect(buildSearchStrings(targets).map((s) => s.text)).toEqual(['25,26&female,25&female,male,26']);
    const species = new Map([25, 26].map((d) => [d, { regions: [], costumes: true, genders: ['m', 'f'] as ('m' | 'f')[] }]));
    expect(buildSearchStrings(targets, { species }).map((s) => s.text)).toEqual(['25,26&female,25']);
  });
  it('adds trait keywords last', () => {
    expect(buildSearchStrings([{ dex: 25, shiny: true, tag: 'lucky' }, { dex: 1, tag: 'background' }]).map((s) => s.text)).toEqual(['1,25&background,25&lucky,1&shiny,1']);
  });
  it('orders modifiers consistently', () => {
    const [s] = buildSearchStrings([{ dex: 19, region: 'alola', gender: 'f', shiny: true }]);
    expect(s!.text).toBe('19&alola&female&shiny');
  });
});

describe('variant keys', () => {
  it('round-trips', () => {
    for (const parts of [
      { dex: 25, form: null, costume: null, gender: null },
      { dex: 25, form: 'HALLOWEEN_2026_01', costume: null, gender: 'f' as const },
      { dex: 1, form: null, costume: 'JAN_2020_NOEVOLVE', gender: null },
    ]) {
      expect(parseVariantKey(makeVariantKey(parts))).toEqual(parts);
    }
  });
  it('rejects garbage', () => {
    expect(parseVariantKey('25;drop')).toBeNull();
    expect(parseVariantKey('abc')).toBeNull();
  });
});

describe('whole-search exclusions for trades', () => {
  const exclude = ['traded', '4*', 'shiny', 'costume', 'shadow', 'purified'];
  it('go first, in the game language, without repeating a block', () => {
    const [s] = buildSearchStrings([{ dex: 25, shiny: false, costume: false }, { dex: 1, shiny: false, costume: false }], { lang: 'fr', exclude });
    expect(s!.text).toBe('!échangé&!4*&!chromatique&!costume&!obscur&!purifié&1,25');
    expect(buildSearchStrings([{ dex: 25 }], { exclude: ['traded', '4*'] })[0]!.text).toBe('!traded&!4*&25');
  });
  it('skip what the list wants: a shiny entry keeps shinies', () => {
    const [s] = buildSearchStrings([{ dex: 25, shiny: true }, { dex: 1, shiny: false }], { lang: 'fr', exclude });
    expect(s!.text.startsWith('!échangé&!4*&!costume&!obscur&!purifié&')).toBe(true);
    expect(s!.text).not.toContain('!chromatique');
    expect(s!.skippedExclusions).toEqual(['shiny']);
  });
});

describe('strings never show shinies or costumes', () => {
  it('leaves shiny and costumed entries out, and starts with both exclusions', () => {
    const { targets, dropped } = plainTargets([
      { dex: 25, gender: 'm', shiny: false, costume: false },
      { dex: 25, gender: 'f', shiny: true, costume: false },
      { dex: 25, gender: 'f', shiny: false, costume: true },
      { dex: 4, gender: 'f', shiny: false, costume: false },
    ]);
    expect(dropped).toBe(2);
    const [s] = buildSearchStrings(targets, { lang: 'fr', exclude: ['shiny', 'costume'] });
    expect(s!.text).toBe('!chromatique&!costume&4,25&femelle,25&mâle,4');
    expect(s!.skippedExclusions).toBeUndefined();
    expect(s!.looser).toBeUndefined();
  });
});
