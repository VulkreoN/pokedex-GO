/** PvPoke's rankings (pvpoke.com), read and cached by our API, matched to our forms. */
import { useQuery } from '@tanstack/react-query';
import type { Lang, PvpData, PvpPokemon } from '@mydexpogo/shared';
import { localized } from './i18n.js';

export const PVPOKE_URL = 'https://pvpoke.com/rankings/';
export type League = 'great' | 'ultra';
export const LEAGUE_CP: Record<League, number> = { great: 1500, ultra: 2500 };

export interface FormRef { speciesId: string; name: string; dex: number; atk: number; def: number; hp: number; shadow: boolean }
export interface RankedPokemon extends FormRef { rank: number; score: number }
export interface PvpokeMove { id: string; name: string; type: string; power: number; energy: number; energyGain: number; turns?: number }
export const ROLES = ['lead', 'closer', 'switch', 'charger', 'attacker', 'consistency'] as const;
export interface RankedDetail extends RankedPokemon {
  league: League;
  of: number;
  scores: Partial<Record<(typeof ROLES)[number], number>>;
  moveset: PvpokeMove[];
  wins: (FormRef & { rating: number })[];
  losses: (FormRef & { rating: number })[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

/** The top 100 of each league. */
export const usePvpRankings = () =>
  useQuery({ queryKey: ['game', 'pvp-rankings'], queryFn: () => getJson<Record<League, RankedPokemon[]>>('/api/game/pvp-rankings'), staleTime: 3600_000, retry: 1 });

/** Every ranked form of one species, both leagues. */
export const usePvpDetails = (dex: number) =>
  useQuery({
    queryKey: ['game', 'pvp-rankings', dex],
    queryFn: () => getJson<{ rankings: RankedDetail[] }>(`/api/game/pvp-rankings/${dex}`).then((r) => r.rankings),
    staleTime: 3600_000,
    retry: 1,
  });

/** Our form for a PvPoke one: same dex number and base stats (a Shadow form has its normal form's stats). */
export function formOf(pvp: PvpData, r: FormRef): PvpPokemon | undefined {
  const same = pvp.pokemon.filter((p) => p.dex === r.dex);
  return same.find((p) => p.atk === r.atk && p.def === r.def && p.sta === r.hp) ?? same[0];
}

/** Every league rank PvPoke gives this form, the Shadow one apart. */
export function pvpokeRanks(pvp: PvpData, rankings: Record<League, RankedPokemon[]> | undefined, key: string) {
  if (!rankings) return [];
  return (['great', 'ultra'] as League[]).flatMap((league) => rankings[league].filter((r) => formOf(pvp, r)?.key === key).map((r) => ({ league, rank: r.rank, shadow: r.shadow })));
}

/**
 * A move in the app language. PvPoke uses the game's move ids, plus a few of its own: "_PLUS" for a buffed copy
 * of a move and one Hidden Power per type; unreleased moves keep PvPoke's English name.
 */
export function moveName(pvp: PvpData, m: PvpokeMove, lang: Lang): string {
  const names = pvp.moves ?? {};
  const n = names[m.id] ?? names[m.id.replace(/_PLUS$/, '')] ?? (m.id.startsWith('HIDDEN_POWER_') ? names.HIDDEN_POWER : undefined);
  return n ? localized(n, lang) || m.name : m.name;
}

export const pvpokeUrl = (r: { league: League; speciesId: string }) => `https://pvpoke.com/rankings/all/${LEAGUE_CP[r.league]}/overall/${r.speciesId}/`;
