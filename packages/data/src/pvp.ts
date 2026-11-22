/** PvP data from the game master: base stats per battle-relevant form, level multipliers, power-up costs, evolutions. */
import { LEAGUES, makeVariantKey, rankTable, type LocalizedText, type PokemonType, type PvpData, type PvpPokemon, type PvpTop } from '@mydexpogo/shared';

interface GmEntry {
  templateId: string;
  data: {
    pokemonSettings?: {
      pokemonId: string;
      form?: string;
      type?: string;
      type2?: string;
      stats?: { baseAttack?: number; baseDefense?: number; baseStamina?: number };
      evolutionBranch?: { evolution?: string; form?: string; temporaryEvolution?: string }[];
    };
    playerLevel?: { cpMultiplier: number[] };
    pokemonUpgrades?: { stardustCost: number[]; candyCost: number[]; xlCandyCost: number[]; xlCandyMinPokemonLevel: number; maxNormalUpgradeLevel: number };
  };
}

export interface PvpContext {
  /** Form token without the species prefix ("ALOLA"), or null for the base form. */
  isCostume: (dex: number, token: string) => boolean;
  released: (dex: number) => boolean;
  name: (dex: number, token: string | null) => LocalizedText;
  dexOf: (pokemonId: string) => number | undefined;
}

const typeOf = (t?: string) => (t ? (t.replace('POKEMON_TYPE_', '').toLowerCase() as PokemonType) : null);
const rankOf = (ps: { pokemonId: string; form?: string }) => (ps.form === `${ps.pokemonId}_NORMAL` ? 0 : ps.form ? 2 : 1);
const tokenOf = (pokemonId: string, form?: string) => {
  if (!form) return null;
  const t = form.startsWith(`${pokemonId}_`) ? form.slice(pokemonId.length + 1) : form;
  return t === 'NORMAL' ? null : t;
};

export function extractPvp(gm: GmEntry[], ctx: PvpContext): PvpData | undefined {
  const level = gm.find((t) => t.templateId === 'PLAYER_LEVEL_SETTINGS')?.data.playerLevel;
  const up = gm.find((t) => t.templateId === 'POKEMON_UPGRADE_SETTINGS')?.data.pokemonUpgrades;
  if (!level || !up) return undefined;
  const maxLevel = up.maxNormalUpgradeLevel ?? 50;

  // Forms with identical stats and types fold into the first one seen (base before its _NORMAL / COPY twins).
  const byStats = new Map<string, PvpPokemon>();
  const byKey = new Map<string, PvpPokemon>();
  const alias = new Map<string, string>(); // `${pokemonId}|${form ?? ''}` -> canonical key
  const branches = new Map<string, { evolution?: string; form?: string; temporaryEvolution?: string }[]>();
  const templates = gm
    .map((t) => ({ m: /^V(\d{4})_POKEMON_/.exec(t.templateId), ps: t.data.pokemonSettings }))
    .filter((x): x is { m: RegExpExecArray; ps: NonNullable<GmEntry['data']['pokemonSettings']> } => !!x.m && !!x.ps?.stats?.baseAttack)
    // "_NORMAL" first: when it disagrees with the formless template (Dugtrio's Defense), it is the one players meet.
    .sort((a, b) => rankOf(a.ps) - rankOf(b.ps));
  for (const { m, ps } of templates) {
    const dex = Number(m[1]);
    const token = tokenOf(ps.pokemonId, ps.form);
    if (!ctx.released(dex)) continue;
    if (token && (ctx.isCostume(dex, token) || /COPY|_\d{4}$|^\d{4}$/.test(token))) continue;
    const types = [typeOf(ps.type), typeOf(ps.type2)].filter((x): x is PokemonType => !!x);
    const s = ps.stats!;
    const key = makeVariantKey({ dex, form: token, costume: null, gender: null });
    const id = `${dex}|${s.baseAttack}|${s.baseDefense}|${s.baseStamina}|${types.join('/')}`;
    let entry = byKey.get(key) ?? byStats.get(id);
    if (!entry) {
      entry = { key, dex, name: ctx.name(dex, token), types, atk: s.baseAttack!, def: s.baseDefense ?? 0, sta: s.baseStamina ?? 0 };
      byStats.set(id, entry);
      byKey.set(key, entry);
    }
    if (ps.evolutionBranch?.length && !branches.has(entry.key)) branches.set(entry.key, ps.evolutionBranch);
    alias.set(`${ps.pokemonId}|${ps.form ?? ''}`, entry.key);
    if (!ps.form) alias.set(`${ps.pokemonId}|${ps.pokemonId}_NORMAL`, entry.key);
  }
  const pokemon = [...byStats.values()].sort((a, b) => a.dex - b.dex);
  for (const p of pokemon) {
    const evos = (branches.get(p.key) ?? [])
      .filter((b) => b.evolution && !b.temporaryEvolution)
      .map((b) => alias.get(`${b.evolution}|${b.form ?? ''}`) ?? alias.get(`${b.evolution}|`))
      .filter((k): k is string => !!k && k !== p.key);
    if (evos.length) p.evolutions = [...new Set(evos)];
  }
  // Rank 1 per league, shown on the Pokédex cards (same settings as the PvP page by default: level 50, no buddy).
  const cpm = level.cpMultiplier.slice(0, maxLevel + 1);
  const top = (p: PvpPokemon, cap: number): PvpTop => {
    const r = rankTable({ cpm }, p, cap, maxLevel)[0]!;
    return [r.ivs.atk, r.ivs.def, r.ivs.sta, r.level, r.cp];
  };
  for (const p of pokemon) p.top = { great: top(p, LEAGUES.great), ultra: top(p, LEAGUES.ultra) };

  return {
    cpm,
    stardust: up.stardustCost,
    candy: up.candyCost,
    xlCandy: up.xlCandyCost,
    xlFrom: up.xlCandyMinPokemonLevel ?? 40,
    maxLevel,
    pokemon,
  };
}
