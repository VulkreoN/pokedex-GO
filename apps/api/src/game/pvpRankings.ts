/**
 * Great and Ultra League rankings from PvPoke (pvpoke.com/rankings, published in their GitHub repository), cached
 * for 12 hours. Their files are big (megabytes): only what the app shows is kept. Each entry carries what it takes to
 * find the same form in our data (dex number and base stats; a Shadow form has the stats of its normal one).
 */

const BASE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data';
/** On the PvP start page. */
const TOP = 100;
/** Best wins and worst losses kept per Pokémon. */
const MATCHUPS = 5;

export type League = 'great' | 'ultra';
const FILES: Record<League, string> = { great: 'rankings-1500.json', ultra: 'rankings-2500.json' };
/** Order of PvPoke's role scores. */
export const ROLES = ['lead', 'closer', 'switch', 'charger', 'attacker', 'consistency'] as const;

/** What finds a PvPoke form among ours. */
export interface FormRef {
  speciesId: string;
  name: string;
  dex: number;
  atk: number;
  def: number;
  hp: number;
  shadow: boolean;
}
export interface RankedPokemon extends FormRef {
  rank: number;
  score: number;
}
export interface Move {
  id: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  turns?: number;
}
export interface RankedDetail extends RankedPokemon {
  league: League;
  /** Out of how many ranked in the league. */
  of: number;
  scores: Partial<Record<(typeof ROLES)[number], number>>;
  /** Fast move, then the two charged moves. */
  moveset: Move[];
  wins: (FormRef & { rating: number })[];
  losses: (FormRef & { rating: number })[];
}
export interface PvpRankings {
  great: RankedPokemon[];
  ultra: RankedPokemon[];
}

type GmPokemon = { speciesId: string; speciesName: string; dex: number; baseStats: { atk: number; def: number; hp: number }; tags?: string[] };
type GmMove = { moveId: string; name: string; type: string; power: number; energy: number; energyGain: number; turns?: number };
type Ranking = {
  speciesId: string;
  speciesName: string;
  score: number;
  scores?: number[];
  moveset?: string[];
  matchups?: { opponent: string; rating: number }[];
  counters?: { opponent: string; rating: number }[];
};

let cache: { at: number; leagues: Record<League, RankedDetail[]> } | null = null;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'user-agent': 'mydexpogo/1.0' } });
  if (!res.ok) throw new Error(`pvpoke ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const refOf = (p: GmPokemon, name = p.speciesName): FormRef => ({
  speciesId: p.speciesId,
  name,
  dex: p.dex,
  atk: p.baseStats.atk,
  def: p.baseStats.def,
  hp: p.baseStats.hp,
  shadow: !!p.tags?.includes('shadow'),
});

/** One league's rankings, in PvPoke's order, entries PvPoke itself cannot describe left out. */
export function rankLeague(league: League, rankings: Ranking[], byId: Map<string, GmPokemon>, moves: Map<string, GmMove>): RankedDetail[] {
  const known = rankings.filter((r) => byId.has(r.speciesId));
  const opponents = (list: { opponent: string; rating: number }[] | undefined) =>
    (list ?? []).flatMap((m) => {
      const p = byId.get(m.opponent);
      return p ? [{ ...refOf(p), rating: m.rating }] : [];
    }).slice(0, MATCHUPS);
  return known.map((r, i) => ({
    ...refOf(byId.get(r.speciesId)!, r.speciesName),
    league,
    rank: i + 1,
    of: known.length,
    score: r.score,
    scores: Object.fromEntries(ROLES.flatMap((role, k) => (r.scores?.[k] !== undefined ? [[role, r.scores[k]]] : []))),
    moveset: (r.moveset ?? []).flatMap((id) => {
      const m = moves.get(id);
      return m ? [{ id, name: m.name, type: m.type, power: m.power, energy: m.energy, energyGain: m.energyGain, ...(m.turns ? { turns: m.turns } : {}) }] : [];
    }),
    wins: opponents(r.matchups),
    losses: opponents(r.counters),
  }));
}

async function load(now: number): Promise<Record<League, RankedDetail[]>> {
  if (cache && now - cache.at < 12 * 3600_000) return cache.leagues;
  const [gm, moveList, great, ultra] = await Promise.all([
    getJson<GmPokemon[]>('gamemaster/pokemon.json'),
    getJson<GmMove[]>('gamemaster/moves.json'),
    getJson<Ranking[]>(`rankings/all/overall/${FILES.great}`),
    getJson<Ranking[]>(`rankings/all/overall/${FILES.ultra}`),
  ]);
  const byId = new Map(gm.map((p) => [p.speciesId, p]));
  const moves = new Map(moveList.map((m) => [m.moveId, m]));
  const leagues = { great: rankLeague('great', great, byId, moves), ultra: rankLeague('ultra', ultra, byId, moves) };
  if (!leagues.great.length || !leagues.ultra.length) throw new Error('pvpoke: empty rankings, format changed?');
  cache = { at: now, leagues };
  return leagues;
}

const slim = ({ rank, speciesId, name, dex, atk, def, hp, shadow, score }: RankedDetail): RankedPokemon => ({ rank, speciesId, name, dex, atk, def, hp, shadow, score });

/** The top of each league, for the PvP start page. */
export async function getPvpRankings(now = Date.now()): Promise<PvpRankings> {
  const l = await load(now);
  return { great: l.great.slice(0, TOP).map(slim), ultra: l.ultra.slice(0, TOP).map(slim) };
}

/** Every ranked form of one species (normal, Shadow, regional...) in both leagues, for its PvP page. */
export async function getPvpDetails(dex: number, now = Date.now()): Promise<RankedDetail[]> {
  const l = await load(now);
  return [...l.great, ...l.ultra].filter((r) => r.dex === dex);
}
