/**
 * An in-game search for PvP candidates: the game filters IVs by appraisal stars per stat (0 = 0, 1 = 1-5, 2 = 6-10,
 * 3 = 11-14, 4 = 15), not exact values. The best combinations of a league are boxed by their stars, stat by stat,
 * and limited to the evolution family ("+marill" also finds Azurill and Azumarill).
 */
import type { LeagueResult } from './pvp.js';
import { keyword, type GameLang } from './search.js';

export const starsOf = (iv: number): number => (iv === 0 ? 0 : iv <= 5 ? 1 : iv <= 10 ? 2 : iv <= 14 ? 3 : 4);

const STATS = [
  ['atk', 'attack'],
  ['def', 'defense'],
  ['sta', 'hp'],
] as const;

export interface IvSearch {
  text: string;
  /** Best combinations aimed at (all inside the box). */
  top: number;
  /** All combinations the search lets through, the best ones included. */
  matched: number;
}

/** `table`: a league's combinations, best first (rankTable). `top`: how many of the best to catch. */
export function ivSearch(table: LeagueResult[], opts: { top: number; family?: string; lang?: GameLang }): IvSearch {
  const best = table.slice(0, opts.top);
  const box = STATS.map(([k]) => {
    const stars = best.map((r) => starsOf(r.ivs[k]));
    return [Math.min(...stars), Math.max(...stars)] as const;
  });
  const parts = STATS.flatMap(([, word], i) => {
    const [lo, hi] = box[i]!;
    if (lo === 0 && hi === 4) return [];
    return [`${lo === hi ? lo : `${lo}-${hi}`}${keyword(word, opts.lang)}`];
  });
  const inBox = (r: LeagueResult) => STATS.every(([k], i) => starsOf(r.ivs[k]) >= box[i]![0] && starsOf(r.ivs[k]) <= box[i]![1]);
  const terms = [opts.family ? `+${opts.family.toLowerCase()}` : null, ...parts].filter(Boolean);
  return { text: terms.join('&'), top: best.length, matched: table.filter(inBox).length };
}
