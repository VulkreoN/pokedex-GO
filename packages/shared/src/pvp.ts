/** PvP maths: CP, stat product, best level under a league cap, rank among all IV combinations, power-up costs. */
import type { PvpData } from './types.js';

export interface BaseStats { atk: number; def: number; sta: number }
export interface Ivs { atk: number; def: number; sta: number }
export interface LeagueResult {
  ivs: Ivs;
  level: number;
  cp: number;
  /** Attack × Defense × HP at that level. */
  product: number;
}
export interface RankInfo extends LeagueResult {
  rank: number;
  /** Number of IV combinations in the ranking (depends on the IV floor). */
  of: number;
  /** Stat product relative to rank 1, in percent. */
  percent: number;
  best: LeagueResult;
}

export const LEAGUES = { great: 1500, ultra: 2500 } as const;

/** CP multiplier of a level in half steps; half levels are the quadratic mean of their neighbours, as in game. */
export function cpmAt(cpm: number[], level: number): number {
  const whole = Math.floor(level);
  const a = cpm[whole - 1]!;
  if (level === whole) return a;
  const b = cpm[whole]!;
  return Math.sqrt((a * a + b * b) / 2);
}

export function cpOf(base: BaseStats, iv: Ivs, m: number): number {
  const cp = Math.floor(((base.atk + iv.atk) * Math.sqrt(base.def + iv.def) * Math.sqrt(base.sta + iv.sta) * m * m) / 10);
  return Math.max(10, cp);
}

export function statProduct(base: BaseStats, iv: Ivs, m: number): number {
  const hp = Math.max(10, Math.floor((base.sta + iv.sta) * m));
  return (base.atk + iv.atk) * m * ((base.def + iv.def) * m) * hp;
}

/** Every level from 1 to max in half steps. */
export function levelSteps(max: number): number[] {
  const out: number[] = [];
  for (let l = 1; l <= max; l += 0.5) out.push(l);
  return out;
}

/** Highest level up to maxLevel whose CP fits under the cap (the lowest level when even level 1 is over the cap). */
export function bestUnderCap(data: Pick<PvpData, 'cpm'>, base: BaseStats, iv: Ivs, cap: number, maxLevel: number): LeagueResult {
  const steps = levelSteps(maxLevel);
  let lo = 0;
  let hi = steps.length - 1;
  // CP grows with level: binary search the last level at or under the cap.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cpOf(base, iv, cpmAt(data.cpm, steps[mid]!)) <= cap) lo = mid;
    else hi = mid - 1;
  }
  const level = steps[lo]!;
  const m = cpmAt(data.cpm, level);
  return { ivs: iv, level, cp: cpOf(base, iv, m), product: statProduct(base, iv, m) };
}

const rankCache = new Map<string, LeagueResult[]>();

/** All IV combinations at or above the floor, best stat product first. */
export function rankTable(data: Pick<PvpData, 'cpm'>, base: BaseStats, cap: number, maxLevel: number, floor = 0): LeagueResult[] {
  const id = `${base.atk}/${base.def}/${base.sta}|${cap}|${maxLevel}|${floor}`;
  const hit = rankCache.get(id);
  if (hit) return hit;
  const rows: LeagueResult[] = [];
  for (let a = floor; a <= 15; a++)
    for (let d = floor; d <= 15; d++)
      for (let s = floor; s <= 15; s++) rows.push(bestUnderCap(data, base, { atk: a, def: d, sta: s }, cap, maxLevel));
  rows.sort((x, y) => y.product - x.product || y.ivs.atk - x.ivs.atk);
  if (rankCache.size > 200) rankCache.clear();
  rankCache.set(id, rows);
  return rows;
}

export function rankOf(data: Pick<PvpData, 'cpm'>, base: BaseStats, iv: Ivs, cap: number, maxLevel: number, floor = 0): RankInfo {
  const table = rankTable(data, base, cap, maxLevel, floor);
  const me = bestUnderCap(data, base, iv, cap, maxLevel);
  // Rank = 1 + number of combinations strictly better (ties share a rank).
  let better = 0;
  for (const r of table) {
    if (r.product > me.product || (r.product === me.product && r.ivs.atk > me.ivs.atk)) better++;
    else break;
  }
  const best = table[0]!;
  return { ...me, rank: better + 1, of: table.length, percent: (me.product / best.product) * 100, best };
}

export interface PowerUpCost { stardust: number; candy: number; xlCandy: number }

/** Cost of powering up from one level to another (half steps). Levels above maxLevel come from best buddy and cost nothing. */
export function powerUpCost(data: Pick<PvpData, 'stardust' | 'candy' | 'xlCandy' | 'xlFrom' | 'maxLevel'>, from: number, to: number): PowerUpCost {
  const cost = { stardust: 0, candy: 0, xlCandy: 0 };
  for (let l = from; l < Math.min(to, data.maxLevel); l += 0.5) {
    const i = Math.floor(l) - 1;
    cost.stardust += data.stardust[i] ?? 0;
    cost.candy += data.candy[i] ?? 0;
    if (l >= data.xlFrom) cost.xlCandy += data.xlCandy[Math.floor(l) - data.xlFrom] ?? 0;
  }
  return cost;
}

/** Levels at which these IVs give exactly this CP (several are possible at low levels). */
export function levelsForCp(data: Pick<PvpData, 'cpm'>, base: BaseStats, iv: Ivs, cp: number, maxLevel: number): number[] {
  return levelSteps(maxLevel).filter((l) => cpOf(base, iv, cpmAt(data.cpm, l)) === cp);
}
