import { describe, expect, it } from 'vitest';
import { movesetDps, rankCounters, weaknesses } from './counters.js';
import type { ToolPokemon, ToolsData } from './types.js';

const mon = (key: string, types: ToolPokemon['types'], atk: number, quick: string[], charged: string[], extra: Partial<ToolPokemon> = {}): ToolPokemon => ({ key, dex: 1, name: { en: key }, types, atk, def: 150, sta: 150, released: true, quick, charged, ...extra });
const tools: ToolsData = {
  version: 't',
  moveNames: {},
  items: {},
  moves: {
    WATER_GUN_FAST: { type: 'water', power: 5, duration: 500, energy: 5 },
    HYDRO_PUMP: { type: 'water', power: 130, duration: 3300, energy: 100 },
    VINE_WHIP_FAST: { type: 'grass', power: 7, duration: 600, energy: 6 },
    SOLAR_BEAM: { type: 'grass', power: 180, duration: 4900, energy: 100 },
    TACKLE_FAST: { type: 'normal', power: 5, duration: 500, energy: 5 },
  },
  pokemon: [
    mon('waterMon', ['water'], 250, ['WATER_GUN_FAST'], ['HYDRO_PUMP']),
    mon('grassMon', ['grass'], 250, ['VINE_WHIP_FAST'], ['SOLAR_BEAM']),
    mon('megaWater', ['water'], 300, ['WATER_GUN_FAST'], ['HYDRO_PUMP'], { mega: true }),
    mon('notOut', ['water'], 400, ['WATER_GUN_FAST'], ['HYDRO_PUMP'], { released: false }),
    mon('eliteMon', ['grass'], 240, ['VINE_WHIP_FAST', 'TACKLE_FAST'], ['SOLAR_BEAM'], { elite: ['VINE_WHIP_FAST'] }),
  ],
};

describe('counters', () => {
  it('a super effective moveset beats a resisted one', () => {
    const fire = { types: ['fire' as const], def: 150 };
    const water = movesetDps(tools, tools.pokemon[0]!, 'WATER_GUN_FAST', 'HYDRO_PUMP', fire, 0.79);
    const grass = movesetDps(tools, tools.pokemon[1]!, 'VINE_WHIP_FAST', 'SOLAR_BEAM', fire, 0.79);
    expect(water).toBeGreaterThan(grass * 2);
  });
  it('ranks released attackers, Megas only when asked, and flags Elite moves', () => {
    const ground = { types: ['ground' as const], def: 150 };
    const plain = rankCounters(tools, ground, { cpm: 0.79 });
    expect(plain.map((c) => c.pokemon.key)).not.toContain('notOut');
    expect(plain.map((c) => c.pokemon.key)).not.toContain('megaWater');
    expect(rankCounters(tools, ground, { cpm: 0.79, megas: true })[0]!.pokemon.key).toBe('megaWater');
    const elite = plain.find((c) => c.pokemon.key === 'eliteMon')!;
    expect(elite.quick).toBe('VINE_WHIP_FAST');
    expect(elite.elite).toBe(true);
  });
  it('Shadow Pokémon, when asked, hit 20 % harder and never keep Frustration', () => {
    const shady = { ...tools, pokemon: [mon('dark', ['dark'], 250, ['TACKLE_FAST'], ['HYDRO_PUMP', 'FRUSTRATION'], { shadow: true })], moves: { ...tools.moves, FRUSTRATION: { type: 'normal' as const, power: 10, duration: 2000, energy: 33 } } };
    const target = { types: ['fire' as const], def: 150 };
    const plain = rankCounters(shady, target, { cpm: 0.79 });
    const both = rankCounters(shady, target, { cpm: 0.79, shadows: true });
    expect(plain).toHaveLength(1);
    expect(both.map((c) => c.shadow)).toEqual([true, false]);
    expect(both[0]!.dps).toBeGreaterThan(both[1]!.dps * 1.1); // each hit is rounded down, so a little under 20 %
    expect(both.every((c) => c.charged === 'HYDRO_PUMP')).toBe(true);
  });
  it('lists weaknesses strongest first', () => {
    const w = weaknesses(['grass', 'ground']);
    expect(w.map((x) => x.type)).toEqual(['ice', 'fire', 'flying', 'bug']);
    expect(w[0]!.times).toBeCloseTo(2.56);
    expect(w[1]!.times).toBeCloseTo(1.6);
  });
});
