/**
 * Automatic ingestion of Pokémon GO regional, venue-exclusive, and real-world partnership events
 * that Leek Duck / ScrapedDuck often omits (e.g. Mall Exploration across SEA/Philippines, ESA
 * museums across Europe, UK National Trust, Pokémon Fossil Museum Chicago, Pokémon Center / Jet /
 * Observatory / PokéPark KANTO in Japan, APAC Stamp Rallies).
 *
 * Pulls structured JSON from Pokémon GO Wiki's MediaWiki API (3 batch calls) + Serebii's Real-Life
 * Events table (1 HTML page), caches for 2 hours, and degrades gracefully to [] on upstream failure.
 */
import type { EventBonusItem, EventDetailMon, EventHighlight, EventMonGroup, RichGameEvent } from '@mydexpogo/shared';

export type SpeciesSpriteLookup = Map<string, { dex: number; image: string }>;

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; mydexpogo/1.0)' };
const FANDOM_API = 'https://pokemongo.fandom.com/api.php';
const SEREBII_REAL_LIFE = 'https://www.serebii.net/pokemongo/reallifeevents.shtml';
const CACHE_MS = 2 * 3600_000;
const DAY_MS = 86_400_000;

let regionalCache: { at: number; events: RichGameEvent[] } | null = null;

export function resetRegionalEventsCache() {
  regionalCache = null;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const REGIONAL_CATEGORIES = new Set([
  'Category:Regional events',
  'Category:Real-world events',
  'Category:Japanese events',
  'Category:Asian events',
  'Category:European events',
  'Category:US events',
  'Category:Latin American events',
  'Category:Sponsored events',
]);

export interface FandomPageRecord {
  title: string;
  wikitext: string;
  thumbnail?: string | null;
  categories?: string[];
}

export interface DateWindow {
  start: Date;
  end: Date | null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&#8217;|&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&eacute;/gi, 'é')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips MediaWiki markup, references, comments, and simple templates into clean readable text. */
export function stripWiki(raw: string): string {
  return decodeHtml(
    raw
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<ref[^>]*\/>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\{\{(?:nth|Nth)\|(\d+)\}\}/g, '$1')
      .replace(/\{\{wp\|([^|}]+)(?:\|([^}]+))?\}\}/gi, (_, a: string, b?: string) => (b ?? a))
      .replace(/\{\{missing\}\}/gi, '')
      .replace(/\{\{[^}]+\}\}/g, '')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<small[^>]*>([\s\S]*?)<\/small>/gi, ' $1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/''+/g, '')
      .replace(/\s*,\s*,+/g, ', ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/** Extracts top-level `| key = value` pairs from `{{Infobox/Event ...}}`, respecting nested `{{...}}`. */
export function extractInfobox(wikitext: string): Record<string, string> {
  const startIdx = wikitext.search(/\{\{Infobox\/Event\b/i);
  if (startIdx < 0) return {};
  let depth = 0;
  let endIdx = wikitext.length;
  for (let i = startIdx; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
      depth++;
      i++;
    } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) {
        endIdx = i - 1;
        break;
      }
    }
  }
  const body = wikitext.slice(startIdx, endIdx);
  const fields: Record<string, string> = {};
  let curKey: string | null = null;
  for (const line of body.split('\n').slice(1)) {
    const m = /^\s*\|\s*([a-z0-9_-]+)\s*=\s*(.*)$/i.exec(line);
    if (m) {
      curKey = m[1]!.toLowerCase();
      fields[curKey] = m[2]!;
    } else if (curKey && !/^\s*\}\}/.test(line)) {
      fields[curKey] += `\n${line}`;
    }
  }
  return fields;
}

/** Parses all dates on a single line/clause, inheriting missing years from sibling dates on the same line. */
function parseDatesInLine(line: string, fallbackYear?: number): Date[] {
  const clean = stripWiki(line);
  const tokens: { mo: number; day: number; yr: number | null }[] = [];
  const re =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?(?:\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    const day1 = Number(m[2]);
    if (mo === undefined || day1 < 1 || day1 > 31) continue;
    const yr1 = m[3] ? Number(m[3]) : null;
    const day2 = m[4] ? Number(m[4]) : null;
    const yr2 = m[5] ? Number(m[5]) : null;
    tokens.push({ mo, day: day1, yr: yr1 ?? yr2 });
    if (day2 && day2 >= 1 && day2 <= 31) {
      tokens.push({ mo, day: day2, yr: yr2 ?? yr1 });
    }
  }
  // Propagate year backward & forward across tokens on the same line (e.g. "October 1 - December 31, 2026")
  const out: Date[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    let yr = t.yr;
    if (!yr) {
      for (let j = i + 1; j < tokens.length; j++) if (tokens[j]!.yr) { yr = tokens[j]!.yr; break; }
    }
    if (!yr) {
      for (let j = i - 1; j >= 0; j--) if (tokens[j]!.yr) { yr = tokens[j]!.yr; break; }
    }
    yr ??= fallbackYear ?? null;
    if (yr && yr >= 2020 && yr <= 2035) {
      out.push(new Date(Date.UTC(yr, t.mo, t.day, 12, 0, 0)));
    }
  }
  return out;
}

function parseDatesMultiline(raw: string, fallbackYear?: number): Date[] {
  const out: Date[] = [];
  for (const line of raw.split(/\n|<br\s*\/?>/i)) {
    out.push(...parseDatesInLine(line, fallbackYear));
  }
  return out;
}

function isoDate(d: Date, endOfDay: boolean): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T${endOfDay ? '23:59:59' : '00:00:00'}.000`;
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

/** Parses `{{EI|label|m1|d1|m2|d2|img|page|y1=2026|y2=2027}}` entries from `Template:CurrentEvents`. */
export function parseCurrentEventsTemplate(wikitext: string, refYear: number): { page: string; label: string; start: Date; end: Date }[] {
  const out: { page: string; label: string; start: Date; end: Date }[] = [];
  for (const m of wikitext.matchAll(/\{\{EI\|([^\n}]+)\}\}/gi)) {
    const parts = m[1]!.split('|');
    const named: Record<string, string> = {};
    const pos: string[] = [];
    for (const part of parts) {
      const eq = /^([a-z0-9_-]+)=(.*)$/i.exec(part.trim());
      if (eq) named[eq[1]!.toLowerCase()] = eq[2]!.trim();
      else pos.push(part.trim());
    }
    const label = pos[0] ?? '';
    const m1 = MONTHS[(pos[1] ?? '').toLowerCase()];
    const d1 = Number(pos[2]);
    const m2 = MONTHS[(pos[3] ?? '').toLowerCase()];
    const d2 = Number(pos[4]);
    const page = pos[6] || label;
    if (!page || label === '???' || m1 === undefined || m2 === undefined || !d1 || !d2) continue;
    const y1 = named.y1 ? Number(named.y1) : refYear;
    const y2 = named.y2 ? Number(named.y2) : m2 < m1 ? y1 + 1 : y1;
    out.push({
      page,
      label,
      start: new Date(Date.UTC(y1, m1, d1, 0, 0, 0)),
      end: new Date(Date.UTC(y2, m2, d2, 23, 59, 59)),
    });
  }
  return out;
}

function extractOfficialLink(wikitext: string, pageTitle: string): string {
  const m = /https?:\/\/(?:www\.)?(?:pokemongo\.com|pokemongolive\.com)\/[^\s\]<>"]+/i.exec(wikitext);
  if (m) return m[0];
  return `https://pokemongo.fandom.com/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
}

function resolveSprite(name: string, speciesByEn?: SpeciesSpriteLookup): EventDetailMon | null {
  const clean = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const hit = speciesByEn?.get(clean.toLowerCase());
  if (!hit) return null;
  return { name: clean, image: hit.image, canBeShiny: false };
}

function extractWikiMons(section: string, template: 'P' | 'RB', speciesByEn?: SpeciesSpriteLookup): EventDetailMon[] {
  const out: EventDetailMon[] = [];
  const seen = new Set<string>();
  const re = new RegExp(`\\{\\{${template}\\|([^}]+)\\}\\}`, 'g');
  for (const m of section.matchAll(re)) {
    const parts = m[1]!.split('|').map((x) => x.trim());
    const rawName = parts[0] ?? '';
    const shiny = parts.some((p) => /^(?:s|shiny)=t/i.test(p));
    const ct = parts.find((p) => /^ct=/i.test(p))?.slice(3).trim();
    const resolved = resolveSprite(rawName, speciesByEn);
    if (!resolved) continue;
    const label = ct || resolved.name;
    const key = `${resolved.image}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: label, image: resolved.image, canBeShiny: shiny });
    if (out.length >= 12) break;
  }
  return out;
}

function extractLeadSummary(wikitext: string): { summary: string | null; venues: string[] } {
  // Strip infobox & stubs before the first heading
  const beforeFeatures = wikitext.split(/\n==[^=]/)[0] ?? wikitext;
  const withoutInfobox = beforeFeatures
    .replace(/\{\{Stub[^}]*\}\}/gi, '')
    .replace(/\{\{Infobox\/Event[\s\S]*?\n\}\}/i, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines = withoutInfobox.split('\n').map((l) => l.trim()).filter(Boolean);
  const paras: string[] = [];
  const venues: string[] = [];
  for (const line of lines) {
    if (line.startsWith('*')) {
      const cleaned = stripWiki(line.replace(/^\*+\s*/, ''));
      if (cleaned && cleaned.length > 2 && cleaned.length < 140) venues.push(cleaned);
    } else if (!line.startsWith('{') && !line.startsWith('|') && !line.startsWith('[')) {
      const cleaned = stripWiki(line);
      if (cleaned.length > 25 && !/^the following\b/i.test(cleaned)) paras.push(cleaned);
    }
  }
  const summary = paras.slice(0, 2).join(' ').slice(0, 320) || null;
  return { summary, venues: venues.slice(0, 12) };
}

/**
 * Parses one Pokémon GO Wiki event page into a `RichGameEvent` if it is a regional/local/real-world
 * event active now or starting within 60 days. Returns `null` for global, expired, or non-event pages.
 */
export function parseFandomRegionalPage(
  page: FandomPageRecord,
  speciesByEn?: SpeciesSpriteLookup,
  now = Date.now(),
  fallbackWindow?: DateWindow,
): RichGameEvent | null {
  const wt = page.wikitext?.trim();
  if (!wt || /^#REDIRECT\b/i.test(wt)) return null;

  const box = extractInfobox(wt);
  const rawTitle = stripWiki(box.title || page.title);
  if (!rawTitle || /\bglobal\b/i.test(rawTitle)) return null;

  const location = stripWiki(box.location || '')
    .replace(/\s*\([^)]{12,}\)/g, '')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  const cats = new Set(page.categories ?? []);
  const hasRegionalCat = [...cats].some((c) => REGIONAL_CATEGORIES.has(c));
  const hasSpecificLocation = !!location && !/^(?:global|worldwide|various)$/i.test(location);
  if (!hasRegionalCat && !hasSpecificLocation) return null;
  if (/^(?:global|worldwide)$/i.test(location)) return null;

  // Date window extraction
  const startRaw = box['start-date'] ?? '';
  const endRaw = box['end-date'] ?? '';
  const cleanEnd = stripWiki(endRaw);
  const isOngoing = /\b(?:none|ongoing|permanent|indefinite|tbd)\b|\?\?\?/i.test(cleanEnd);

  const sDates = parseDatesMultiline(startRaw);
  const eDates = isOngoing ? [] : parseDatesMultiline(endRaw);

  const intro = wt.split(/\n==\s*Features\s*==/i)[0] ?? wt;
  const needsBodyScan = !sDates.length || (!isOngoing && !eDates.length) || /various/i.test(`${startRaw} ${endRaw}`);
  const bodyDates = needsBodyScan ? parseDatesMultiline(intro) : [];

  let startDate: Date | null = sDates.length
    ? new Date(Math.min(...sDates.map((d) => d.getTime())))
    : bodyDates.length
      ? new Date(Math.min(...bodyDates.map((d) => d.getTime())))
      : fallbackWindow?.start ?? null;

  let endDate: Date | null = isOngoing
    ? null
    : eDates.length
      ? new Date(Math.max(...eDates.map((d) => d.getTime())))
      : bodyDates.length
        ? new Date(Math.max(...bodyDates.map((d) => d.getTime())))
        : fallbackWindow?.end ?? null;

  // Prefer later end date from fallbackWindow (Template:CurrentEvents) if the infobox wasn't updated yet
  if (!isOngoing && fallbackWindow?.end && (!endDate || fallbackWindow.end.getTime() > endDate.getTime())) {
    endDate = fallbackWindow.end;
  }
  if (!startDate) return null;

  const startMs = startDate.getTime();
  const horizonMs = now + 60 * DAY_MS;
  if (startMs > horizonMs) return null;
  if (endDate) {
    if (endDate.getTime() + DAY_MS < now) return null;
  } else {
    // Ongoing/permanent venues: ignore ancient undated stubs older than ~2.5 years
    if (startMs < now - 900 * DAY_MS) return null;
  }

  // Extract bonuses {{BI|icon|text}}
  const bonuses: EventBonusItem[] = [];
  const seenBonus = new Set<string>();
  const cleanWt = wt.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of cleanWt.matchAll(/\{\{BI\|[^|}]+\|([^\n}]+)\}\}/gi)) {
    const text = stripWiki(m[1]!);
    if (text && text.length >= 4 && !seenBonus.has(text.toLowerCase())) {
      seenBonus.add(text.toLowerCase());
      bonuses.push({ text });
    }
  }

  // Extract spawns & raid bosses
  const spawns = extractWikiMons(cleanWt, 'P', speciesByEn);
  const raids = extractWikiMons(cleanWt, 'RB', speciesByEn);
  const spawnGroups: EventMonGroup[] = spawns.length ? [{ label: 'Spawns', mons: spawns }] : [];
  const raidGroups: EventMonGroup[] = raids.length ? [{ label: 'Raids', mons: raids }] : [];

  const { summary, venues } = extractLeadSummary(wt);
  const highlights: EventHighlight[] = [];
  if (/location backgrounds?|special backgrounds?/i.test(cleanWt)) {
    highlights.push({
      kind: 'background',
      title: 'Location Backgrounds',
      text: location ? `Available at ${location}.` : 'Location Backgrounds available at participating venues.',
    });
  }
  if (venues.length >= 2) {
    highlights.push({
      kind: 'info',
      title: 'Locations',
      text: venues.slice(0, 8).join(' · '),
    });
  }

  const featured: EventDetailMon[] = [];
  const firstMon = raids[0] ?? spawns[0];
  if (firstMon) featured.push(firstMon);

  // Normalize Fandom thumbnail URL cleanly (strip scale-to-width query fragments if needed)
  const image = page.thumbnail?.startsWith('https://') ? page.thumbnail : '';

  return {
    eventID: `regional-${slugify(page.title)}`,
    name: rawTitle,
    eventType: 'local-event',
    heading: 'Local Event',
    template: 'event',
    link: extractOfficialLink(wt, page.title),
    image,
    start: isoDate(startDate, false),
    end: endDate ? isoDate(endDate, true) : null,
    location: location ? location.slice(0, 140) : null,
    summary,
    bonuses: bonuses.slice(0, 10),
    highlights,
    featured,
    spawnGroups,
    raidGroups,
    eggGroups: [],
    research: [],
    researchNote: null,
    rocket: [],
    newShinies: [],
    moves: [],
  };
}

/**
 * Fallback parser for Serebii's Real-Life Events table (`serebii.net/pokemongo/reallifeevents.shtml`),
 * catching ongoing real-life venues like Pokémon Astronomical Observatory if absent from Fandom.
 */
export function parseSerebiiRealLifeHtml(html: string, now = Date.now()): RichGameEvent[] {
  const out: RichGameEvent[] = [];
  const horizonMs = now + 60 * DAY_MS;
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]!);
    if (tds.length < 4) continue;
    const name = decodeHtml(tds[1]!.replace(/<[^>]+>/g, ' '));
    const dateRaw = decodeHtml(tds[2]!.replace(/<[^>]+>/g, ' '));
    const locRaw = decodeHtml(tds[3]!.replace(/<[^>]+>/g, ' ')).replace(/\$\d+.*$/, '').trim();
    if (!name || /name/i.test(name) && /dates/i.test(dateRaw)) continue;
    if (/^(?:global|worldwide)$/i.test(locRaw)) continue;
    const href = /href="([^"]+)"/i.exec(tds[1]!)?.[1];
    const imgPath = /<img[^>]+src="([^"]+)"/i.exec(tds[0]!)?.[1];

    const isOngoing = /\?\?\?|ongoing|permanent/i.test(dateRaw);
    // Fix occasional typos like "20256" in Serebii dates
    const sanitizedDates = dateRaw.replace(/\b202\d{2,}\b/g, '').replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1');
    const parsed = parseDatesInLine(sanitizedDates);
    if (!parsed.length) continue;

    const startDate = parsed[0]!;
    const endDate = isOngoing ? null : parsed[parsed.length - 1]!;
    if (startDate.getTime() > horizonMs) continue;
    if (endDate) {
      if (endDate.getTime() + DAY_MS < now) continue;
    } else if (startDate.getTime() < now - 900 * DAY_MS) {
      continue;
    }

    const link = href
      ? href.startsWith('http')
        ? href
        : `https://www.serebii.net/pokemongo/${href.replace(/^\/+/, '')}`
      : SEREBII_REAL_LIFE;
    const image = imgPath
      ? imgPath.startsWith('http')
        ? imgPath
        : `https://www.serebii.net${imgPath.startsWith('/') ? imgPath : `/pokemongo/${imgPath}`}`
      : '';

    out.push({
      eventID: `serebii-${slugify(name)}`,
      name,
      eventType: 'local-event',
      heading: 'Local Event',
      template: 'event',
      link,
      image,
      start: isoDate(startDate, false),
      end: endDate ? isoDate(endDate, true) : null,
      location: locRaw ? locRaw.slice(0, 140) : null,
      summary: locRaw ? `In-person / regional event in ${locRaw}.` : null,
      bonuses: [],
      highlights: [],
      featured: [],
      spawnGroups: [],
      raidGroups: [],
      eggGroups: [],
      research: [],
      researchNote: null,
      rocket: [],
      newShinies: [],
      moves: [],
    });
  }
  return out;
}

function normEventKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\besa\b/g, 'european space agency')
    .replace(/\b(?:pok[eé]mon|go|x|event|events|collaboration|partnership|202\d)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSameEvent(a: RichGameEvent, b: RichGameEvent): boolean {
  const ka = normEventKey(a.name);
  const kb = normEventKey(b.name);
  if (!ka || !kb) return false;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  const ta = new Set(ka.split(' ').filter((w) => w.length >= 3));
  const tb = new Set(kb.split(' ').filter((w) => w.length >= 3));
  if (ta.size < 2 || tb.size < 2) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.75;
}

/** Merges Leek Duck events with regional events, preferring Leek Duck when both cover the same event. */
export function mergeRegionalEvents(baseEvents: RichGameEvent[], regionalEvents: RichGameEvent[]): RichGameEvent[] {
  const merged = [...baseEvents];
  for (const reg of regionalEvents) {
    const dup = merged.find((b) => isSameEvent(b, reg));
    if (dup) {
      if (!dup.location && reg.location) dup.location = reg.location;
      continue;
    }
    merged.push(reg);
  }
  return merged;
}

interface FandomQueryResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        missing?: string;
        revisions?: { slots?: { main?: { '*'?: string } } }[];
        thumbnail?: { source?: string };
        categories?: { title: string }[];
      }
    >;
  };
}

function extractPages(resp: FandomQueryResponse): FandomPageRecord[] {
  const out: FandomPageRecord[] = [];
  for (const p of Object.values(resp.query?.pages ?? {})) {
    if (!p.title || p.missing !== undefined) continue;
    const wt = p.revisions?.[0]?.slots?.main?.['*'];
    if (!wt) continue;
    out.push({
      title: p.title,
      wikitext: wt,
      thumbnail: p.thumbnail?.source ?? null,
      categories: (p.categories ?? []).map((c) => c.title),
    });
  }
  return out;
}

async function fetchFandomJson<T>(params: Record<string, string>): Promise<T> {
  const url = `${FANDOM_API}?${new URLSearchParams({ ...params, format: 'json' }).toString()}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`fandom ${res.status}`);
  return (await res.json()) as T;
}

async function fetchCategoryBatch(category: string, limit: number): Promise<FandomPageRecord[]> {
  const resp = await fetchFandomJson<FandomQueryResponse>({
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: category,
    gcmsort: 'timestamp',
    gcmdir: 'desc',
    gcmlimit: String(limit),
    prop: 'revisions|pageimages|categories',
    rvprop: 'content',
    rvslots: 'main',
    pithumbsize: '500',
    cllimit: '20',
  });
  return extractPages(resp);
}

/** Fetches and caches active/upcoming regional & real-world events from Pokémon GO Wiki + Serebii. */
export async function getRegionalEvents(speciesByEn?: SpeciesSpriteLookup): Promise<RichGameEvent[]> {
  if (regionalCache && Date.now() - regionalCache.at < CACHE_MS) return regionalCache.events;

  const now = Date.now();
  const refYear = new Date(now).getUTCFullYear();

  const [ceResp, regPages, rwPages, jpPages, serebiiHtml] = await Promise.all([
    fetchFandomJson<{ parse?: { wikitext?: { '*'?: string } } }>({
      action: 'parse',
      page: 'Template:CurrentEvents',
      prop: 'wikitext',
    }).catch(() => null),
    fetchCategoryBatch('Category:Regional_events', 40).catch(() => [] as FandomPageRecord[]),
    fetchCategoryBatch('Category:Real-world_events', 25).catch(() => [] as FandomPageRecord[]),
    fetchCategoryBatch('Category:Japanese_events', 15).catch(() => [] as FandomPageRecord[]),
    fetch(SEREBII_REAL_LIFE, { headers: UA, signal: AbortSignal.timeout(12_000) })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
  ]);

  const byTitle = new Map<string, FandomPageRecord>();
  for (const p of [...regPages, ...rwPages, ...jpPages]) {
    if (!byTitle.has(p.title)) byTitle.set(p.title, p);
  }

  // Also grab any current/upcoming event from Template:CurrentEvents not yet in our category batches (e.g. ESA partnership)
  const ceEntries = parseCurrentEventsTemplate(ceResp?.parse?.wikitext?.['*'] ?? '', refYear);
  const windowByTitle = new Map<string, DateWindow>();
  const missingTitles: string[] = [];
  for (const entry of ceEntries) {
    const existing = windowByTitle.get(entry.page);
    if (!existing) {
      windowByTitle.set(entry.page, { start: entry.start, end: entry.end });
    } else {
      if (entry.start < existing.start) existing.start = entry.start;
      if (existing.end && entry.end > existing.end) existing.end = entry.end;
    }
    if (
      !byTitle.has(entry.page) &&
      entry.end.getTime() + DAY_MS >= now &&
      entry.start.getTime() <= now + 60 * DAY_MS &&
      !/^(?:Event|Community Day|Raid Day|Max Battle Day|Hatch Day|Winter Holiday|New Year's|Minior Shower)$/i.test(entry.page) &&
      !missingTitles.includes(entry.page)
    ) {
      missingTitles.push(entry.page);
    }
  }

  if (missingTitles.length > 0) {
    const extraResp = await fetchFandomJson<FandomQueryResponse>({
      action: 'query',
      titles: missingTitles.slice(0, 20).join('|'),
      prop: 'revisions|pageimages|categories',
      rvprop: 'content',
      rvslots: 'main',
      pithumbsize: '500',
      cllimit: '20',
      redirects: '1',
    }).catch(() => null);
    for (const p of extraResp ? extractPages(extraResp) : []) {
      if (!byTitle.has(p.title)) byTitle.set(p.title, p);
    }
  }

  const parsed: RichGameEvent[] = [];
  for (const p of byTitle.values()) {
    const ev = parseFandomRegionalPage(p, speciesByEn, now, windowByTitle.get(p.title));
    if (ev) parsed.push(ev);
  }

  // Supplement with Serebii Real-Life Events table (deduplicated against Fandom)
  const serebiiEvents = serebiiHtml ? parseSerebiiRealLifeHtml(serebiiHtml, now) : [];
  const combined = mergeRegionalEvents(parsed, serebiiEvents);

  regionalCache = { at: Date.now(), events: combined };
  return combined;
}
