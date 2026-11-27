/**
 * Rich event details scraped from ScrapedDuck events.json + Leek Duck event pages:
 * bonuses (free, GO Pass milestones, ticket), highlights (debuts, new shinies, special backgrounds,
 * new moves, Super Max, limited-time evolutions), spawns (including dated sub-groups), tiered raids
 * (1★/3★/5★/Mega/Shadow), eggs by distance, field research, moves, GO Pass and event ticket rewards.
 * Cached for 1 hour per page and for the full list; resettable from the admin panel.
 */
import type {
  EventBonusItem,
  EventDetailMon,
  EventHighlight,
  EventMonGroup,
  EventMoveEntry,
  EventPaidOffer,
  EventTemplateKind,
  RichGameEvent,
} from '@mydexpogo/shared';
import { tracked } from '../lib/health.js';

interface LiveEvent {
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
    raidbattles?: { bosses?: { name: string; image: string; canBeShiny?: boolean }[]; shinies?: { name: string; image: string }[] };
    spotlight?: { name: string; canBeShiny: boolean; image: string; bonus: string; list?: { name: string; image: string; canBeShiny?: boolean }[] };
    communityday?: {
      spawns?: { name: string; image: string; canBeShiny?: boolean }[];
      bonuses?: { text: string; image?: string }[];
      shinies?: { name: string; image: string }[];
    };
  };
}

/** Routine rotations that already have dedicated tabs (Raids, GBL) or noise without event content. */
const SKIP_TYPES = new Set(['raid-battles', 'raid-hour', 'go-battle-league', 'pokestop-showcase', 'season']);
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; mydexpogo/1.0)' };
const CACHE_MS = 3600_000;
const MAX_PAGE_CACHE = 200;

const pageCache = new Map<string, { at: number; event: Omit<RichGameEvent, 'eventID' | 'name' | 'eventType' | 'heading' | 'template' | 'link' | 'image' | 'start' | 'end'> }>();
const pageInFlight = new Map<string, Promise<Omit<RichGameEvent, 'eventID' | 'name' | 'eventType' | 'heading' | 'template' | 'link' | 'image' | 'start' | 'end'>>>();
let listCache: { at: number; events: RichGameEvent[] } | null = null;
let rawEventsCache: { at: number; events: LiveEvent[] } | null = null;

export function resetEventDetailsCache() {
  pageCache.clear();
  pageInFlight.clear();
  listCache = null;
  rawEventsCache = null;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&#8217;|&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&minus;|&#8722;/g, '−')
    .replace(/&times;|&#215;/g, '×')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' '));

const isBoilerplate = (s: string) =>
  !s ||
  s.length < 4 ||
  /Hey, I’m LeekDuck|Hey, I'm LeekDuck|Source:\s*Official|Tickets can be gifted|non-refundable|subject to applicable law|cannot be purchased with PokéCoins|equivalent pricing tier|Tasks have not yet been announced|full rank-by-rank reward list|Available until/i.test(s);

export function templateOf(e: Pick<LiveEvent, 'eventType' | 'name'>): EventTemplateKind {
  if (e.eventType === 'community-day') return 'community_day';
  if (e.eventType === 'pokemon-spotlight-hour') return 'spotlight';
  if (e.eventType === 'raid-day' || e.eventType === 'raid-battles' || e.eventType === 'raid-hour') return 'raid_day';
  if (e.eventType === 'max-battles' || e.eventType === 'max-mondays' || /gigantamax|dynamax|max battle/i.test(e.name)) return 'max';
  return 'event';
}

function resolveAssetUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `https://leekduck.com${s}`;
  return s;
}

function readMons(body: string): EventDetailMon[] {
  const out: EventDetailMon[] = [];
  const plainSection = stripTags(body);
  // Detect Dusk Form Rockruff even when Leek Duck reuses the base pm744 icon and notes Dusk Form in the section prose.
  const duskRockruffNote = /dusk form\s+(?:lycanroc|rockruff)|rockruff.*dusk form/i.test(plainSection);
  for (const item of body.split('class="pkmn-list-item"').slice(1)) {
    const image = resolveAssetUrl(/<img[^>]+src="([^"]+)"/.exec(item)?.[1]);
    const rawName = /class="pkmn-name">([^<]*)</.exec(item)?.[1] ?? /alt="([^"]*)"/.exec(item)?.[1];
    if (!image || !rawName) continue;
    let name = decode(rawName);
    if (duskRockruffNote && /^Rockruff$/i.test(name)) {
      name = 'Rockruff (Dusk Form)';
    }
    if (!out.some((m) => m.image === image && m.name === name)) {
      out.push({ name, image, canBeShiny: /pokemon-cutout-shiny|shiny-icon/.test(item) });
    }
  }
  return out;
}

function readBonuses(body: string, defaultGroup?: string, paid = false): EventBonusItem[] {
  const out: EventBonusItem[] = [];
  // Track inline time-window intros like "The following bonuses will be active on Dec 5 from 12:00 a.m. to 5:00 p.m."
  const chunks = body.split(/(?=class="bonus-item")/);
  let windowGroup = defaultGroup;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    if (i === 0) {
      const m = /active[^<\n]*?from\s+([^\n<]+?(?:local time|PST|UTC))/i.exec(stripTags(c));
      if (m && !defaultGroup) windowGroup = m[1]!.replace(/\s+local time/i, '').trim();
      continue;
    }
    const img = resolveAssetUrl(/<img[^>]+src="([^"]+)"/.exec(c)?.[1]);
    const txt = /class="bonus-text"[^>]*>([\s\S]*?)<\/div>/.exec(c)?.[1];
    if (txt) {
      const clean = stripTags(txt);
      if (clean) {
        const isDeluxe = /^GO Pass Deluxe:/i.test(clean);
        out.push({
          text: clean,
          ...(img && !img.endsWith('/none.png') ? { image: img } : {}),
          ...(windowGroup ? { group: windowGroup } : {}),
          ...(paid || isDeluxe ? { paid: true } : {}),
        });
      }
    }
    // Check if the tail after this bonus item introduces a new time-window block for subsequent bonuses.
    const afterEnd = c.indexOf('</div>');
    if (afterEnd > 0) {
      const tail = stripTags(c.slice(afterEnd));
      const m = /following bonus(?:es)? will be active[^<\n]*?from\s+([^\n<]+?(?:local time|PST|UTC))/i.exec(tail);
      if (m) windowGroup = m[1]!.replace(/\s+local time/i, '').trim();
    }
  }
  return out;
}

function readBullets(body: string): string[] {
  return [...body.matchAll(/<li(?:\s+class="(?!pkmn-list-item)[^"]*")?>([\s\S]*?)<\/li>/g)]
    .map((m) => stripTags(m[1]!))
    .filter((s) => s.length > 1 && s.length < 180 && !/^and (even )?more!?$|^additional rewards$/i.test(s) && !isBoilerplate(s));
}

function readParagraphs(body: string): string[] {
  return [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => stripTags(m[1]!))
    .filter((s) => s.length > 6 && s.length < 280 && !isBoilerplate(s));
}

/** Parses one Leek Duck event page HTML into structured sections for the infographic templates. */
export function parseEventHtml(html: string, base: LiveEvent): RichGameEvent {
  const startIdx = html.indexOf('class="event-description"');
  const endIdx = html.indexOf('<footer', startIdx > 0 ? startIdx : 0);
  const body = html.slice(startIdx > 0 ? startIdx : 0, endIdx > 0 ? endIdx : html.length);

  // Split into sections delimited by <h2 id="..."> or <h3 id="...">.
  const parts = body.split(/(?=<h[23][^>]*id=")/);
  const introParas = readParagraphs(parts[0] ?? '');
  const summary = introParas.find((p) => p.length > 20 && !/^Raids Current/i.test(p)) ?? null;

  const bonuses: EventBonusItem[] = [];
  const highlights: EventHighlight[] = [];
  const featured: EventDetailMon[] = [];
  const spawnGroups: EventMonGroup[] = [];
  const raidGroups: EventMonGroup[] = [];
  const eggGroups: EventMonGroup[] = [];
  const research: EventDetailMon[] = [];
  let researchNote: string | null = null;
  const rocket: EventDetailMon[] = [];
  const newShinies: EventDetailMon[] = [];
  const moves: EventMoveEntry[] = [];
  let goPass: RichGameEvent['goPass'];
  let ticket: EventPaidOffer | undefined;
  let graphicUrl: string | null = null;

  let parentH2 = '';
  for (const part of parts.slice(1)) {
    const hm = /^<h([23])[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/.exec(part);
    if (!hm) continue;
    const level = Number(hm[1]);
    const id = hm[2]!.toLowerCase();
    const title = stripTags(hm[3]!);
    const content = part.slice(hm[0].length);
    if (level === 2) parentH2 = id;

    // 1. Graphic
    if (id === 'graphic') {
      graphicUrl = resolveAssetUrl(/<img[^>]+src="([^"]+)"/.exec(content)?.[1]) ?? graphicUrl;
      continue;
    }

    // 2. Skip pure web-store upsells
    if (id === 'sales' || id.startsWith('pokémon-go-web-store') || id.startsWith('where-can-i-find')) continue;

    // 3. Bonuses & Tier milestones
    if (parentH2 === 'bonuses' || id === 'bonuses') {
      const group = level === 3 ? title : undefined;
      bonuses.push(...readBonuses(content, group, false));
      continue;
    }

    // 4. Event ticket / Paid Timed Research / Paid Special Research
    if (id === 'event-ticket' || id === 'paid-timed-research' || /special-research/.test(id)) {
      const price = /US\$\d+(?:\.\d+)?/.exec(content)?.[0];
      const rewards = readBullets(content);
      const tBonuses = readBonuses(content, undefined, true);
      if (price || rewards.length || tBonuses.length) {
        if (!ticket) {
          ticket = { title, ...(price ? { price } : {}), rewards, bonuses: tBonuses };
        } else {
          if (!ticket.price && price) ticket.price = price;
          for (const r of rewards) if (!ticket.rewards.includes(r)) ticket.rewards.push(r);
          for (const b of tBonuses) if (!ticket.bonuses.some((x) => x.text === b.text)) ticket.bonuses.push(b);
        }
      }
      continue;
    }

    // 5. GO Pass section
    if (parentH2.startsWith('go-pass') || id.startsWith('go-pass') || id === 'featured-pokémon-and-rewards') {
      const price = /US\$\d+(?:\.\d+)?/.exec(content)?.[0];
      if (!goPass) goPass = { title: title.startsWith('GO Pass') ? title : 'GO Pass', freeRewards: [], deluxeRewards: [] };
      if (price && !goPass.price) goPass.price = price;
      // Split lists when Leek Duck separates free track vs Deluxe track via a paragraph mentioning "Deluxe".
      const ulParts = content.split(/<ul[^>]*>/i).slice(1);
      if (ulParts.length >= 2) {
        const free = readBullets(`<ul>${ulParts[0]}`);
        const deluxe = readBullets(`<ul>${ulParts[1]}`);
        for (const r of free) if (!goPass.freeRewards.includes(r)) goPass.freeRewards.push(r);
        for (const r of deluxe) if (!goPass.deluxeRewards.includes(r)) goPass.deluxeRewards.push(r);
      } else {
        const items = readBullets(content);
        for (const r of items) if (!goPass.freeRewards.includes(r)) goPass.freeRewards.push(r);
      }
      continue;
    }

    // 6. Debuts, Super Max, Special Backgrounds, New Attacks, Limited-time Evo, Global Challenge
    if (/debut/.test(id)) {
      const mons = readMons(content).map((m) => ({ ...m, debut: true }));
      const text = readParagraphs(content)[0] ?? '';
      if (mons.length || text) highlights.push({ kind: 'debut', title, text, ...(mons.length ? { mons } : {}) });
      continue;
    }
    if (id.includes('super-max')) {
      const mons = readMons(content);
      const text = readParagraphs(content)[0] ?? '';
      if (mons.length || text) highlights.push({ kind: 'super_max', title, text, ...(mons.length ? { mons } : {}) });
      continue;
    }
    if (id.includes('special-background')) {
      const text = readParagraphs(content)[0] ?? '';
      if (text) highlights.push({ kind: 'background', title, text });
      continue;
    }
    if (id.includes('attack-availability') || (/Trainer Battles:/i.test(content) && /Raid Battles:/i.test(content) && parentH2 !== 'moves')) {
      const paras = readParagraphs(content);
      const bullets = readBullets(content);
      const text = [paras[0], ...bullets.slice(0, 2)].filter(Boolean).join(' · ');
      if (text) highlights.push({ kind: 'move', title, text });
      continue;
    }
    if (id.includes('evolution-requirement')) {
      const mons = readMons(content);
      const text = readParagraphs(content)[0] ?? '';
      if (text) highlights.push({ kind: 'evolution', title, text, ...(mons.length ? { mons } : {}) });
      continue;
    }
    if (id === 'global-challenge') {
      const text = readParagraphs(content)[0] ?? '';
      if (text) highlights.push({ kind: 'info', title, text });
      continue;
    }

    // 7. Featured Pokémon
    if (id === 'featured-pokémon') {
      for (const m of readMons(content)) if (!featured.some((x) => x.image === m.image)) featured.push(m);
      continue;
    }

    // 8. Spawns (including dated h3 sub-groups or Day 1 / Day 2)
    if (parentH2 === 'spawns' || id === 'spawns' || id === 'wild-encounters') {
      const mons = readMons(content);
      if (mons.length) spawnGroups.push({ label: level === 3 ? title : 'Spawns', mons });
      continue;
    }

    // 9. Raids (preserving 1★, 3★, 5★, Mega, Shadow sub-groups!)
    if (parentH2 === 'raids' || id === 'raids') {
      const mons = readMons(content);
      if (mons.length) raidGroups.push({ label: title, mons });
      continue;
    }

    // 10. Eggs (per distance)
    if (parentH2 === 'eggs' || /egg|hatch/.test(id)) {
      const mons = readMons(content);
      if (mons.length) eggGroups.push({ label: title, mons });
      continue;
    }

    // 11. Field Research
    if (/field-research/.test(id)) {
      const mons = readMons(content);
      for (const m of mons) if (!research.some((x) => x.image === m.image)) research.push(m);
      const p = readParagraphs(content)[0];
      if (p && !researchNote) researchNote = p;
      continue;
    }

    // 12. Rocket / Shadow
    if (/rocket|^shadow-pokémon$/.test(id)) {
      for (const m of readMons(content)) if (!rocket.some((x) => x.image === m.image)) rocket.push(m);
      continue;
    }

    // 13. Shiny section (debuts vs featured)
    if (parentH2 === 'shiny' || id === 'shiny') {
      const mons = readMons(content);
      const isNew = /will be released|for the first time|debut/i.test(content);
      if (mons.length && isNew) {
        for (const m of mons) {
          if (!newShinies.some((x) => x.image === m.image)) newShinies.push({ ...m, canBeShiny: true, newShiny: true });
        }
      }
      continue;
    }

    // 14. Community Day featured moves
    if (parentH2 === 'moves' && level === 3) {
      const mons = readMons(content);
      const p = readParagraphs(content)[0] ?? '';
      const moveMatch = /(?:Charged|Fast) Attack\s+([A-Za-z0-9'’+\- ]+?)(?:\.|,| while| during|$)/.exec(p);
      if (mons.length || moveMatch) {
        moves.push({ pokemon: title, move: moveMatch?.[1]?.trim() ?? p.slice(0, 60), mons });
      }
    }
  }

  // Enrich from ScrapedDuck extraData for Spotlight Hours & Community Days when HTML sections are minimal.
  const template = templateOf(base);
  if (template === 'spotlight' && base.extraData?.spotlight) {
    const sp = base.extraData.spotlight;
    if (!bonuses.length && sp.bonus) bonuses.push({ text: sp.bonus });
    if (!featured.length && !spawnGroups.length) {
      const list = sp.list?.length ? sp.list : [{ name: sp.name, image: sp.image, canBeShiny: sp.canBeShiny }];
      for (const m of list) featured.push({ name: m.name, image: m.image, canBeShiny: !!m.canBeShiny });
    }
  }
  if (template === 'community_day' && base.extraData?.communityday) {
    const cd = base.extraData.communityday;
    if (!bonuses.length && cd.bonuses?.length) {
      for (const b of cd.bonuses) bonuses.push({ text: b.text, ...(b.image ? { image: b.image } : {}) });
    }
    if (!spawnGroups.length && !featured.length && cd.spawns?.length) {
      spawnGroups.push({
        label: 'Spawns',
        mons: cd.spawns.map((m) => ({ name: m.name, image: m.image, canBeShiny: m.canBeShiny !== false })),
      });
    }
  }
  if (!raidGroups.length && base.extraData?.raidbattles?.bosses?.length) {
    const label = /mega/i.test(base.name)
      ? 'Mega Raids'
      : /shadow/i.test(base.name)
        ? 'Shadow Raids'
        : /5-star/i.test(base.name)
          ? 'Five-Star Raids'
          : /3-star/i.test(base.name)
            ? 'Three-Star Raids'
            : /1-star/i.test(base.name)
              ? 'One-Star Raids'
              : 'Raids';
    raidGroups.push({
      label,
      mons: base.extraData.raidbattles.bosses.map((b) => ({ name: b.name, image: b.image, canBeShiny: !!b.canBeShiny })),
    });
  }

  // Flag newShiny across featured / spawns / raids / highlights when present in newShinies.
  if (newShinies.length) {
    const newNames = new Set(newShinies.map((m) => m.name.toLowerCase()));
    const mark = (m: EventDetailMon) => (newNames.has(m.name.toLowerCase()) ? { ...m, canBeShiny: true, newShiny: true } : m);
    for (let i = 0; i < featured.length; i++) featured[i] = mark(featured[i]!);
    for (const g of spawnGroups) g.mons = g.mons.map(mark);
    for (const g of raidGroups) g.mons = g.mons.map(mark);
    for (const h of highlights) if (h.mons) h.mons = h.mons.map(mark);
  }

  return {
    eventID: base.eventID,
    name: base.name,
    eventType: base.eventType,
    heading: base.heading,
    template,
    link: base.link,
    image: base.image,
    start: base.start,
    end: base.end,
    summary,
    bonuses,
    highlights,
    featured,
    spawnGroups,
    raidGroups,
    eggGroups,
    research,
    researchNote,
    rocket,
    newShinies,
    moves,
    ...(goPass && (goPass.freeRewards.length || goPass.deluxeRewards.length || goPass.price) ? { goPass } : {}),
    ...(ticket ? { ticket } : {}),
    ...(graphicUrl ? { graphicUrl } : {}),
  };
}

async function fetchOneEvent(base: LiveEvent): Promise<RichGameEvent> {
  const assemble = (rest: Omit<RichGameEvent, 'eventID' | 'name' | 'eventType' | 'heading' | 'template' | 'link' | 'image' | 'start' | 'end'>): RichGameEvent => ({
    eventID: base.eventID,
    name: base.name,
    eventType: base.eventType,
    heading: base.heading,
    template: templateOf(base),
    link: base.link,
    image: base.image,
    start: base.start,
    end: base.end,
    ...rest,
  });
  const hit = pageCache.get(base.link);
  if (hit && Date.now() - hit.at < CACHE_MS) return assemble(hit.event);
  let pending = pageInFlight.get(base.link);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(base.link, { headers: UA, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`event detail ${base.eventID}: HTTP ${res.status}`);
      const parsed = parseEventHtml(await res.text(), base);
      const { eventID: _a, name: _b, eventType: _c, heading: _d, template: _e, link: _f, image: _g, start: _h, end: _i, ...rest } = parsed;
      pageCache.delete(base.link);
      pageCache.set(base.link, { at: Date.now(), event: rest });
      while (pageCache.size > MAX_PAGE_CACHE) pageCache.delete(pageCache.keys().next().value!);
      return rest;
    })().finally(() => pageInFlight.delete(base.link));
    pageInFlight.set(base.link, pending);
  }
  return assemble(await pending);
}

async function loadRawEvents(): Promise<LiveEvent[]> {
  if (rawEventsCache && Date.now() - rawEventsCache.at < CACHE_MS) return rawEventsCache.events;
  const res = await fetch('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json', { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`events.json: HTTP ${res.status}`);
  const all = (await res.json()) as LiveEvent[];
  rawEventsCache = { at: Date.now(), events: all };
  return all;
}

/** Active and upcoming events (next 30 days) enriched from Leek Duck pages, ordered soonest first. */
export async function getRichEvents(): Promise<RichGameEvent[]> {
  if (listCache && Date.now() - listCache.at < CACHE_MS) return listCache.events;
  return tracked('events', async () => {
    const all = await loadRawEvents();
    const now = Date.now();
    const horizon = now + 30 * 86_400_000;
    const wanted = all.filter((e) => {
      if (!e.link || SKIP_TYPES.has(e.eventType)) return false;
      const start = e.start ? new Date(e.start).getTime() : now;
      const end = e.end ? new Date(e.end).getTime() : Infinity;
      return end >= now && start <= horizon;
    });
    const out: RichGameEvent[] = [];
    for (let i = 0; i < wanted.length; i += 4) {
      const batch = await Promise.all(
        wanted.slice(i, i + 4).map(async (e) => {
          try {
            return await fetchOneEvent(e);
          } catch {
            return parseEventHtml('', e);
          }
        }),
      );
      out.push(...batch);
    }
    out.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    listCache = { at: Date.now(), events: out };
    return out;
  });
}

/** On-demand rich detail for any event in the weekly timeline (raids, raid hours, GBL, past or far-future events). */
export async function getRichEventById(eventID: string, archived?: LiveEvent | null): Promise<RichGameEvent | null> {
  const fromList = listCache?.events.find((e) => e.eventID === eventID);
  if (fromList) return fromList;
  const live = await loadRawEvents().catch(() => [] as LiveEvent[]);
  const base = live.find((e) => e.eventID === eventID) ?? archived ?? null;
  if (!base) return null;
  if (!base.link) return parseEventHtml('', base);
  try {
    return await fetchOneEvent(base);
  } catch {
    return parseEventHtml('', base);
  }
}
