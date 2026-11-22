import { describe, expect, it } from 'vitest';
import { extractPvp } from './pvp.js';

const mon = (id: string, dex: number, form: string | undefined, atk: number, def: number, sta: number, extra: object = {}) => ({
  templateId: `V${String(dex).padStart(4, '0')}_POKEMON_${form ?? id}`,
  data: { pokemonSettings: { pokemonId: id, form, type: 'POKEMON_TYPE_GROUND', stats: { baseAttack: atk, baseDefense: def, baseStamina: sta }, ...extra } },
});
const gm = [
  { templateId: 'PLAYER_LEVEL_SETTINGS', data: { playerLevel: { cpMultiplier: Array.from({ length: 80 }, (_, i) => 0.1 + i / 100) } } },
  { templateId: 'POKEMON_UPGRADE_SETTINGS', data: { pokemonUpgrades: { stardustCost: [200], candyCost: [1], xlCandyCost: [10], xlCandyMinPokemonLevel: 40, maxNormalUpgradeLevel: 50 } } },
  mon('DIGLETT', 50, undefined, 109, 78, 67, { evolutionBranch: [{ evolution: 'DUGTRIO', form: 'DUGTRIO_NORMAL' }] }),
  mon('DUGTRIO', 51, undefined, 167, 134, 111),
  mon('DUGTRIO', 51, 'DUGTRIO_NORMAL', 167, 136, 111),
  mon('DUGTRIO', 51, 'DUGTRIO_ALOLA', 201, 142, 111),
  mon('DUGTRIO', 51, 'DUGTRIO_COPY_2019', 167, 136, 111),
  mon('DUGTRIO', 51, 'DUGTRIO_HALLOWEEN_2025', 167, 136, 111),
];
const ctx = {
  isCostume: (_: number, token: string) => token.startsWith('HALLOWEEN'),
  released: () => true,
  name: (dex: number, token: string | null) => ({ en: token ? `${dex} ${token}` : String(dex) }),
  dexOf: () => undefined,
};

describe('extractPvp', () => {
  const pvp = extractPvp(gm as never, ctx)!;
  it('keeps one entry per key, the _NORMAL stats winning over the formless template', () => {
    expect(pvp.pokemon.map((p) => p.key)).toEqual(['50', '51', '51.fALOLA']);
    expect(pvp.pokemon.find((p) => p.key === '51')!.def).toBe(136);
  });
  it('resolves evolutions through _NORMAL forms', () => {
    expect(pvp.pokemon.find((p) => p.key === '50')!.evolutions).toEqual(['51']);
  });
  it('caps level multipliers at max level + best buddy', () => {
    expect(pvp.cpm).toHaveLength(51);
    expect(pvp.maxLevel).toBe(50);
  });
});
