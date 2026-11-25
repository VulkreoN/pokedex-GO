/**
 * Best attackers against a raid boss or a Team GO Rocket Pokémon, the way counter sites rank them: each attacker
 * with its best moveset, by damage per second weighted by how long it holds (DPS × (Def × HP)^¼). Hundos at the
 * level given, no weather, no friendship bonus: a ranking, not a simulation.
 */
import { effectiveness, TYPES } from './typeChart.js';
import type { PokemonType, ToolMove, ToolPokemon, ToolsData } from './types.js';

export interface CounterTarget {
  types: PokemonType[];
  /** Base Defense of the target. */
  def: number;
}

export interface Counter {
  pokemon: ToolPokemon;
  quick: string;
  charged: string;
  /** Damage per second against the target. */
  dps: number;
  score: number;
  /** The moveset needs an Elite TM or an event. */
  elite: boolean;
  /** As a Shadow Pokémon: 20 % more attack, 1/6 less defense. */
  shadow: boolean;
}

const RAID_BOSS_CPM = 0.79;

/** Shadow Pokémon hit 20 % harder and take 20 % more (Defense × 0.8333), as the game master says. */
const SHADOW_ATK = 1.2;
const SHADOW_DEF = 0.8333333;
/** Frustration (Shadow) and Return (purified) are removed with a Charged TM: never part of a ranked moveset. */
const SHADOW_ONLY = new Set(['FRUSTRATION', 'RETURN']);

function damage(move: ToolMove, attack: number, defense: number, attacker: ToolPokemon, target: CounterTarget): number {
  const stab = attacker.types.includes(move.type) ? 1.2 : 1;
  return Math.floor(0.5 * move.power * (attack / defense) * stab * effectiveness(move.type, target.types)) + 1;
}

/** Damage per second of one moveset: fast moves until the charged one is ready, then the charged one, in a loop. */
export function movesetDps(tools: Pick<ToolsData, 'moves'>, attacker: ToolPokemon, quick: string, charged: string, target: CounterTarget, cpm: number, shadow = false): number {
  const fast = tools.moves[quick];
  const big = tools.moves[charged];
  if (!fast || !big || fast.energy <= 0) return 0;
  const attack = (attacker.atk + 15) * cpm * (shadow ? SHADOW_ATK : 1);
  const defense = (target.def + 15) * RAID_BOSS_CPM;
  const fastHits = Math.ceil(big.energy / fast.energy);
  const dealt = fastHits * damage(fast, attack, defense, attacker, target) + damage(big, attack, defense, attacker, target);
  return dealt / ((fastHits * fast.duration + big.duration) / 1000);
}

export function rankCounters(tools: ToolsData, target: CounterTarget, opts: { cpm: number; megas?: boolean; shadows?: boolean; limit?: number }): Counter[] {
  const out: Counter[] = [];
  for (const p of tools.pokemon) {
    if (!p.released || (p.mega && !opts.megas)) continue;
    for (const shadow of opts.shadows && p.shadow ? [false, true] : [false]) {
      let best: Counter | null = null;
      for (const quick of p.quick) {
        for (const charged of p.charged) {
          if (SHADOW_ONLY.has(charged)) continue;
          const dps = movesetDps(tools, p, quick, charged, target, opts.cpm, shadow);
          const score = dps * Math.pow((p.def + 15) * (shadow ? SHADOW_DEF : 1) * (p.sta + 15), 0.25);
          if (!best || score > best.score) best = { pokemon: p, quick, charged, dps, score, elite: !!p.elite?.includes(quick) || !!p.elite?.includes(charged), shadow };
        }
      }
      if (best && best.dps > 0) out.push(best);
    }
  }
  // Forms that fight the same (same stats, types and moves) are kept once.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const id = `${c.shadow}|${c.pokemon.atk}|${c.pokemon.def}|${c.pokemon.sta}|${c.pokemon.types.join()}|${c.quick}|${c.charged}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, opts.limit ?? 12);
}

/** The types that hit these types harder than neutral, strongest first (×2.56 for a double weakness). */
export function weaknesses(types: PokemonType[]): { type: PokemonType; times: number }[] {
  return TYPES.map((type) => ({ type, times: effectiveness(type, types) }))
    .filter((w) => w.times > 1)
    .sort((a, b) => b.times - a.times);
}
