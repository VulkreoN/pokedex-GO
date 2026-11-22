import { describe, expect, it } from 'vitest';
import { buildSearchStrings, compressDexNumbers, dexRanges } from './search.js';
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
  it('combines groups whose dex numbers do not overlap, and splits the ones that do', () => {
    const out = buildSearchStrings([
      { dex: 25, shiny: true },
      { dex: 1 },
      { dex: 4 },
      { dex: 26, shiny: true },
      { dex: 25, costume: true, shiny: true },
    ]);
    // Plain 1, 4 and shiny 25, 26 fit together; costume shiny Pikachu overlaps with shiny Pikachu.
    expect(out.map((s) => s.text)).toEqual(['1,4,25,26&shiny,1,4', '25&costume&shiny']);
    expect(out[0]!.parts).toEqual([{ modifiers: [], count: 2 }, { modifiers: ['shiny'], count: 2 }]);
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
  it('filters by gender, both genders of one target collapse into one string', () => {
    expect(buildSearchStrings([{ dex: 41, gender: 'm' }, { dex: 42, gender: 'f' }]).map((s) => s.text)).toEqual(['41,42&female,41&male,42']);
    // Both genders of the same target: one string, no filter.
    expect(buildSearchStrings([{ dex: 25, gender: 'm' }, { dex: 25, gender: 'f' }, { dex: 26, gender: 'f' }]).map((s) => s.text)).toEqual(['25,26&female,25']);
  });
  it('adds trait keywords last', () => {
    expect(buildSearchStrings([{ dex: 25, shiny: true, tag: 'lucky' }, { dex: 1, tag: 'background' }]).map((s) => s.text)).toEqual(['1,25&background,25&shiny,1&lucky,1']);
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
