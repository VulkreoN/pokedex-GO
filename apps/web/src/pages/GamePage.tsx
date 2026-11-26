import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XEmbed } from '../components/XEmbed.js';
import { BottleCaps } from '../components/BottleCaps.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { normalize, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { useTheme } from '../lib/theme.js';
import { Button, CopyButton, TextField } from '../components/ui.js';
import { Link, useSearchParams } from 'react-router';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Badge, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { BuddyTool, CostsTool, CountersSheet, CountersTool, EVENT_MARK, EventLegend, EvolutionsTool, LeagueTool, RocketTab, useEventMarks, useEventSpawns, useFromImage, useKnownPokemon, useMissingHunts, type EventSpawns } from '../components/GameTools.js';
import { liveKey, useTools } from '../lib/tools.js';
import { cpmAt, cpOf, type ToolPokemon } from '@mydexpogo/shared';
import { TYPE_COLORS, TypeBadge } from '../components/TypeBadge.js';
import { RAID_TIERS, currentRaidBosses, raidSchedule, type CurrentBoss, type RaidTier, dexFromImage, eventStatus, eventTitle, liveName, formatRange, formatUntil, isMaxEvent, linkify, useEggs, useEvents, usePosts, usePromoCodes, useRaids, useResearch, type GameEvent, type LivePokemon, type ResearchCategory, type ResearchReward } from '../lib/live.js';

const X_HANDLE = 'g47ix';

type Tab = 'raids' | 'spawns' | 'max' | 'rocket' | 'events' | 'research' | 'eggs' | 'tools';

const TABS: Tab[] = ['raids', 'spawns', 'max', 'rocket', 'events', 'research', 'eggs', 'tools'];

export function GamePage() {
  const t = useT();
  // The tab lives in the URL: coming back from a Pokémon page lands on the same tab.
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x === params.get('tab')) ?? 'raids';
  const setTab = (id: Tab) => setParams(id === 'raids' ? {} : { tab: id }, { replace: true });
  const labels: Record<Tab, string> = { raids: t.tab_raids, spawns: t.tab_spawns, max: t.tab_max, rocket: t.tab_rocket, events: t.tab_events, research: t.tab_research, eggs: t.tab_eggs, tools: t.tab_tools };
  return (
    <>
      <TopBar title={t.nav_game}>
        {/* Eight tabs do not fit a phone: the row scrolls, fades out on the right, and keeps the current one in view. */}
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 pb-2 [mask-image:linear-gradient(to_right,#000_88%,transparent)] [scrollbar-width:none]" role="tablist">
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
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {tab === 'raids' && <Raids />}
        {tab === 'spawns' && <EventSpawnsTab />}
        {tab === 'max' && <MaxBattles />}
        {tab === 'rocket' && <RocketTab />}
        {tab === 'events' && <Events />}
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
      {caption && <span className="mt-0.5 line-clamp-2 w-[4.5rem] text-[11px] font-semibold leading-tight">{liveName(p.name, p.image, idx?.speciesByDex, lang)}</span>}
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

function Section({ title, count, subtitle, children }: { title: ReactNode; count?: number; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className={`${subtitle ? 'mb-0.5' : 'mb-2'} text-base font-bold`}>
        {title} {count !== undefined && <span className="tnum font-normal text-ink-3">{count}</span>}
      </h2>
      {subtitle && <p className="mb-2 text-xs text-ink-3">{subtitle}</p>}
      {children}
    </section>
  );
}

function Raids() {
  const t = useT();
  const { lang } = useLang();
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
  const name = (n: string, image: string) => liveName(n, image, idx?.speciesByDex, lang);
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
  const allTiers = RAID_TIERS.filter((tier) => bosses.some((b) => b.tier === tier));
  const anyWanted = hasMissing && bosses.some((b) => isWanted(b.image, b.canBeShiny));
  const visibleBosses = bosses.filter((b) => (tierFilter === 'all' || b.tier === tierFilter) && (!onlyHunts || isWanted(b.image, b.canBeShiny)));
  const tiers = allTiers.filter((tier) => visibleBosses.some((b) => b.tier === tier));

  return (
    <>
      <p className="mb-2 text-sm text-ink-2">{t.raids_tap_hint}</p>
      {(allTiers.length > 1 || anyWanted) && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
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
            <ul className="space-y-2">
              {list.map((b) => {
                const wanted = isWanted(b.image, b.canBeShiny);
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
                        {b.end && <div className="text-xs font-medium text-go-ink dark:text-go">{formatUntil(b.end, lang)}</div>}
                        {eventOf(b.image, b.name) && <div className="truncate text-xs font-semibold text-sky">{eventOf(b.image, b.name)}</div>}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {typesOf(b).map((ty) => <TypeBadge key={ty} type={ty} small />)}
                        {b.boostedWeather?.map((w) => <img key={w.name} src={w.image} alt={w.name} title={w.name} width={20} height={20} loading="lazy" decoding="async" className="opacity-70" />)}
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
          <ul className="space-y-2">
            {moments.map((e) => (
              <li key={e.eventID} className="card flex items-center gap-3 p-3">
                <span className="text-xl" aria-hidden="true">{e.eventType === 'raid-hour' ? '⏰' : '📅'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{eventTitle(e.name, idx?.speciesByDex, lang)}</span>
                  <span className="block text-xs text-ink-2">{formatRange(e.start, e.end, lang)}</span>
                </span>
                {eventStatus(e) === 'current' && <Badge tone="grass">{t.raid_moment_now}</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t.raids_upcoming} count={next.length}>
        {next.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
        <ul className="space-y-2">
          {next.map((e) => (
            <li key={e.eventID} className="card p-3">
              <div className="text-xs text-ink-2">{formatRange(e.start, e.end, lang)}</div>
              <div className="mt-1 font-semibold">{eventTitle(e.name, idx?.speciesByDex, lang)}</div>
              {!!e.extraData?.raidbattles?.bosses?.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.extraData.raidbattles.bosses.map((b, i) => (
                    <button key={`${b.name}-${i}`} type="button" onClick={() => pickTarget(b.image, b.name)} className="flex w-24 flex-col items-center rounded-lg p-1 text-center hover:bg-paper-2">
                      <img src={b.image} alt="" width={56} height={56} loading="lazy" className="object-contain" />
                      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{name(b.name, b.image)}</span>
                      {cpLine({ image: b.image, name: b.name }, true)}
                    </button>
                  ))}
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

function Events() {
  const t = useT();
  const { lang } = useLang();
  const { dark } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const posts = usePosts();
  const promo = usePromoCodes();
  const [url, setUrl] = useState('');
  const isManager = me.data?.role === 'manager' || me.data?.role === 'admin';
  const add = useMutation({ mutationFn: (u: string) => api<{ post: unknown }>('/game/posts', { body: { url: u } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['game', 'posts'] }); toast(t.posts_added); setUrl(''); } });
  const remove = useMutation({ mutationFn: (id: string) => api<{ ok: true }>(`/game/posts/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['game', 'posts'] }) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (url.trim()) add.mutate(url.trim()); };

  return (
    <>
      {promo.data && promo.data.length > 0 && (
        <Section title={t.promo_title} count={promo.data.length}>
          <ul className="space-y-2">
            {promo.data.map((c) => (
              <li key={c.code} className="card p-3">
                <div className="font-semibold">{c.title}</div>
                {c.rewards.length > 0 && <div className="mt-0.5 text-xs text-ink-2">{c.rewards.join(' · ')}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-paper-2 px-2 py-1.5 text-sm">{c.code}</code>
                  <CopyButton className="min-h-9 px-3 text-sm" text={c.code} />
                  <a href={c.redeemUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-xl bg-go px-3 text-sm font-semibold text-white">{t.redeem}</a>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t.posts_title} count={posts.data?.length}>
        {isManager && (
          <form onSubmit={submit} className="mb-3 flex gap-2">
            <TextField placeholder={t.posts_add_placeholder} value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" inputMode="url" />
            <Button tone="primary" type="submit" disabled={add.isPending || !url.trim()}>{t.add}</Button>
          </form>
        )}
        {add.isError && <p className="mb-2 text-sm text-berry">{t.err_generic}</p>}
        {posts.isPending && <Spinner />}
        {posts.data?.length === 0 && <p className="text-sm text-ink-3">{t.posts_empty}</p>}
        <ul className="space-y-3">
          {posts.data?.map((p) => (
            <li key={p.id} className="card p-3">
              <div className="flex items-center gap-2 text-xs text-ink-2">
                <Badge tone="muted">@{p.authorUrl?.split('/').pop() ?? p.author}</Badge>
                {p.postedAt && <span>{new Date(p.postedAt).toLocaleDateString(lang, { dateStyle: 'medium' })}</span>}
                <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-sky">{t.open_on_x}</a>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {linkify(p.text).map((part, i) => part.url ? <a key={i} href={part.url} target="_blank" rel="noreferrer" className="break-all font-semibold text-sky underline">{part.text}</a> : <span key={i}>{part.text}</span>)}
              </p>
              {p.codes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.codes.map((code) => (
                    <a key={code} href={`https://store.pokemongo.com/offer-redemption?passcode=${code}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-go px-3 text-sm font-semibold text-white">🎁 {code}</a>
                  ))}
                </div>
              )}
              <div className="mt-2"><XEmbed html={p.html} dark={dark} /></div>
              {isManager && <button type="button" className="mt-1 text-xs text-berry" onClick={() => remove.mutate(p.id)}>{t.posts_remove}</button>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t.timeline_title(X_HANDLE)}>
        <p className="mb-2 text-xs text-ink-3">{t.timeline_hint} <a href={`https://x.com/${X_HANDLE}/media`} target="_blank" rel="noreferrer" className="font-semibold text-sky">@{X_HANDLE}</a></p>
        <div className="card overflow-hidden p-1">
          <XEmbed html={`<a class="twitter-timeline" href="https://x.com/${X_HANDLE}?ref_src=twsrc%5Etfw">Posts by ${X_HANDLE}</a>`} dark={dark} />
        </div>
      </Section>
    </>
  );
}

/** Max Battles: current and upcoming Dynamax / Gigantamax events, with the Pokémon named in them. */
function MaxBattles() {
  const t = useT();
  const { lang } = useLang();
  const events = useEvents();
  const dataset = useDataset();
  const { isWanted } = useMissingHunts();
  const list = useMemo(() => (events.data ?? []).filter((e) => isMaxEvent(e) && eventStatus(e) !== 'past').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')), [events.data]);
  if (events.isPending) return <Spinner />;
  if (events.isError) return <LiveError retry={() => void events.refetch()} />;
  const idx = dataset.data;
  /** Species named in an event title, matched on English names (Leek Duck writes English). */
  const named = (name: string) => {
    if (!idx) return [];
    const hay = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    return idx.ds.species.filter((s) => s.name.en.length >= 4 && hay.includes(` ${s.name.en.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `));
  };
  const now = list.filter((e) => eventStatus(e) === 'current');
  const upcoming = list.filter((e) => eventStatus(e) === 'upcoming');
  const block = (title: string, items: GameEvent[]) => (
    <Section title={title} count={items.length}>
      {items.length === 0 && <p className="text-sm text-ink-3">{t.max_empty}</p>}
      <ul className="space-y-2">
        {items.map((e) => {
          const species = named(e.name);
          const gmax = /gigantamax/i.test(e.name);
          return (
            <li key={e.eventID} className="card p-3">
              <div className="flex items-center gap-2 text-xs text-ink-2">
                <Badge tone={gmax ? 'shiny' : 'datamined'}>{gmax ? 'Gigantamax' : 'Dynamax'}</Badge>
                <span>{formatRange(e.start, e.end, lang)}</span>
              </div>
              <div className="mt-1 font-semibold">{eventTitle(e.name, dataset.data?.speciesByDex, lang)}</div>
              {species.length > 0 && idx && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {species.map((sp) => {
                    const cover = idx.coverOf.get(sp.dex);
                    const v = gmax ? idx.variantsByDex.get(sp.dex)?.find((x) => x.kind === 'gmax') ?? cover : cover;
                    const wanted = isWanted(`/pm${sp.dex}.icon.png`);
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
  const anyWanted = hasMissing && q.data.some((c) => c.tasks.some((task) => task.rewards.some((r) => r.kind === 'encounter' && isWanted(r.image, r.canBeShiny))));
  const filterCategory = (c: ResearchCategory): ResearchCategory => ({
    ...c,
    tasks: c.tasks.filter((task) => {
      const encs = task.rewards.filter((r) => r.kind === 'encounter');
      if (encountersOnly && !encs.length) return false;
      if (shinyOnly && !encs.some((r) => r.canBeShiny)) return false;
      if (onlyHunts && !encs.some((r) => isWanted(r.image, r.canBeShiny))) return false;
      if (!normQ) return true;
      const hay = normalize([task.text, task.textFr ?? '', ...task.rewards.map((r) => `${r.name} ${r.kind === 'encounter' ? liveName(r.name, r.image, idx?.speciesByDex, lang) : rewardName(r)}`)].join(' '));
      return hay.includes(normQ);
    }),
  });
  const block = (c: ResearchCategory) => (
    <Section key={c.title} title={c.event ? eventTitle(c.title.replace(/ Tasks$/, ''), idx?.speciesByDex, lang) : (t.research_types[c.title] ?? c.title.replace(/ Tasks$/, ''))} count={c.tasks.length}>
      {c.end && <p className="-mt-1 mb-2 text-xs text-ink-3">{formatUntil(c.end, lang)}</p>}
      <ul className="space-y-2">
        {c.tasks.map((task, ti) => (
          <li key={`${task.text}-${ti}`} className="card p-3">
            <div className="text-sm font-semibold">{lang === 'fr' ? (task.textFr ?? task.text) : task.text}</div>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {task.rewards.map((r, i) =>
                r.kind === 'encounter' ? (
                  <Mon
                    key={`${r.name}-${i}`}
                    p={r}
                    size={48}
                    event={eventOf(r.image, r.name)}
                    wanted={isWanted(r.image, r.canBeShiny)}
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
    if (onlyHunts && !isWanted(m.image, m.canBeShiny)) return false;
    if (shinyOnly && !m.canBeShiny) return false;
    if (!normQ) return true;
    const localN = liveName(m.name, m.image, idx?.speciesByDex, lang);
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
  const anyWanted = hasMissing && q.data.some((m) => isWanted(m.image, m.canBeShiny));

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
      <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
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
                        <span>{t.egg_rarity_tier[tier] ?? `Tier ${tier}`}</span>
                        <span className="tnum font-normal text-ink-3">{list.length}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {list.map((m, i) => (
                        <Mon key={`${m.name}-${i}`} p={m} event={eventOf(m.image, m.name)} wanted={isWanted(m.image, m.canBeShiny)} regional={m.isRegional} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pool.mons.map((m, i) => (
                  <Mon key={`${m.name}-${i}`} p={m} event={eventOf(m.image, m.name)} wanted={isWanted(m.image, m.canBeShiny)} regional={m.isRegional} />
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
  const anyWanted = hasMissing && wild.some((e) => [...e.featured, ...e.spawns].some((m) => isWanted(m.image, m.canBeShiny)));
  const grid = allGrid.filter(({ m }) => (!onlyHunts || isWanted(m.image, m.canBeShiny)) && (!shinyOnly || !!m.canBeShiny));
  const matchMon = (m: LivePokemon) => (!onlyHunts || isWanted(m.image, m.canBeShiny)) && (!shinyOnly || !!m.canBeShiny);
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
          <span className="block font-bold leading-tight">{title(e)}</span>
          <span className="block text-xs text-ink-3">{e.start && `${date(e.start)} → `}{date(e.end)}</span>
        </span>
      </a>
      {feat.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-ink-3">{t.spawns_featured}</p>
          <div className="flex flex-wrap gap-2">{feat.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} wanted={isWanted(m.image, m.canBeShiny)} />)}</div>
        </div>
      )}
      {spw.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-ink-3">{t.spawns_wild}</p>
          <div className="flex flex-wrap gap-2">{spw.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} wanted={isWanted(m.image, m.canBeShiny)} />)}</div>
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
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {grid.map(({ m, event, featured }) => (
              <li key={m.image} className="flex flex-col items-center">
                <Mon p={m} wanted={isWanted(m.image, m.canBeShiny)} />
                <span className={`mt-0.5 line-clamp-1 w-[4.5rem] text-center text-[10px] leading-tight ${featured ? 'font-semibold text-sky' : 'text-ink-3'}`}>{featured ? `★ ${event}` : event}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <>
          <Section title={t.spawns_now} count={nowFiltered.length}>
            {nowFiltered.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
            <ul className="space-y-3">{nowFiltered.map(card)}</ul>
          </Section>
          {soonFiltered.length > 0 && (
            <Section title={t.spawns_soon} count={soonFiltered.length}>
              <ul className="space-y-3">{soonFiltered.map(card)}</ul>
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
