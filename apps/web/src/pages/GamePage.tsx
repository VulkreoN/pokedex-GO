import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XEmbed } from '../components/XEmbed.js';
import { BottleCaps } from '../components/BottleCaps.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { useDataset } from '../lib/dataset.js';
import { useTheme } from '../lib/theme.js';
import { Button, CopyButton, TextField } from '../components/ui.js';
import { Link, useSearchParams } from 'react-router';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Badge, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { BuddyTool, CostsTool, CountersSheet, CountersTool, LeagueTool, RocketTab, useFromImage } from '../components/GameTools.js';
import { useTools } from '../lib/tools.js';
import type { ToolPokemon } from '@mydexpogo/shared';
import { dexFromImage, eventStatus, liveName, formatRange, formatUntil, isMaxEvent, raidEventFor, linkify, useEggs, useEvents, usePosts, usePromoCodes, useRaids, useResearch, type GameEvent, type LivePokemon, type ResearchCategory, type ResearchReward } from '../lib/live.js';

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

/** Small helpers for the game, one at a time. */
function Tools() {
  const t = useT();
  const tools = [['counters', t.tool_counters], ['costs', t.tool_costs], ['buddy', t.tool_buddy], ['league', t.tool_league], ['caps', t.tool_caps]] as const;
  const [tool, setTool] = useState<(typeof tools)[number][0]>('counters');
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {tools.map(([id, label]) => <Chip key={id} active={tool === id} onClick={() => setTool(id)}>{label}</Chip>)}
      </div>
      {tool === 'counters' && <CountersTool />}
      {tool === 'costs' && <CostsTool />}
      {tool === 'buddy' && <BuddyTool />}
      {tool === 'league' && <LeagueTool />}
      {tool === 'caps' && <BottleCaps />}
    </>
  );
}

/** Small Pokémon picture from Leek Duck, linked to our Pokédex entry when the file name tells us the species. */
function Mon({ p, size = 56, caption = true }: { p: LivePokemon; size?: number; caption?: boolean }) {
  const { lang } = useLang();
  const idx = useDataset().data;
  const dex = dexFromImage(p.image);
  const body = (
    <span className="flex flex-col items-center text-center">
      <span className="relative">
        <img src={p.image} alt="" width={size} height={size} loading="lazy" className="object-contain" style={{ width: size, height: size }} />
        {p.canBeShiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
      </span>
      {caption && <span className="mt-0.5 line-clamp-2 w-[4.5rem] text-[11px] font-semibold leading-tight">{liveName(p.name, p.image, idx?.speciesByDex, lang)}</span>}
    </span>
  );
  return dex ? <Link to={`/dex/${dex}`} className="rounded-lg hover:bg-paper-2">{body}</Link> : body;
}

function Section({ title, count, children }: { title: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-bold">
        {title} {count !== undefined && <span className="tnum font-normal text-ink-3">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

const TIER_ORDER = ['5', 'mega', '4', '3', '1', 'shadow'];
/** "5-Star Raids" -> "Raids 5 étoiles" in French; other tier names are kept as Leek Duck writes them. */
const tierLabel = (tier: string, lang: string) => {
  const m = /^(\d)-Star Raids$/.exec(tier);
  if (lang === 'fr' && m) return `Raids ${m[1]} étoiles`;
  if (lang === 'fr' && /^Mega Raids$/i.test(tier)) return 'Raids Méga';
  if (lang === 'fr' && /^Shadow Raids$/i.test(tier)) return 'Raids Obscurs';
  return tier;
};
const tierRank = (tier: string) => {
  const key = tier.toLowerCase();
  const i = TIER_ORDER.findIndex((k) => key.startsWith(k) || key.includes(k));
  return i === -1 ? 99 : i;
};

function Raids() {
  const t = useT();
  const { lang } = useLang();
  // A boss opens its best counters.
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const [target, setTarget] = useState<ToolPokemon | null>(null);
  const raids = useRaids();
  const events = useEvents();
  const dataset = useDataset();
  const tiers = useMemo(() => {
    const m = new Map<string, NonNullable<typeof raids.data>>();
    for (const b of raids.data ?? []) (m.get(b.tier) ?? m.set(b.tier, []).get(b.tier)!).push(b);
    return [...m.entries()].sort((a, b) => tierRank(a[0]) - tierRank(b[0]));
  }, [raids.data]);
  // Each current boss gets the end date of the event announcing it; those events then need no card of their own.
  const { endOf, now, upcoming } = useMemo(() => {
    const all = events.data ?? [];
    const endOf = new Map<string, string>();
    const used = new Set<string>();
    for (const b of raids.data ?? []) {
      const e = raidEventFor(b.name, all);
      if (e) {
        endOf.set(b.name, e.end!);
        used.add(e.eventID);
      }
    }
    const raidEvents = all
      .filter((e) => /raid/.test(e.eventType) && !isMaxEvent(e) && !used.has(e.eventID))
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    return {
      endOf,
      now: raidEvents.filter((e) => eventStatus(e) === 'current'),
      upcoming: raidEvents.filter((e) => eventStatus(e) === 'upcoming'),
    };
  }, [raids.data, events.data]);
  const eventCard = (e: GameEvent) => (
    <li key={e.eventID} className="card p-3">
      <div className="text-xs text-ink-2">{formatRange(e.start, e.end, lang)}</div>
      <div className="mt-1 font-semibold">{e.name}</div>
      {e.extraData?.raidbattles?.bosses && (
        <div className="mt-2 flex flex-wrap gap-2">
          {e.extraData.raidbattles.bosses.map((b, i) => <Mon key={`${b.name}-${i}`} p={b} />)}
        </div>
      )}
    </li>
  );
  if (raids.isPending) return <Spinner />;
  if (raids.isError) return <LiveError retry={() => void raids.refetch()} />;
  return (
    <>
      <p className="mb-3 text-sm text-ink-2">{t.raids_tap_hint}</p>
      {now.length > 0 && (
        <Section title={t.raids_now} count={now.length}>
          <ul className="space-y-2">{now.map(eventCard)}</ul>
        </Section>
      )}
      {tiers.map(([tier, bosses]) => (
        <Section key={tier} title={tierLabel(tier, lang)} count={bosses.length}>
          <ul className="space-y-2">
            {bosses.map((b) => (
              <li key={b.name}>
                <button type="button" onClick={() => setTarget(fromImage(b.image) ?? null)} aria-label={t.counters_title(liveName(b.name, b.image, dataset.data?.speciesByDex, lang))} className="card flex w-full items-center gap-3 p-2 text-left transition active:scale-[0.99]">
                <img src={b.image} alt="" width={56} height={56} loading="lazy" className="shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{liveName(b.name, b.image, dataset.data?.speciesByDex, lang)}</span>
                    {b.canBeShiny && <Sparkle className="shrink-0 text-shiny" />}
                  </div>
                  <div className="tnum text-xs text-ink-2">
                    PC {b.combatPower.normal.min}–{b.combatPower.normal.max}
                    <span className="text-ink-3"> · {t.boosted} {b.combatPower.boosted.min}–{b.combatPower.boosted.max}</span>
                  </div>
                  {endOf.has(b.name) && <div className="text-xs font-medium text-grass">{formatUntil(endOf.get(b.name)!, lang)}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {b.types.map((ty) => <img key={ty.name} src={ty.image} alt={ty.name} title={ty.name} width={22} height={22} />)}
                  {b.boostedWeather.map((w) => <img key={w.name} src={w.image} alt={w.name} title={w.name} width={22} height={22} className="opacity-70" />)}
                </div>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <Section title={t.raids_upcoming} count={upcoming.length}>
        {upcoming.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
        <ul className="space-y-2">{upcoming.map(eventCard)}</ul>
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
  const list = useMemo(() => (events.data ?? []).filter((e) => isMaxEvent(e) && eventStatus(e) !== 'past').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')), [events.data]);
  if (events.isPending) return <Spinner />;
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
              <div className="mt-1 font-semibold">{e.name}</div>
              {species.length > 0 && idx && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {species.map((sp) => {
                    const cover = idx.coverOf.get(sp.dex);
                    const v = gmax ? idx.variantsByDex.get(sp.dex)?.find((x) => x.kind === 'gmax') ?? cover : cover;
                    return v ? <Link key={sp.dex} to={`/dex/${sp.dex}`} className="flex flex-col items-center text-center"><Sprite idx={idx} variant={v} size={56} /><span className="w-[4.5rem] truncate text-[11px] font-semibold">{localized(sp.name, lang)}</span></Link> : null;
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
  const [items, setItems] = useState(true);
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
    return t.items[r.name] ?? r.name;
  };
  const block = (c: ResearchCategory) => (
    <Section key={c.title} title={c.event ? c.title.replace(/ Tasks$/, '') : (t.research_types[c.title] ?? c.title.replace(/ Tasks$/, ''))} count={c.tasks.length}>
      {c.end && <p className="-mt-1 mb-2 text-xs text-ink-3">{formatUntil(c.end, lang)}</p>}
      <ul className="space-y-2">
        {c.tasks.map((task) => (
          <li key={task.text} className="card p-3">
            <div className="text-sm font-semibold">{task.text}</div>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {task.rewards.map((r, i) =>
                r.kind === 'encounter' ? (
                  <Mon key={`${r.name}-${i}`} p={r} size={48} />
                ) : items ? (
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
  const events = q.data.filter((c) => c.event);
  const regular = q.data.filter((c) => !c.event);
  const hasItems = q.data.some((c) => c.tasks.some((task) => task.rewards.some((r) => r.kind !== 'encounter')));
  return (
    <>
      {hasItems && (
        <div className="mb-3 flex gap-2">
          <Chip active={items} onClick={() => setItems((v) => !v)}>{t.research_items}</Chip>
        </div>
      )}
      {events.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-extrabold">{t.research_event}</h2>
          {events.map(block)}
          <h2 className="mb-3 text-lg font-extrabold">{t.research_regular}</h2>
        </>
      )}
      {regular.map(block)}
    </>
  );
}

function Eggs() {
  const t = useT();
  const q = useEggs();
  if (q.isPending) return <Spinner />;
  if (q.isError) return <LiveError retry={() => void q.refetch()} />;
  const groups = new Map<string, NonNullable<typeof q.data>>();
  for (const e of q.data) {
    const k = e.eggType + (e.isAdventureSync ? ` · ${t.adventure_sync}` : '') + (e.isGiftExchange ? ` · ${t.gift_egg}` : '');
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  return (
    <>
      {[...groups.entries()].map(([type, mons]) => (
        <Section key={type} title={type} count={mons.length}>
          <div className="flex flex-wrap gap-2">{mons.map((m, i) => <Mon key={`${m.name}-${i}`} p={m} />)}</div>
        </Section>
      ))}
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

interface EventSpawns { eventID: string; name: string; link: string; image: string; start: string | null; end: string | null; featured: LivePokemon[]; spawns: LivePokemon[] }

/** What pops in the wild during the current events, and the ones starting soon (Leek Duck's event pages). */
function EventSpawnsTab() {
  const t = useT();
  const { lang } = useLang();
  const q = useQuery({ queryKey: ['live', 'event-spawns'], queryFn: () => api<{ events: EventSpawns[] }>('/game/event-spawns').then((r) => r.events), staleTime: 10 * 60_000 });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <LiveError retry={() => void q.refetch()} />;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const now = q.data.filter((e) => eventStatus(e) === 'current');
  const soon = q.data.filter((e) => eventStatus(e) === 'upcoming');
  const card = (e: EventSpawns) => (
    <li key={e.eventID} className="card overflow-hidden">
      <a href={e.link} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3">
        {e.image && <img src={e.image} alt="" width={64} height={36} loading="lazy" className="h-9 w-16 shrink-0 rounded-md object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight">{e.name}</span>
          <span className="block text-xs text-ink-3">{e.start && `${date(e.start)} → `}{date(e.end)}</span>
        </span>
      </a>
      {e.featured.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-ink-3">{t.spawns_featured}</p>
          <div className="flex flex-wrap gap-2">{e.featured.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} />)}</div>
        </div>
      )}
      {e.spawns.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-ink-3">{t.spawns_wild}</p>
          <div className="flex flex-wrap gap-2">{e.spawns.map((m, i) => <Mon key={`${m.image}-${i}`} p={m} />)}</div>
        </div>
      )}
    </li>
  );
  return (
    <>
      <p className="mb-3 text-sm text-ink-2">{t.spawns_help}</p>
      <Section title={t.spawns_now} count={now.length}>
        {now.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
        <ul className="space-y-3">{now.map(card)}</ul>
      </Section>
      {soon.length > 0 && (
        <Section title={t.spawns_soon} count={soon.length}>
          <ul className="space-y-3">{soon.map(card)}</ul>
        </Section>
      )}
    </>
  );
}
