/** Live game data scraped from Leek Duck by ScrapedDuck (refreshed hourly on their side), plus our own event archive. */
import { formInnerFr, resolveLiveKey, type HuntIndex, type Variant } from '@mydexpogo/shared';
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
  /** Optional location label for regional / in-person / venue-exclusive events. */
  location?: string | null;
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
  /** The game's French name of an item reward. */
  nameFr?: string;
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
  /** textFr: the game's own French for the task, when it has the same one. */
  tasks: { text: string; textFr?: string; rewards: ResearchReward[] }[];
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

const REGION_FR: Record<string, string> = { Alolan: "d'Alola", Galarian: 'de Galar', Hisuian: 'de Hisui', Paldean: 'de Paldea' };
const COSTUME_PREFIX_FR: [RegExp, string][] = [
  [/^Sun Crown$/i, 'Couronne Soleil'],
  [/^Moon Crown$/i, 'Couronne Lune'],
  [/^Day Scarf$/i, 'Écharpe Soleil'],
  [/^Night Scarf$/i, 'Écharpe Lune'],
  [/^Sun Scarf$/i, 'Écharpe Soleil'],
  [/^Moon Scarf$/i, 'Écharpe Lune'],
  [/^Flower Crown$/i, 'Couronne de fleurs'],
  [/^Party Hat$/i, 'Chapeau de fête'],
  [/^Witch Hat$/i, 'Chapeau de sorcière'],
  [/^Santa Hat$/i, 'Chapeau de Noël'],
  [/^Holiday Hat$/i, 'Chapeau des fêtes'],
  [/^Winter Holiday$/i, 'Fêtes d’hiver'],
  [/^Holiday$/i, 'Fêtes'],
  [/^New Year(?:'s|’s)?(?: Hat)?$/i, 'Nouvel An'],
  [/^Birthday Hat$/i, 'Chapeau d’anniversaire'],
  [/^Cake Hat$/i, 'Chapeau gâteau'],
  [/^Anniversary$/i, 'Anniversaire'],
  [/^Fashion Week$/i, 'Semaine de la Mode'],
  [/^Halloween$/i, 'Halloween'],
  [/^Spooky$/i, 'Halloween'],
  [/^Harvest$/i, 'Récolte'],
  [/^Detective$/i, 'Détective'],
  [/^Safari Hat$/i, 'Chapeau safari'],
  [/^Explorer(?: Hat)?$/i, 'Explorateur'],
  [/^Captain(?:'s|’s)? Hat$/i, 'Chapeau Capitaine'],
  [/^Train Conductor$/i, 'Conducteur de train'],
  [/^Cowboy Hat$/i, 'Chapeau de cow-boy'],
  [/^Straw Hat$/i, 'Chapeau de paille'],
  [/^Top Hat$/i, 'Haut-de-forme'],
  [/^Bowler Hat$/i, 'Chapeau melon'],
  [/^Beanie$/i, 'Bonnet'],
  [/^Nightcap|Sleep Cap$/i, 'Bonnet de nuit'],
  [/^Visor$/i, 'Visière'],
  [/^Red Scarf$/i, 'Écharpe rouge'],
  [/^Scarf$/i, 'Écharpe'],
  [/^Crown$/i, 'Couronne'],
  [/^Tiara$/i, 'Tiare'],
  [/^Sunglasses|Shades$/i, 'Lunettes de soleil'],
  [/^Goggles$/i, 'Lunettes'],
  [/^Monocle$/i, 'Monocle'],
  [/^Ribbon$/i, 'Ruban'],
  [/^Bow$/i, 'Nœud'],
  [/^Flying$/i, 'Volant'],
  [/^Balloon$/i, 'Ballon'],
  [/^Armored$/i, 'en Armure'],
  [/^Clone$/i, 'Clone'],
  [/^Costume$/i, 'Costumé'],
  [/^Festive$/i, 'Festif'],
  [/^Spring$/i, 'Printemps'],
  [/^Summer$/i, 'Été'],
  [/^Autumn|Fall$/i, 'Automne'],
  [/^Winter$/i, 'Hiver'],
  [/^Ash Hat$/i, 'Casquette de Sacha'],
  [/^Dawn Hat$/i, 'Bonnet d’Aurore'],
  [/^Lucas Hat$/i, 'Béret de Louka'],
  [/^Brendan Hat$/i, 'Casquette de Brice'],
  [/^May(?:'s|’s)? Bow$/i, 'Ruban de Flora'],
  [/^Backwards Cap$/i, 'Casquette à l’envers'],
  [/^World Championships$/i, 'Championnats du Monde'],
];

const DATASET_TOKEN_FR: [RegExp, string][] = [
  [/\bSscarf\b/g, 'Écharpe Soleil'],
  [/\bMscarf\b/g, 'Écharpe Lune'],
  [/\bStiara\b/g, 'Couronne Soleil'],
  [/\bMtiara\b/g, 'Couronne Lune'],
];

type SpeciesOrIdx =
  | Map<number, { name: { en: string; fr?: string } }>
  | { speciesByDex: Map<number, { name: { en: string; fr?: string } }>; variantByKey: Map<string, Variant>; hunt: HuntIndex };

function costumePrefixFr(prefix: string): string {
  const clean = prefix.trim();
  for (const [re, fr] of COSTUME_PREFIX_FR) if (re.test(clean)) return fr;
  return clean;
}

function variantLabelFr(raw: string): string {
  let out = raw;
  for (const [re, fr] of DATASET_TOKEN_FR) out = out.replace(re, fr);
  return out;
}

/**
 * Leek Duck's English name in the app language: "Shadow Alolan Marowak" -> "Ossatueur d'Alola obscur",
 * "Mega Charizard X" -> "Méga-Dracaufeu X", "Sun Crown Pikachu" -> "Pikachu (Couronne Soleil)",
 * "Rockruff" with pm744.fDUSK.icon.png -> "Rocabot (Forme Crépusculaire)".
 */
export function liveName(name: string, image: string, speciesOrIdx: SpeciesOrIdx | undefined, lang: string): string {
  const isIdx = !!speciesOrIdx && 'speciesByDex' in speciesOrIdx;
  const speciesByDex = isIdx ? speciesOrIdx.speciesByDex : speciesOrIdx;
  const dex = dexFromImage(image);
  const sp = speciesByDex?.get(dex ?? 0);

  // Resolve exact variant label from image URL (e.g. pm744.fDUSK.icon.png -> "Forme Crépusculaire").
  let variantLabel: string | null = null;
  if (isIdx) {
    const key = resolveLiveKey(image, name, speciesOrIdx.hunt);
    const v = key ? speciesOrIdx.variantByKey.get(key) : undefined;
    if (v && v.kind !== 'base' && v.kind !== 'mega' && v.kind !== 'gmax' && v.label) {
      variantLabel = lang === 'fr' ? (v.label.fr ?? variantLabelFr(v.label.en)) : v.label.en;
    }
  }

  if (lang !== 'fr') {
    if (variantLabel && !/\([^)]+\)/.test(name) && !name.toLowerCase().includes(variantLabel.toLowerCase())) {
      return `${name} (${variantLabel})`;
    }
    return name;
  }

  if (!sp) return name;
  const spFr = sp.name.fr ?? sp.name.en;
  const m = /^(Shadow )?(Mega |Primal )?(Alolan |Galarian |Hisuian |Paldean )?(Gigantamax |Dynamax )?(.*)$/.exec(name)!;
  const rest = m[5]!.trim();

  let out = spFr;
  let suffix = '';
  let explicitFormOrCostume = false;

  if (rest.startsWith(sp.name.en)) {
    const tail = rest.slice(sp.name.en.length);
    if (tail.trim()) explicitFormOrCostume = true;
    const wearing = /^\s+(?:wearing|with)\s+(?:an?\s+)?(.+)$/i.exec(tail);
    if (wearing) {
      suffix = ` (${costumePrefixFr(wearing[1]!)})`;
    } else {
      suffix = tail
        .replace(/\(([^)]*)\)/g, (_, inner: string) => {
          const mapped = formInnerFr(inner);
          return mapped ? `(${mapped})` : '';
        })
        .replace(/,? and /g, ', ');
    }
  } else if (rest.endsWith(` ${sp.name.en}`)) {
    // Costume/form prefix before species name ("Sun Crown Pikachu", "Origin Forme Dialga", "Curly Form Tatsugiri")
    const prefix = rest.slice(0, rest.length - sp.name.en.length).trim();
    if (/^Dusk(?: Form)?$/i.test(prefix)) suffix = ' (Forme Crépusculaire)';
    else {
      const formMapped = formInnerFr(prefix);
      const translated = formMapped && formMapped !== prefix ? formMapped : costumePrefixFr(prefix);
      suffix = ` (${translated})`;
    }
    explicitFormOrCostume = true;
  } else {
    return name;
  }

  if (m[2] === 'Mega ') out = `Méga-${out}`;
  if (m[2] === 'Primal ') out = `Primo-${out}`;
  out += suffix;
  if (m[3]) out += ` ${REGION_FR[m[3].trim()]}`;
  if (m[4]) out += m[4] === 'Gigantamax ' ? ' Gigamax' : ' Dynamax';
  if (m[1]) out += ' obscur';
  if (!explicitFormOrCostume && !m[2] && !m[3] && !m[4] && variantLabel) {
    out += ` (${variantLabel})`;
  }
  return out;
}

/** Splits a liveName like "Rocabot (Forme Crépusculaire)" into base name + distinct form/costume sub-label. */
export function splitLiveLabel(label: string): { main: string; form: string | null } {
  const m = /^(.+?)\s*\(([^)]+)\)$/.exec(label.trim());
  if (!m) return { main: label, form: null };
  return { main: m[1]!.trim(), form: m[2]!.trim() };
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
  if (Number.isNaN(d.getTime())) return '';
  const day = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  return lang === 'fr' ? `jusqu'au ${day} ${time}` : `until ${day} ${time}`;
}

/** Human short duration ("2 j 3 h", "1 h 25", "35 min") for live countdown badges. */
export function shortDuration(ms: number, lang: string): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remM = mins % 60;
  if (hours < 24) return remM ? `${hours} h ${String(remM).padStart(2, '0')}` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const d = lang === 'fr' ? 'j' : 'd';
  return remH ? `${days} ${d} ${remH} h` : `${days} ${d}`;
}

/** Countdown info for active events (ending within 7 days) or upcoming events (starting within 72 hours). */
export function countdownOf(
  e: { start?: string | null; end?: string | null },
  lang: string,
  now = Date.now(),
): { kind: 'starts' | 'ends'; text: string } | null {
  const start = e.start ? new Date(e.start).getTime() : null;
  const end = e.end ? new Date(e.end).getTime() : null;
  if (start !== null && start > now && start - now <= 72 * 3600_000) {
    return { kind: 'starts', text: shortDuration(start - now, lang) };
  }
  if ((start === null || start <= now) && end !== null && end > now && end - now <= 7 * 86_400_000) {
    return { kind: 'ends', text: shortDuration(end - now, lang) };
  }
  return null;
}

export function formatRange(start: string | null, end: string | null, lang: string): string {
  if (!start) return '';
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return '';
  const rawE = end ? new Date(end) : null;
  const e = rawE && !Number.isNaN(rawE.getTime()) ? rawE : null;
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

export { eventTitle, monsFr } from '@mydexpogo/shared';

/** Raid levels in the order a player reads them; shadows apart from their level. */
export const RAID_TIERS = ['5', 'shadow5', 'mega', '3', 'shadow3', '1', 'shadow1'] as const;
export type RaidTier = (typeof RAID_TIERS)[number];

export interface CurrentBoss {
  tier: RaidTier;
  name: string;
  image: string;
  canBeShiny: boolean;
  /** From Leek Duck's boss list; worked out by the page when only an announcement names the boss. */
  combatPower?: RaidBoss['combatPower'];
  types?: RaidBoss['types'];
  boostedWeather?: RaidBoss['boostedWeather'];
  /** When its week ends, from the announcement. */
  end?: string;
}

const pictureKey = (image: string) => /\/pm(\d+(?:\.[fc][A-Z0-9_]+)?)\.(?:s\.)?icon\.png/.exec(image)?.[1] ?? image;

/** "5-Star Raids" + "Shadow Darkrai" -> shadow5; "Mega Raids" -> mega. */
function bossTier(tier: string, name: string): RaidTier | null {
  if (/mega/i.test(tier)) return 'mega';
  const n = /(\d)-Star/i.exec(tier)?.[1];
  if (!n || !['1', '3', '5'].includes(n)) return null;
  return (/^shadow /i.test(name) ? `shadow${n}` : n) as RaidTier;
}

/** "Deoxys … in 5-star Raid Battles" -> 5; "… in Shadow Raids" -> shadow5; "… in Mega Raids" -> mega. */
function eventTier(e: GameEvent): RaidTier | null {
  if (/in Mega Raids$/i.test(e.name)) return 'mega';
  if (/in Shadow Raids$/i.test(e.name)) return 'shadow5';
  const n = /in (\d)-star Raid Battles$/i.exec(e.name)?.[1];
  return n === '5' || n === '3' || n === '1' ? (n as RaidTier) : null;
}

/** A raid-battle announcement with its dates, under way now. Leek Duck clears the dates of the ones that are over. */
const runningNow = (e: GameEvent, now: number) => e.eventType === 'raid-battles' && !!e.start && !!e.end && eventStatus(e, now) === 'current';

/**
 * The bosses in raids right now, by level. Leek Duck's boss list lags behind on change days, its announcements do
 * not: where a 5-star level has a dated announcement under way, its bosses are the ones (left-overs of last week go),
 * with the list's CP and types when it has them. Megas add the announced one to the list's. Levels without
 * announcements (1 and 3 stars) follow the list.
 */
export function currentRaidBosses(raids: RaidBoss[], events: GameEvent[], now = Date.now()): CurrentBoss[] {
  const running = events.filter((e) => runningNow(e, now) && eventTier(e));
  const announced = new Set(running.map((e) => eventTier(e)!));
  const listed = new Map(raids.map((b) => [pictureKey(b.image), b]));
  // Bosses an announcement that is over names (Leek Duck clears its dates, or they are past).
  const ended = new Set(events.filter((e) => e.eventType === 'raid-battles' && !runningNow(e, now) && eventStatus(e, now) !== 'upcoming').flatMap((e) => (e.extraData?.raidbattles?.bosses ?? []).map((b) => pictureKey(b.image))));
  const out: CurrentBoss[] = [];
  const seen = new Set<string>();
  for (const e of running) {
    const tier = eventTier(e)!;
    for (const b of e.extraData?.raidbattles?.bosses ?? []) {
      const key = `${tier}|${pictureKey(b.image)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fromList = listed.get(pictureKey(b.image));
      const name = tier === 'shadow5' && !/^shadow /i.test(b.name) ? `Shadow ${b.name}` : b.name;
      out.push({ tier, name, image: b.image, canBeShiny: !!(b.canBeShiny ?? fromList?.canBeShiny), combatPower: fromList?.combatPower, types: fromList?.types, boostedWeather: fromList?.boostedWeather, end: e.end! });
    }
  }
  for (const b of raids) {
    const tier = bossTier(b.tier, b.name);
    if (!tier) continue;
    const key = `${tier}|${pictureKey(b.image)}`;
    if (seen.has(key)) continue;
    if (ended.has(pictureKey(b.image))) continue;
    // 5 stars: the week's announcement names them all, so one missing from it is last week's boss. Megas run several
    // side by side (the announcement names only the week's new one): kept unless an announcement that is over names it.
    if (announced.has(tier) && tier !== 'mega') continue;
    seen.add(key);
    out.push({ tier, name: b.name, image: b.image, canBeShiny: !!b.canBeShiny, combatPower: b.combatPower, types: b.types, boostedWeather: b.boostedWeather });
  }
  return out.sort((a, b) => RAID_TIERS.indexOf(a.tier) - RAID_TIERS.indexOf(b.tier));
}

/** Raid Hours and Raid Days now or within two weeks; raid-battle announcements still to come. */
export function raidSchedule(events: GameEvent[], now = Date.now()) {
  const soon = now + 14 * 86_400_000;
  const dated = events.filter((e) => e.start && e.end && eventStatus(e, now) !== 'past').sort((a, b) => a.start!.localeCompare(b.start!));
  return {
    moments: dated.filter((e) => (e.eventType === 'raid-hour' || e.eventType === 'raid-day') && new Date(e.start!).getTime() <= soon),
    next: dated.filter((e) => e.eventType === 'raid-battles' && eventStatus(e, now) === 'upcoming'),
  };
}

/**
 * Recurring weekly Pokémon GO "Daily Discoveries" (Mon=0 .. Sun=6).
 * Fixed bonuses active every week, displayed as a compact aligned strip in "Ma semaine".
 */
export interface DailyDiscovery {
  /** Day index in Monday-first week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun. */
  dow: number;
  icon: string;
  accent: string;
  fr: { title: string; lines: string[] };
  en: { title: string; lines: string[] };
}

export const DAILY_DISCOVERIES: readonly (DailyDiscovery | null)[] = [
  {
    dow: 0,
    icon: '⚡',
    accent: 'border-fuchsia-400/35 bg-fuchsia-950/35',
    fr: { title: 'Lundi Max', lines: ['1 Super Bonbon XL (Combats Max en personne)'] },
    en: { title: 'Max Monday', lines: ['1 Rare Candy XL (in-person Max Battles)'] },
  },
  {
    dow: 1,
    icon: '🏅',
    accent: 'border-amber-400/35 bg-amber-950/35',
    fr: { title: 'Mardi Concours', lines: ['Participe jusqu’à 5 Concours PokéStop'] },
    en: { title: 'Showcase Tuesday', lines: ['Enter up to 5 PokéStop Showcases'] },
  },
  {
    dow: 2,
    icon: '⚔️',
    accent: 'border-rose-400/35 bg-rose-950/35',
    fr: { title: 'Heure de Raid', lines: ['1 Super Bonbon XL (Raids en personne)'] },
    en: { title: 'Raid Hour', lines: ['1 Rare Candy XL (in-person Raid Battles)'] },
  },
  {
    dow: 3,
    icon: '🏆',
    accent: 'border-indigo-400/35 bg-indigo-950/35',
    fr: { title: 'Jeudi Combat GO', lines: ['50 combats/jour', '4× Poussière en victoire'] },
    en: { title: 'GO Battle Thursday', lines: ['50 battles/day', '4× Stardust from wins'] },
  },
  {
    dow: 4,
    icon: '🤝',
    accent: 'border-emerald-400/35 bg-emerald-950/35',
    fr: { title: 'Vendredi Amitié', lines: ['3 échanges spéciaux · 2 Bonbons XL', 'Chances accrues de Chanceux'] },
    en: { title: 'Friendship Friday', lines: ['Up to 3 Special Trades · 2 Candy XL', 'Increased Lucky Trade chance'] },
  },
  null, // Saturday: reserved for weekend events
  {
    dow: 6,
    icon: '🗺️',
    accent: 'border-sky-400/35 bg-sky-950/35',
    fr: { title: 'Dimanche Balade', lines: ['+ de Pokémon & Encens sur Routes', 'Mateo jusqu’à 3×'] },
    en: { title: 'Scenic Sunday', lines: ['More spawns & Incense on Routes', 'Encounter Mateo up to 3×'] },
  },
];

const LOCAL_EVENT_TYPES = new Set(['city-safari', 'safari-zone', 'live-event', 'local-event', 'regional-event']);
const TOUR_OR_FEST_TYPES = new Set(['pokemon-go-tour', 'pokemon-go-fest', 'go-wild-area']);
const LOCAL_EVENT_RE =
  /\b(?:city safari|safari zone|stamp rally|pok[eé]park|pok[eé]xciting|pok[eé]mon center|pok[eé]mon observatory|astronomical observatory|fossil museum|national trust|mall exploration|apple stores?|partner research|air adventures|pok[eé]mon jet|pikachu jet|european space agency|\besa\b|in-person|select locations|select malls|participating stores|participating airports|participating museums|only available in|museums across|mcdonald'?s|7-eleven|familymart|starbucks|tully'?s|circle k|oxxo|aeon|apac|latam|philippines|malaysia|thailand|south korea|taiwan|japan|hong kong|indonesia|singapore|brazil|mexico city|los angeles|kaohsiung|osaka|sendai|fukuoka|tokyo|seoul|taipei|jakarta|chicago|new york|madrid|london|paris|milan|barcelona|amsterdam|munich|sydney|manila|bangkok|kuala lumpur|s[aã]o paulo|uk national|england|wales|northern ireland)\b/i;

/**
 * Returns true when an event is restricted to a specific city, country, venue, or regional partnership
 * (e.g. GO Tour Los Angeles/Kaohsiung, City Safari, Apple Store Japan, Mall Exploration, ESA Museums, National Trust).
 */
export function isLocalEvent(
  ev: Pick<GameEvent, 'eventType' | 'name' | 'heading'> & { summary?: string | null; location?: string | null },
): boolean {
  const title = `${ev.name} ${ev.heading ?? ''}`;
  if (LOCAL_EVENT_TYPES.has(ev.eventType)) return true;
  if (/\bglobal\b|\bworldwide\b/i.test(title) && !ev.location) return false;
  if (ev.location && !/^(?:global|worldwide)$/i.test(ev.location.trim())) return true;
  if (TOUR_OR_FEST_TYPES.has(ev.eventType)) return true;
  if (LOCAL_EVENT_RE.test(title)) return true;
  if (ev.summary && /\b(?:in-person event|only available in|select locations|select malls|participating stores|participating museums)\b/i.test(ev.summary)) return true;
  return false;
}

const LOCATION_FLAGS: [RegExp, string][] = [
  [/\b(?:japan|tokyo|osaka|sendai|kanagawa|fukuoka|inagi|yomiuriland)\b/i, '🇯🇵'],
  [/\b(?:philippines|manila|cebu|davao)\b/i, '🇵🇭'],
  [/\b(?:malaysia|kuala lumpur)\b/i, '🇲🇾'],
  [/\b(?:singapore|changi)\b/i, '🇸🇬'],
  [/\b(?:hong kong)\b/i, '🇭🇰'],
  [/\b(?:thailand|bangkok)\b/i, '🇹🇭'],
  [/\b(?:taiwan|taipei|kaohsiung|tainan)\b/i, '🇹🇼'],
  [/\b(?:south korea|seoul|incheon)\b/i, '🇰🇷'],
  [/\b(?:indonesia|jakarta)\b/i, '🇮🇩'],
  [/\b(?:england|wales|northern ireland|united kingdom|\buk\b|london)\b/i, '🇬🇧'],
  [/\b(?:europe|esa\b)\b/i, '🇪🇺'],
  [/\b(?:france|paris|toulouse|marseille)\b/i, '🇫🇷'],
  [/\b(?:germany|munich|nuremberg|cologne)\b/i, '🇩🇪'],
  [/\b(?:spain|madrid|barcelona|val[eè]ncia|m[aá]laga)\b/i, '🇪🇸'],
  [/\b(?:usa|u\.s\.|united states|chicago|los angeles|boston|new york|san francisco|miami)\b/i, '🇺🇸'],
  [/\b(?:mexico)\b/i, '🇲🇽'],
  [/\b(?:brazil|rio de janeiro|s[aã]o paulo)\b/i, '🇧🇷'],
  [/\b(?:australia|sydney|brisbane|melbourne)\b/i, '🇦🇺'],
  [/\b(?:india)\b/i, '🇮🇳'],
];

const LOCATION_FR: [RegExp, string][] = [
  [/\bSelect malls in\b/gi, 'Centres commerciaux :'],
  [/\bParticipating science and space museums across Europe\b/gi, '6 musées scientifiques en Europe'],
  [/\bParticipating airports across Japan\b/gi, 'Aéroports participants au Japon'],
  [/\bPok[eé]mon Center locations around Japan\b/gi, 'Pokémon Centers au Japon'],
  [/\bNational Trust locations across England, Wales, and Northern Ireland\b/gi, 'Sites National Trust (Royaume-Uni)'],
  [/\bWorldwide in specific locations\b/gi, 'Lieux précis dans le monde'],
  [/\bJapan\b/gi, 'Japon'],
  [/\bMalaysia\b/gi, 'Malaisie'],
  [/\bSingapore\b/gi, 'Singapour'],
  [/\bThailand\b/gi, 'Thaïlande'],
  [/\bSouth Korea\b/gi, 'Corée du Sud'],
  [/\bTaiwan\b/gi, 'Taïwan'],
  [/\bIndonesia\b/gi, 'Indonésie'],
  [/\bEngland\b/gi, 'Angleterre'],
  [/\bWales\b/gi, 'Pays de Galles'],
  [/\bNorthern Ireland\b/gi, 'Irlande du Nord'],
  [/\bUnited Kingdom\b/gi, 'Royaume-Uni'],
  [/\bGermany\b/gi, 'Allemagne'],
  [/\bSpain\b/gi, 'Espagne'],
  [/\bNetherlands\b/gi, 'Pays-Bas'],
  [/\bBelgium\b/gi, 'Belgique'],
  [/\bUnited States\b|\bUSA\b/g, 'États-Unis'],
  [/\bBrazil\b/gi, 'Brésil'],
  [/\bMexico\b/gi, 'Mexique'],
  [/\bAustralia\b/gi, 'Australie'],
  [/\bIndia\b/gi, 'Inde'],
];

/** Formats a regional location string with flag emojis and concise French country names for badges & cards. */
export function formatLocationBadge(location: string | null | undefined, lang: string): string | null {
  if (!location || !location.trim()) return null;
  let text = location.trim();
  const flags: string[] = [];
  for (const [re, flag] of LOCATION_FLAGS) {
    if (re.test(text) && !flags.includes(flag) && flags.length < 4) flags.push(flag);
  }
  if (lang === 'fr') {
    for (const [re, fr] of LOCATION_FR) text = text.replace(re, fr);
  }
  if (text.length > 64) text = `${text.slice(0, 61).trimEnd()}…`;
  return flags.length ? `${flags.join('')} ${text}` : text;
}
