/** The Game tab's tools: best counters (raids, Team GO Rocket, any Pokémon), costs, buddy distances, the GO Battle League. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { buildHuntMatcher, cupNameFr, entryMatchesLive, gblSeasonFr, inferHuntSource, neutralKey, nextFullMoons, powerUpCost, rankCounters, resolveLiveKey, weaknesses, type HuntMatcher, type HuntSource, type MembershipEntry, type PokemonType, type PowerUpKind, type ToolPokemon, type ToolsData } from '@mydexpogo/shared';
import { Sprite } from './Sprite.js';
import { TYPE_COLORS, TypeBadge } from './TypeBadge.js';
import { Badge, Button, Chip, Empty, Sheet, Spinner } from './ui.js';
import { useMe } from '../lib/auth.js';
import { normalize, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { typeName, useLang, useT } from '../lib/i18n.js';
import { useLists, useMembership } from '../lib/lists.js';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { currentRaidBosses, dexFromImage, eventStatus, eventTitle, liveName, useEvents, useRaids, type LivePokemon } from '../lib/live.js';
import { liveKey, local, moveLabel, rocketName, useRockets, useTools } from '../lib/tools.js';

/** Tells whether a live Pokémon (raid, egg, spawn, research, Rocket, Max) is missing in one of the signed-in player's collections. */
export function useMissingHunts(): HuntMatcher {
  const me = useMe();
  const membership = useMembership(!!me.data);
  const dataset = useDataset();
  return useMemo(() => buildHuntMatcher(dataset.data?.hunt ?? null, membership.data ?? []), [dataset.data?.hunt, membership.data]);
}

export interface WantedMatchGroup {
  listId: string;
  listName: string;
  exact: boolean;
  shiny: boolean;
  tag: MembershipEntry['tag'];
  entries: MembershipEntry[];
}

/** Resolves WHICH collections want a live Pokémon (and which exact entries can be marked caught in 1 tap). */
export function useWantedMatches() {
  const me = useMe();
  const membership = useMembership(!!me.data);
  const lists = useLists();
  const dataset = useDataset();
  const hunt = dataset.data?.hunt ?? null;
  const listNames = useMemo(() => new Map((lists.data ?? []).map((l) => [l.id, l.name])), [lists.data]);
  const missing = useMemo(() => (membership.data ?? []).filter((e) => !e.done), [membership.data]);

  const forKey = (rawKey: string, rawSource: HuntSource, canBeShiny?: boolean): WantedMatchGroup[] => {
    if (!missing.length) return [];
    const key = neutralKey(rawKey);
    const source = inferHuntSource(rawSource, key);
    const live = { key, source, canBeShiny };
    const groups = new Map<string, WantedMatchGroup>();
    for (const e of missing) {
      if (!entryMatchesLive(hunt, e, live)) continue;
      const targetKey = neutralKey(e.variantKey);
      const exact = targetKey === key || (source === 'megaRaid' && targetKey === key.replace(/\.f(MEGA(?:_[A-Z0-9]+)*|PRIMAL)$/, ''));
      const gid = `${e.listId}|${targetKey}|${e.shiny ? 1 : 0}|${e.tag}`;
      let g = groups.get(gid);
      if (!g) {
        g = { listId: e.listId, listName: listNames.get(e.listId) ?? '…', exact, shiny: e.shiny, tag: e.tag, entries: [] };
        groups.set(gid, g);
      }
      g.entries.push(e);
    }
    // Prefer exact-catchable matches first so 1-tap "Caught" targets the direct collection entry.
    return [...groups.values()].sort((a, b) => Number(b.exact) - Number(a.exact));
  };

  const forLive = (image: string, name: string, rawSource: HuntSource, canBeShiny?: boolean): WantedMatchGroup[] => {
    const key = resolveLiveKey(image, name, hunt ?? undefined);
    if (!key) return [];
    const source = inferHuntSource(rawSource, key, name);
    return forKey(key, source, canBeShiny);
  };

  return { forKey, forLive };
}

/** The tools need both the Pokédex (pictures) and their own data. */
function useToolData(): { idx: DatasetIndex; tools: ToolsData } | 'loading' | 'error' {
  const dataset = useDataset();
  const tools = useTools();
  if (dataset.isError || tools.isError) return 'error';
  if (!dataset.data || !tools.data) return 'loading';
  return { idx: dataset.data, tools: tools.data };
}

function Loading({ state }: { state: 'loading' | 'error' }) {
  const t = useT();
  return state === 'loading' ? <Spinner /> : <Empty>{t.live_error}</Empty>;
}

/** The picture of a form: its own when the Pokédex has it, the species' otherwise. */
function FormSprite({ idx, p, size = 48 }: { idx: DatasetIndex; p: Pick<ToolPokemon, 'key' | 'dex'>; size?: number }) {
  const v = idx.variantByKey.get(p.key) ?? idx.coverOf.get(p.dex);
  return v ? <Sprite idx={idx} variant={v} size={size} /> : <span style={{ width: size, height: size }} />;
}

/** Search any form by name or number. */
function PokemonPicker({ tools, onPick, releasedOnly = false }: { tools: ToolsData; onPick: (p: ToolPokemon) => void; releasedOnly?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [q, setQ] = useState('');
  const found = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return tools.pokemon
      .filter((p) => (!releasedOnly || p.released) && words.every((w) => (/^\d+$/.test(w) ? String(p.dex) === w : normalize(`${p.name.en} ${p.name.fr ?? ''}`).includes(w))))
      .slice(0, 8);
  }, [q, tools, releasedOnly]);
  return (
    <div>
      <div className="relative">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search_placeholder} aria-label={t.tools_pick} className="min-h-11 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3" />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">
            ✕
          </button>
        )}
      </div>
      {found.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-xl border border-line bg-card">
          {found.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => { onPick(p); setQ(''); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-paper-2">
                <span className="tnum w-10 text-xs text-ink-3">#{p.dex}</span>
                <span className="flex-1 font-semibold">{local(p.name, lang)}</span>
                {p.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Counters ---------- */

/** The Pokémon a Leek Duck picture shows, in the tools data ("…/pm354.fMEGA.icon.png" -> Mega Banette). */
export interface EventSpawns {
  eventID: string;
  name: string;
  eventType: string;
  link: string;
  image: string;
  start: string | null;
  end: string | null;
  featured: LivePokemon[];
  spawns: LivePokemon[];
  raids: LivePokemon[];
  eggs: LivePokemon[];
  research: LivePokemon[];
  rocket: LivePokemon[];
}

/** Leek Duck's event pages, read by the server: what each event puts in the wild, raids, eggs, research, Rocket. */
export function useEventSpawns() {
  return useQuery({ queryKey: ['live', 'event-spawns'], queryFn: () => api<{ events: EventSpawns[] }>('/game/event-spawns').then((r) => r.events), staleTime: 10 * 60_000 });
}

/**
 * Which event, under way now, puts this Pokémon in raids, eggs, research or Rocket's hands: its name, or nothing. The
 * season is not an event here (its eggs are the usual ones), nor are the weekly raid bosses an event page also lists.
 */
export function useEventMarks(kind: 'raids' | 'eggs' | 'research' | 'rocket') {
  const { lang } = useLang();
  const idx = useDataset().data;
  const known = useKnownPokemon();
  const events = useEventSpawns().data;
  const announced = useEvents().data;
  return useMemo(() => {
    const marks = new Map<string, string>();
    const weekly = new Set<string>();
    if (kind === 'raids')
      for (const e of announced ?? []) if (e.eventType === 'raid-battles' && eventStatus(e) === 'current') for (const b of e.extraData?.raidbattles?.bosses ?? []) { const k = liveKey(b.image, b.name, known); if (k) weekly.add(k); }
    for (const e of events ?? []) {
      if (e.eventType === 'season' || eventStatus(e) !== 'current') continue;
      for (const m of e[kind]) {
        const k = liveKey(m.image, m.name, known);
        if (k && !weekly.has(k) && !marks.has(k)) marks.set(k, eventTitle(e.name, idx?.speciesByDex, lang));
      }
    }
    return (image: string, name: string) => {
      const k = liveKey(image, name, known);
      return k ? marks.get(k) : undefined;
    };
  }, [events, announced, kind, known, idx, lang]);
}

/** The look of a Pokémon an event brings: a blue wash, and the event's name for whoever asks. */
export const EVENT_MARK = 'bg-sky/15 ring-2 ring-sky/60';

/** "Blue background: brought by Twilight Wishes", naming the events among `marks` (nothing when none). */
export function EventLegend({ marks, className = 'mb-3' }: { marks: (string | undefined)[]; className?: string }) {
  const t = useT();
  const names = [...new Set(marks.filter((m): m is string => !!m))];
  if (!names.length) return null;
  return <p className={`flex items-center gap-2 text-sm text-ink-2 ${className}`}><span className={`inline-block h-4 w-4 shrink-0 rounded ${EVENT_MARK}`} aria-hidden="true" />{t.event_legend(names.join(', '))}</p>;
}

export function useFromImage(tools: ToolsData | undefined) {
  const byKey = useMemo(() => new Map((tools?.pokemon ?? []).map((p) => [p.key, p])), [tools]);
  const known = useKnownPokemon();
  return (image: string, name = '') => {
    const key = liveKey(image, name, known);
    return key ? byKey.get(key) ?? byKey.get(key.split('.')[0]!) : undefined;
  };
}

/** What the Pokédex knows, to read Leek Duck's pictures and names (forms, English names). */
export function useKnownPokemon() {
  const idx = useDataset().data;
  return useMemo(() => {
    if (!idx) return undefined;
    const byName = new Map(idx.ds.species.map((s) => [s.name.en.toLowerCase(), s.dex]));
    return { has: (k: string) => idx.variantByKey.has(k), dexOf: (n: string) => byName.get(n.toLowerCase()) };
  }, [idx]);
}

/** Authentic Pokémon GO Team GO Rocket Grunt pre-battle quotes (the #1 lookup cue players read in-game). */
const ROCKET_QUOTES: Record<string, { fr: string; en: string }> = {
  normal: { fr: '« Normal ne veut pas dire faible. »', en: '“Normal does not mean weak.”' },
  fire: { fr: '« Tu sais à quel point le souffle ardent d’un Pokémon peut être chaud ? »', en: '“Do you know how hot Pokémon fire breath can get?”' },
  water: { fr: '« Ces eaux sont traîtresses ! »', en: '“These waters are treacherous!”' },
  grass: { fr: '« Ne te frotte pas à nous ! »', en: '“Don’t tangle with us!”' },
  electric: { fr: '« Prépare-toi à un choc ! »', en: '“Get ready to be shocked!”' },
  ice: { fr: '« Tu vas rester figé sur place. »', en: '“You’re gonna be frozen in your tracks.”' },
  fighting: { fr: '« Ce corps musclé n’est pas que pour la frime ! »', en: '“This buff physique isn’t just for show!”' },
  poison: { fr: '« Enroulé et prêt à frapper ! »', en: '“Coiled and ready to strike!”' },
  ground: { fr: '« Tu vas mordre la poussière ! »', en: '“You’ll be defeated into the ground!”' },
  flying: { fr: '« Mon Pokémon Oiseau veut se battre avec toi ! »', en: '“Battle against my Flying-type Pokémon!”' },
  psychic: { fr: '« Les pouvoirs psychiques t’effraient-ils ? »', en: '“Are you scared of psychics that use unseen power?”' },
  bug: { fr: '« Allez, mon super Pokémon Insecte ! »', en: '“Go, my super bug Pokémon!”' },
  rock: { fr: '« Allons-y ! Rock and roll ! »', en: '“Let’s rock and roll!”' },
  ghost: { fr: '« Ke… ke… ke… ke… ke… ke ! »', en: '“Ke…ke…ke…ke…ke…ke!”' },
  dragon: { fr: '« ROAR ! … Qu’est-ce que tu en penses ? »', en: '“ROAR! …How’d that sound?”' },
  dark: { fr: '« Là où il y a de la lumière, il y a aussi de l’ombre. »', en: '“Wherever there is a light, there is also shadow.”' },
  steel: { fr: '« Tu n’es pas de taille face à ma volonté de fer ! »', en: '“You’re no match for my iron will!”' },
  fairy: { fr: '« Regarde mon adorable Pokémon ! »', en: '“Check out my cute Pokémon!”' },
  winning: { fr: '« Gagner, c’est pour les gagnants ! »', en: '“Winning is for winners!”' },
  decoy: { fr: '« Trompé ! Tu pensais trouver Giovanni ? »', en: '“Fooled ya, twerp!”' },
};

function rocketQuote(name: string, type: string): { fr: string; en: string } | null {
  if (/decoy/i.test(name)) return ROCKET_QUOTES.decoy!;
  const low = type.toLowerCase();
  if (low in ROCKET_QUOTES) return ROCKET_QUOTES[low]!;
  if (/grunt/i.test(name) && (!low || low === 'typeless' || low === 'none')) return ROCKET_QUOTES.winning!;
  return null;
}

/** Counters in a sheet over the page: seen at once, wherever the Pokémon was picked. */
export function CountersSheet({ target, onClose }: { target: ToolPokemon | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const [megas, setMegas] = useState(false);
  const [shadows, setShadows] = useState(true);
  const [noElite, setNoElite] = useState(false);
  return (
    <Sheet open={!!target} onClose={onClose} title={target ? t.counters_title(local(target.name, lang)) : ''}>
      {target && (typeof data === 'string' ? <Loading state={data} /> : <CounterList idx={data.idx} tools={data.tools} target={target} megas={megas} setMegas={setMegas} shadows={shadows} setShadows={setShadows} noElite={noElite} setNoElite={setNoElite} />)}
    </Sheet>
  );
}

/** Inline Counters tool with quick-pick chips for current raid bosses so the page is immediately useful. */
export function CountersTool() {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const raids = useRaids();
  const events = useEvents();
  const fromImage = useFromImage(typeof data === 'string' ? undefined : data.tools);
  const [target, setTarget] = useState<ToolPokemon | null>(null);
  const [megas, setMegas] = useState(false);
  const [shadows, setShadows] = useState(true);
  const [noElite, setNoElite] = useState(false);

  const quickBosses = useMemo(() => {
    if (typeof data === 'string') return [];
    const live = currentRaidBosses(raids.data ?? [], events.data ?? []).filter((b) => b.tier === '5' || b.tier === 'mega' || b.tier === 'shadow5');
    const seen = new Set<string>();
    const out: { mon: ToolPokemon; label: string; image: string }[] = [];
    for (const b of live) {
      const found = fromImage(b.image, b.name) ?? data.tools.pokemon.find((p) => p.dex === dexFromImage(b.image) && !p.mega);
      if (!found || seen.has(found.key)) continue;
      seen.add(found.key);
      out.push({ mon: found, label: liveName(b.name, b.image, data.idx, lang), image: b.image });
    }
    return out.slice(0, 8);
  }, [data, raids.data, events.data, fromImage, lang]);

  if (typeof data === 'string') return <Loading state={data} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{t.counters_help}</p>
      <PokemonPicker tools={data.tools} onPick={setTarget} />
      {quickBosses.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-3">{t.counters_current_bosses}</p>
          <div className="flex flex-wrap gap-1.5">
            {quickBosses.map(({ mon, label, image }) => (
              <Chip key={mon.key} active={target?.key === mon.key} onClick={() => setTarget(mon)} className="min-h-8 pl-1.5 pr-2.5 text-xs">
                <img src={image} alt="" width={22} height={22} className="h-5 w-5 shrink-0 object-contain" />
                <span className="max-w-[10rem] truncate">{label}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      {target && (
        <CounterList
          idx={data.idx}
          tools={data.tools}
          target={target}
          megas={megas}
          setMegas={setMegas}
          shadows={shadows}
          setShadows={setShadows}
          noElite={noElite}
          setNoElite={setNoElite}
        />
      )}
    </div>
  );
}

/** Team GO Rocket's current line-ups: three slots per trainer, catchphrase shown & searchable, catchable slot ringed in gold. */
export function RocketTab() {
  const t = useT();
  const { lang } = useLang();
  const [params] = useSearchParams();
  const rockets = useRockets();
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const eventOf = useEventMarks('rocket');
  const { hasMissing, isWanted } = useMissingHunts();
  const [target, setTarget] = useState<ToolPokemon | null>(null);
  const [query, setQuery] = useState('');
  const [onlyHunts, setOnlyHunts] = useState(() => params.get('onlyHunts') === '1');
  if (rockets.isPending) return <Spinner />;
  if (rockets.isError) return <Empty>{t.live_error}<br /><Button tone="ghost" className="mt-3" onClick={() => void rockets.refetch()}>{t.retry}</Button></Empty>;

  const q = normalize(query);
  const gruntTypeOf = (type: string): PokemonType | null => {
    const low = type.toLowerCase();
    return low in TYPE_COLORS ? (low as PokemonType) : null;
  };
  const hasWantedEncounter = (r: (typeof rockets.data)[number]) =>
    [r.firstPokemon, r.secondPokemon, r.thirdPokemon].flat().some((m) => m.isEncounter && isWanted(m.image, m.name, 'rocket', m.canBeShiny));

  const filtered = rockets.data.filter((r) => {
    if (onlyHunts && !hasWantedEncounter(r)) return false;
    if (!q) return true;
    const title = rocketName(r.name, lang, (ty) => typeName(ty, lang));
    const quote = rocketQuote(r.name, r.type);
    const mons = [r.firstPokemon, r.secondPokemon, r.thirdPokemon]
      .flat()
      .map((m) => {
        const p = fromImage(m.image, m.name);
        return `${m.name} ${p ? `${p.name.en} ${p.name.fr ?? ''}` : ''}`;
      })
      .join(' ');
    return normalize(`${title} ${r.name} ${r.type} ${quote ? `${quote.fr} ${quote.en}` : ''} ${mons}`).includes(q);
  });
  const leaders = filtered.filter((r) => !/Grunt/.test(r.name));
  const grunts = filtered.filter((r) => /Grunt/.test(r.name));
  const anyWanted = hasMissing && rockets.data.some(hasWantedEncounter);

  const card = (r: (typeof rockets.data)[number]) => {
    const gType = gruntTypeOf(r.type);
    const weak = gType ? weaknesses([gType]) : [];
    const wanted = hasWantedEncounter(r);
    const quote = rocketQuote(r.name, r.type);
    return (
      <li key={r.name} className={`card p-2.5 ${wanted ? 'ring-2 ring-go/60' : ''}`}>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-bold">{rocketName(r.name, lang, (ty) => typeName(ty, lang))}</p>
          {gType && <TypeBadge type={gType} small />}
          {wanted && <Badge tone="grass">{t.game_wanted_badge}</Badge>}
          {weak.length > 0 && (
            <span className="ml-auto flex flex-wrap items-center gap-1 text-[11px] text-ink-3">
              <span>{t.rocket_weak_to}</span>
              {weak.slice(0, 4).map((w) => <TypeBadge key={w.type} type={w.type} small />)}
            </span>
          )}
        </div>
        {quote && <p className="mb-2 text-xs italic text-ink-2">{lang === 'fr' ? quote.fr : quote.en}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {[r.firstPokemon, r.secondPokemon, r.thirdPokemon].map((slot, i) => (
            <div key={i} className="flex items-start gap-1 border-l border-line pl-2 first:border-0 first:pl-0">
              <span className="tnum mt-2 text-[10px] font-bold text-ink-3">{i + 1}</span>
              {slot.map((m) => {
                const p = fromImage(m.image, m.name);
                const monLabel = p ? local(p.name, lang) : m.name;
                const ev = eventOf(m.image, m.name);
                const monWanted = m.isEncounter && isWanted(m.image, m.name, 'rocket', m.canBeShiny);
                const tooltip = [monLabel, m.isEncounter ? t.rocket_catchable : '', ev ?? ''].filter(Boolean).join(' · ');
                return (
                  <button
                    key={`${m.image}-${m.name}`}
                    type="button"
                    disabled={!p}
                    onClick={() => p && setTarget(p)}
                    title={tooltip}
                    aria-label={tooltip}
                    className={`relative flex w-14 flex-col items-center rounded-lg p-1 text-center transition hover:bg-paper-2 disabled:opacity-40 ${
                      m.isEncounter ? 'ring-2 ring-shiny' : ''
                    } ${monWanted ? 'bg-go-soft/55' : ev ? (m.isEncounter ? 'bg-sky/15' : EVENT_MARK) : ''}`}
                  >
                    <img src={m.image} alt="" width={38} height={38} loading="lazy" decoding="async" className="h-9 w-9 object-contain" />
                    <span className="mt-0.5 w-full truncate text-[10px] font-semibold leading-tight text-ink-2">{monLabel}</span>
                    {monWanted && <span className="absolute -left-1 -top-1 rounded-full bg-go px-1 text-[8px] font-bold leading-3.5 text-white">★</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.rocket_search_quote}
          aria-label={t.rocket_search_quote}
          className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">
            ✕
          </button>
        )}
      </div>
      {anyWanted && (
        <div className="flex flex-wrap gap-2">
          <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)}>{t.game_my_hunts}</Chip>
        </div>
      )}
      <p className="flex items-center gap-2 text-sm text-ink-2"><span className="inline-block h-4 w-4 shrink-0 rounded ring-2 ring-shiny" aria-hidden="true" />{t.rocket_legend}</p>
      <EventLegend className="" marks={rockets.data.flatMap((r) => [r.firstPokemon, r.secondPokemon, r.thirdPokemon].flat().map((m) => eventOf(m.image, m.name)))} />
      {leaders.length === 0 && grunts.length === 0 && <Empty>{t.nothing_here}</Empty>}
      {leaders.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-bold">{t.rocket_leaders}</h2>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{leaders.map(card)}</ul>
        </section>
      )}
      {grunts.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-bold">{t.rocket_grunts}</h2>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{grunts.map(card)}</ul>
        </section>
      )}
      <CountersSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function CounterList({
  idx,
  tools,
  target,
  megas,
  setMegas,
  shadows,
  setShadows,
  noElite,
  setNoElite,
}: {
  idx: DatasetIndex;
  tools: ToolsData;
  target: ToolPokemon;
  megas: boolean;
  setMegas: (v: boolean) => void;
  shadows: boolean;
  setShadows: (v: boolean) => void;
  noElite: boolean;
  setNoElite: (v: boolean) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  // Hundos at level 40, the usual reference for raids.
  const cpm = idx.ds.pvp?.cpm[39] ?? 0.7903;
  const counters = useMemo(() => rankCounters(tools, { types: target.types, def: target.def }, { cpm, megas, shadows, noElite, limit: 12 }), [tools, target, cpm, megas, shadows, noElite]);
  const weak = weaknesses(target.types);
  const top = counters[0]?.score ?? 1;
  return (
    <section aria-label={t.counters_title(local(target.name, lang))} className="space-y-3 overflow-x-hidden pb-2">
      <div className="card flex items-center gap-3 p-3">
        <FormSprite idx={idx} p={target} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="min-w-0 flex-1 truncate font-bold">{local(target.name, lang)}</p>
            <Link to={`/dex/${target.dex}`} className="shrink-0 text-xs font-semibold text-sky hover:underline">{t.counters_dex_link} ›</Link>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">{target.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}</div>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-2">
            {t.counters_weak}
            {weak.map((w) => (
              <span key={w.type} className="inline-flex items-center gap-0.5"><TypeBadge type={w.type} small />{w.times > 2 && <span className="font-bold">×2</span>}</span>
            ))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-go" checked={shadows} onChange={(e) => setShadows(e.target.checked)} />
          {t.counters_shadows}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-go" checked={megas} onChange={(e) => setMegas(e.target.checked)} />
          {t.counters_megas}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-go" checked={noElite} onChange={(e) => setNoElite(e.target.checked)} />
          {t.counters_no_elite}
        </label>
      </div>
      <ol className="space-y-1.5">
        {counters.map((c, i) => (
          <li key={`${c.pokemon.key}${c.shadow ? '-shadow' : ''}`} className="card flex items-center gap-2 p-2">
            <span className="tnum w-5 shrink-0 text-center text-sm font-bold text-ink-3">{i + 1}</span>
            <Link to={`/dex/${c.pokemon.dex}`} className="shrink-0">
              <FormSprite idx={idx} p={c.pokemon} size={44} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold leading-snug">
                <Link to={`/dex/${c.pokemon.dex}`} className="truncate hover:underline">
                  {c.shadow && lang !== 'fr' && <span className="mr-1 text-shadow-ink">{t.counters_shadow}</span>}
                  {local(c.pokemon.name, lang)}
                  {c.shadow && lang === 'fr' && <span className="ml-1 text-shadow-ink">{t.counters_shadow}</span>}
                </Link>
                {c.elite && <Badge tone="datamined">{t.counters_elite}</Badge>}
              </p>
              <p className="truncate text-xs text-ink-2">{moveLabel(tools, c.quick, lang)} · {moveLabel(tools, c.charged, lang)}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full rounded-full bg-go" style={{ width: `${Math.min(100, Math.round((c.score / top) * 100))}%` }} />
              </div>
            </div>
            <span className="tnum w-14 shrink-0 text-right text-xs text-ink-3">{c.dps.toFixed(1)}<br />{t.counters_dps}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-3">{t.counters_note}</p>
    </section>
  );
}

/* ---------- Costs ---------- */

const TRADE_COST: Record<'regular' | 'new' | 'special' | 'specialNew', [number, number, number, number]> = {
  // Good, Great, Ultra, Best friend.
  regular: [100, 100, 100, 100],
  new: [20000, 16000, 1600, 800],
  special: [20000, 16000, 1600, 800],
  specialNew: [1000000, 800000, 80000, 40000],
};

export function CostsTool() {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const notesOf = useEvoNotes();
  const [pokemon, setPokemon] = useState<ToolPokemon | null>(null);
  const [from, setFrom] = useState(20);
  const [to, setTo] = useState(40);
  const [kind, setKind] = useState<PowerUpKind>('normal');
  if (typeof data === 'string') return <Loading state={data} />;
  const { idx, tools } = data;
  const pvp = idx.ds.pvp;
  const byKey = new Map(tools.pokemon.map((p) => [p.key, p]));
  const fmt = (n: number) => n.toLocaleString(lang);
  const levels = pvp ? Array.from({ length: (pvp.maxLevel - 1) * 2 + 1 }, (_, i) => 1 + i / 2) : [];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const cost = pvp ? powerUpCost(pvp, lo, hi, kind) : null;
  const presets: [number, number][] = [
    [15, 40],
    [20, 40],
    [20, 50],
    [25, 40],
    [25, 50],
    [40, 50],
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-bold">{t.costs_powerup}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">{t.costs_from}
            <select
              value={from}
              onChange={(e) => {
                const next = Number(e.target.value);
                setFrom(next);
                if (next > to) setTo(next);
              }}
              className="min-h-9 rounded-lg border border-line bg-card px-2"
            >
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">{t.costs_to}
            <select
              value={to}
              onChange={(e) => {
                const next = Number(e.target.value);
                setTo(next);
                if (next < from) setFrom(next);
              }}
              className="min-h-9 rounded-lg border border-line bg-card px-2"
            >
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([a, b]) => (
            <button
              key={`${a}-${b}`}
              type="button"
              onClick={() => { setFrom(a); setTo(b); }}
              className={`tnum rounded-lg border px-2 py-1 text-xs font-semibold transition ${from === a && to === b ? 'border-sky bg-sky/10 text-sky' : 'border-line bg-card text-ink-2 hover:border-ink-3'}`}
            >
              {a} → {b}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['normal', 'shadow', 'purified', 'lucky', 'luckyPurified'] as const).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)} className="min-h-8 px-2.5 text-xs">
              {t.costs_kind[k]}
            </Chip>
          ))}
        </div>
        {cost && (
          <dl className="card grid grid-cols-3 gap-2 p-3 text-center">
            <div><dt className="text-xs text-ink-3">{t.costs_stardust}</dt><dd className="tnum font-bold">{fmt(cost.stardust)}</dd></div>
            <div><dt className="text-xs text-ink-3">{t.costs_candy}</dt><dd className="tnum font-bold">{fmt(cost.candy)}</dd></div>
            <div><dt className="text-xs text-ink-3">{t.costs_xl}</dt><dd className="tnum font-bold">{fmt(cost.xlCandy)}</dd></div>
          </dl>
        )}
        {kind !== 'normal' && (
          <p className="text-xs text-ink-3">
            {t.costs_rounding_note}
            {(kind === 'purified' || kind === 'luckyPurified') && from < 25 ? ` ${t.costs_purified_note}` : ''}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">{t.costs_evolve}</h3>
        <PokemonPicker tools={tools} onPick={setPokemon} />
        {pokemon && (
          <div className="card space-y-2 p-3 text-sm">
            <Link to={`/dex/${pokemon.dex}`} className="flex items-center gap-2 hover:underline">
              <FormSprite idx={idx} p={pokemon} size={44} />
              <span className="font-bold">{local(pokemon.name, lang)}</span>
            </Link>
            {!pokemon.evolutions?.length && !pokemon.megaEnergy && <p className="text-ink-3">{t.costs_no_evolution}</p>}
            {pokemon.evolutions?.map((e) => {
              const into = byKey.get(e.to);
              const base = notesOf(tools, e);
              const notes = e.candyPurified ? `${base} (${t.costs_purified_short} ${e.candyPurified})` : base;
              return (
                <div key={e.to} className="flex items-center gap-2 border-t border-line pt-2">
                  {into && <Link to={`/dex/${into.dex}`} className="shrink-0"><FormSprite idx={idx} p={into} size={36} /></Link>}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      → {into ? <Link to={`/dex/${into.dex}`} className="hover:underline">{local(into.name, lang)}</Link> : e.to}
                    </p>
                    <p className="text-xs text-ink-2">{notes}</p>
                  </div>
                </div>
              );
            })}
            {pokemon.megaEnergy && (
              <p className="border-t border-line pt-2">
                {t.costs_mega(fmt(pokemon.megaEnergy[0]), fmt(pokemon.megaEnergy[1]))}
                {pokemon.megaMove && ` · ${t.costs_mega_move(moveLabel(tools, pokemon.megaMove, lang))}`}
              </p>
            )}
            {pokemon.secondMove && <p className="text-xs text-ink-2">{t.costs_second_move(fmt(pokemon.secondMove[0]), fmt(pokemon.secondMove[1]))}</p>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">{t.costs_trade}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-ink-3"><th className="py-1 text-left font-medium" />{t.costs_friendship.map((f) => <th key={f} className="px-1 py-1 text-right font-medium">{f}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {(['regular', 'new', 'special', 'specialNew'] as const).map((k) => (
                <tr key={k}><td className="py-1.5 pr-2">{t.costs_trade_kind[k]}</td>{TRADE_COST[k].map((n, i) => <td key={i} className="tnum px-1 py-1.5 text-right font-semibold">{fmt(n)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-3">{t.costs_trade_note}</p>
      </section>
    </div>
  );
}

/* ---------- Buddy distance ---------- */

export function BuddyTool() {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const [km, setKm] = useState<number | null>(null);
  const [picked, setPicked] = useState<ToolPokemon | null>(null);
  if (typeof data === 'string') return <Loading state={data} />;
  const { idx, tools } = data;
  // One per species (forms walk the same), preferring the plain base form over alternate forms.
  const speciesByDex = new Map<number, ToolPokemon>();
  for (const p of tools.pokemon) {
    if (!p.released || p.mega || !p.buddyKm) continue;
    if (!speciesByDex.has(p.dex) || !p.key.includes('.')) speciesByDex.set(p.dex, p);
  }
  const species = [...speciesByDex.values()];
  const distances = [...new Set(species.map((p) => p.buddyKm!))].sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{t.buddy_help}</p>
      <PokemonPicker tools={tools} releasedOnly onPick={setPicked} />
      {picked && (
        <div className="card flex items-center gap-3 p-3">
          <FormSprite idx={idx} p={picked} size={48} />
          <p className="flex-1 font-bold">{local(picked.name, lang)}</p>
          <span className="tnum text-lg font-bold">{picked.buddyKm ? t.buddy_km(picked.buddyKm) : '—'}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {distances.map((d) => <Chip key={d} active={km === d} onClick={() => setKm(km === d ? null : d)}>{t.buddy_km(d)} <span className="tnum text-ink-3">{species.filter((p) => p.buddyKm === d).length}</span></Chip>)}
      </div>
      {km !== null && (
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {species.filter((p) => p.buddyKm === km).map((p) => (
            <li key={p.key}>
              <Link to={`/dex/${p.dex}`} className="card flex flex-col items-center p-1 text-center">
                <FormSprite idx={idx} p={p} size={40} />
                <span className="line-clamp-1 text-[11px] font-semibold">{local(p.name, lang)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- GO Battle League ---------- */

/** "Great League: Mega Edition, Holiday Cup: Great League Edition | Season" -> the cups, without the season. */
export function cupsOf(name: string): string[] {
  return name.split(' | ')[0]!.split(/,\s*(?:and\s+)?|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
}

/** "Great League: Mega Edition" -> "Ligue Super : édition Méga", "Holiday Cup: Great League Edition" -> "Coupe Fêtes : édition Ligue Super". */
export function cupName(cup: string, lang: string): string {
  return cupNameFr(cup, lang);
}

export function LeagueTool() {
  const t = useT();
  const { lang } = useLang();
  const events = useEvents();
  if (events.isPending) return <Spinner />;
  if (events.isError) return <Empty>{t.live_error}<br /><Button tone="ghost" className="mt-3" onClick={() => void events.refetch()}>{t.retry}</Button></Empty>;
  const weeks = events.data
    .filter((e) => e.eventType === 'go-battle-league' && eventStatus(e) !== 'past')
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const date = (iso: string | null) => {
    if (!iso) return '?';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '?' : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  };
  const season = weeks[0]?.name.split(' | ')[1];
  return (
    <div className="space-y-3">
      {season && <p className="text-sm text-ink-2">{t.league_season(gblSeasonFr(season, lang))}</p>}
      {weeks.length === 0 && <Empty>{t.nothing_here}</Empty>}
      <ul className="space-y-2">
        {weeks.map((w) => {
          const now = eventStatus(w) === 'current';
          return (
            <li key={w.eventID} className={`card p-3 ${now ? 'ring-2 ring-go' : ''}`}>
              <p className="tnum text-xs text-ink-3">{date(w.start)} → {date(w.end)}{now && <span className="ml-2"><Badge tone="grass">{t.league_now}</Badge></span>}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {cupsOf(w.name).map((c) => <span key={c} className="rounded-full bg-paper-2 px-2.5 py-1 text-sm font-semibold">{cupName(c, lang)}</span>)}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-3">{t.league_note} <Link to="/pvp" className="font-semibold text-sky">{t.nav_pvp}</Link></p>
    </div>
  );
}

/* ---------- Special evolutions ---------- */

type Evo = NonNullable<ToolPokemon['evolutions']>[number];
type EvoGroup = 'moon' | 'time' | 'upside' | 'quest' | 'buddy' | 'item' | 'lure' | 'trade' | 'gender' | 'stats' | 'random' | 'nickname';
const EVO_ORDER: EvoGroup[] = ['moon', 'time', 'upside', 'quest', 'buddy', 'item', 'lure', 'trade', 'gender', 'stats', 'random', 'nickname'];
const EVO_ICON: Record<EvoGroup, string> = { moon: '🌕', time: '🌗', upside: '🙃', quest: '🎯', buddy: '🚶', item: '💎', lure: '🧲', trade: '🔁', gender: '⚥', stats: '📊', random: '🎲', nickname: '🏷️' };

/** The group an evolution goes in, by its most particular condition; null for candy alone. */
const evoGroup = (e: Evo): EvoGroup | null =>
  e.fullMoon ? 'moon' : e.daytime || e.nighttime || e.dusk ? 'time' : e.upsideDown ? 'upside' : e.quest && e.questText && !e.buddyKm ? 'quest' : e.buddyKm ? 'buddy' : e.item ? 'item' : e.lure ? 'lure' : e.tradeFree ? 'trade' : e.gender ? 'gender' : e.byStat ? 'stats' : e.random ? 'random' : null;
/** Its groups: the usual one, and Eevee's nickname trick besides. */
const evoGroups = (e: Evo): EvoGroup[] => [evoGroup(e), e.nickname ? ('nickname' as const) : null].filter((g): g is EvoGroup => !!g);

/** What it takes, in words: "pendant la pleine lune · 100 bonbons". */
function useEvoNotes() {
  const t = useT();
  const { lang } = useLang();
  return (tools: ToolsData, e: Evo) =>
    [
      e.fullMoon && t.evo_full_moon,
      e.daytime && t.costs_day,
      e.nighttime && t.costs_night,
      e.dusk && t.evo_dusk,
      e.upsideDown && t.evo_upside,
      e.questText && local(e.questText, lang),
      e.buddyKm && !e.questText && t.costs_buddy_km(e.buddyKm),
      e.item && `${e.itemCount ? `${e.itemCount} × ` : ''}${local(tools.items[e.item], lang, e.item)}`,
      e.lure && local(tools.items[e.lure], lang, e.lure),
      e.tradeFree && t.costs_trade_free,
      e.gender && (e.gender === 'm' ? t.evo_male : t.evo_female),
      e.byStat && t.evo_by_stat[e.byStat],
      e.random && t.evo_random,
      e.nickname && t.evo_nickname(e.nickname),
      e.candy && t.costs_candies(e.candy),
    ].filter(Boolean).join(' · ');
}

function EvoRow({ idx, from, to, notes }: { idx: DatasetIndex; from: ToolPokemon; to: ToolPokemon; notes: string }) {
  const { lang } = useLang();
  return (
    <li className="flex items-center gap-2">
      <Link to={`/dex/${from.dex}`} className="shrink-0"><FormSprite idx={idx} p={from} size={40} /></Link>
      <span className="text-ink-3" aria-hidden="true">→</span>
      <Link to={`/dex/${to.dex}`} className="shrink-0"><FormSprite idx={idx} p={to} size={40} /></Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{local(from.name, lang)} → {local(to.name, lang)}</p>
        <p className="text-xs text-ink-2">{notes}</p>
      </div>
    </li>
  );
}

/** Every evolution of released Pokémon, one per (species, form it becomes): Burmy's cloaks all evolve the same way. */
function evolutionLinks(tools: ToolsData) {
  const byKey = new Map(tools.pokemon.map((p) => [p.key, p]));
  const out: { from: ToolPokemon; to: ToolPokemon; e: Evo }[] = [];
  const seen = new Set<string>();
  for (const p of tools.pokemon) {
    if (!p.released || p.mega) continue;
    for (const e of p.evolutions ?? []) {
      const to = byKey.get(e.to);
      if (!to || seen.has(`${p.dex}>${e.to}`)) continue;
      seen.add(`${p.dex}>${e.to}`);
      out.push({ from: p, to, e });
    }
  }
  return out;
}

/** Pokémon that evolve in a particular way: full moon, day or night, a task, an item, a trade, a gender… */
export function EvolutionsTool() {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const notesOf = useEvoNotes();
  const [open, setOpen] = useState<EvoGroup | null>('moon');
  const [q, setQ] = useState('');
  const moons = useMemo(() => nextFullMoons(new Date(), 4), []);
  if (typeof data === 'string') return <Loading state={data} />;
  const { idx, tools } = data;
  // A search keeps the evolutions where either side matches, and opens every group that has some.
  const words = normalize(q).split(/\s+/).filter(Boolean);
  const matches = (p: ToolPokemon) => words.every((w) => (/^\d+$/.test(w) ? String(p.dex) === w : normalize(`${p.name.en} ${p.name.fr ?? ''}`).includes(w)));
  const groups = new Map<EvoGroup, ReturnType<typeof evolutionLinks>>();
  for (const link of evolutionLinks(tools)) {
    if (words.length && !matches(link.from) && !matches(link.to)) continue;
    for (const g of evoGroups(link.e)) (groups.get(g) ?? groups.set(g, []).get(g)!).push(link);
  }
  const when = (d: Date) => d.toLocaleString(lang, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t.evo_help}</p>
      <div className="relative">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search_placeholder} aria-label={t.evo_search} className="min-h-11 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3" />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">
            ✕
          </button>
        )}
      </div>
      {words.length > 0 && groups.size === 0 && <Empty>{t.evo_none(q.trim())}</Empty>}
      {EVO_ORDER.filter((g) => groups.has(g)).map((g) => {
        const isOpen = words.length > 0 || open === g;
        return (
          <section key={g} className="card overflow-hidden">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(open === g ? null : g)} className="flex w-full items-center gap-2 p-3 text-left">
              <span className="text-xl" aria-hidden="true">{EVO_ICON[g]}</span>
              <span className="flex-1 font-bold">{t.evo_group[g]}</span>
              <span className="tnum text-sm text-ink-3">{groups.get(g)!.length}</span>
            </button>
            {isOpen && (
              <div className="border-t border-line p-3">
                {g === 'moon' && (
                  <div className="mb-3 rounded-lg bg-paper-2 p-2 text-sm">
                    <p className="font-semibold">{t.evo_next_moons}</p>
                    <ul className="mt-1 space-y-0.5">{moons.map((d) => <li key={d.toISOString()} className="tnum">🌕 {when(d)}</li>)}</ul>
                  </div>
                )}
                <ul className="space-y-2">
                  {groups.get(g)!.map(({ from, to, e }) => <EvoRow key={`${from.key}>${to.key}`} idx={idx} from={from} to={to} notes={notesOf(tools, e)} />)}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * On a Pokémon's page: how it evolves and how it is evolved into, with what it takes (candy, and any particular
 * condition). Nothing for a Pokémon outside any evolution.
 */
export function EvolutionCard({ dex }: { dex: number }) {
  const t = useT();
  const { lang } = useLang();
  const tools = useTools();
  const dataset = useDataset();
  const notesOf = useEvoNotes();
  const links = useMemo(() => (tools.data ? evolutionLinks(tools.data).filter((l) => l.from.dex === dex || l.to.dex === dex) : []), [tools.data, dex]);
  if (!tools.data || !dataset.data || !links.length) return null;
  const moon = links.some((l) => l.e.fullMoon) ? nextFullMoons(new Date(), 1)[0] : null;
  return (
    <section aria-label={t.evo_card} className="card mb-4 p-3">
      <h2 className="mb-2 text-sm font-bold">{t.evo_card}</h2>
      <ul className="space-y-2">
        {links.map(({ from, to, e }) => <EvoRow key={`${from.key}>${to.key}`} idx={dataset.data!} from={from} to={to} notes={notesOf(tools.data!, e)} />)}
      </ul>
      {moon && <p className="mt-2 text-xs text-ink-2">🌕 {t.evo_next_moon(moon.toLocaleString(lang, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</p>}
    </section>
  );
}
