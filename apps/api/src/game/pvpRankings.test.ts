import { describe, expect, it } from 'vitest';
import { topOf } from './pvpRankings.js';

describe('topOf', () => {
  it('keeps the order, numbers the ranks, and carries what finds our form', () => {
    const gm = new Map([
      ['marowak_alolan', { speciesId: 'marowak_alolan', dex: 105, baseStats: { atk: 144, def: 186, hp: 155 } }],
      ['ninetales_shadow', { speciesId: 'ninetales_shadow', dex: 38, baseStats: { atk: 169, def: 190, hp: 177 }, tags: ['shadow'] }],
    ]);
    const top = topOf(
      [
        { speciesId: 'ninetales_shadow', speciesName: 'Ninetales (Shadow)', score: 92.6 },
        { speciesId: 'unknown_thing', speciesName: '?', score: 91 },
        { speciesId: 'marowak_alolan', speciesName: 'Marowak (Alolan)', score: 90 },
      ],
      gm,
    );
    expect(top).toEqual([
      { rank: 1, speciesId: 'ninetales_shadow', name: 'Ninetales (Shadow)', dex: 38, atk: 169, def: 190, hp: 177, shadow: true, score: 92.6 },
      { rank: 2, speciesId: 'marowak_alolan', name: 'Marowak (Alolan)', dex: 105, atk: 144, def: 186, hp: 155, shadow: false, score: 90 },
    ]);
  });
});
