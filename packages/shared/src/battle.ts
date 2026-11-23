/**
 * One-on-one Pokémon GO trainer battle, turn by turn (a turn is half a second), with the game's damage formula and
 * a player-like AI on both sides: shields the hits that matter, baits shields with a cheap charged move, throws its
 * charged move when the opponent cannot get a free fast move in, nukes when the opponent is out of shields, and
 * keeps fast-moving when that alone finishes the opponent. An approximation of PvPoke's simulator, not a copy.
 */
import type { PokemonType } from './types.js';
import { effectiveness } from './typeChart.js';

export interface BattleMove {
  id: string;
  type: PokemonType;
  power: number;
  /** Charged moves: energy spent. */
  energy: number;
  /** Fast moves: energy gained. */
  energyGain: number;
  /** Fast moves: duration in turns. */
  turns: number;
  /** [attack, defense] stage changes, applied to `buffTarget` ('both': buffsSelf / buffsOpponent). */
  buffs?: [number, number];
  buffTarget?: 'self' | 'opponent' | 'both';
  buffsSelf?: [number, number];
  buffsOpponent?: [number, number];
  /** Only certain effects are simulated: a chance under 1 is left out, as PvPoke does by default. */
  buffApplyChance?: number;
}

/**
 * A form a fighter can switch to in battle, and what makes it switch: Mimikyu's Disguise takes the first charged hit,
 * Aegislash goes Blade when it attacks and Shield when it shields, Morpeko swaps form with each charged move.
 */
export interface BattleForm {
  types: PokemonType[];
  atk: number;
  def: number;
  fast: BattleMove;
  charged: BattleMove[];
  change?: { trigger: 'charged_move_damage' | 'activate_charged' | 'activate_shield'; to: string; protect?: boolean };
}

export interface Fighter {
  name: string;
  types: PokemonType[];
  /** Attack, Defense and HP with IVs and level (and Shadow) already applied. */
  atk: number;
  def: number;
  hp: number;
  fast: BattleMove;
  charged: BattleMove[];
  shields: number;
  /** Throw a cheap charged move first to make the opponent spend a shield. */
  bait: boolean;
  /** Its forms by id when it changes form in battle, `form` being the one it starts in. */
  forms?: Record<string, BattleForm>;
  form?: string;
}

export type BattleEvent =
  | { turn: number; side: 0 | 1; kind: 'charged'; move: string; damage: number; shielded: boolean; hp: [number, number] }
  | { turn: number; side: 0 | 1; kind: 'fainted'; hp: [number, number] };

export interface BattleResult {
  /** null: both fainted the same turn, or time ran out with the same share of HP. */
  winner: 0 | 1 | null;
  hp: [number, number];
  hpMax: [number, number];
  turns: number;
  /** Charged moves (shielded or not) and faints; fast moves are summed up in `fastHits`. */
  events: BattleEvent[];
  fastHits: [number, number];
  shieldsUsed: [number, number];
  /** PvPoke-style battle rating, 0 to 1000 per side: 500 for the damage dealt, 500 for the HP kept. Over 500 wins. */
  rating: [number, number];
}

/** Stats at a level from base stats, IVs and the CP multiplier; Shadow: 1.2 Attack, 0.833 Defense. */
export function fighterStats(base: { atk: number; def: number; sta: number }, iv: { atk: number; def: number; sta: number }, cpm: number, shadow = false) {
  return {
    atk: (base.atk + iv.atk) * cpm * (shadow ? 1.2 : 1),
    def: (base.def + iv.def) * cpm * (shadow ? 5 / 6 : 1),
    hp: Math.max(10, Math.floor((base.sta + iv.sta) * cpm)),
  };
}

const MAX_TURNS = 480; // 4 minutes
/**
 * A hit taking at least this share of the remaining HP is shielded (lethal ones always are). Compared with PvPoke on
 * the top 30 of Great League: shielding nearly everything gives the same winner most often (82 % at 0-0, 80 % at 2-2).
 */
const SHIELD_SHARE = 0.2;
const stageMult = (s: number) => (s >= 0 ? (4 + s) / 4 : 4 / (4 - s));
const clampStage = (s: number) => Math.max(-4, Math.min(4, s));

interface Side {
  /** The fighter as it is now: a form change replaces its types, stats and moves (HP stays). */
  f: Fighter;
  hp: number;
  energy: number;
  shields: number;
  atkStage: number;
  defStage: number;
  /** Turns left of the fast move in progress; 0 = free to act. */
  busy: number;
  fastHits: number;
  shieldsUsed: number;
}

/** The game's formula: floor(0.5 * power * attack / defense * STAB * effectiveness * 1.3) + 1. */
export function damage(attacker: { atk: number; types: PokemonType[] }, atkStage: number, defender: { def: number; types: PokemonType[] }, defStage: number, move: BattleMove): number {
  const stab = attacker.types.includes(move.type) ? 1.2 : 1;
  const ratio = (attacker.atk * stageMult(atkStage)) / (defender.def * stageMult(defStage));
  return Math.floor(0.5 * move.power * ratio * stab * effectiveness(move.type, defender.types) * 1.3) + 1;
}

export function simulate(a: Fighter, b: Fighter): BattleResult {
  const s: [Side, Side] = [a, b].map((f) => ({ f: { ...f }, hp: f.hp, energy: 0, shields: f.shields, atkStage: 0, defStage: 0, busy: 0, fastHits: 0, shieldsUsed: 0 })) as [Side, Side];
  const events: BattleEvent[] = [];
  const hpNow = (): [number, number] => [s[0].hp, s[1].hp];
  const dmg = (from: Side, to: Side, m: BattleMove) => damage(from.f, from.atkStage, to.f, to.defStage, m);

  const formOf = (me: Side) => (me.f.forms && me.f.form ? me.f.forms[me.f.form] : undefined);
  const switchForm = (me: Side, to: string) => {
    const next = me.f.forms?.[to];
    if (!next) return;
    me.f = { ...me.f, form: to, types: next.types, atk: next.atk, def: next.def, fast: next.fast, charged: next.charged };
  };
  /** The form change this event triggers, if the current form has one. */
  const trigger = (me: Side, t: NonNullable<BattleForm['change']>['trigger']) => {
    const c = formOf(me)?.change;
    if (c?.trigger === t) switchForm(me, c.to);
  };

  /** The defender's call: block what would knock it out or take a big bite, let small hits through. */
  const wantsShield = (me: Side, incoming: number) => me.shields > 0 && (incoming >= me.hp || incoming >= me.hp * SHIELD_SHARE);

  const decide = (i: 0 | 1): BattleMove | null => {
    const me = s[i];
    const op = s[1 - i]!;
    const fastDmg = dmg(me, op, me.f.fast);
    const opFastDmg = dmg(op, me, op.f.fast);
    const usable = me.f.charged.filter((m) => m.energy <= me.energy);
    if (!usable.length) return null;
    // Fast moves alone finish it: keep the energy.
    if (fastDmg >= op.hp && opFastDmg < me.hp) return null;
    const byDamage = [...usable].sort((x, y) => dmg(me, op, y) - dmg(me, op, x));
    // Out of shields: the hardest-hitting move that is ready, or the one that knocks out for the least energy.
    if (op.shields === 0) {
      const lethal = usable.filter((m) => dmg(me, op, m) >= op.hp).sort((x, y) => x.energy - y.energy)[0];
      if (lethal) return lethal;
    }
    // Free fast move: the opponent is mid fast move and ours fits before theirs lands, without risk.
    const opCanThrow = op.f.charged.some((m) => m.energy <= op.energy);
    if (op.busy > me.f.fast.turns && opFastDmg < me.hp && !opCanThrow && me.energy + me.f.fast.energyGain <= 100) return null;
    const cheapest = [...me.f.charged].sort((x, y) => x.energy - y.energy)[0]!;
    const strongest = [...me.f.charged].sort((x, y) => dmg(me, op, y) - dmg(me, op, x))[0]!;
    // Bait: the opponent still has shields and our cheap move is ready while the big one is not, or both are ready.
    if (me.f.bait && op.shields > 0 && cheapest !== strongest && usable.includes(cheapest)) return cheapest;
    // Otherwise wait for the big one if we can afford to (we survive a couple more of their fast moves, they are not about to throw).
    if (!usable.includes(strongest)) {
      const turnsToStrong = Math.ceil((strongest.energy - me.energy) / me.f.fast.energyGain) * me.f.fast.turns;
      const opTurnsToKill = Math.ceil(me.hp / opFastDmg) * op.f.fast.turns;
      if (turnsToStrong < opTurnsToKill && !opCanThrow && me.energy < 100) return null;
    }
    return byDamage[0]!;
  };

  const throwCharged = (i: 0 | 1, m: BattleMove, turn: number) => {
    const me = s[i];
    const op = s[1 - i]!;
    me.energy -= m.energy;
    // Aegislash and the like attack in the form the charged move switches them to.
    trigger(me, 'activate_charged');
    const hit = dmg(me, op, m);
    const disguise = formOf(op)?.change;
    const shielded = !(disguise?.protect && disguise.trigger === 'charged_move_damage') && wantsShield(op, hit);
    if (shielded) {
      op.shields--;
      op.shieldsUsed++;
      trigger(op, 'activate_shield');
    }
    // Disguise: the first charged hit is absorbed and the form is gone.
    const absorbed = !shielded && !!disguise?.protect && disguise.trigger === 'charged_move_damage';
    op.hp = Math.max(0, op.hp - (shielded || absorbed ? 1 : hit));
    if (absorbed) trigger(op, 'charged_move_damage');
    if ((m.buffApplyChance ?? 1) >= 1 && (m.buffs || m.buffsSelf)) {
      const self = m.buffTarget === 'both' ? m.buffsSelf : m.buffTarget === 'self' ? m.buffs : undefined;
      const other = m.buffTarget === 'both' ? m.buffsOpponent : m.buffTarget === 'opponent' ? m.buffs : undefined;
      if (self) [me.atkStage, me.defStage] = [clampStage(me.atkStage + self[0]), clampStage(me.defStage + self[1])];
      if (other) [op.atkStage, op.defStage] = [clampStage(op.atkStage + other[0]), clampStage(op.defStage + other[1])];
    }
    events.push({ turn, side: i, kind: 'charged', move: m.id, damage: hit, shielded: shielded || absorbed, hp: hpNow() });
  };

  let turn = 0;
  for (; turn < MAX_TURNS && s[0].hp > 0 && s[1].hp > 0; turn++) {
    // 1. Free sides choose: a charged move now, or start a fast move.
    const charged: [BattleMove | null, BattleMove | null] = [null, null];
    for (const i of [0, 1] as const) if (s[i].busy === 0) charged[i] = decide(i);
    // 2. Charged moves first; both at once: higher Attack goes first (the game's charged move priority).
    const order: (0 | 1)[] = s[1].f.atk * stageMult(s[1].atkStage) > s[0].f.atk * stageMult(s[0].atkStage) ? [1, 0] : [0, 1];
    for (const i of order) {
      const m = charged[i];
      if (m && s[i].hp > 0 && s[1 - i]!.hp > 0) throwCharged(i, m, turn);
    }
    if (s[0].hp <= 0 || s[1].hp <= 0) break;
    // 3. Fast moves: start them, then the ones finishing this turn land (both at once if they finish together).
    for (const i of [0, 1] as const) if (s[i].busy === 0 && !charged[i]) s[i].busy = s[i].f.fast.turns;
    const landing = ([0, 1] as const).filter((i) => s[i].busy > 0 && --s[i].busy === 0);
    for (const i of landing) {
      const me = s[i];
      const op = s[1 - i]!;
      op.hp = Math.max(0, op.hp - dmg(me, op, me.f.fast));
      me.energy = Math.min(100, me.energy + me.f.fast.energyGain);
      me.fastHits++;
    }
  }
  for (const i of [0, 1] as const) if (s[i].hp === 0) events.push({ turn, side: i, kind: 'fainted', hp: hpNow() });

  const hpMax: [number, number] = [a.hp, b.hp];
  const left = (i: 0 | 1) => s[i].hp / hpMax[i];
  const rating = ([0, 1] as const).map((i) => Math.round(500 * (1 - left((1 - i) as 0 | 1)) + 500 * left(i))) as [number, number];
  const winner = s[0].hp > 0 && s[1].hp === 0 ? 0 : s[1].hp > 0 && s[0].hp === 0 ? 1 : s[0].hp && s[1].hp ? (left(0) === left(1) ? null : left(0) > left(1) ? 0 : 1) : null;
  return { winner, hp: hpNow(), hpMax, turns: turn, events, fastHits: [s[0].fastHits, s[1].fastHits], shieldsUsed: [s[0].shieldsUsed, s[1].shieldsUsed], rating };
}

/** Every shield scenario, 0 to 2 on each side (rows: first fighter's shields). */
export function shieldMatrix(a: Fighter, b: Fighter): BattleResult[][] {
  return [0, 1, 2].map((sa) => [0, 1, 2].map((sb) => simulate({ ...a, shields: sa }, { ...b, shields: sb })));
}
