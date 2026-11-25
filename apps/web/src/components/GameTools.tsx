/** The Game tab's tools: best counters (raids, Team GO Rocket, any Pokémon), costs, buddy distances, the GO Battle League. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { powerUpCost, rankCounters, weaknesses, type ToolPokemon, type ToolsData } from '@mydexpogo/shared';
import { Sprite } from './Sprite.js';
import { TypeBadge } from './TypeBadge.js';
import { Badge, Chip, Empty, Sheet, Spinner } from './ui.js';
import { normalize, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { typeName, useLang, useT } from '../lib/i18n.js';
import { eventStatus, useEvents, useRaids } from '../lib/live.js';
import { keyFromImage, local, moveLabel, rocketName, useRockets, useTools } from '../lib/tools.js';

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

type Target = { pokemon: ToolPokemon; label: string };

/** The Pokémon a Leek Duck picture shows, in the tools data ("…/pm354.fMEGA.icon.png" -> Mega Banette). */
function useFromImage(tools: ToolsData | undefined) {
  const byKey = useMemo(() => new Map((tools?.pokemon ?? []).map((p) => [p.key, p])), [tools]);
  return (image: string) => {
    const key = keyFromImage(image);
    return key ? byKey.get(key) ?? byKey.get(key.split('.')[0]!) : undefined;
  };
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
    </Sheet>
  );
}

export function CountersTool() {
  const t = useT();
  const { lang } = useLang();
  const data = useToolData();
  const raids = useRaids();
  const fromImage = useFromImage(typeof data === 'string' ? undefined : data.tools);
  const [source, setSource] = useState<'raids' | 'any'>('raids');
  const [target, setTarget] = useState<Target | null>(null);
  if (typeof data === 'string') return <Loading state={data} />;
  const { tools } = data;
  const pick = (p: ToolPokemon | undefined, label: string) => p && setTarget({ pokemon: p, label });

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{t.counters_help}</p>
      <div className="flex flex-wrap gap-2">
        {(['raids', 'any'] as const).map((s) => <Chip key={s} active={source === s} onClick={() => setSource(s)}>{t.counters_source[s]}</Chip>)}
      </div>

      {source === 'raids' && (
        raids.isPending ? <Spinner /> : raids.isError ? <Empty>{t.live_error}</Empty> : (
          <ul className="flex flex-wrap gap-2">
            {raids.data.map((b) => {
              const p = fromImage(b.image);
              return (
                <li key={b.name + b.tier}>
                  <button type="button" disabled={!p} onClick={() => pick(p, b.name)} className="card flex w-20 flex-col items-center p-1.5 text-center disabled:opacity-40">
                    <img src={b.image} alt="" width={44} height={44} className="object-contain" />
                    <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{p ? local(p.name, lang) : b.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      {source === 'any' && <PokemonPicker tools={tools} onPick={(p) => pick(p, local(p.name, lang))} />}
      <CountersSheet target={target?.pokemon ?? null} onClose={() => setTarget(null)} />
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
              const p = fromImage(m.image);
              return (
                <button key={m.image} type="button" disabled={!p} onClick={() => p && setTarget(p)} aria-label={`${p ? local(p.name, lang) : m.name}${m.isEncounter ? ` · ${t.rocket_catchable}` : ''}`} className={`rounded-lg p-0.5 hover:bg-paper-2 disabled:opacity-40 ${m.isEncounter ? 'ring-2 ring-shiny' : ''}`}>
                  <img src={m.image} alt="" width={38} height={38} className="object-contain" />
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
                {c.shadow && <span className="mr-1 text-[#8b3fc8] dark:text-[#c79bff]">{t.counters_shadow}</span>}
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
