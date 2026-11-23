import { describe, expect, it } from 'vitest';
import { TYPES, effectiveness } from './typeChart.js';

describe('effectiveness', () => {
  it('uses Pokémon GO multipliers, multiplied over both types', () => {
    expect(effectiveness('fighting', ['steel'])).toBe(1.6);
    expect(effectiveness('grass', ['water', 'ground'])).toBeCloseTo(2.56); // Swampert
    expect(effectiveness('dragon', ['fairy'])).toBe(0.390625);
    expect(effectiveness('electric', ['water', 'fairy'])).toBe(1.6); // Azumarill
    expect(effectiveness('poison', ['water', 'fairy'])).toBe(1.6);
    expect(effectiveness('fighting', ['ghost', 'dark'])).toBeCloseTo(0.390625 * 1.6); // Sableye
    expect(effectiveness('normal', ['normal'])).toBe(1);
  });
  it('knows all 18 types', () => {
    expect(TYPES).toHaveLength(18);
    for (const a of TYPES) for (const d of TYPES) expect(effectiveness(a, [d])).toBeGreaterThan(0);
  });
});
