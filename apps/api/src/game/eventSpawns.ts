/**
 * What appears during Leek Duck's events (their "Spawns" and "Featured Pokémon" sections): ScrapedDuck only lists
 * them for Community Days and Spotlight Hours. Current events and those starting within three weeks; each page is
 * read at most once an hour.
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
  featured: EventMon[];
  spawns: EventMon[];
}

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
const pages = new Map<string, { at: number; featured: EventMon[]; spawns: EventMon[] }>();
let list: { at: number; events: EventSpawns[] } | null = null;

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, '’').replace(/&quot;/g, '"').trim();

/** The Pokémon of one section of the page: from its <h2 id="…"> to the next <h2>. */
export function sectionMons(html: string, id: string): EventMon[] {
  const start = html.search(new RegExp(`<h2[^>]*id="${id}"`));
  if (start < 0) return [];
  const rest = html.slice(start + 4);
  const end = rest.search(/<h2[\s>]/);
  const body = end < 0 ? rest : rest.slice(0, end);
  const out: EventMon[] = [];
  for (const item of body.split('class="pkmn-list-item"').slice(1)) {
    const image = /<img[^>]+src="([^"]+)"/.exec(item)?.[1];
    const name = /class="pkmn-name">([^<]*)</.exec(item)?.[1] ?? /alt="([^"]*)"/.exec(item)?.[1];
    if (!image || !name) continue;
    if (!out.some((m) => m.image === image)) out.push({ name: decode(name), image, canBeShiny: /pokemon-cutout-shiny|shiny-icon/.test(item) });
  }
  return out;
}

async function pageOf(link: string): Promise<{ featured: EventMon[]; spawns: EventMon[] }> {
  const hit = pages.get(link);
  if (hit && Date.now() - hit.at < 3600_000) return hit;
  const res = await fetch(link, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`event page: HTTP ${res.status}`);
  const html = await res.text();
  const parsed = { at: Date.now(), featured: sectionMons(html, 'featured-pokémon'), spawns: sectionMons(html, 'spawns') };
  pages.set(link, parsed);
  return parsed;
}

export async function getEventSpawns(): Promise<EventSpawns[]> {
  if (list && Date.now() - list.at < 3600_000) return list.events;
  const res = await fetch('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json', { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`events: HTTP ${res.status}`);
  const events = (await res.json()) as LiveEvent[];
  const now = Date.now();
  const soon = now + 21 * 86400_000;
  const wanted = events.filter((e) => {
    if (!e.extraData?.generic?.hasSpawns || !e.link) return false;
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
          return { eventID: e.eventID, name: e.name, link: e.link, image: e.image, start: e.start, end: e.end, featured: p.featured, spawns: p.spawns };
        } catch {
          return null;
        }
      }),
    );
    for (const b of batch) if (b && (b.spawns.length || b.featured.length)) out.push(b);
  }
  out.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  list = { at: Date.now(), events: out };
  return out;
}
