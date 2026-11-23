/** Live game data scraped from Leek Duck by ScrapedDuck (refreshed hourly on their side), plus our own event archive. */
import { useQuery } from '@tanstack/react-query';

const BASE = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/';

export interface LivePokemon {
  name: string;
  image: string;
  canBeShiny?: boolean;
  combatPower?: { min: number; max: number } | { normal: { min: number; max: number }; boosted: { min: number; max: number } };
}
export interface RaidBoss extends LivePokemon {
  tier: string;
  types: { name: string; image: string }[];
  combatPower: { normal: { min: number; max: number }; boosted: { min: number; max: number } };
  boostedWeather: { name: string; image: string }[];
}
export interface GameEvent {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string;
  image: string;
  start: string | null;
  end: string | null;
  /** Only known from our archive: Leek Duck no longer lists it. */
  archived?: boolean;
  extraData?: {
    generic?: { hasSpawns?: boolean; hasFieldResearchTasks?: boolean };
    raidbattles?: { bosses: LivePokemon[]; shinies?: LivePokemon[] };
    spotlight?: { name: string; canBeShiny: boolean; image: string; bonus: string; list?: LivePokemon[] };
    communityday?: { spawns: LivePokemon[]; bonuses: { text: string; image: string }[]; bonusDisclaimers?: string[]; shinies?: LivePokemon[]; specialresearch?: unknown[] };
  };
}
export interface ResearchTask {
  text: string;
  type?: string;
  rewards: LivePokemon[];
}
export interface EggPokemon extends LivePokemon {
  eggType: string;
  isAdventureSync: boolean;
  isRegional: boolean;
  isGiftExchange: boolean;
  rarity: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

const live = { staleTime: 10 * 60_000, retry: 1 };

export const useRaids = () => useQuery({ queryKey: ['live', 'raids'], queryFn: () => getJson<RaidBoss[]>(`${BASE}raids.json`), ...live });
export interface ResearchReward {
  kind: 'encounter' | 'item' | 'resource';
  name: string;
  image: string;
  quantity?: number;
  /** Candy and Mega Energy: whose. */
  dex?: number;
  canBeShiny?: boolean;
  combatPower?: { min: number; max: number };
}
export interface ResearchCategory {
  title: string;
  /** Tasks only given during an event, until `end`. */
  event: boolean;
  end: string | null;
  tasks: { text: string; rewards: ResearchReward[] }[];
}

/**
 * Field research read from Leek Duck by our API (event tasks apart, item rewards included). If that fails,
 * ScrapedDuck's list: encounters only, grouped by kind of task.
 */
export const useResearch = () =>
  useQuery({
    queryKey: ['live', 'research'],
    queryFn: async () => {
      try {
        const { categories } = await getJson<{ categories: ResearchCategory[] }>('/api/game/research');
        if (categories.length) return categories;
      } catch {}
      const groups = new Map<string, ResearchCategory>();
      for (const task of await getJson<ResearchTask[]>(`${BASE}research.json`)) {
        const type = task.type ?? 'other';
        const g = groups.get(type) ?? groups.set(type, { title: type, event: false, end: null, tasks: [] }).get(type)!;
        g.tasks.push({ text: task.text.replace(/<[^>]+>/g, ''), rewards: task.rewards.map((r) => ({ ...r, kind: 'encounter' as const, combatPower: r.combatPower && 'min' in r.combatPower ? r.combatPower : undefined })) });
      }
      return [...groups.values()];
    },
    ...live,
  });
export const useEggs = () => useQuery({ queryKey: ['live', 'eggs'], queryFn: () => getJson<EggPokemon[]>(`${BASE}eggs.json`), ...live });

/** Live events merged with the archive, so past events stay visible. */
export const useEvents = () =>
  useQuery({
    queryKey: ['live', 'events'],
    queryFn: async () => {
      const [liveEvents, archive] = await Promise.all([
        getJson<GameEvent[]>(`${BASE}events.json`).catch(() => [] as GameEvent[]),
        getJson<GameEvent[]>('/api/data/events-archive.json').catch(() => [] as GameEvent[]),
      ]);
      const byId = new Map<string, GameEvent>();
      for (const e of archive) byId.set(e.eventID, { ...e, archived: true });
      for (const e of liveEvents) byId.set(e.eventID, e);
      return [...byId.values()];
    },
    ...live,
  });

export type EventStatus = 'current' | 'upcoming' | 'past';

/** Leek Duck times carry no timezone: they are the player's local time, which is what Date parsing gives us. */
export function eventStatus(e: Pick<GameEvent, 'start' | 'end' | 'archived'>, now = Date.now()): EventStatus {
  // An undated event that dropped off Leek Duck is over, not "current forever".
  if (e.archived && !e.start && !e.end) return 'past';
  const start = e.start ? new Date(e.start).getTime() : null;
  const end = e.end ? new Date(e.end).getTime() : null;
  if (start !== null && start > now) return 'upcoming';
  if (end !== null && end < now) return 'past';
  return 'current';
}

/** Leek Duck uses PokeMiners picture names, so a boss can be linked back to our Pokédex. */
export function dexFromImage(url: string): number | null {
  const m = /\/(?:pm(\d+)\.|pokemon_icon_(\d{3})_)/.exec(url);
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

/**
 * The current raid-battle event announcing this boss, which carries the end date Leek Duck's boss list lacks.
 * Matches on the boss name (without Shadow prefix and form) and on Shadow / Mega consistency.
 */
export function raidEventFor(bossName: string, events: GameEvent[], now = Date.now()): GameEvent | undefined {
  const shadow = /^shadow /i.test(bossName);
  const mega = /^mega /i.test(bossName);
  const base = bossName.replace(/^shadow /i, '').replace(/\s*\(.*\)$/, '').toLowerCase();
  return events
    .filter((e) => e.eventType === 'raid-battles' && eventStatus(e, now) === 'current' && e.end)
    .filter((e) => {
      const name = e.name.toLowerCase();
      const bosses = (e.extraData?.raidbattles?.bosses ?? []).map((b) => b.name.toLowerCase());
      const named = name.includes(base) || bosses.some((b) => b.startsWith(base));
      return named && /shadow/.test(name) === shadow && /\bmega\b/.test(name) === mega;
    })
    .sort((a, b) => a.end!.localeCompare(b.end!))[0];
}

export function formatUntil(end: string, lang: string): string {
  const d = new Date(end);
  const day = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  return lang === 'fr' ? `jusqu'au ${day} ${time}` : `until ${day} ${time}`;
}

export function formatRange(start: string | null, end: string | null, lang: string): string {
  if (!start) return '';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
  if (!e) return `${day.format(s)} ${time.format(s)}`;
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay ? `${day.format(s)} · ${time.format(s)} – ${time.format(e)}` : `${day.format(s)} ${time.format(s)} → ${day.format(e)} ${time.format(e)}`;
}

export interface CuratedPost {
  id: string;
  url: string;
  author: string;
  authorUrl: string | null;
  text: string;
  html: string;
  links: string[];
  codes: string[];
  postedAt: string | null;
  createdAt: string;
}
export interface PromoCode { code: string; title: string; description: string; rewards: string[]; redeemUrl: string }

export const usePosts = () => useQuery({ queryKey: ['game', 'posts'], queryFn: () => getJson<{ posts: CuratedPost[] }>('/api/game/posts').then((r) => r.posts), staleTime: 60_000 });
export const usePromoCodes = () => useQuery({ queryKey: ['game', 'promo'], queryFn: () => getJson<{ codes: PromoCode[] }>('/api/game/promo-codes').then((r) => r.codes), ...live });

/** Events about Max Battles: Max Mondays, Dynamax / Gigantamax days, Max Battle days. */
export const isMaxEvent = (e: GameEvent) => /max-|dynamax|gigantamax/i.test(`${e.eventType} ${e.name}`);

/** Splits text into plain parts and URLs so links can be rendered clickable. */
export function linkify(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  const re = /https?:\/\/[^\s<>")]+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], url: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
