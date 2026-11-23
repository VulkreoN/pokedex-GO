import { describe, expect, it } from 'vitest';
import { rankTable } from './pvp.js';
import { ivSearch, starsOf } from './pvpSearch.js';

const cpm = [0.094, 0.16639787, 0.21573247, 0.25572005, 0.29024988, 0.3210876, 0.34921268, 0.3752356, 0.39956728, 0.4225, 0.44310755, 0.4627984, 0.48168495, 0.49985844, 0.51739395, 0.5343543, 0.5507927, 0.5667545, 0.5822789, 0.5974, 0.6121573, 0.6265671, 0.64065295, 0.65443563, 0.667934, 0.6811649, 0.69414365, 0.7068842, 0.7193991, 0.7317, 0.7377695, 0.74378943, 0.74976104, 0.7556855, 0.76156384, 0.76739717, 0.7731865, 0.77893275, 0.784637, 0.7903, 0.7953, 0.8003, 0.8053, 0.8103, 0.8153, 0.8203, 0.8253, 0.8303, 0.8353, 0.8403, 0.8453];
const azumarill = { atk: 112, def: 152, sta: 225 };

describe('ivSearch', () => {
  it('maps IVs to appraisal stars', () => {
    expect([0, 1, 5, 6, 10, 11, 14, 15].map(starsOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('boxes the best Great League Azumarill by stars, in the family, in either game language', () => {
    const table = rankTable({ cpm }, azumarill, 1500, 50);
    // The 10 best: the usual "low Attack, high Defense and HP" search, 150 of the 4096 combinations.
    const en = ivSearch(table, { top: 10, family: 'Marill' });
    expect(en).toEqual({ text: '+marill&0-1attack&3-4defense&3-4hp', top: 10, matched: 150 });
    expect(ivSearch(table, { top: 10, family: 'Marill', lang: 'fr' }).text).toBe('+marill&0-1attaque&3-4défense&3-4pv');
    // Wider: more of the good ones, more to sort through.
    expect(ivSearch(table, { top: 41 })).toMatchObject({ text: '0-1attack&2-4defense&2-4hp', matched: 600 });
  });

  it('leaves out a stat the best ones do not care about', () => {
    const table = rankTable({ cpm }, azumarill, 1500, 50);
    expect(ivSearch(table, { top: table.length }).text).toBe('');
  });
});
