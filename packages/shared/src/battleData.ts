/**
 * Builds battle fighters from PvPoke's game data (pvpoke/src/data/gamemaster: pokemon.json, moves.json): base stats,
 * move pools, move details, default IVs per league and form changes.
 */
import { fighterStats, type BattleForm, type BattleMove, type Fighter } from './battle.js';
import { cpmAt } from './pvp.js';
import type { PokemonType } from './types.js';

export interface PvpokeSpecies {
  speciesId: string;
  speciesName: string;
  dex: number;
  types: string[];
  baseStats: { atk: number; def: number; hp: number };
  fastMoves: string[];
  chargedMoves: string[];
  tags?: string[];
  /** [level, attack, defense, HP] per league cap: cp500, cp1500, cp2500, cp2500l40. */
  defaultIVs?: Record<string, [number, number, number, number]>;
  formChange?: { type: string; trigger: string; effect?: string; alternativeFormId?: string };
}
export interface PvpokeMove {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  turns?: number;
  buffs?: [number, number];
  buffTarget?: 'self' | 'opponent' | 'both';
  buffsSelf?: [number, number];
  buffsOpponent?: [number, number];
  buffApplyChance?: string | number;
}

export function toBattleMove(m: PvpokeMove): BattleMove {
  return {
    id: m.moveId,
    type: m.type as PokemonType,
    power: m.power,
    energy: m.energy,
    energyGain: m.energyGain,
    turns: m.turns ?? 1,
    ...(m.buffs ? { buffs: m.buffs } : {}),
    ...(m.buffTarget ? { buffTarget: m.buffTarget } : {}),
    ...(m.buffsSelf ? { buffsSelf: m.buffsSelf } : {}),
    ...(m.buffsOpponent ? { buffsOpponent: m.buffsOpponent } : {}),
    ...(m.buffApplyChance !== undefined ? { buffApplyChance: Number(m.buffApplyChance) } : {}),
  };
}

const typesOf = (p: PvpokeSpecies) => p.types.filter((t) => t !== 'none') as PokemonType[];
/** Default IVs and level for a league: [level, atk, def, hp]. Master League: 15/15/15 at 50. */
export function defaultIvs(p: PvpokeSpecies, cap: number): [number, number, number, number] {
  if (cap >= 10000) return [50, 15, 15, 15];
  return p.defaultIVs?.[`cp${cap}`] ?? [40, 15, 15, 15];
}

/**
 * The same move in another form: Aegislash's charge fast moves are its Blade ones prefixed ("AEGISLASH_CHARGE_"),
 * Morpeko's Aura Wheel changes type with the form.
 */
function moveIn(id: string, pool: string[]): string {
  if (pool.includes(id)) return id;
  const plain = id.replace(/^AEGISLASH_CHARGE_/, '');
  const found = pool.find((m) => m === plain || m === `AEGISLASH_CHARGE_${plain}` || m.replace(/_[A-Z]+$/, '') === id.replace(/_[A-Z]+$/, ''));
  return found ?? id;
}

export interface FighterSetup {
  species: PvpokeSpecies;
  /** Every species PvPoke knows, for the forms it can switch to. */
  byId: Map<string, PvpokeSpecies>;
  moves: Map<string, PvpokeMove>;
  cpm: number[];
  iv: { atk: number; def: number; sta: number };
  level: number;
  fast: string;
  charged: string[];
  shields: number;
  bait: boolean;
}

export function buildFighter(x: FighterSetup): Fighter | null {
  const shadow = !!x.species.tags?.includes('shadow');
  const m = cpmAt(x.cpm, x.level);
  const move = (id: string) => {
    const d = x.moves.get(id);
    return d ? toBattleMove(d) : null;
  };
  const fast = move(x.fast);
  const charged = x.charged.flatMap((c) => move(c) ?? []);
  if (!fast || !charged.length) return null;
  const st = fighterStats({ atk: x.species.baseStats.atk, def: x.species.baseStats.def, sta: x.species.baseStats.hp }, x.iv, m, shadow);
  const f: Fighter = { name: x.species.speciesId, types: typesOf(x.species), ...st, fast, charged, shields: x.shields, bait: x.bait };

  // Form changes that matter in battle: Disguise, Aegislash's stances, Morpeko's hunger.
  const triggerOf = (p: PvpokeSpecies): NonNullable<BattleForm['change']>['trigger'] | null => {
    const c = p.formChange;
    if (!c?.alternativeFormId || !x.byId.has(c.alternativeFormId)) return null;
    if (c.trigger === 'charged_move_damage' && c.effect === 'protect') return 'charged_move_damage';
    if (c.trigger === 'activate_charged' || (c.trigger === 'charged_move' && c.type === 'toggle')) return 'activate_charged';
    if (c.trigger === 'activate_shield') return 'activate_shield';
    return null;
  };
  if (!triggerOf(x.species)) return f;
  const forms: Record<string, BattleForm> = {};
  let p: PvpokeSpecies | undefined = x.species;
  while (p && !forms[p.speciesId]) {
    const s = fighterStats({ atk: p.baseStats.atk, def: p.baseStats.def, sta: p.baseStats.hp }, x.iv, m, shadow);
    const t = triggerOf(p);
    const formFast = move(moveIn(x.fast, p.fastMoves)) ?? fast;
    const formCharged = x.charged.flatMap((c) => move(moveIn(c, p!.chargedMoves)) ?? []);
    forms[p.speciesId] = {
      types: typesOf(p),
      atk: s.atk,
      def: s.def,
      fast: formFast,
      charged: formCharged.length ? formCharged : charged,
      ...(t ? { change: { trigger: t, to: p.formChange!.alternativeFormId!, ...(t === 'charged_move_damage' ? { protect: true } : {}) } } : {}),
    };
    p = t ? x.byId.get(p.formChange!.alternativeFormId!) : undefined;
  }
  return { ...f, forms, form: x.species.speciesId };
}
