import { describe, expect, it } from 'vitest';
import { abbreviationFit, decodeMember, parsePreviewSeason, pickFresherAnalysis, rankLeague, withRankDeltas } from './pvpRankings.js';

const sp = (speciesId: string, speciesName: string, dex: number, baseStats: { atk: number; def: number; hp: number }, extra = {}) => ({ speciesId, speciesName, dex, baseStats, types: [], fastMoves: [], chargedMoves: [], ...extra });
const gm = new Map([
  ['melmetal', sp('melmetal', 'Melmetal', 809, { atk: 226, def: 190, hp: 264 })],
  ['ninetales_shadow', sp('ninetales_shadow', 'Ninetales (Shadow)', 38, { atk: 169, def: 190, hp: 177 }, { tags: ['shadow'] })],
  ['marowak_alolan', sp('marowak_alolan', 'Marowak (Alolan)', 105, { atk: 144, def: 186, hp: 155 })],
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

describe('decodeMember', () => {
  const mv = (moveId: string, name: string, abbreviation?: string) => [moveId, { moveId, name, type: 'normal', power: 1, energy: 1, energyGain: 1, ...(abbreviation ? { abbreviation } : {}) }] as const;
  const moves = new Map([
    mv('INFESTATION', 'Infestation'), mv('SHADOW_BALL', 'Shadow Ball'), mv('SEED_BOMB', 'Seed Bomb'), mv('FOUL_PLAY', 'Foul Play'), mv('SUPER_POWER', 'Superpower'),
    mv('PSYWAVE', 'Psywave'), mv('COUNTER', 'Counter', 'C'), mv('BULLDOZE', 'Bulldoze'),
  ]);
  const byId = new Map([
    ['gourgeist_super', { ...sp('gourgeist_super', 'Gourgeist (Super)', 711, { atk: 1, def: 1, hp: 1 }), fastMoves: ['INFESTATION'], chargedMoves: ['SHADOW_BALL', 'SEED_BOMB'] }],
    ['malamar', { ...sp('malamar', 'Malamar', 687, { atk: 1, def: 1, hp: 1 }), fastMoves: ['PSYWAVE'], chargedMoves: ['FOUL_PLAY', 'SUPER_POWER'] }],
  ]);
  it('reads PvPoke abbreviations against what the Pokémon can learn', () => {
    expect(decodeMember('gourgeist_super I/SB/SeB', byId, moves)).toEqual({ speciesId: 'gourgeist_super', fast: 'INFESTATION', charged: ['SHADOW_BALL', 'SEED_BOMB'] });
    expect(decodeMember('malamar Psy/FoP/SP', byId, moves)).toEqual({ speciesId: 'malamar', fast: 'PSYWAVE', charged: ['FOUL_PLAY', 'SUPER_POWER'] });
    expect(decodeMember('missingno A/B/C', byId, moves)).toBeNull();
    expect(abbreviationFit('Bd', moves.get('BULLDOZE')!)).toBe(1);
    expect(abbreviationFit('C', moves.get('COUNTER')!)).toBe(2);
  });
});

describe('pickFresherAnalysis', () => {
  const sample = (lastUpdated: string, team = 'melmetal TS/DbI/DyP') => ({ properties: { lastUpdated }, teams: [{ team, teamScore: 550, games: 100 }] });
  it('picks whichever PvPoke analysis file was updated more recently', () => {
    const older = sample('August 26,  2026', 'old_team');
    const newer = sample('October 17,  2026', 'new_team');
    expect(pickFresherAnalysis(older, newer)).toBe(newer);
    expect(pickFresherAnalysis(newer, older)).toBe(newer);
    expect(pickFresherAnalysis(older, {})).toBe(older);
    // On equal dates, keeps the first candidate (`all/`).
    const same = sample('August 26,  2026', 'second_team');
    expect(pickFresherAnalysis(older, same)).toBe(older);
  });
});

describe('parsePreviewSeason & withRankDeltas', () => {
  it('detects active PvPoke next-season preview banner and computes rank deltas', () => {
    const active = `<?php if(true): ?><div class="header-ticker"><a href="https://pvpoke.com/daydream-destinations/rankings/">Preview next season</a></div><?php endif; ?>`;
    expect(parsePreviewSeason(active)).toEqual({ slug: 'daydream-destinations', title: 'Daydream Destinations' });
    const inactive = `<?php if(false): ?><div class="header-ticker"><a href="https://pvpoke.com/daydream-destinations/rankings/">Preview next season</a></div><?php endif; ?>`;
    expect(parsePreviewSeason(inactive)).toBeNull();

    const cur = [
      { speciesId: 'a', name: 'A', dex: 1, atk: 1, def: 1, hp: 1, shadow: false, league: 'great' as const, rank: 10, of: 100, score: 90, scores: {}, moveset: [], wins: [], losses: [] },
      { speciesId: 'b', name: 'B', dex: 2, atk: 1, def: 1, hp: 1, shadow: false, league: 'great' as const, rank: 2, of: 100, score: 95, scores: {}, moveset: [], wins: [], losses: [] },
    ];
    const prev = [
      { ...cur[0]!, rank: 1 },
      { ...cur[1]!, rank: 5 },
      { ...cur[0]!, speciesId: 'c', rank: 8 },
    ];
    expect(withRankDeltas(prev, cur).map((x) => [x.speciesId, x.delta])).toEqual([
      ['a', 9],
      ['b', -3],
      ['c', null],
    ]);
  });
});
