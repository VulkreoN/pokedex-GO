import { describe, expect, it } from 'vitest';
import { bestUnderCap, cpOf, cpmAt, levelsForCp, powerUpCost, rankOf, rankTable } from './pvp.js';

const cpm = [0.094, 0.16639787, 0.21573247, 0.25572005, 0.29024988, 0.3210876, 0.34921268, 0.3752356, 0.39956728, 0.4225, 0.44310755, 0.4627984, 0.48168495, 0.49985844, 0.51739395, 0.5343543, 0.5507927, 0.5667545, 0.5822789, 0.5974, 0.6121573, 0.6265671, 0.64065295, 0.65443563, 0.667934, 0.6811649, 0.69414365, 0.7068842, 0.7193991, 0.7317, 0.7377695, 0.74378943, 0.74976104, 0.7556855, 0.76156384, 0.76739717, 0.7731865, 0.77893275, 0.784637, 0.7903, 0.7953, 0.8003, 0.8053, 0.8103, 0.8153, 0.8203, 0.8253, 0.8303, 0.8353, 0.8403, 0.8453];
const data = {
  cpm,
  stardust: [200, 200, 400, 400, 600, 600, 800, 800, 1000, 1000, 1300, 1300, 1600, 1600, 1900, 1900, 2200, 2200, 2500, 2500, 3000, 3000, 3500, 3500, 4000, 4000, 4500, 4500, 5000, 5000, 6000, 6000, 7000, 7000, 8000, 8000, 9000, 9000, 10000, 10000, 11000, 11000, 12000, 12000, 13000, 13000, 14000, 14000, 15000],
  candy: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  xlCandy: [10, 10, 12, 12, 15, 15, 17, 17, 20, 20],
  xlFrom: 40,
  maxLevel: 50,
};
const mewtwo = { atk: 300, def: 182, sta: 214 };
const azumarill = { atk: 112, def: 152, sta: 225 };
const hundo = { atk: 15, def: 15, sta: 15 };

describe('pvp maths', () => {
  it('matches known CP values', () => {
    expect(cpOf(mewtwo, hundo, cpmAt(cpm, 40))).toBe(4178);
    expect(cpOf(mewtwo, hundo, cpmAt(cpm, 50))).toBe(4724);
  });

  it('computes half levels between whole ones', () => {
    const m = cpmAt(cpm, 39.5);
    expect(m).toBeGreaterThan(cpm[38]!);
    expect(m).toBeLessThan(cpm[39]!);
  });

  it('finds the highest level under the cap', () => {
    const r = bestUnderCap(data, azumarill, { atk: 0, def: 15, sta: 15 }, 1500, 51);
    expect(r.cp).toBeLessThanOrEqual(1500);
    expect(cpOf(azumarill, r.ivs, cpmAt(cpm, r.level + 0.5))).toBeGreaterThan(1500);
  });

  it('ranks all 4096 combinations, rank 1 being 100 %', () => {
    const table = rankTable(data, azumarill, 1500, 51);
    expect(table).toHaveLength(4096);
    const top = rankOf(data, azumarill, table[0]!.ivs, 1500, 51);
    expect(top.rank).toBe(1);
    expect(top.percent).toBe(100);
    const hundoRank = rankOf(data, azumarill, hundo, 1500, 51);
    expect(hundoRank.rank).toBeGreaterThan(1000);
    expect(rankTable(data, azumarill, 1500, 51, 10)).toHaveLength(216);
  });

  it('prices power-ups like the game (including per-step rounding for Shadow, Purified & Lucky)', () => {
    expect(powerUpCost(data, 1, 40)).toEqual({ stardust: 270000, candy: 304, xlCandy: 0 });
    expect(powerUpCost(data, 20, 40)).toEqual({ stardust: 225000, candy: 248, xlCandy: 0 });
    expect(powerUpCost(data, 25, 40)).toEqual({ stardust: 194000, candy: 220, xlCandy: 0 });
    expect(powerUpCost(data, 40, 50)).toEqual({ stardust: 250000, candy: 0, xlCandy: 296 });
    expect(powerUpCost(data, 20, 50)).toEqual({ stardust: 475000, candy: 248, xlCandy: 296 });
    expect(powerUpCost(data, 50, 51)).toEqual({ stardust: 0, candy: 0, xlCandy: 0 });
    expect(powerUpCost(data, 20, 20.5).stardust).toBe(2500);
    // Shadow (+20 % rounded up per power-up step)
    expect(powerUpCost(data, 1, 40, 'shadow')).toEqual({ stardust: 324000, candy: 406, xlCandy: 0 });
    expect(powerUpCost(data, 20, 40, 'shadow')).toEqual({ stardust: 270000, candy: 312, xlCandy: 0 });
    expect(powerUpCost(data, 40, 50, 'shadow')).toEqual({ stardust: 300000, candy: 0, xlCandy: 360 });
    // Purified (−10 % rounded up per power-up step)
    expect(powerUpCost(data, 25, 40, 'purified')).toEqual({ stardust: 174600, candy: 210, xlCandy: 0 });
    expect(powerUpCost(data, 40, 50, 'purified')).toEqual({ stardust: 225000, candy: 0, xlCandy: 272 });
    // Lucky (−50 % stardust, normal candy/XL) & Lucky + Purified
    expect(powerUpCost(data, 20, 40, 'lucky')).toEqual({ stardust: 112500, candy: 248, xlCandy: 0 });
    expect(powerUpCost(data, 40, 50, 'lucky')).toEqual({ stardust: 125000, candy: 0, xlCandy: 296 });
    expect(powerUpCost(data, 40, 50, 'luckyPurified')).toEqual({ stardust: 112500, candy: 0, xlCandy: 272 });
  });

  it('recovers the level from CP', () => {
    expect(levelsForCp(data, mewtwo, hundo, 4178, 51)).toEqual([40]);
  });
});
