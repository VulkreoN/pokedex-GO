import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Sparkle } from '../components/Sprite.js';
import { Badge, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { useLang, useT } from '../lib/i18n.js';
import { dexFromImage, eventStatus, formatRange, useEggs, useEvents, useRaids, useResearch, type EventStatus, type GameEvent, type LivePokemon } from '../lib/live.js';

type Tab = 'raids' | 'events' | 'research' | 'eggs';

export function GamePage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('raids');
  const tabs: [Tab, string][] = [['raids', t.tab_raids], ['events', t.tab_events], ['research', t.tab_research], ['eggs', t.tab_eggs]];
  return (
    <>
      <TopBar title={t.nav_game}>
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {tabs.map(([id, label]) => (
            <Chip key={id} active={tab === id} onClick={() => setTab(id)}>{label}</Chip>
          ))}
        </div>
      </TopBar>
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {tab === 'raids' && <Raids />}
        {tab === 'events' && <Events />}
        {tab === 'research' && <Research />}
        {tab === 'eggs' && <Eggs />}
        <p className="mt-8 text-center text-xs text-ink-3">{t.live_source}</p>
      </main>
    </>
  );
}

/** Small Pokémon picture from Leek Duck, linked to our Pokédex entry when the file name tells us the species. */
function Mon({ p, size = 56, caption = true }: { p: LivePokemon; size?: number; caption?: boolean }) {
  const dex = dexFromImage(p.image);
  const body = (
    <span className="flex flex-col items-center text-center">
      <span className="relative">
        <img src={p.image} alt="" width={size} height={size} loading="lazy" className="object-contain" style={{ width: size, height: size }} />
        {p.canBeShiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
      </span>
      {caption && <span className="mt-0.5 line-clamp-2 w-[4.5rem] text-[11px] font-semibold leading-tight">{p.name}</span>}
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
  const raids = useRaids();
  const events = useEvents();
  const tiers = useMemo(() => {
    const m = new Map<string, NonNullable<typeof raids.data>>();
    for (const b of raids.data ?? []) (m.get(b.tier) ?? m.set(b.tier, []).get(b.tier)!).push(b);
    return [...m.entries()].sort((a, b) => tierRank(a[0]) - tierRank(b[0]));
  }, [raids.data]);
  const upcoming = useMemo(
    () =>
      (events.data ?? [])
        .filter((e) => /raid/.test(e.eventType) && eventStatus(e) !== 'past')
        .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    [events.data],
  );
  if (raids.isPending) return <Spinner />;
  if (raids.isError) return <Empty>{t.live_error}</Empty>;
  return (
    <>
      {tiers.map(([tier, bosses]) => (
        <Section key={tier} title={tierLabel(tier, lang)} count={bosses.length}>
          <ul className="space-y-2">
            {bosses.map((b) => (
              <li key={b.name} className="card flex items-center gap-3 p-2">
                <Mon p={b} size={56} caption={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{b.name}</span>
                    {b.canBeShiny && <Sparkle className="shrink-0 text-shiny" />}
                  </div>
                  <div className="tnum text-xs text-ink-2">
                    PC {b.combatPower.normal.min}–{b.combatPower.normal.max}
                    <span className="text-ink-3"> · {t.boosted} {b.combatPower.boosted.min}–{b.combatPower.boosted.max}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {b.types.map((ty) => <img key={ty.name} src={ty.image} alt={ty.name} title={ty.name} width={22} height={22} />)}
                  {b.boostedWeather.map((w) => <img key={w.name} src={w.image} alt={w.name} title={w.name} width={22} height={22} className="opacity-70" />)}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <Section title={t.raids_upcoming} count={upcoming.length}>
        {upcoming.length === 0 && <p className="text-sm text-ink-3">{t.nothing_here}</p>}
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.eventID} className="card p-3">
              <div className="flex items-center gap-2">
                <Badge tone={eventStatus(e) === 'current' ? 'grass' : 'muted'}>{eventStatus(e) === 'current' ? t.status_current : t.status_upcoming}</Badge>
                <span className="text-xs text-ink-2">{formatRange(e.start, e.end, lang)}</span>
              </div>
              <div className="mt-1 font-semibold">{e.name}</div>
              {e.extraData?.raidbattles?.bosses && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.extraData.raidbattles.bosses.map((b, i) => <Mon key={`${b.name}-${i}`} p={b} />)}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Events() {
  const t = useT();
  const { lang } = useLang();
  const events = useEvents();
  const [status, setStatus] = useState<EventStatus>('current');
  const list = useMemo(() => {
    const all = (events.data ?? []).filter((e) => eventStatus(e) === status);
    return status === 'past' ? all.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '')) : all.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  }, [events.data, status]);
  if (events.isPending) return <Spinner />;
  const statuses: [EventStatus, string][] = [['current', t.status_current], ['upcoming', t.status_upcoming], ['past', t.status_past]];
  return (
    <>
      <div className="mb-3 flex gap-2">
        {statuses.map(([s, label]) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{label}</Chip>)}
      </div>
      {list.length === 0 && <Empty>{status === 'past' ? t.past_events_hint : t.nothing_here}</Empty>}
      <ul className="space-y-3">
        {list.map((e) => <EventCard key={e.eventID} e={e} lang={lang} />)}
      </ul>
    </>
  );
}

function EventCard({ e, lang }: { e: GameEvent; lang: string }) {
  const t = useT();
  const x = e.extraData;
  return (
    <li className="card overflow-hidden">
      {e.image && <img src={e.image} alt="" loading="lazy" className="aspect-[2/1] w-full object-cover" />}
      <div className="p-3">
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <Badge tone="muted">{e.heading}</Badge>
          <span>{formatRange(e.start, e.end, lang)}</span>
        </div>
        <h3 className="mt-1 text-[17px] font-bold leading-tight">{e.name}</h3>
        {x?.spotlight && (
          <div className="mt-2 flex items-center gap-3">
            <Mon p={x.spotlight} />
            <span className="text-sm">{x.spotlight.bonus}</span>
          </div>
        )}
        {x?.raidbattles?.bosses && <div className="mt-2 flex flex-wrap gap-2">{x.raidbattles.bosses.map((b, i) => <Mon key={`${b.name}-${i}`} p={b} />)}</div>}
        {x?.communityday && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-2">{x.communityday.spawns.map((b, i) => <Mon key={`${b.name}-${i}`} p={b} />)}</div>
            <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
              {x.communityday.bonuses.map((b) => <li key={b.text}>• {b.text}</li>)}
            </ul>
          </div>
        )}
        <a href={e.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-sky">{t.open_leekduck}</a>
      </div>
    </li>
  );
}

function Research() {
  const t = useT();
  const q = useResearch();
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Empty>{t.live_error}</Empty>;
  const groups = new Map<string, NonNullable<typeof q.data>>();
  for (const task of q.data) {
    const k = task.type ?? 'other';
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(task);
  }
  return (
    <>
      {[...groups.entries()].map(([type, tasks]) => (
        <Section key={type} title={t.research_types[type] ?? type} count={tasks.length}>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.text} className="card p-3">
                <div className="text-sm font-semibold" dangerouslySetInnerHTML={{ __html: task.text }} />
                <div className="mt-2 flex flex-wrap gap-2">{task.rewards.map((r, i) => <Mon key={`${r.name}-${i}`} p={r} size={48} />)}</div>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

function Eggs() {
  const t = useT();
  const q = useEggs();
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Empty>{t.live_error}</Empty>;
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
