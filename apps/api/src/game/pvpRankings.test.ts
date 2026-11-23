import { describe, expect, it } from 'vitest';
import { rankLeague } from './pvpRankings.js';

const gm = new Map([
  ['melmetal', { speciesId: 'melmetal', speciesName: 'Melmetal', dex: 809, baseStats: { atk: 226, def: 190, hp: 264 } }],
  ['ninetales_shadow', { speciesId: 'ninetales_shadow', speciesName: 'Ninetales (Shadow)', dex: 38, baseStats: { atk: 169, def: 190, hp: 177 }, tags: ['shadow'] }],
  ['marowak_alolan', { speciesId: 'marowak_alolan', speciesName: 'Marowak (Alolan)', dex: 105, baseStats: { atk: 144, def: 186, hp: 155 } }],
]);
const moves = new Map([
  ['THUNDER_SHOCK', { moveId: 'THUNDER_SHOCK', name: 'Thunder Shock', type: 'electric', power: 4, energy: 0, energyGain: 9, turns: 2 }],
  ['DOUBLE_IRON_BASH', { moveId: 'DOUBLE_IRON_BASH', name: 'Double Iron Bash', type: 'steel', power: 50, energy: 35, energyGain: 0 }],
]);

describe('rankLeague', () => {
  it('numbers the ranks, maps the moveset and matchups, and skips what PvPoke cannot describe', () => {
    const [first, second] = rankLeague(
      'great',
      [
        {
          speciesId: 'melmetal',
          speciesName: 'Melmetal',
          score: 93.9,
          scores: [86.8, 86.2, 89.7, 94.4, 87.8, 94],
          moveset: ['THUNDER_SHOCK', 'DOUBLE_IRON_BASH', 'UNKNOWN_MOVE'],
          matchups: [{ opponent: 'marowak_alolan', rating: 729 }, { opponent: 'gone', rating: 700 }],
          counters: [{ opponent: 'ninetales_shadow', rating: 99 }],
        },
        { speciesId: 'not_in_gamemaster', speciesName: '?', score: 93 },
        { speciesId: 'ninetales_shadow', speciesName: 'Ninetales (Shadow)', score: 92.6 },
      ],
      gm,
      moves,
    );
    expect(first).toMatchObject({ rank: 1, of: 2, dex: 809, league: 'great', scores: { lead: 86.8, consistency: 94 } });
    expect(first!.moveset.map((m) => m.id)).toEqual(['THUNDER_SHOCK', 'DOUBLE_IRON_BASH']);
    expect(first!.moveset[0]).toMatchObject({ energyGain: 9, turns: 2 });
    expect(first!.wins).toEqual([{ speciesId: 'marowak_alolan', name: 'Marowak (Alolan)', dex: 105, atk: 144, def: 186, hp: 155, shadow: false, rating: 729 }]);
    expect(first!.losses[0]).toMatchObject({ dex: 38, shadow: true, rating: 99 });
    expect(second).toMatchObject({ rank: 2, speciesId: 'ninetales_shadow', shadow: true, moveset: [], wins: [] });
  });
});
