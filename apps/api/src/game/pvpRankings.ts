/**
 * Great and Ultra League rankings from PvPoke (pvpoke.com/rankings, published in their GitHub repository), cached
 * for 12 hours. Their files are big (megabytes): only the top of each league is kept, with what it takes to find the
 * same form in our data (dex number and base stats; a Shadow form has the stats of its normal one).
 */

const BASE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data';
const KEEP = 100;

export interface RankedPokemon {
  rank: number;
  speciesId: string;
  name: string;
  dex: number;
  atk: number;
  def: number;
  hp: number;
  shadow: boolean;
  score: number;
}
export interface PvpRankings {
  great: RankedPokemon[];
  ultra: RankedPokemon[];
}

let cache: { at: number; data: PvpRankings } | null = null;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'user-agent': 'mydexpogo/1.0' } });
  if (!res.ok) throw new Error(`pvpoke ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

type GmPokemon = { speciesId: string; dex: number; baseStats: { atk: number; def: number; hp: number }; tags?: string[] };
type Ranking = { speciesId: string; speciesName: string; score: number };

export function topOf(rankings: Ranking[], byId: Map<string, GmPokemon>): RankedPokemon[] {
  const out: RankedPokemon[] = [];
  for (const r of rankings) {
    const p = byId.get(r.speciesId);
    if (!p) continue;
    out.push({
      rank: out.length + 1,
      speciesId: r.speciesId,
      name: r.speciesName,
      dex: p.dex,
      atk: p.baseStats.atk,
      def: p.baseStats.def,
      hp: p.baseStats.hp,
      shadow: !!p.tags?.includes('shadow'),
      score: r.score,
    });
    if (out.length === KEEP) break;
  }
  return out;
}

export async function getPvpRankings(now = Date.now()): Promise<PvpRankings> {
  if (cache && now - cache.at < 12 * 3600_000) return cache.data;
  const [gm, great, ultra] = await Promise.all([
    getJson<GmPokemon[]>('gamemaster/pokemon.json'),
    getJson<Ranking[]>('rankings/all/overall/rankings-1500.json'),
    getJson<Ranking[]>('rankings/all/overall/rankings-2500.json'),
  ]);
  const byId = new Map(gm.map((p) => [p.speciesId, p]));
  const data = { great: topOf(great, byId), ultra: topOf(ultra, byId) };
  if (!data.great.length || !data.ultra.length) throw new Error('pvpoke: empty rankings, format changed?');
  cache = { at: now, data };
  return data;
}
