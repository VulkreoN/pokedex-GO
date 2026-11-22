/**
 * Keeps an archive of Pokémon GO events. Leek Duck (through ScrapedDuck) only lists current and
 * upcoming events, so every nightly run merges what it sees into apps/web/public/data/events-archive.json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SCRAPEDDUCK_EVENTS = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';

export interface ArchivedEvent {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string;
  image: string;
  start: string | null;
  end: string | null;
  /** Kept so past raid rotations, spotlight hours and community days stay readable. */
  extraData?: Record<string, unknown>;
  firstSeen: string;
  lastSeen: string;
}

export type LiveEvent = Omit<ArchivedEvent, 'firstSeen' | 'lastSeen'>;

export async function fetchLiveEvents(): Promise<LiveEvent[]> {
  const res = await fetch(SCRAPEDDUCK_EVENTS, { headers: { 'user-agent': 'mydexpogo-data-pipeline' } });
  if (!res.ok) throw new Error(`events: HTTP ${res.status}`);
  return (await res.json()) as LiveEvent[];
}

/** Merges live events into an archive. Pure: returns the new archive and how many events were new. */
export function mergeEvents(existing: ArchivedEvent[], live: LiveEvent[], now = new Date().toISOString()): { all: ArchivedEvent[]; added: number } {
  const byId = new Map(existing.map((e) => [e.eventID, e]));
  let added = 0;
  for (const e of live) {
    const prev = byId.get(e.eventID);
    if (!prev) added++;
    byId.set(e.eventID, {
      eventID: e.eventID,
      name: e.name,
      eventType: e.eventType,
      heading: e.heading,
      link: e.link,
      image: e.image,
      start: e.start ?? null,
      end: e.end ?? null,
      ...(e.extraData ? { extraData: e.extraData } : {}),
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
    });
  }
  const all = [...byId.values()].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  return { all, added };
}

/** File-based wrapper used by the CLI. */
export async function updateEventArchive(outDir: string, offline: boolean): Promise<{ total: number; added: number }> {
  const file = path.join(outDir, 'events-archive.json');
  const existing: ArchivedEvent[] = await readFile(file, 'utf8')
    .then((s) => JSON.parse(s) as ArchivedEvent[])
    .catch(() => []);
  if (offline) return { total: existing.length, added: 0 };
  const { all, added } = mergeEvents(existing, await fetchLiveEvents());
  await writeFile(file, JSON.stringify(all));
  return { total: all.length, added };
}
