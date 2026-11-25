import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XEmbed } from '../components/XEmbed.js';
import { BottleCaps } from '../components/BottleCaps.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { useDataset, type DatasetIndex } from '../lib/dataset.js';
import { useTheme } from '../lib/theme.js';
import { Button, CopyButton, TextField } from '../components/ui.js';
import { Link, useSearchParams } from 'react-router';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Badge, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { BuddyTool, CostsTool, CountersSheet, CountersTool, EvolutionsTool, LeagueTool, RocketTab, useFromImage } from '../components/GameTools.js';
import { keyFromImage, useTools } from '../lib/tools.js';
import { cpmAt, cpOf, type ToolPokemon } from '@mydexpogo/shared';
import { TypeBadge } from '../components/TypeBadge.js';
import { RAID_TIERS, currentRaidBosses, raidSchedule, type CurrentBoss, dexFromImage, eventStatus, eventTitle, liveName, formatRange, formatUntil, isMaxEvent, raidEventFor, linkify, useEggs, useEvents, usePosts, usePromoCodes, useRaids, useResearch, type GameEvent, type LivePokemon, type ResearchCategory, type ResearchReward } from '../lib/live.js';

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
  const tools = [['counters', t.tool_counters], ['evolutions', t.tool_evolutions], ['costs', t.tool_costs], ['buddy', t.tool_buddy], ['league', t.tool_league], ['caps', t.tool_caps]] as const;
  const [tool, setTool] = useState<(typeof tools)[number][0]>('counters');
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
  const idx = dataset.data;
  // This week's bosses by level (the announcements win over Leek Duck's lagging list), then Raid Hours, then what comes.
  const bosses = useMemo(() => currentRaidBosses(raids.data ?? [], events.data ?? []), [raids.data, events.data]);
  const { moments, next } = useMemo(() => raidSchedule(events.data ?? []), [events.data]);
  if (raids.isPending) return <Spinner />;
  if (raids.isError && !bosses.length) return <LiveError retry={() => void raids.refetch()} />;
  const name = (n: string, image: string) => liveName(n, image, idx?.speciesByDex, lang);
  /** Types of a boss only an announcement names, from the Pokédex. */
  const typesOf = (image: string) => {
    const key = keyFromImage(image);
    const v = key ? idx?.variantByKey.get(key.replace(/\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/, '')) ?? idx?.variantByKey.get(key) : undefined;
    return v ? v.types ?? idx?.speciesByDex.get(v.dex)?.types ?? [] : [];
  };
  const cpLine = (b: { image: string; combatPower?: CurrentBoss['combatPower'] }) => {
    const cp = b.combatPower ? { normal: [b.combatPower.normal.min, b.combatPower.normal.max], boosted: [b.combatPower.boosted.min, b.combatPower.boosted.max] } : idx ? raidCatchCp(idx, b.image) : null;
    return cp ? (
      <div className="tnum text-xs text-ink-2">
        PC {cp.normal[0]}–{cp.normal[1]}
        <span className="text-ink-3"> · {t.boosted} {cp.boosted[0]}–{cp.boosted[1]}</span>
      </div>
    ) : null;
  };
  const tiers = RAID_TIERS.filter((tier) => bosses.some((b) => b.tier === tier));
  return (
    <>
      <p className="mb-3 text-sm text-ink-2">{t.raids_tap_hint}</p>
      {tiers.map((tier) => {
        const list = bosses.filter((b) => b.tier === tier);
        return (
          <Section key={tier} title={t.raid_tier[tier]} count={list.length}>
            <ul className="space-y-2">
              {list.map((b) => (
                <li key={b.image + b.tier}>
                  <button type="button" onClick={() => setTarget(fromImage(b.image) ?? null)} aria-label={t.counters_title(name(b.name, b.image))} className="card flex w-full items-center gap-3 p-2 text-left transition active:scale-[0.99]">
                    <img src={b.image} alt="" width={56} height={56} loading="lazy" className="shrink-0 object-contain" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{name(b.name, b.image)}</span>
                        {b.canBeShiny && <Sparkle className="shrink-0 text-shiny" />}
                      </div>
                      {cpLine(b)}
                      {b.end && <div className="text-xs font-medium text-grass">{formatUntil(b.end, lang)}</div>}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {b.types ? b.types.map((ty) => <img key={ty.name} src={ty.image} alt={ty.name} title={ty.name} width={22} height={22} />) : typesOf(b.image).map((ty) => <TypeBadge key={ty} type={ty} small />)}
                      {b.boostedWeather?.map((w) => <img key={w.name} src={w.image} alt={w.name} title={w.name} width={22} height={22} className="opacity-70" />)}
                    </div>
                  </button>
                </li>
              ))}
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
                    <button key={`${b.name}-${i}`} type="button" onClick={() => setTarget(fromImage(b.image) ?? null)} className="flex w-24 flex-col items-center rounded-lg p-1 text-center hover:bg-paper-2">
                      <img src={b.image} alt="" width={56} height={56} loading="lazy" className="object-contain" />
                      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{name(b.name, b.image)}</span>
                      {cpLine({ image: b.image })}
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
              <div className="mt-1 font-semibold">{eventTitle(e.name, dataset.data?.speciesByDex, lang)}</div>
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
    return t.items[r.name] ?? (lang === 'fr' ? r.nameFr : undefined) ?? r.name;
  };
  const block = (c: ResearchCategory) => (
    <Section key={c.title} title={c.event ? eventTitle(c.title.replace(/ Tasks$/, ''), idx?.speciesByDex, lang) : (t.research_types[c.title] ?? c.title.replace(/ Tasks$/, ''))} count={c.tasks.length}>
      {c.end && <p className="-mt-1 mb-2 text-xs text-ink-3">{formatUntil(c.end, lang)}</p>}
      <ul className="space-y-2">
        {c.tasks.map((task) => (
          <li key={task.text} className="card p-3">
            <div className="text-sm font-semibold">{lang === 'fr' ? (task.textFr ?? task.text) : task.text}</div>
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
  const dataset = useDataset();
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
          <span className="block font-bold leading-tight">{eventTitle(e.name, dataset.data?.speciesByDex, lang)}</span>
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

/**
 * The CP range of a raid catch, as the game gives it: level 20 (25 when weather boosted), IVs 10 to 15 each.
 * A Mega or Primal boss is caught in its normal form.
 */
function raidCatchCp(idx: DatasetIndex, image: string): { normal: [number, number]; boosted: [number, number] } | null {
  const key = keyFromImage(image)?.replace(/\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/, '');
  const p = key ? idx.pvpByKey.get(key) ?? idx.pvpByKey.get(key.split('.')[0]!) : undefined;
  const cpm = idx.ds.pvp?.cpm;
  if (!p || !cpm) return null;
  const at = (level: number, iv: number) => cpOf(p, { atk: iv, def: iv, sta: iv }, cpmAt(cpm, level));
  return { normal: [at(20, 10), at(20, 15)], boosted: [at(25, 10), at(25, 15)] };
}
