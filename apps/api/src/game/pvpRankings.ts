/**
 * Great and Ultra League rankings from PvPoke (pvpoke.com/rankings, published in their GitHub repository), cached
 * for 12 hours. Their files are big (megabytes): only what the app shows is kept. Each entry carries what it takes to
 * find the same form in our data (dex number and base stats; a Shadow form has the stats of its normal one).
 */
import { tracked } from '../lib/health.js';

const BASE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data';
/** On the PvP start page. */
const TOP = 100;
/** Best wins and worst losses kept per Pokémon. */
const MATCHUPS = 5;

export type League = 'great' | 'ultra' | 'master';
export const LEAGUES: League[] = ['great', 'ultra', 'master'];
const FILES: Record<League, string> = { great: 'rankings-1500.json', ultra: 'rankings-2500.json', master: 'rankings-10000.json' };
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
  /** Change in rank vs current season (only on next-season preview: +N = climbed N places, null = new). */
  delta?: number | null;
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
export interface PreviewRankings {
  slug: string;
  title: string;
  url: string;
  great: RankedPokemon[];
  ultra: RankedPokemon[];
  master: RankedPokemon[];
}
export interface PvpRankings {
  great: RankedPokemon[];
  ultra: RankedPokemon[];
  master: RankedPokemon[];
  preview?: PreviewRankings;
}

type GmPokemon = { speciesId: string; speciesName: string; dex: number; baseStats: { atk: number; def: number; hp: number }; tags?: string[]; types: string[]; fastMoves: string[]; chargedMoves: string[]; formChange?: { alternativeFormId?: string } };
type GmMove = { moveId: string; name: string; type: string; power: number; energy: number; energyGain: number; turns?: number; abbreviation?: string };
type Analysis = { properties?: { lastUpdated?: string }; teams?: { team: string; teamScore: number; games: number }[] };
type Ranking = {
  speciesId: string;
  speciesName: string;
  score: number;
  scores?: number[];
  moveset?: string[];
  matchups?: { opponent: string; rating: number }[];
  counters?: { opponent: string; rating: number }[];
};

interface PreviewLoaded {
  slug: string;
  title: string;
  url: string;
  leagues: Record<League, RankedDetail[]>;
}
interface Loaded {
  leagues: Record<League, RankedDetail[]>;
  preview: PreviewLoaded | null;
  gm: GmPokemon[];
  byId: Map<string, GmPokemon>;
  moves: Map<string, GmMove>;
  analysis: Record<League, Analysis>;
}
let cache: { at: number; data: Loaded } | null = null;
/** Admin: download again on the next request. */
export const resetPvpokeCache = () => void (cache = null);

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

/** One download at a time: pages opened while it runs wait for it instead of each starting their own. */
let loading: Promise<Loaded> | null = null;

async function loadAll(now: number): Promise<Loaded> {
  if (cache && now - cache.at < 12 * 3600_000) return cache.data;
  loading ??= tracked('pvpoke', () => download(now)).finally(() => (loading = null));
  return loading;
}

const analysisDate = (a: Analysis): number => {
  const raw = a.properties?.lastUpdated?.replace(/\s+/g, ' ').trim();
  const ts = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ts) ? ts : 0;
};

/** Picks the freshest non-empty PvPoke training analysis (PvPoke sometimes refreshes `mega/` while `all/` freezes). */
export function pickFresherAnalysis(...candidates: Analysis[]): Analysis {
  let best: Analysis = {};
  let bestTs = -1;
  for (const c of candidates) {
    if (!c.teams?.length) continue;
    const ts = analysisDate(c);
    if (ts > bestTs) {
      best = c;
      bestTs = ts;
    }
  }
  return best;
}

/** Detects PvPoke's active "Preview next season" banner from src/header.php (null when between seasons). */
export function parsePreviewSeason(headerPhp: string): { slug: string; title: string } | null {
  if (/if\s*\(\s*false\s*\)[\s\S]{0,400}Preview next season/i.test(headerPhp)) return null;
  const m = /href="https:\/\/pvpoke\.com\/([a-z0-9-]+)\/rankings\/"[^>]*>\s*Preview next season/i.exec(headerPhp);
  if (!m?.[1]) return null;
  const slug = m[1];
  const title = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { slug, title };
}

/** Attaches rank delta vs current season (+N = climbed N places, -N = dropped, null = newly ranked). */
export function withRankDeltas(preview: RankedDetail[], current: RankedDetail[]): RankedDetail[] {
  const curRank = new Map(current.map((r) => [r.speciesId, r.rank]));
  return preview.map((r) => {
    const prev = curRank.get(r.speciesId);
    return { ...r, delta: prev !== undefined ? prev - r.rank : null };
  });
}

async function downloadPreview(baseById: Map<string, GmPokemon>, baseMoves: Map<string, GmMove>, currentLeagues: Record<League, RankedDetail[]>): Promise<PreviewLoaded | null> {
  const header = await fetch('https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/header.php', { headers: { 'user-agent': 'mydexpogo/1.0' } })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  const info = parsePreviewSeason(header);
  if (!info) return null;
  const pBase = `https://pvpoke.com/${info.slug}/data`;
  const fetchJson = async <T>(p: string): Promise<T> => {
    const res = await fetch(`${pBase}/${p}`, { headers: { 'user-agent': 'mydexpogo/1.0' } });
    if (!res.ok) throw new Error(`pvpoke preview ${p}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  try {
    const [pGm, ...lists] = await Promise.all([
      fetchJson<{ pokemon?: GmPokemon[]; moves?: GmMove[] }>('gamemaster.min.json').catch(() => null),
      ...LEAGUES.map((l) => fetchJson<Ranking[]>(`rankings/all/overall/${FILES[l]}`)),
    ]);
    const byId = new Map(baseById);
    for (const p of pGm?.pokemon ?? []) byId.set(p.speciesId, p);
    const moves = new Map(baseMoves);
    for (const m of pGm?.moves ?? []) moves.set(m.moveId, m);
    const leagues = Object.fromEntries(
      LEAGUES.map((l, i) => [l, withRankDeltas(rankLeague(l, lists[i] as Ranking[], byId, moves), currentLeagues[l])]),
    ) as Record<League, RankedDetail[]>;
    if (LEAGUES.some((l) => !leagues[l].length)) return null;
    return { slug: info.slug, title: info.title, url: `https://pvpoke.com/${info.slug}/rankings/`, leagues };
  } catch {
    return null;
  }
}

async function download(now: number): Promise<Loaded> {
  const [gm, moveList, analyses, ...lists] = await Promise.all([
    getJson<GmPokemon[]>('gamemaster/pokemon.json'),
    getJson<GmMove[]>('gamemaster/moves.json'),
    // Most played teams on PvPoke's training mode: check both `all/` and `mega/` and keep whichever was updated last.
    Promise.all(
      LEAGUES.map(async (l) => {
        const file = FILES[l].replace('rankings-', '');
        const [all, mega] = await Promise.all([
          getJson<Analysis>(`training/analysis/all/${file}`).catch(() => ({}) as Analysis),
          getJson<Analysis>(`training/analysis/mega/${file}`).catch(() => ({}) as Analysis),
        ]);
        return pickFresherAnalysis(all, mega);
      }),
    ),
    ...LEAGUES.map((l) => getJson<Ranking[]>(`rankings/all/overall/${FILES[l]}`)),
  ]);
  const byId = new Map(gm.map((p) => [p.speciesId, p]));
  const moves = new Map(moveList.map((m) => [m.moveId, m]));
  const leagues = Object.fromEntries(LEAGUES.map((l, i) => [l, rankLeague(l, lists[i] as Ranking[], byId, moves)])) as Record<League, RankedDetail[]>;
  if (LEAGUES.some((l) => !leagues[l].length)) throw new Error('pvpoke: empty rankings, format changed?');
  const preview = await downloadPreview(byId, moves, leagues);
  const data: Loaded = { leagues, preview, gm, byId, moves, analysis: Object.fromEntries(LEAGUES.map((l, i) => [l, analyses[i]!])) as Record<League, Analysis> };
  cache = { at: now, data };
  return data;
}

const slim = ({ rank, speciesId, name, dex, atk, def, hp, shadow, score, delta }: RankedDetail): RankedPokemon => ({
  rank, speciesId, name, dex, atk, def, hp, shadow, score, ...(delta !== undefined ? { delta } : {}),
});

/** The top of each league, for the PvP start page (plus next-season preview when PvPoke publishes one). */
export async function getPvpRankings(now = Date.now()): Promise<PvpRankings> {
  const d = await loadAll(now);
  const l = d.leagues;
  return {
    great: l.great.slice(0, TOP).map(slim),
    ultra: l.ultra.slice(0, TOP).map(slim),
    master: l.master.slice(0, TOP).map(slim),
    ...(d.preview
      ? {
          preview: {
            slug: d.preview.slug,
            title: d.preview.title,
            url: d.preview.url,
            great: d.preview.leagues.great.slice(0, TOP).map(slim),
            ultra: d.preview.leagues.ultra.slice(0, TOP).map(slim),
            master: d.preview.leagues.master.slice(0, TOP).map(slim),
          },
        }
      : {}),
  };
}

/** Every ranked form of one species (normal, Shadow, regional...) in every league, plus next-season preview if active. */
export async function getPvpDetails(dex: number, now = Date.now()): Promise<{ rankings: RankedDetail[]; preview?: { slug: string; title: string; url: string; rankings: RankedDetail[] } }> {
  const d = await loadAll(now);
  const rankings = LEAGUES.flatMap((league) => d.leagues[league]).filter((r) => r.dex === dex);
  const previewRankings = d.preview ? LEAGUES.flatMap((league) => d.preview!.leagues[league]).filter((r) => r.dex === dex) : [];
  return {
    rankings,
    ...(d.preview && previewRankings.length ? { preview: { slug: d.preview.slug, title: d.preview.title, url: d.preview.url, rankings: previewRankings } } : {}),
  };
}

/** What a battle needs for one species: its forms (and the ones it changes into), their move details, PvPoke's movesets. */
export async function getBattleData(dex: number, now = Date.now()) {
  const d = await loadAll(now);
  const species = new Map<string, GmPokemon>();
  const add = (p: GmPokemon | undefined) => {
    if (!p || species.has(p.speciesId)) return;
    species.set(p.speciesId, p);
    add(p.formChange?.alternativeFormId ? d.byId.get(p.formChange.alternativeFormId) : undefined);
  };
  for (const p of d.gm) if (p.dex === dex) add(p);
  const moveIds = new Set([...species.values()].flatMap((p) => [...p.fastMoves, ...p.chargedMoves]));
  const recommended: Record<string, Partial<Record<League, string[]>>> = {};
  for (const league of LEAGUES)
    for (const r of d.leagues[league]) if (species.has(r.speciesId)) (recommended[r.speciesId] ??= {})[league] = r.moveset.map((m) => m.id);
  return { species: [...species.values()], moves: [...moveIds].flatMap((id) => d.moves.get(id) ?? []), recommended };
}

const words = (s: string) => s.split(/[\s_-]+/).filter(Boolean);
/** How well an abbreviation like "SeB" or "FoP" fits a move: 2 exact, 1 letters in order, word by word; 0 no. */
export function abbreviationFit(abbr: string, m: { moveId: string; name: string; abbreviation?: string }): number {
  const initials = (ws: string[]) => ws.map((w) => w[0]!.toUpperCase()).join('');
  if (m.abbreviation === abbr || initials(words(m.name)) === abbr || initials(words(m.moveId)) === abbr) return 2;
  const chunks = abbr.match(/[A-Z][^A-Z]*/g) ?? [];
  const fit = (ws: string[]) =>
    ws.length === chunks.length &&
    chunks.every((c, i) => {
      const w = ws[i]!.toLowerCase();
      let k = 0;
      for (const ch of c.toLowerCase()) if ((k = w.indexOf(ch, k) + 1) === 0) return false;
      return w[0] === c[0]!.toLowerCase();
    });
  return fit(words(m.name)) || fit(words(m.moveId)) ? 1 : 0;
}

/** "tinkaton FW/Bd/GH" -> tinkaton with Fairy Wind, Bulldoze and Gigaton Hammer, taken from what it can learn. */
export function decodeMember(text: string, byId: Map<string, GmPokemon>, moves: Map<string, GmMove>): { speciesId: string; fast: string; charged: string[] } | null {
  const [speciesId, set] = text.trim().split(' ');
  const p = speciesId ? byId.get(speciesId) : undefined;
  if (!p || !set) return null;
  const parts = set.split(/[/+]/);
  const pools = parts.map((_, i) => (i === 0 ? p.fastMoves : p.chargedMoves));
  const out: (string | null)[] = parts.map(() => null);
  const used = new Set<string>();
  // Most specific abbreviations first: "SeB" takes Seed Bomb before "SB" picks between Shadow Ball and Seed Bomb.
  for (const i of parts.map((_, i) => i).sort((a, b) => parts[b]!.length - parts[a]!.length)) {
    const best = pools[i]!
      .filter((id) => !used.has(id) && moves.has(id))
      .map((id) => ({ id, fit: abbreviationFit(parts[i]!, moves.get(id)!) }))
      .filter((x) => x.fit > 0)
      .sort((a, b) => b.fit - a.fit)[0];
    if (!best) return null;
    out[i] = best.id;
    used.add(best.id);
  }
  return { speciesId: speciesId!, fast: out[0]!, charged: out.slice(1) as string[] };
}

/** The most played teams of a league on PvPoke's training mode, most games first, with their moves decoded. */
export async function getPopularTeams(league: League, now = Date.now()) {
  const d = await loadAll(now);
  const a = d.analysis[league];
  const teams = (a.teams ?? [])
    .flatMap((t) => {
      const members = t.team.split('|').map((m) => decodeMember(m, d.byId, d.moves));
      if (members.some((m) => !m || d.byId.get(m.speciesId)?.tags?.includes('mega'))) return [];
      return [{ members: members.map((m) => ({ ...m!, dex: d.byId.get(m!.speciesId)!.dex, ...stats(d.byId.get(m!.speciesId)!) })), games: t.games, score: t.teamScore }];
    })
    .sort((x, y) => y.games - x.games)
    .slice(0, 30);
  return { updated: a.properties?.lastUpdated?.replace(/\s+/g, ' ') ?? null, teams };
}
const stats = (p: GmPokemon) => ({ name: p.speciesName, atk: p.baseStats.atk, def: p.baseStats.def, hp: p.baseStats.hp, shadow: !!p.tags?.includes('shadow') });
