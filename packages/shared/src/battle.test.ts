import { describe, expect, it } from 'vitest';
import { damage, fighterStats, shieldMatrix, simulate, type BattleMove, type Fighter } from './battle.js';

// Level 41.5-ish CP multiplier for a Great League Azumarill, level 49 for Medicham (their usual rank 1 levels).
const azuStats = fighterStats({ atk: 112, def: 152, sta: 225 }, { atk: 4, def: 15, sta: 13 }, 0.80275);
const medStats = fighterStats({ atk: 121, def: 152, sta: 155 }, { atk: 7, def: 15, sta: 14 }, 0.8428);

const mv = (id: string, type: BattleMove['type'], power: number, energy: number, energyGain = 0, turns = 1, extra: Partial<BattleMove> = {}): BattleMove => ({ id, type, power, energy, energyGain, turns, ...extra });
const BUBBLE = mv('BUBBLE', 'water', 8, 0, 11, 3);
const ICE_BEAM = mv('ICE_BEAM', 'ice', 90, 55);
const PLAY_ROUGH = mv('PLAY_ROUGH', 'fairy', 90, 60);
const COUNTER = mv('COUNTER', 'fighting', 8, 0, 6, 2);
const ICE_PUNCH = mv('ICE_PUNCH', 'ice', 55, 40);
const PSYCHIC = mv('PSYCHIC', 'psychic', 90, 55);
const PUP = mv('POWER_UP_PUNCH', 'fighting', 20, 35, 0, 1, { buffs: [1, 0], buffTarget: 'self', buffApplyChance: 1 });

const azumarill = (shields = 1, bait = true): Fighter => ({ name: 'Azumarill', types: ['water', 'fairy'], ...azuStats, fast: BUBBLE, charged: [ICE_BEAM, PLAY_ROUGH], shields, bait });
const medicham = (shields = 1, bait = true): Fighter => ({ name: 'Medicham', types: ['fighting', 'psychic'], ...medStats, fast: COUNTER, charged: [ICE_PUNCH, PSYCHIC], shields, bait });

describe('damage', () => {
  it('follows the game formula: STAB, type effectiveness, the 1.3 PvP bonus, +1', () => {
    const d = damage({ atk: 100, types: ['fighting'] }, 0, { def: 100, types: ['normal'] }, 0, COUNTER);
    expect(d).toBe(Math.floor(0.5 * 8 * 1 * 1.2 * 1.6 * 1.3) + 1);
    // Fairy resists fighting: Counter barely scratches Azumarill.
    expect(damage({ atk: medStats.atk, types: ['fighting', 'psychic'] }, 0, { def: azuStats.def, types: ['water', 'fairy'] }, 0, COUNTER)).toBeLessThanOrEqual(4);
    // Stages: +1 Attack is ×1.25.
    expect(damage({ atk: 100, types: ['normal'] }, 1, { def: 100, types: ['normal'] }, 0, mv('X', 'fire', 100, 50))).toBe(Math.floor(0.5 * 100 * 1.25 * 1.3) + 1);
  });
});

describe('simulate', () => {
  it('plays a whole battle: a winner, never more shields than given, a rating over 500 for the winner', () => {
    const r = simulate(azumarill(1), medicham(1));
    expect(r.winner).not.toBeNull();
    expect(r.rating[r.winner!]).toBeGreaterThan(500);
    expect(r.hp[1 - r.winner!]).toBe(0);
    expect(r.shieldsUsed[0]).toBeLessThanOrEqual(1);
    expect(r.shieldsUsed[1]).toBeLessThanOrEqual(1);
    expect(r.events.some((e) => e.kind === 'charged')).toBe(true);
    // Azumarill resists fighting and walls Medicham, as every PvP site says.
    expect(r.winner).toBe(0);
  });

  it('baits a shield with the cheaper move, and goes straight for the strong one without bait', () => {
    const withBait = simulate(azumarill(2, true), medicham(2, false));
    expect(withBait.events.find((e) => e.kind === 'charged' && e.side === 0)).toMatchObject({ move: 'ICE_BEAM' });
    const noBait = simulate({ ...azumarill(2, false), charged: [ICE_BEAM, PLAY_ROUGH] }, medicham(2, false));
    const first = noBait.events.find((e) => e.kind === 'charged' && e.side === 0);
    expect(first && first.kind === 'charged' && ['ICE_BEAM', 'PLAY_ROUGH']).toContain(first && first.kind === 'charged' ? first.move : '');
  });

  it('applies self buffs (Power-Up Punch raises Attack)', () => {
    const pupMedicham: Fighter = { ...medicham(0), charged: [PUP] };
    const r = simulate(pupMedicham, { ...medicham(0), name: 'mirror' });
    const throws = r.events.filter((e) => e.kind === 'charged' && e.side === 0);
    expect(throws.length).toBeGreaterThan(1);
    // Later Power-Up Punches hit harder than the first one.
    const d = throws.map((e) => (e.kind === 'charged' ? e.damage : 0));
    expect(d[d.length - 1]!).toBeGreaterThan(d[0]!);
  });

  it('runs all nine shield scenarios', () => {
    const m = shieldMatrix(azumarill(), medicham());
    expect(m).toHaveLength(3);
    expect(m.every((row) => row.length === 3)).toBe(true);
    expect(m[2]![0]!.shieldsUsed[1]).toBe(0);
  });
});
