import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BottleCaps } from '../components/BottleCaps.js';
import { EventFeed } from '../components/EventInfographic.js';
import { PageTourBanner, PageTourButton } from '../components/PageTour.js';
import { WhatsNewBanner } from '../components/WhatsNew.js';
import { useMe } from '../lib/auth.js';
import { normalize, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { Button, CopyButton } from '../components/ui.js';
import { Link, useSearchParams } from 'react-router';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Badge, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { localized, typeName, useLang, useT } from '../lib/i18n.js';
import { BuddyTool, CostsTool, CountersSheet, CountersTool, EVENT_MARK, EventLegend, EvolutionsTool, LeagueTool, RocketTab, useEventMarks, useEventSpawns, useFromImage, useKnownPokemon, useMissingHunts, type EventSpawns } from '../components/GameTools.js';
import { liveKey, rocketName, useRockets, useTools } from '../lib/tools.js';
import { cpmAt, cpOf, eventLabelFr, promoTextFr, researchTaskFr, weatherFr, type HuntSource, type ToolPokemon } from '@mydexpogo/shared';
import { TYPE_COLORS, TypeBadge } from '../components/TypeBadge.js';
import { RAID_TIERS, countdownOf, currentRaidBosses, raidSchedule, type CurrentBoss, type RaidTier, dexFromImage, eventStatus, eventTitle, liveName, formatRange, formatUntil, isMaxEvent, useEggs, useEvents, usePromoCodes, useRaids, useResearch, type GameEvent, type LivePokemon, type ResearchCategory, type ResearchReward } from '../lib/live.js';

type Tab = 'events' | 'hunts' | 'raids' | 'spawns' | 'max' | 'rocket' | 'research' | 'eggs' | 'tools';

const TABS: Tab[] = ['events', 'hunts', 'raids', 'spawns', 'max', 'rocket', 'research', 'eggs', 'tools'];

const raidSource = (b: { tier: RaidTier }): HuntSource => (b.tier === 'mega' ? 'megaRaid' : b.tier.startsWith('shadow') ? 'shadowRaid' : 'raid');

/** Ticks every 60 s so live countdown badges stay fresh while the Game tab stays open. */
function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function CountdownBadge({ e, now }: { e: { start?: string | null; end?: string | null }; now: number }) {
  const t = useT();
  const { lang } = useLang();
  const cd = countdownOf(e, lang, now);
  if (!cd) return null;
  return (
    <Badge tone={cd.kind === 'ends' ? 'grass' : 'datamined'}>
      {cd.kind === 'ends' ? t.countdown_ends_in(cd.text) : t.countdown_starts_in(cd.text)}
    </Badge>
  );
}

export function GamePage() {
  const t = useT();
  // The tab lives in the URL: coming back from a Pokémon page lands on the same tab.
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x === params.get('tab')) ?? 'events';
  const setTab = (id: Tab) => setParams(id === 'events' ? {} : { tab: id }, { replace: true });
  const labels: Record<Tab, string> = {
    events: t.tab_events,
    hunts: t.tab_hunts,
    raids: t.tab_raids,
    spawns: t.tab_spawns,
    max: t.tab_max,
    rocket: t.tab_rocket,
    research: t.tab_research,
    eggs: t.tab_eggs,
    tools: t.tab_tools,
  };
  return (
    <>
      <TopBar title={t.nav_game} actions={<PageTourButton page="game" />}>
        {/* Nine tabs scroll on phones, and wrap cleanly on desktop so every tab stays visible and clickable. */}
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-2 [mask-image:linear-gradient(to_right,#000_88%,transparent)] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-5 sm:[mask-image:none]" role="tablist">
          {TABS.map((id) => (
            <Chip
              key={id}
              role="tab"
              aria-selected={tab === id}
              active={tab === id}
              ref={(el) => { if (el && tab === id) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}
              onClick={() => setTab(id)}
            >
              {labels[id]}
            </Chip>
          ))}
        </div>
      </TopBar>
      <main className="mx-auto max-w-6xl px-3 pb-24 sm:px-5">
        <WhatsNewBanner />
        <PageTourBanner page="game" />
        {tab === 'events' && <Events />}
        {tab === 'hunts' && <MyHuntsOverview onGoTab={setTab} />}
        {tab === 'raids' && <Raids />}
        {tab === 'spawns' && <EventSpawnsTab />}
        {tab === 'max' && <MaxBattles />}
        {tab === 'rocket' && <RocketTab />}
        {tab === 'research' && <Research />}
        {tab === 'eggs' && <Eggs />}
        {tab === 'tools' && <Tools />}
        {tab !== 'tools' && <p className="mt-8 text-center text-xs text-ink-3">{t.live_source}</p>}
      </main>
    </>
  );
}

const TOOL_IDS = ['counters', 'evolutions', 'costs', 'buddy', 'league', 'caps'] as const;
type ToolId = (typeof TOOL_IDS)[number];

/** Small helpers for the game, one at a time, remembered in the URL so back from a Pokémon returns to the same tool. */
function Tools() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const urlTool = TOOL_IDS.find((x) => x === params.get('tool')) ?? 'counters';
  // Local state updates synchronously on click (no React Router transition lag); URL syncs Back/Forward navigation.
  const [tool, setToolState] = useState<ToolId>(urlTool);
  useEffect(() => {
    setToolState(urlTool);
  }, [urlTool]);
  const setTool = (id: ToolId) => {
    setToolState(id);
    setParams(id === 'counters' ? { tab: 'tools' } : { tab: 'tools', tool: id }, { replace: true });
  };
  const tools: readonly [ToolId, string][] = [
    ['counters', t.tool_counters],
    ['evolutions', t.tool_evolutions],
    ['costs', t.tool_costs],
    ['buddy', t.tool_buddy],
    ['league', t.tool_league],
    ['caps', t.tool_caps],
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {tools.map(([id, label]) => <Chip key={id} active={tool === id} onClick={() => setTool(id)}>{label}</Chip>)}
      </div>
      {tool === 'counters' && <CountersTool />}
      {tool === 'evolutions' && <EvolutionsTool />}
      {tool === 'costs' && <CostsTool />}
      {tool === 'buddy' && <BuddyTool />}
      {tool === 'league' && <LeagueTool />}
      {tool === 'caps' && <BottleCaps />}
    </>
  );
}

/** Small Pokémon picture from Leek Duck, linked to our Pokédex entry when the file name tells us the species. */
/** A Pokémon from Leek Duck; `event` names the event that brings it (blue), `wanted` highlights missing collection entries (green). */
function Mon({ p, size = 56, caption = true, event, wanted = false, regional = false, sub }: { p: LivePokemon; size?: number; caption?: boolean; event?: string; wanted?: boolean; regional?: boolean; sub?: string }) {
  const t = useT();
  const { lang } = useLang();
  const idx = useDataset().data;
  const dex = dexFromImage(p.image);
  const body = (
    <span className="flex flex-col items-center text-center">
      <span className="relative">
        <img src={p.image} alt="" width={size} height={size} loading="lazy" className="object-contain" style={{ width: size, height: size }} />
        {p.canBeShiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
        {wanted && (
          <span className="absolute -left-1 top-0 rounded-full bg-go px-1 text-[8px] font-bold leading-3.5 text-white" title={t.game_wanted_badge}>
            ★
          </span>
        )}
        {regional && (
          <span className="absolute -bottom-0.5 -right-1 text-[10px] leading-none" title={t.egg_regional} aria-label={t.egg_regional}>
            🌍
          </span>
        )}
      </span>
      {caption && <span className="mt-0.5 line-clamp-2 w-[4.5rem] text-[11px] font-semibold leading-tight">{liveName(p.name, p.image, idx, lang)}</span>}
      {sub && <span className="tnum w-[4.5rem] truncate text-[10px] font-semibold leading-tight text-ink-3">{sub}</span>}
    </span>
  );
  const look = `rounded-lg p-0.5 ${wanted ? 'bg-go-soft/50 ring-2 ring-go/70' : event ? EVENT_MARK : ''}`;
  const title = [wanted ? t.game_wanted_badge : '', regional ? t.egg_regional : '', event ?? ''].filter(Boolean).join(' · ') || undefined;
  return dex ? (
    <Link to={`/dex/${dex}`} title={title} className={`${look} hover:bg-paper-2`}>{body}</Link>
  ) : (
    <span title={title} className={look}>{body}</span>
  );
}

function Section({ title, count, subtitle, action, children }: { title: ReactNode; count?: number; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className={`${subtitle ? 'mb-0.5' : 'mb-2'} flex items-baseline gap-2`}>
        <h2 className="min-w-0 flex-1 text-base font-bold">
          {title} {count !== undefined && <span className="tnum font-normal text-ink-3">{count}</span>}
        </h2>
        {action}
      </div>
      {subtitle && <p className="mb-2 text-xs text-ink-3">{subtitle}</p>}
      {children}
    </section>
  );
}

/** Aggregated "For me" summary of everything currently active in the game that matches the player's missing hunts. */
function MyHuntsOverview({ onGoTab }: { onGoTab: (tab: Tab) => void }) {
  const t = useT();
  const { lang } = useLang();
  const now = useNowMinute();
  const me = useMe();
  const dataset = useDataset();
  const idx = dataset.data;
  const { hasMissing, isWanted, isWantedKey } = useMissingHunts();
  const raids = useRaids();
  const events = useEvents();
  const spawns = useEventSpawns();
  const rockets = useRockets();
  const research = useResearch();
  const eggs = useEggs();
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const [target, setTarget] = useState<ToolPokemon | null>(null);

  const wantedRaids = useMemo(
    () => currentRaidBosses(raids.data ?? [], events.data ?? []).filter((b) => isWanted(b.image, b.name, raidSource(b), b.canBeShiny)),
    [raids.data, events.data, isWanted],
  );

  const wantedSpawns = useMemo(() => {
    const out = new Map<string, { m: LivePokemon; event: string }>();
    for (const e of spawns.data ?? []) {
      if (eventStatus(e, now) !== 'current') continue;
      const evTitle = eventTitle(e.name, idx?.speciesByDex, lang);
      for (const m of [...e.featured, ...e.spawns]) {
        if (!out.has(m.image) && isWanted(m.image, m.name, 'wild', m.canBeShiny)) {
          out.set(m.image, { m, event: evTitle });
        }
      }
    }
    return [...out.values()].sort((a, b) => (dexFromImage(a.m.image) ?? 9999) - (dexFromImage(b.m.image) ?? 9999));
  }, [spawns.data, now, idx, lang, isWanted]);

  const wantedMax = useMemo(() => {
    if (!idx) return [];
    const list = (events.data ?? [])
      .filter((e) => isMaxEvent(e) && eventStatus(e, now) !== 'past')
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    const out: { event: GameEvent; gmax: boolean; species: typeof idx.ds.species }[] = [];
    for (const e of list) {
      const gmax = /gigantamax/i.test(e.name);
      const hay = ` ${e.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
      const matched = idx.ds.species.filter((sp) => {
        if (sp.name.en.length < 3 || !hay.includes(` ${sp.name.en.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `)) return false;
        const v = gmax ? idx.variantsByDex.get(sp.dex)?.find((x) => x.kind === 'gmax') : undefined;
        return isWantedKey(gmax ? (v?.key ?? `${sp.dex}.fGIGANTAMAX`) : String(sp.dex), gmax ? 'gmax' : 'max');
      });
      if (matched.length) out.push({ event: e, gmax, species: matched });
    }
    return out;
  }, [events.data, idx, now, isWantedKey]);

  const wantedRockets = useMemo(() => {
    const out: { trainer: string; mons: LivePokemon[] }[] = [];
    for (const r of rockets.data ?? []) {
      const mons = [r.firstPokemon, r.secondPokemon, r.thirdPokemon]
        .flat()
        .filter((m) => m.isEncounter && isWanted(m.image, m.name, 'rocket', m.canBeShiny));
      if (mons.length) out.push({ trainer: rocketName(r.name, lang, (ty) => typeName(ty, lang)), mons });
    }
    return out;
  }, [rockets.data, lang, isWanted]);

  const wantedResearch = useMemo(() => {
    const out: { text: string; rewards: LivePokemon[] }[] = [];
    for (const c of research.data ?? []) {
      for (const task of c.tasks) {
        const rewards = task.rewards.filter((r) => r.kind === 'encounter' && isWanted(r.image, r.name, 'research', r.canBeShiny));
        if (rewards.length) {
          out.push({ text: lang === 'fr' ? (task.textFr ?? researchTaskFr(task.text, idx?.speciesByDex, 'fr')) : task.text, rewards });
        }
      }
    }
    return out;
  }, [research.data, lang, idx, isWanted]);

  const wantedEggs = useMemo(
    () => (eggs.data ?? []).filter((m) => isWanted(m.image, m.name, 'egg', m.canBeShiny)),
    [eggs.data, isWanted],
  );

  if (me.isPending || dataset.isPending) return <Spinner />;
  if (!me.data) {
    return (
      <Empty>
        {t.hunts_login}
        <br />
        <Link to="/login" className="mt-3 inline-block"><Button tone="primary">{t.login}</Button></Link>
      </Empty>
    );
  }
  const allLoading = raids.isPending && spawns.isPending && events.isPending && rockets.isPending && research.isPending && eggs.isPending;
  if (allLoading) return <Spinner />;

  const total =
    wantedRaids.length +
    wantedSpawns.length +
    wantedMax.length +
    wantedRockets.length +
    wantedResearch.length +
    wantedEggs.length;

  const pickTarget = (image: string, bossName: string) => {
    const found = fromImage(image, bossName) ?? tools.data?.pokemon.find((p) => p.dex === dexFromImage(image) && !p.mega);
    if (found) setTarget(found);
  };
  const goBtn = (tab: Tab) => (
    <button type="button" onClick={() => onGoTab(tab)} className="shrink-0 text-xs font-semibold text-sky hover:underline">
      {t.hunts_see_tab} ›
    </button>
  );

  return (
    <>
      <p className="mb-3 text-sm text-ink-2">{t.hunts_intro}</p>
      {(!hasMissing || total === 0) && <Empty>{t.hunts_empty}</Empty>}

      {wantedRaids.length > 0 && (
        <Section title={t.tab_raids} count={wantedRaids.length} action={goBtn('raids')}>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {wantedRaids.map((b) => (
              <li key={b.image + b.tier}>
                <button
                  type="button"
                  onClick={() => pickTarget(b.image, b.name)}
                  className="card flex w-full items-center gap-3 p-2 text-left ring-2 ring-go/60 transition active:scale-[0.99]"
                >
                  <img src={b.image} alt="" width={48} height={48} loading="lazy" className="shrink-0 object-contain" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                      <span className="truncate">{liveName(b.name, b.image, idx, lang)}</span>
                      {b.canBeShiny && <Sparkle className="shrink-0 text-shiny" />}
                      <Badge tone="muted">{t.raid_tier[b.tier]}</Badge>
                    </div>
                    {b.end && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                        <span>{formatUntil(b.end, lang)}</span>
                        <CountdownBadge e={{ end: b.end }} now={now} />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {wantedSpawns.length > 0 && (
        <Section title={t.tab_spawns} count={wantedSpawns.length} action={goBtn('spawns')}>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
            {wantedSpawns.map(({ m, event }) => (
              <li key={m.image} className="flex flex-col items-center">
                <Mon p={m} wanted />
                <span className="mt-0.5 line-clamp-1 w-[4.5rem] text-center text-[10px] text-ink-3">{event}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {wantedMax.length > 0 && idx && (
        <Section title={t.tab_max} count={wantedMax.length} action={goBtn('max')}>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {wantedMax.map(({ event: e, gmax, species }) => (
              <li key={e.eventID} className="card p-3 ring-2 ring-go/60">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                  <Badge tone={gmax ? 'shiny' : 'datamined'}>{gmax ? t.kinds.gmax : t.tag_dynamax}</Badge>
                  <CountdownBadge e={e} now={now} />
                  <span>{formatRange(e.start, e.end, lang)}</span>
                </div>
                <div className="mt-1 font-semibold">{eventTitle(e.name, idx.speciesByDex, lang)}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {species.map((sp) => {
                    const cover = idx.coverOf.get(sp.dex);
                    const v = gmax ? idx.variantsByDex.get(sp.dex)?.find((x) => x.kind === 'gmax') ?? cover : cover;
                    return v ? (
                      <Link key={sp.dex} to={`/dex/${sp.dex}`} className="flex flex-col items-center rounded-lg bg-go-soft/50 p-1 text-center ring-2 ring-go/60">
                        <Sprite idx={idx} variant={v} size={48} />
                        <span className="w-[4.5rem] truncate text-[11px] font-semibold">{localized(sp.name, lang)}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {wantedRockets.length > 0 && (
        <Section title={t.tab_rocket} count={wantedRockets.length} action={goBtn('rocket')}>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {wantedRockets.map((r) => (
              <li key={r.trainer} className="card p-2.5 ring-2 ring-go/60">
                <p className="mb-1.5 text-sm font-bold">{r.trainer}</p>
                <div className="flex flex-wrap gap-2">
                  {r.mons.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} size={48} wanted />)}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {wantedResearch.length > 0 && (
        <Section title={t.tab_research} count={wantedResearch.length} action={goBtn('research')}>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {wantedResearch.map((task, ti) => (
              <li key={`${task.text}-${ti}`} className="card p-3 ring-2 ring-go/60">
                <div className="text-sm font-semibold">{task.text}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {task.rewards.map((r, i) => <Mon key={`${r.image}-${i}`} p={r} size={48} wanted />)}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {wantedEggs.length > 0 && (
        <Section title={t.tab_eggs} count={wantedEggs.length} action={goBtn('eggs')}>
          <div className="flex flex-wrap gap-2">
            {wantedEggs.map((m, i) => (
              <Mon key={`${m.name}-${m.eggType}-${i}`} p={m} wanted regional={m.isRegional} sub={m.eggType} />
            ))}
          </div>
        </Section>
      )}

      <CountersSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function Raids() {
  const t = useT();
  const { lang } = useLang();
  const now = useNowMinute();
  // A boss opens its best counters.
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const known = useKnownPokemon();
  const eventOf = useEventMarks('raids');
  const { hasMissing, isWanted } = useMissingHunts();
  const [target, setTarget] = useState<ToolPokemon | null>(null);
  const [tierFilter, setTierFilter] = useState<RaidTier | 'all'>('all');
  const [onlyHunts, setOnlyHunts] = useState(false);
  const raids = useRaids();
  const events = useEvents();
  const dataset = useDataset();
  const idx = dataset.data;
  // This week's bosses by level (the announcements win over Leek Duck's lagging list), then Raid Hours, then what comes.
  const bosses = useMemo(() => currentRaidBosses(raids.data ?? [], events.data ?? []), [raids.data, events.data]);
  const { moments, next } = useMemo(() => raidSchedule(events.data ?? []), [events.data]);
  if (raids.isPending) return <Spinner />;
  if (raids.isError && !bosses.length) return <LiveError retry={() => void raids.refetch()} />;
  const name = (n: string, image: string) => liveName(n, image, idx, lang);
  const pickTarget = (image: string, bossName: string) => {
    const found = fromImage(image, bossName) ?? tools.data?.pokemon.find((p) => p.dex === dexFromImage(image) && !p.mega);
    if (found) setTarget(found);
  };
  /** Unified types for every raid boss (Leek Duck types, else exact form/Mega from tools, else Pokédex). */
  const typesOf = (b: { image: string; name: string; types?: { name: string }[] }) => {
    const fromLd = (b.types ?? []).map((ty) => ty.name.toLowerCase()).filter((ty) => ty in TYPE_COLORS);
    if (fromLd.length) return fromLd;
    const fromTools = fromImage(b.image, b.name)?.types;
    if (fromTools?.length) return fromTools;
    const key = liveKey(b.image, b.name, known);
    const v = key ? idx?.variantByKey.get(key) ?? idx?.variantByKey.get(key.replace(/\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/, '')) : undefined;
    return v ? v.types ?? idx?.speciesByDex.get(v.dex)?.types ?? [] : [];
  };
  const cpLine = (b: { image: string; name: string; combatPower?: CurrentBoss['combatPower'] }, compact = false) => {
    const cp = b.combatPower ? { normal: [b.combatPower.normal.min, b.combatPower.normal.max], boosted: [b.combatPower.boosted.min, b.combatPower.boosted.max] } : idx ? raidCatchCp(idx, liveKey(b.image, b.name, known)) : null;
    return cp ? (
      <div className="tnum text-xs text-ink-2">
        <span className="font-bold text-ink">{t.game_hundo} {cp.normal[1]}</span>
        <span className="text-ink-3"> ({cp.boosted[1]} {t.boosted.toLowerCase()})</span>
        {!compact && <span className="hidden text-ink-3 sm:inline"> · PC {cp.normal[0]}–{cp.normal[1]}</span>}
      </div>
    ) : null;
  };
  const upcomingSource = (eventName: string, bossName: string): HuntSource =>
    /shadow/i.test(eventName) || /^shadow /i.test(bossName) ? 'shadowRaid' : /\bmega\b|primal/i.test(`${eventName} ${bossName}`) ? 'megaRaid' : 'raid';
  const allTiers = RAID_TIERS.filter((tier) => bosses.some((b) => b.tier === tier));
  const anyWanted = hasMissing && bosses.some((b) => isWanted(b.image, b.name, raidSource(b), b.canBeShiny));
  const visibleBosses = bosses.filter((b) => (tierFilter === 'all' || b.tier === tierFilter) && (!onlyHunts || isWanted(b.image, b.name, raidSource(b), b.canBeShiny)));
  const tiers = allTiers.filter((tier) => visibleBosses.some((b) => b.tier === tier));

  return (
    <>
      <p className="mb-2 text-sm text-ink-2">{t.raids_tap_hint}</p>
      {(allTiers.length > 1 || anyWanted) && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
          {anyWanted && (
            <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)} className="min-h-8 shrink-0 px-2.5 text-xs">
              {t.game_my_hunts}
            </Chip>
          )}
          {allTiers.length > 1 && (
            <>
              <Chip active={tierFilter === 'all'} onClick={() => setTierFilter('all')} className="min-h-8 shrink-0 px-2.5 text-xs">{t.filter_all}</Chip>
              {allTiers.map((tier) => (
                <Chip key={tier} active={tierFilter === tier} onClick={() => setTierFilter(tierFilter === tier ? 'all' : tier)} className="min-h-8 shrink-0 px-2.5 text-xs">
                  {t.raid_tier[tier]}
                </Chip>
              ))}
            </>
          )}
        </div>
      )}
      <EventLegend marks={visibleBosses.map((b) => eventOf(b.image, b.name))} />
      {tiers.length === 0 && <Empty>{t.nothing_here}</Empty>}
      {tiers.map((tier) => {
        const list = visibleBosses.filter((b) => b.tier === tier);
        return (
          <Section key={tier} title={t.raid_tier[tier]} count={list.length}>
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {list.map((b) => {
                const wanted = isWanted(b.image, b.name, raidSource(b), b.canBeShiny);
                return (
                  <li key={b.image + b.tier}>
                    <button
                      type="button"
                      onClick={() => pickTarget(b.image, b.name)}
                      aria-label={t.counters_title(name(b.name, b.image))}
                      className={`card flex w-full items-center gap-3 p-2 text-left transition active:scale-[0.99] ${wanted ? 'ring-2 ring-go/65' : eventOf(b.image, b.name) ? EVENT_MARK : ''}`}
                    >
                      <img src={b.image} alt="" width={56} height={56} loading="lazy" className="shrink-0 object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{name(b.name, b.image)}</span>
                          {b.canBeShiny && <Sparkle className="shrink-0 text-shiny" />}
                          {wanted && <Badge tone="grass">{t.game_wanted_badge}</Badge>}
                        </div>
                        {cpLine(b)}
                        {b.end && (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-go-ink dark:text-go">
                            <span>{formatUntil(b.end, lang)}</span>
                            <CountdownBadge e={{ end: b.end }} now={now} />
                          </div>
                        )}
                        {eventOf(b.image, b.name) && <div className="truncate text-xs font-semibold text-sky">{eventOf(b.image, b.name)}</div>}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {typesOf(b).map((ty) => <TypeBadge key={ty} type={ty} small />)}
                        {b.boostedWeather?.map((w) => {
                          const wLabel = weatherFr(w.name, lang);
                          return <img key={w.name} src={w.image} alt={wLabel} title={wLabel} width={20} height={20} loading="lazy" decoding="async" className="opacity-70" />;
                        })}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}

      {moments.length > 0 && (
        <Section title={t.raid_moments} count={moments.length}>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {moments.map((e) => (
              <li key={e.eventID} className="card flex items-center gap-3 p-3">
                <span className="text-xl" aria-hidden="true">{e.eventType === 'raid-hour' ? '⏰' : '📅'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{eventTitle(e.name, idx?.speciesByDex, lang)}</span>
                  <span className="block text-xs text-ink-2">{formatRange(e.start, e.end, lang)}</span>
                </span>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {eventStatus(e, now) === 'current' && <Badge tone="grass">{t.raid_moment_now}</Badge>}
                  <CountdownBadge e={e} now={now} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t.raids_upcoming} count={next.length}>
        {next.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {next.map((e) => (
            <li key={e.eventID} className="card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <span>{formatRange(e.start, e.end, lang)}</span>
                <CountdownBadge e={e} now={now} />
              </div>
              <div className="mt-1 font-semibold">{eventTitle(e.name, idx?.speciesByDex, lang)}</div>
              {!!e.extraData?.raidbattles?.bosses?.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.extraData.raidbattles.bosses.map((b, i) => {
                    const wanted = isWanted(b.image, b.name, upcomingSource(e.name, b.name), b.canBeShiny);
                    return (
                      <button
                        key={`${b.name}-${i}`}
                        type="button"
                        onClick={() => pickTarget(b.image, b.name)}
                        title={wanted ? t.game_wanted_badge : undefined}
                        className={`flex w-24 flex-col items-center rounded-lg p-1 text-center hover:bg-paper-2 ${wanted ? 'bg-go-soft/50 ring-2 ring-go/70' : ''}`}
                      >
                        <span className="relative">
                          <img src={b.image} alt="" width={56} height={56} loading="lazy" className="object-contain" />
                          {b.canBeShiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
                          {wanted && <span className="absolute -left-1 top-0 rounded-full bg-go px-1 text-[8px] font-bold leading-3.5 text-white">★</span>}
                        </span>
                        <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{name(b.name, b.image)}</span>
                        {cpLine({ image: b.image, name: b.name }, true)}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <CountersSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

const HIDDEN_PROMOS_KEY = 'hiddenPromoCodes';

function readHiddenPromos(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_PROMOS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveHiddenPromos(codes: string[]) {
  try {
    if (codes.length) localStorage.setItem(HIDDEN_PROMOS_KEY, JSON.stringify(codes));
    else localStorage.removeItem(HIDDEN_PROMOS_KEY);
  } catch {}
}

function Events() {
  const t = useT();
  const { lang } = useLang();
  const now = useNowMinute();
  const idx = useDataset().data;
  const promo = usePromoCodes();
  const [promoOpen, setPromoOpen] = useState(false);
  const [hiddenCodes, setHiddenCodes] = useState<string[]>(readHiddenPromos);

  const allPromos = promo.data ?? [];
  const hiddenSet = useMemo(() => new Set(hiddenCodes), [hiddenCodes]);
  const visiblePromos = allPromos.filter((c) => !hiddenSet.has(c.code));
  const hiddenCount = allPromos.length - visiblePromos.length;

  const hidePromos = (codes: string[]) => {
    const next = [...new Set([...hiddenCodes, ...codes])];
    setHiddenCodes(next);
    saveHiddenPromos(next);
  };
  const restorePromos = () => {
    setHiddenCodes([]);
    saveHiddenPromos([]);
  };

  return (
    <>
      {visiblePromos.length > 0 && (
        <section className="card mb-4 overflow-hidden">
          <div className="flex items-center">
            <button
              type="button"
              aria-expanded={promoOpen}
              onClick={() => setPromoOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-paper-2/50"
            >
              <span className="text-base" aria-hidden="true">🎁</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.promo_title}</span>
              <Badge tone="grass">{visiblePromos.length}</Badge>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`shrink-0 text-ink-3 transition-transform ${promoOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { hidePromos(visiblePromos.map((c) => c.code)); setPromoOpen(false); }}
              className="mr-2 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-ink-3 transition hover:bg-paper-2 hover:text-ink"
            >
              {t.promo_hide_all}
            </button>
          </div>
          {promoOpen && (
            <div className="border-t border-line p-3">
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {visiblePromos.map((c) => (
                  <li key={c.code} className="rounded-xl border border-line bg-paper-2/35 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 font-semibold">{promoTextFr(c.title, idx?.speciesByDex, lang)}</div>
                      <button
                        type="button"
                        aria-label={`${t.promo_hide_one} ${c.code}`}
                        title={t.promo_hide_one}
                        onClick={() => hidePromos([c.code])}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-ink-3 transition hover:bg-card hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                    {c.rewards.length > 0 && (
                      <div className="mt-0.5 text-xs text-ink-2">
                        {c.rewards.map((r) => promoTextFr(r, idx?.speciesByDex, lang)).join(' · ')}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-lg bg-card px-2 py-1.5 text-sm">{c.code}</code>
                      <CopyButton className="min-h-9 px-3 text-sm" text={c.code} />
                      <a href={c.redeemUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-xl bg-go px-3 text-sm font-semibold text-white">{t.redeem}</a>
                    </div>
                  </li>
                ))}
              </ul>
              {hiddenCount > 0 && (
                <div className="mt-2.5 flex items-center justify-end gap-2 text-xs text-ink-3">
                  <span>{t.promo_hidden_count(hiddenCount)}</span>
                  <button type="button" onClick={restorePromos} className="font-semibold text-sky hover:underline">
                    {t.promo_show_hidden}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <EventFeed now={now} />

      {visiblePromos.length === 0 && hiddenCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-3">
          <span>🎁 {t.promo_hidden_count(hiddenCount)}</span>
          <button type="button" onClick={restorePromos} className="font-semibold text-sky hover:underline">
            {t.promo_show_hidden}
          </button>
        </div>
      )}
    </>
  );
}

/** Max Battles: current and upcoming Dynamax / Gigantamax events, with the Pokémon named in them. */
function MaxBattles() {
  const t = useT();
  const { lang } = useLang();
  const nowMs = useNowMinute();
  const events = useEvents();
  const dataset = useDataset();
  const { hasMissing, isWantedKey } = useMissingHunts();
  const [onlyHunts, setOnlyHunts] = useState(false);
  const list = useMemo(() => (events.data ?? []).filter((e) => isMaxEvent(e) && eventStatus(e) !== 'past').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')), [events.data]);
  if (events.isPending) return <Spinner />;
  if (events.isError) return <LiveError retry={() => void events.refetch()} />;
  const idx = dataset.data;
  /** Species named in an event title, matched on English names (Leek Duck writes English). */
  const named = (name: string) => {
    if (!idx) return [];
    const hay = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    return idx.ds.species.filter((s) => s.name.en.length >= 3 && hay.includes(` ${s.name.en.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `));
  };
  const isMaxSpeciesWanted = (dex: number, gmax: boolean) => {
    const v = gmax ? idx?.variantsByDex.get(dex)?.find((x) => x.kind === 'gmax') : undefined;
    return isWantedKey(gmax ? (v?.key ?? `${dex}.fGIGANTAMAX`) : String(dex), gmax ? 'gmax' : 'max');
  };
  const eventHasWanted = (e: GameEvent) => {
    const gmax = /gigantamax/i.test(e.name);
    return named(e.name).some((sp) => isMaxSpeciesWanted(sp.dex, gmax));
  };
  const anyWanted = hasMissing && list.some(eventHasWanted);
  const visible = onlyHunts ? list.filter(eventHasWanted) : list;
  const now = visible.filter((e) => eventStatus(e) === 'current');
  const upcoming = visible.filter((e) => eventStatus(e) === 'upcoming');
  const block = (title: string, items: GameEvent[]) => (
    <Section title={title} count={items.length}>
      {items.length === 0 && <p className="text-sm text-ink-3">{t.max_empty}</p>}
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {items.map((e) => {
          const species = named(e.name);
          const gmax = /gigantamax/i.test(e.name);
          return (
            <li key={e.eventID} className="card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <Badge tone={gmax ? 'shiny' : 'datamined'}>{gmax ? t.kinds.gmax : t.tag_dynamax}</Badge>
                <CountdownBadge e={e} now={nowMs} />
                <span>{formatRange(e.start, e.end, lang)}</span>
              </div>
              <div className="mt-1 font-semibold">{eventTitle(e.name, dataset.data?.speciesByDex, lang)}</div>
              {species.length > 0 && idx && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {species.map((sp) => {
                    const cover = idx.coverOf.get(sp.dex);
                    const v = gmax ? idx.variantsByDex.get(sp.dex)?.find((x) => x.kind === 'gmax') ?? cover : cover;
                    const wanted = isMaxSpeciesWanted(sp.dex, gmax);
                    return v ? (
                      <Link key={sp.dex} to={`/dex/${sp.dex}`} title={wanted ? t.game_wanted_badge : undefined} className={`flex flex-col items-center rounded-lg p-0.5 text-center ${wanted ? 'bg-go-soft/50 ring-2 ring-go/70' : ''}`}>
                        <span className="relative">
                          <Sprite idx={idx} variant={v} size={56} />
                          {wanted && <span className="absolute -left-1 top-0 rounded-full bg-go px-1 text-[8px] font-bold leading-3.5 text-white">★</span>}
                        </span>
                        <span className="w-[4.5rem] truncate text-[11px] font-semibold">{localized(sp.name, lang)}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
              <a href={e.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-sky">{t.open_leekduck}</a>
            </li>
          );
        })}
      </ul>
    </Section>
  );
  return (
    <>
      {anyWanted && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)} className="min-h-8 px-2.5 text-xs">{t.game_my_hunts}</Chip>
        </div>
      )}
      {block(t.max_now, now)}
      {block(t.max_upcoming, upcoming)}
    </>
  );
}

function Research() {
  const t = useT();
  const { lang } = useLang();
  const q = useResearch();
  const dataset = useDataset();
  const { hasMissing, isWanted } = useMissingHunts();
  const [items, setItems] = useState(true);
  const [encountersOnly, setEncountersOnly] = useState(false);
  const [shinyOnly, setShinyOnly] = useState(false);
  const [onlyHunts, setOnlyHunts] = useState(false);
  const [query, setQuery] = useState('');
  const eventOf = useEventMarks('research');
  if (q.isPending) return <Spinner />;
  if (q.isError) return <LiveError retry={() => void q.refetch()} />;
  const idx = dataset.data;
  const speciesName = (dex: number | undefined, fallback: string) => (dex && idx ? localized(idx.speciesByDex.get(dex)?.name, lang) || fallback : fallback);
  /** French names for items, candy and Mega Energy; Leek Duck writes English. */
  const rewardName = (r: ResearchReward) => {
    const candy = /^(.*) Candy( XL)?$/.exec(r.name);
    if (r.kind === 'resource' && candy) return t.candy_of(speciesName(r.dex, candy[1]!), !!candy[2]);
    const energy = /^(.*) Mega Energy$/.exec(r.name);
    if (r.kind === 'resource' && energy) return t.mega_energy_of(speciesName(r.dex, energy[1]!));
    return t.items[r.name] ?? (lang === 'fr' ? r.nameFr : undefined) ?? r.name;
  };
  const normQ = normalize(query);
  const anyWanted = hasMissing && q.data.some((c) => c.tasks.some((task) => task.rewards.some((r) => r.kind === 'encounter' && isWanted(r.image, r.name, 'research', r.canBeShiny))));
  const filterCategory = (c: ResearchCategory): ResearchCategory => ({
    ...c,
    tasks: c.tasks.filter((task) => {
      const encs = task.rewards.filter((r) => r.kind === 'encounter');
      if (encountersOnly && !encs.length) return false;
      if (shinyOnly && !encs.some((r) => r.canBeShiny)) return false;
      if (onlyHunts && !encs.some((r) => isWanted(r.image, r.name, 'research', r.canBeShiny))) return false;
      if (!normQ) return true;
      const taskLabel = lang === 'fr' ? (task.textFr ?? researchTaskFr(task.text, idx?.speciesByDex, 'fr')) : task.text;
      const hay = normalize([task.text, task.textFr ?? '', taskLabel, ...task.rewards.map((r) => `${r.name} ${r.kind === 'encounter' ? liveName(r.name, r.image, idx, lang) : rewardName(r)}`)].join(' '));
      return hay.includes(normQ);
    }),
  });
  const block = (c: ResearchCategory) => (
    <Section key={c.title} title={c.event ? eventTitle(c.title.replace(/ Tasks$/, ''), idx?.speciesByDex, lang) : (t.research_types[c.title] ?? eventLabelFr(c.title.replace(/ Tasks$/, ''), lang, idx?.speciesByDex))} count={c.tasks.length}>
      {c.end && <p className="-mt-1 mb-2 text-xs text-ink-3">{formatUntil(c.end, lang)}</p>}
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {c.tasks.map((task, ti) => (
          <li key={`${task.text}-${ti}`} className="card p-3">
            <div className="text-sm font-semibold">{lang === 'fr' ? (task.textFr ?? researchTaskFr(task.text, idx?.speciesByDex, 'fr')) : task.text}</div>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {task.rewards.map((r, i) =>
                r.kind === 'encounter' ? (
                  <Mon
                    key={`${r.name}-${i}`}
                    p={r}
                    size={48}
                    event={eventOf(r.image, r.name)}
                    wanted={isWanted(r.image, r.name, 'research', r.canBeShiny)}
                    sub={r.combatPower?.max ? `${t.game_hundo} ${r.combatPower.max}` : undefined}
                  />
                ) : items && !encountersOnly ? (
                  <span key={`${r.name}-${i}`} className="flex flex-col items-center text-center">
                    <span className="relative">
                      <img src={r.image} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 object-contain" />
                      {r.quantity && <span className="tnum absolute -bottom-1 -right-2 rounded-md bg-paper-2 px-1 text-[10px] font-bold leading-tight">×{r.quantity.toLocaleString(lang)}</span>}
                    </span>
                    <span className="mt-1 line-clamp-2 w-[4.5rem] text-[11px] leading-tight text-ink-2">{rewardName(r)}</span>
                  </span>
                ) : null,
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
  const filtered = q.data.map(filterCategory).filter((c) => c.tasks.length > 0);
  const events = filtered.filter((c) => c.event);
  const regular = filtered.filter((c) => !c.event);
  const hasItems = q.data.some((c) => c.tasks.some((task) => task.rewards.some((r) => r.kind !== 'encounter')));
  return (
    <>
      <div className="relative mb-2">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.research_search}
          aria-label={t.research_search}
          className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">✕</button>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {anyWanted && <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)} className="min-h-8 px-2.5 text-xs">{t.game_my_hunts}</Chip>}
        <Chip active={encountersOnly} onClick={() => setEncountersOnly((v) => !v)} className="min-h-8 px-2.5 text-xs">{t.research_encounters_only}</Chip>
        <Chip active={shinyOnly} onClick={() => setShinyOnly((v) => !v)} className="min-h-8 px-2.5 text-xs">
          <Sparkle className={shinyOnly ? 'text-shiny' : ''} /> {t.game_shiny_possible}
        </Chip>
        {hasItems && !encountersOnly && (
          <Chip active={items} onClick={() => setItems((v) => !v)} className="min-h-8 px-2.5 text-xs">{t.research_items}</Chip>
        )}
      </div>
      <EventLegend marks={filtered.flatMap((c) => c.tasks.flatMap((task) => task.rewards.map((r) => (r.kind === 'encounter' ? eventOf(r.image, r.name) : undefined))))} />
      {filtered.length === 0 && <Empty>{t.nothing_here}</Empty>}
      {events.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-extrabold">{t.research_event}</h2>
          {events.map(block)}
          {regular.length > 0 && <h2 className="mb-3 text-lg font-extrabold">{t.research_regular}</h2>}
        </>
      )}
      {regular.map(block)}
    </>
  );
}

function Eggs() {
  const t = useT();
  const { lang } = useLang();
  const q = useEggs();
  const idx = useDataset().data;
  const eventOf = useEventMarks('eggs');
  const { hasMissing, isWanted } = useMissingHunts();
  const [distFilter, setDistFilter] = useState<string>('all');
  const [onlyHunts, setOnlyHunts] = useState(false);
  const [shinyOnly, setShinyOnly] = useState(false);
  const [query, setQuery] = useState('');
  if (q.isPending) return <Spinner />;
  if (q.isError) return <LiveError retry={() => void q.refetch()} />;

  type EggItem = NonNullable<typeof q.data>[number];
  const poolTitle = (e: EggItem) =>
    e.eggType + (e.isAdventureSync ? ` · ${t.adventure_sync}` : '') + (e.isGiftExchange ? ` · ${t.gift_egg}` : '');
  const poolSubtitle = (e: EggItem): string | undefined => {
    if (e.isAdventureSync) return t.egg_source_sync(e.eggType);
    if (e.isGiftExchange) return t.egg_source_mateo;
    if (e.eggType.startsWith('1 ')) return t.egg_source_daily;
    if (e.eggType.startsWith('7 ')) return t.egg_source_gifts;
    if (e.eggType.startsWith('12 ')) return t.egg_source_rocket;
    if (/^(2|5|10)\s/.test(e.eggType)) return t.egg_source_stops;
    return undefined;
  };

  // Distance chips keep 5 km / 7 km / 10 km unified (e.g. tapping 7 km shows friend gifts + Mateo Routes together).
  const distances = [...new Set(q.data.map((e) => e.eggType))];
  const normQ = normalize(query);
  const matchMon = (m: EggItem) => {
    if (distFilter !== 'all' && m.eggType !== distFilter) return false;
    if (onlyHunts && !isWanted(m.image, m.name, 'egg', m.canBeShiny)) return false;
    if (shinyOnly && !m.canBeShiny) return false;
    if (!normQ) return true;
    const localN = liveName(m.name, m.image, idx, lang);
    const dex = dexFromImage(m.image);
    return normalize(`${m.name} ${localN} ${dex ?? ''}`).includes(normQ);
  };

  const pools = new Map<string, { title: string; subtitle?: string; mons: EggItem[] }>();
  for (const e of q.data) {
    if (!matchMon(e)) continue;
    const key = `${e.eggType}|${Number(e.isAdventureSync)}|${Number(e.isGiftExchange)}`;
    const pool = pools.get(key) ?? pools.set(key, { title: poolTitle(e), subtitle: poolSubtitle(e), mons: [] }).get(key)!;
    pool.mons.push(e);
  }
  const shownPools = [...pools.values()];
  const anyWanted = hasMissing && q.data.some((m) => isWanted(m.image, m.name, 'egg', m.canBeShiny));

  const byTier = (mons: EggItem[]) => {
    const tiers = new Map<number, EggItem[]>();
    for (const m of mons) {
      const r = Math.max(0, Math.min(5, m.rarity || 0));
      (tiers.get(r) ?? tiers.set(r, []).get(r)!).push(m);
    }
    return [...tiers.entries()].sort((a, b) => a[0] - b[0]);
  };
  return (
    <>
      <div className="relative mb-2">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.egg_search}
          aria-label={t.egg_search}
          className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">
            ✕
          </button>
        )}
      </div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        <Chip active={distFilter === 'all'} onClick={() => setDistFilter('all')} className="min-h-8 shrink-0 px-2.5 text-xs">{t.filter_all}</Chip>
        {distances.map((d) => (
          <Chip key={d} active={distFilter === d} onClick={() => setDistFilter(distFilter === d ? 'all' : d)} className="min-h-8 shrink-0 px-2.5 text-xs">
            {d}
          </Chip>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {anyWanted && (
          <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)} className="min-h-8 px-2.5 text-xs">{t.game_my_hunts}</Chip>
        )}
        <Chip active={shinyOnly} onClick={() => setShinyOnly((v) => !v)} className="min-h-8 px-2.5 text-xs">
          <Sparkle className={shinyOnly ? 'text-shiny' : ''} /> {t.game_shiny_possible}
        </Chip>
      </div>
      <EventLegend marks={shownPools.flatMap((p) => p.mons.map((m) => eventOf(m.image, m.name)))} />
      {shownPools.length === 0 && <Empty>{t.nothing_here}</Empty>}
      {shownPools.map((pool) => {
        const tiers = byTier(pool.mons);
        const showTiers = tiers.length > 1;
        return (
          <Section key={pool.title} title={pool.title} count={pool.mons.length} subtitle={pool.subtitle}>
            {showTiers ? (
              <div className="space-y-3">
                {tiers.map(([tier, list]) => (
                  <div key={tier}>
                    {tier > 0 && (
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                        <span aria-hidden="true">{'🥚'.repeat(tier)}</span>
                        <span>{t.egg_rarity_tier[tier] ?? (lang === 'fr' ? `Palier ${tier}` : `Tier ${tier}`)}</span>
                        <span className="tnum font-normal text-ink-3">{list.length}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {list.map((m, i) => (
                        <Mon key={`${m.name}-${i}`} p={m} event={eventOf(m.image, m.name)} wanted={isWanted(m.image, m.name, 'egg', m.canBeShiny)} regional={m.isRegional} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pool.mons.map((m, i) => (
                  <Mon key={`${m.name}-${i}`} p={m} event={eventOf(m.image, m.name)} wanted={isWanted(m.image, m.name, 'egg', m.canBeShiny)} regional={m.isRegional} />
                ))}
              </div>
            )}
          </Section>
        );
      })}
    </>
  );
}

/** Live data that did not come: say so, and let the player try again. */
function LiveError({ retry }: { retry: () => void }) {
  const t = useT();
  return (
    <Empty>
      {t.live_error}
      <br />
      <Button tone="ghost" className="mt-3" onClick={retry}>{t.retry}</Button>
    </Empty>
  );
}

/**
 * What pops in the wild during the events (Leek Duck's event pages): all of it now in one grid, each Pokémon once
 * with its event; or event by event, with the ones starting soon.
 */
function EventSpawnsTab() {
  const t = useT();
  const { lang } = useLang();
  const nowMs = useNowMinute();
  const dataset = useDataset();
  const q = useEventSpawns();
  const { hasMissing, isWanted } = useMissingHunts();
  const [view, setView] = useState<'all' | 'events'>('all');
  const [onlyHunts, setOnlyHunts] = useState(false);
  const [shinyOnly, setShinyOnly] = useState(false);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <LiveError retry={() => void q.refetch()} />;
  const title = (e: EventSpawns) => eventTitle(e.name, dataset.data?.speciesByDex, lang);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const wild = q.data.filter((e) => e.featured.length || e.spawns.length);
  const now = wild.filter((e) => eventStatus(e) === 'current');
  const soon = wild.filter((e) => eventStatus(e) === 'upcoming');
  // Everything that pops now, each Pokémon once: featured first, then by Pokédex number.
  const all = new Map<string, { m: LivePokemon; event: string; featured: boolean }>();
  for (const e of now) {
    for (const m of e.featured) if (!all.has(m.image)) all.set(m.image, { m, event: title(e), featured: true });
    for (const m of e.spawns) if (!all.has(m.image)) all.set(m.image, { m, event: title(e), featured: false });
  }
  const allGrid = [...all.values()].sort((a, b) => Number(b.featured) - Number(a.featured) || (dexFromImage(a.m.image) ?? 9999) - (dexFromImage(b.m.image) ?? 9999));
  const anyWanted = hasMissing && wild.some((e) => [...e.featured, ...e.spawns].some((m) => isWanted(m.image, m.name, 'wild', m.canBeShiny)));
  const grid = allGrid.filter(({ m }) => (!onlyHunts || isWanted(m.image, m.name, 'wild', m.canBeShiny)) && (!shinyOnly || !!m.canBeShiny));
  const matchMon = (m: LivePokemon) => (!onlyHunts || isWanted(m.image, m.name, 'wild', m.canBeShiny)) && (!shinyOnly || !!m.canBeShiny);
  const filterEvents = (list: EventSpawns[]) =>
    list
      .map((e) => ({ e, feat: e.featured.filter(matchMon), spw: e.spawns.filter(matchMon) }))
      .filter((x) => x.feat.length > 0 || x.spw.length > 0);
  const nowFiltered = filterEvents(now);
  const soonFiltered = filterEvents(soon);
  const card = ({ e, feat, spw }: { e: EventSpawns; feat: LivePokemon[]; spw: LivePokemon[] }) => (
    <li key={e.eventID} className="card overflow-hidden">
      <a href={e.link} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3">
        {e.image && <img src={e.image} alt="" width={64} height={36} loading="lazy" className="h-9 w-16 shrink-0 rounded-md object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 font-bold leading-tight">
            <span>{title(e)}</span>
            <CountdownBadge e={e} now={nowMs} />
          </span>
          <span className="block text-xs text-ink-3">{e.start && `${date(e.start)} → `}{date(e.end)}</span>
        </span>
      </a>
      {feat.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-ink-3">{t.spawns_featured}</p>
          <div className="flex flex-wrap gap-2">{feat.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} wanted={isWanted(m.image, m.name, 'wild', m.canBeShiny)} />)}</div>
        </div>
      )}
      {spw.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-ink-3">{t.spawns_wild}</p>
          <div className="flex flex-wrap gap-2">{spw.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} wanted={isWanted(m.image, m.name, 'wild', m.canBeShiny)} />)}</div>
        </div>
      )}
    </li>
  );
  return (
    <>
      <p className="mb-3 text-sm text-ink-2">{t.spawns_help}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip active={view === 'all'} onClick={() => setView('all')}>{t.spawns_view_all}</Chip>
        <Chip active={view === 'events'} onClick={() => setView('events')}>{t.spawns_view_events}</Chip>
        {anyWanted && <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)}>{t.game_my_hunts}</Chip>}
        <Chip active={shinyOnly} onClick={() => setShinyOnly((v) => !v)}>
          <Sparkle className={shinyOnly ? 'text-shiny' : ''} /> {t.game_shiny_possible}
        </Chip>
      </div>
      {view === 'all' ? (
        <Section title={t.spawns_now} count={grid.length}>
          {grid.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
            {grid.map(({ m, event, featured }) => (
              <li key={m.image} className="flex flex-col items-center">
                <Mon p={m} wanted={isWanted(m.image, m.name, 'wild', m.canBeShiny)} />
                <span className={`mt-0.5 line-clamp-1 w-[4.5rem] text-center text-[10px] leading-tight ${featured ? 'font-semibold text-sky' : 'text-ink-3'}`}>{featured ? `★ ${event}` : event}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <>
          <Section title={t.spawns_now} count={nowFiltered.length}>
            {nowFiltered.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{nowFiltered.map(card)}</ul>
          </Section>
          {soonFiltered.length > 0 && (
            <Section title={t.spawns_soon} count={soonFiltered.length}>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{soonFiltered.map(card)}</ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}

/**
 * The CP range of a raid catch, as the game gives it: level 20 (25 when weather boosted), IVs 10 to 15 each.
 * A Mega or Primal boss is caught in its normal form.
 */
function raidCatchCp(idx: DatasetIndex, liveKeyOf: string | null): { normal: [number, number]; boosted: [number, number] } | null {
  const key = liveKeyOf?.replace(/\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/, '');
  const p = key ? idx.pvpByKey.get(key) ?? idx.pvpByKey.get(key.split('.')[0]!) : undefined;
  const cpm = idx.ds.pvp?.cpm;
  if (!p || !cpm) return null;
  const at = (level: number, iv: number) => cpOf(p, { atk: iv, def: iv, sta: iv }, cpmAt(cpm, level));
  return { normal: [at(20, 10), at(20, 15)], boosted: [at(25, 10), at(25, 15)] };
}
