/**
 * What appears during Leek Duck's events (their "Spawns" and "Featured Pokémon" sections), and what the event puts
 * in raids, eggs, field research and Team GO Rocket's hands: ScrapedDuck only lists spawns for Community Days and
 * Spotlight Hours. Current events and those starting within three weeks; each page is read at most once an hour.
 */

export interface EventMon {
  name: string;
  image: string;
  canBeShiny: boolean;
}
export interface EventSpawns {
  eventID: string;
  name: string;
  link: string;
  image: string;
  start: string | null;
  end: string | null;
  eventType: string;
  featured: EventMon[];
  spawns: EventMon[];
  raids: EventMon[];
  eggs: EventMon[];
  research: EventMon[];
  rocket: EventMon[];
}
type PageMons = Pick<EventSpawns, 'featured' | 'spawns' | 'raids' | 'eggs' | 'research' | 'rocket'>;

/** The weekly rotations and passes have their own pages elsewhere (Raids tab, GO Pass…): their pages are not read. */
const NOT_READ = new Set(['raid-battles', 'raid-hour', 'go-battle-league', 'season', 'go-pass', 'max-mondays', 'max-battles', 'pokemon-go-tour-paid', 'timed-research', 'research', 'pokestop-showcase']);

interface LiveEvent {
  eventID: string;
  name: string;
  eventType: string;
  link: string;
  image: string;
  start: string | null;
  end: string | null;
  extraData?: { generic?: { hasSpawns?: boolean } };
}

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; mydexpogo/1.0)' };
const MAX_PAGES = 200;
const pages = new Map<string, { at: number } & PageMons>();
const pagesInFlight = new Map<string, Promise<PageMons>>();
let list: { at: number; events: EventSpawns[] } | null = null;

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, '’').replace(/&quot;/g, '"').trim();

/** The Pokémon of one section of the page: from its <h2 id="…"> to the next <h2>; or of every section whose id matches. */
export function sectionMons(html: string, id: string | RegExp): EventMon[] {
  const out: EventMon[] = [];
  const re = new RegExp(`<h2[^>]*id="(${typeof id === 'string' ? id : '[^"]*'})"`, 'g');
  for (const m of html.matchAll(re)) {
    if (id instanceof RegExp && !id.test(m[1]!)) continue;
    const rest = html.slice(m.index! + 4);
    const end = rest.search(/<h2[\s>]/);
    readMons(end < 0 ? rest : rest.slice(0, end), out);
  }
  return out;
}

function readMons(body: string, out: EventMon[]) {
  for (const item of body.split('class="pkmn-list-item"').slice(1)) {
    const image = /<img[^>]+src="([^"]+)"/.exec(item)?.[1];
    const name = /class="pkmn-name">([^<]*)</.exec(item)?.[1] ?? /alt="([^"]*)"/.exec(item)?.[1];
    if (!image || !name) continue;
    if (!out.some((m) => m.image === image)) out.push({ name: decode(name), image, canBeShiny: /pokemon-cutout-shiny|shiny-icon/.test(item) });
  }
  return out;
}

async function pageOf(link: string): Promise<PageMons> {
  const hit = pages.get(link);
  if (hit && Date.now() - hit.at < 3600_000) return hit;
  let pending = pagesInFlight.get(link);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(link, { headers: UA, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`event page: HTTP ${res.status}`);
      const html = await res.text();
      const parsed = {
        at: Date.now(),
        featured: sectionMons(html, 'featured-pokémon'),
        spawns: sectionMons(html, 'spawns'),
        raids: sectionMons(html, 'raids'),
        eggs: sectionMons(html, /egg|hatch/),
        research: sectionMons(html, /field-research/),
        rocket: sectionMons(html, /rocket|^shadow-pokémon$/),
      };
      // A spawns heading but nothing read: Leek Duck's markup probably changed.
      if (/<h2[^>]*id="spawns"/.test(html) && /pkmn-list-item/.test(html) && !parsed.spawns.length && !parsed.featured.length) console.warn(`event spawns: nothing read on ${link}, markup changed?`);
      pages.delete(link);
      pages.set(link, parsed);
      while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value!);
      return parsed;
    })().finally(() => pagesInFlight.delete(link));
    pagesInFlight.set(link, pending);
  }
  return pending;
}

export async function getEventSpawns(): Promise<EventSpawns[]> {
  if (list && Date.now() - list.at < 3600_000) return list.events;
  const res = await fetch('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json', { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`events: HTTP ${res.status}`);
  const events = (await res.json()) as LiveEvent[];
  const now = Date.now();
  const soon = now + 21 * 86400_000;
  const wanted = events.filter((e) => {
    if (!e.link || (!e.extraData?.generic?.hasSpawns && NOT_READ.has(e.eventType))) return false;
    const start = e.start ? new Date(e.start).getTime() : now;
    const end = e.end ? new Date(e.end).getTime() : Infinity;
    return end >= now && start <= soon;
  });
  const out: EventSpawns[] = [];
  // A few pages at a time, politely.
  for (let i = 0; i < wanted.length; i += 3) {
    const batch = await Promise.all(
      wanted.slice(i, i + 3).map(async (e) => {
        try {
          const p = await pageOf(e.link);
          const { featured, spawns, raids, eggs, research, rocket } = p;
          return { eventID: e.eventID, name: e.name, eventType: e.eventType, link: e.link, image: e.image, start: e.start, end: e.end, featured, spawns, raids, eggs, research, rocket };
        } catch {
          return null;
        }
      }),
    );
    for (const b of batch) if (b && [b.featured, b.spawns, b.raids, b.eggs, b.research, b.rocket].some((l) => l.length)) out.push(b);
  }
  out.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  list = { at: Date.now(), events: out };
  return out;
}
