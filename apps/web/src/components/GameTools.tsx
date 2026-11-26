/** The Game tab's tools: best counters (raids, Team GO Rocket, any Pokémon), costs, buddy distances, the GO Battle League. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { nextFullMoons, powerUpCost, rankCounters, weaknesses, type ToolPokemon, type ToolsData } from '@mydexpogo/shared';
import { Sprite } from './Sprite.js';
import { TypeBadge } from './TypeBadge.js';
import { Badge, Chip, Empty, Sheet, Spinner } from './ui.js';
import { normalize, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { typeName, useLang, useT } from '../lib/i18n.js';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { eventStatus, eventTitle, useEvents, useRaids, type LivePokemon } from '../lib/live.js';
import { liveKey, local, moveLabel, rocketName, useRockets, useTools } from '../lib/tools.js';

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
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search_placeholder} aria-label={t.tools_pick} className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] placeholder:text-ink-3" />
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

/** Counters in a sheet over the page: seen at once, wherever the Pokémon was picked. */
export function CountersSheet({ target, onClose }: { target: ToolPokemon | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const [megas, setMegas] = useState(false);
  const [shadows, setShadows] = useState(true);
  return (
    <Sheet open={!!target} onClose={onClose} title={target ? t.counters_title(local(target.name, lang)) : ''}>
      {target && (typeof data === 'string' ? <Loading state={data} /> : <CounterList idx={data.idx} tools={data.tools} target={target} megas={megas} setMegas={setMegas} shadows={shadows} setShadows={setShadows} />)}
      {target && <Link to={`/dex/${target.dex}`} className="mt-1 block pb-2 text-center text-sm font-semibold text-sky">{t.counters_dex_link}</Link>}
    </Sheet>
  );
}

export function CountersTool() {
  const t = useT();
  const data = useToolData();
  const [target, setTarget] = useState<ToolPokemon | null>(null);
  if (typeof data === 'string') return <Loading state={data} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{t.counters_help}</p>
      <PokemonPicker tools={data.tools} onPick={setTarget} />
      <CountersSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

/** Team GO Rocket's current line-ups: three slots per trainer, the one to catch afterwards ringed in gold. */
export function RocketTab() {
  const t = useT();
  const { lang } = useLang();
  const rockets = useRockets();
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const eventOf = useEventMarks('rocket');
  const [target, setTarget] = useState<ToolPokemon | null>(null);
  if (rockets.isPending) return <Spinner />;
  if (rockets.isError) return <Empty>{t.live_error}</Empty>;
  const leaders = rockets.data.filter((r) => !/Grunt/.test(r.name));
  const grunts = rockets.data.filter((r) => /Grunt/.test(r.name));
  const card = (r: (typeof rockets.data)[number]) => (
    <li key={r.name} className="card p-2.5">
      <p className="mb-1.5 text-sm font-bold">{rocketName(r.name, lang, (ty) => typeName(ty, lang))}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {[r.firstPokemon, r.secondPokemon, r.thirdPokemon].map((slot, i) => (
          <div key={i} className="flex items-center gap-1 border-l border-line pl-2 first:border-0 first:pl-0">
            <span className="tnum text-[10px] font-bold text-ink-3">{i + 1}</span>
            {slot.map((m) => {
              const p = fromImage(m.image, m.name);
              return (
                <button key={m.image} type="button" disabled={!p} onClick={() => p && setTarget(p)} title={eventOf(m.image, m.name)} aria-label={`${p ? local(p.name, lang) : m.name}${m.isEncounter ? ` · ${t.rocket_catchable}` : ''}${eventOf(m.image, m.name) ? ` · ${eventOf(m.image, m.name)}` : ''}`} className={`rounded-lg p-0.5 hover:bg-paper-2 disabled:opacity-40 ${m.isEncounter ? 'ring-2 ring-shiny' : ''} ${eventOf(m.image, m.name) ? (m.isEncounter ? 'bg-sky/15' : EVENT_MARK) : ''}`}>
                  <img src={m.image} alt="" width={38} height={38} loading="lazy" decoding="async" className="object-contain" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </li>
  );
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-ink-2"><span className="inline-block h-4 w-4 shrink-0 rounded ring-2 ring-shiny" aria-hidden="true" />{t.rocket_legend}</p>
      <EventLegend className="" marks={rockets.data.flatMap((r) => [r.firstPokemon, r.secondPokemon, r.thirdPokemon].flat().map((m) => eventOf(m.image, m.name)))} />
      <section>
        <h2 className="mb-2 text-base font-bold">{t.rocket_leaders}</h2>
        <ul className="space-y-2">{leaders.map(card)}</ul>
      </section>
      <section>
        <h2 className="mb-2 text-base font-bold">{t.rocket_grunts}</h2>
        <ul className="space-y-2">{grunts.map(card)}</ul>
      </section>
      <CountersSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function CounterList({ idx, tools, target, megas, setMegas, shadows, setShadows }: { idx: DatasetIndex; tools: ToolsData; target: ToolPokemon; megas: boolean; setMegas: (v: boolean) => void; shadows: boolean; setShadows: (v: boolean) => void }) {
  const t = useT();
  const { lang } = useLang();
  // Hundos at level 40, the usual reference for raids.
  const cpm = idx.ds.pvp?.cpm[39] ?? 0.7903;
  const counters = useMemo(() => rankCounters(tools, { types: target.types, def: target.def }, { cpm, megas, shadows, limit: 12 }), [tools, target, cpm, megas, shadows]);
  const weak = weaknesses(target.types);
  const top = counters[0]?.dps ?? 1;
  return (
    <section aria-label={t.counters_title(local(target.name, lang))} className="space-y-3 pb-2">
      <div className="card flex items-center gap-3 p-3">
        <FormSprite idx={idx} p={target} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{local(target.name, lang)}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">{target.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}</div>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-2">
            {t.counters_weak}
            {weak.map((w) => (
              <span key={w.type} className="inline-flex items-center gap-0.5"><TypeBadge type={w.type} small />{w.times > 2 && <span className="font-bold">×2</span>}</span>
            ))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-go" checked={shadows} onChange={(e) => setShadows(e.target.checked)} />
          {t.counters_shadows}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-go" checked={megas} onChange={(e) => setMegas(e.target.checked)} />
          {t.counters_megas}
        </label>
      </div>
      <ol className="space-y-1.5">
        {counters.map((c, i) => (
          <li key={`${c.pokemon.key}${c.shadow ? '-shadow' : ''}`} className="card flex items-center gap-2 p-2">
            <span className="tnum w-6 text-center text-sm font-bold text-ink-3">{i + 1}</span>
            <FormSprite idx={idx} p={c.pokemon} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {c.shadow && <span className="mr-1 text-shadow-ink">{t.counters_shadow}</span>}
                {local(c.pokemon.name, lang)}
                {c.elite && <span className="ml-1 align-middle"><Badge tone="datamined">{t.counters_elite}</Badge></span>}
              </p>
              <p className="truncate text-xs text-ink-2">{moveLabel(tools, c.quick, lang)} · {moveLabel(tools, c.charged, lang)}</p>
              <div className="mt-1 h-1.5 rounded-full bg-paper-2"><div className="h-full rounded-full bg-go" style={{ width: `${Math.round((c.dps / top) * 100)}%` }} /></div>
            </div>
            <span className="tnum w-12 shrink-0 text-right text-xs text-ink-3">{c.dps.toFixed(1)}<br />{t.counters_dps}</span>
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
  const [pokemon, setPokemon] = useState<ToolPokemon | null>(null);
  const [from, setFrom] = useState(20);
  const [to, setTo] = useState(40);
  const [kind, setKind] = useState<'normal' | 'shadow' | 'purified' | 'lucky'>('normal');
  if (typeof data === 'string') return <Loading state={data} />;
  const { idx, tools } = data;
  const pvp = idx.ds.pvp;
  const byKey = new Map(tools.pokemon.map((p) => [p.key, p]));
  const fmt = (n: number) => n.toLocaleString(lang);
  const levels = pvp ? Array.from({ length: (pvp.maxLevel - 1) * 2 + 1 }, (_, i) => 1 + i / 2) : [];
  const raw = pvp ? powerUpCost(pvp, Math.min(from, to), Math.max(from, to)) : null;
  // Shadows cost 20 % more, purified 10 % less; a lucky Pokémon half the Stardust.
  const factor = { normal: [1, 1], shadow: [1.2, 1.2], purified: [0.9, 0.9], lucky: [0.5, 1] }[kind];
  const cost = raw && { stardust: Math.round(raw.stardust * factor[0]!), candy: Math.ceil(raw.candy * factor[1]!), xl: Math.ceil(raw.xlCandy * factor[1]!) };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-bold">{t.costs_powerup}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">{t.costs_from}
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="min-h-9 rounded-lg border border-line bg-card px-2">{levels.map((l) => <option key={l} value={l}>{l}</option>)}</select>
          </label>
          <label className="flex items-center gap-1">{t.costs_to}
            <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="min-h-9 rounded-lg border border-line bg-card px-2">{levels.map((l) => <option key={l} value={l}>{l}</option>)}</select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['normal', 'shadow', 'purified', 'lucky'] as const).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)} className="min-h-8 px-2.5 text-xs">{t.costs_kind[k]}</Chip>)}
        </div>
        {cost && (
          <dl className="card grid grid-cols-3 gap-2 p-3 text-center">
            <div><dt className="text-xs text-ink-3">{t.costs_stardust}</dt><dd className="tnum font-bold">{fmt(cost.stardust)}</dd></div>
            <div><dt className="text-xs text-ink-3">{t.costs_candy}</dt><dd className="tnum font-bold">{fmt(cost.candy)}</dd></div>
            <div><dt className="text-xs text-ink-3">{t.costs_xl}</dt><dd className="tnum font-bold">{fmt(cost.xl)}</dd></div>
          </dl>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">{t.costs_evolve}</h3>
        <PokemonPicker tools={tools} onPick={setPokemon} />
        {pokemon && (
          <div className="card space-y-2 p-3 text-sm">
            <div className="flex items-center gap-2">
              <FormSprite idx={idx} p={pokemon} size={44} />
              <span className="font-bold">{local(pokemon.name, lang)}</span>
            </div>
            {!pokemon.evolutions?.length && !pokemon.megaEnergy && <p className="text-ink-3">{t.costs_no_evolution}</p>}
            {pokemon.evolutions?.map((e) => {
              const into = byKey.get(e.to);
              const notes = [
                e.candy && t.costs_candies(e.candy) + (e.candyPurified ? ` (${t.costs_purified_short} ${e.candyPurified})` : ''),
                e.item && local(tools.items[e.item], lang, e.item),
                e.lure && local(tools.items[e.lure], lang, e.lure),
                e.buddyKm && t.costs_buddy_km(e.buddyKm),
                e.daytime && t.costs_day,
                e.nighttime && t.costs_night,
                e.tradeFree && t.costs_trade_free,
                e.quest && t.costs_quest,
              ].filter(Boolean);
              return (
                <div key={e.to} className="flex items-center gap-2 border-t border-line pt-2">
                  {into && <FormSprite idx={idx} p={into} size={36} />}
                  <div>
                    <p className="font-semibold">→ {into ? local(into.name, lang) : e.to}</p>
                    <p className="text-xs text-ink-2">{notes.join(' · ')}</p>
                  </div>
                </div>
              );
            })}
            {pokemon.megaEnergy && <p className="border-t border-line pt-2">{t.costs_mega(fmt(pokemon.megaEnergy[0]), fmt(pokemon.megaEnergy[1]))}</p>}
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
  // One per species (forms walk the same), released ones.
  const species = [...new Map(tools.pokemon.filter((p) => p.released && !p.mega && p.buddyKm).map((p) => [p.dex, p])).values()];
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

/** "Great League: Mega Edition" -> "Ligue Super : édition Méga", "Holiday Cup: Great League Edition" -> "Coupe Holiday : édition Ligue Super". */
export function cupName(cup: string, lang: string): string {
  if (lang !== 'fr') return cup;
  const league = (s: string) => s.replace(/Great League/g, 'Ligue Super').replace(/Ultra League/g, 'Ligue Hyper').replace(/Master League/g, 'Ligue Master');
  const [name, edition] = cup.split(/:\s*/);
  const head = league(name!).replace(/^(.+) Cup$/, 'Coupe $1');
  if (!edition) return head;
  const ed = league(edition.replace(/ Edition$/, '')).replace(/^Mega$/, 'Méga');
  return `${head} : édition ${ed}`;
}

export function LeagueTool() {
  const t = useT();
  const { lang } = useLang();
  const events = useEvents();
  if (events.isPending) return <Spinner />;
  if (events.isError) return <Empty>{t.live_error}</Empty>;
  const weeks = events.data
    .filter((e) => e.eventType === 'go-battle-league' && eventStatus(e) !== 'past')
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' }) : '?');
  const season = weeks[0]?.name.split(' | ')[1];
  return (
    <div className="space-y-3">
      {season && <p className="text-sm text-ink-2">{t.league_season(season)}</p>}
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
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search_placeholder} aria-label={t.evo_search} className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] placeholder:text-ink-3" />
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
      {moon && <p className="mt-2 text-xs text-ink-2">🌕 {t.evo_next_moon(moon.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</p>}
    </section>
  );
}
