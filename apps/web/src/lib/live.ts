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
export const useResearch = () => useQuery({ queryKey: ['live', 'research'], queryFn: () => getJson<ResearchTask[]>(`${BASE}research.json`), ...live });
export const useEggs = () => useQuery({ queryKey: ['live', 'eggs'], queryFn: () => getJson<EggPokemon[]>(`${BASE}eggs.json`), ...live });

/** Live events merged with the archive, so past events stay visible. */
export const useEvents = () =>
  useQuery({
    queryKey: ['live', 'events'],
    queryFn: async () => {
      const [liveEvents, archive] = await Promise.all([
        getJson<GameEvent[]>(`${BASE}events.json`).catch(() => [] as GameEvent[]),
        getJson<GameEvent[]>('/data/events-archive.json').catch(() => [] as GameEvent[]),
      ]);
      const byId = new Map<string, GameEvent>();
      for (const e of archive) byId.set(e.eventID, e);
      for (const e of liveEvents) byId.set(e.eventID, e);
      return [...byId.values()];
    },
    ...live,
  });

export type EventStatus = 'current' | 'upcoming' | 'past';

/** Leek Duck times carry no timezone: they are the player's local time, which is what Date parsing gives us. */
export function eventStatus(e: Pick<GameEvent, 'start' | 'end'>, now = Date.now()): EventStatus {
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
