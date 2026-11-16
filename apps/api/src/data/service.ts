/**
 * Dataset job: builds the Pokédex dataset from PokeMiners & co on a schedule, keeps the event
 * archive, and serves everything from memory with manager overrides merged in.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PIPELINE_VERSION, applyManualOverrides, buildDataset, fetchLiveEvents, mergeEvents, type ArchivedEvent, type ManualOverrides } from '@mydexpogo/data';
import type { Dataset } from '@mydexpogo/shared';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';

export interface SourceFreshness {
  name: string;
  label: string;
  /** Last change upstream (commit date or Last-Modified), when known. */
  updatedAt: string | null;
  url: string;
}

export interface DataStatus {
  generatedAt: string | null;
  version: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  nextRunAt: string | null;
  refreshHours: number;
  running: boolean;
  stats: Record<string, unknown> | null;
  eventsArchived: number;
  sources: SourceFreshness[];
  /** Pipeline version that produced the dataset on disk. */
  pipelineVersion?: number;
}

const FILES = { dataset: 'pokedex.json', events: 'events-archive.json', status: 'status.json', seen: 'seen-species.json' };
const SCRAPEDDUCK = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/';

const SOURCE_REPOS: { name: string; label: string; repo: string; branch?: string }[] = [
  { name: 'gameMaster', label: 'Game master (PokeMiners)', repo: 'PokeMiners/game_masters' },
  { name: 'assets', label: 'Textes & images Méga (PokeMiners)', repo: 'PokeMiners/pogo_assets' },
  { name: 'costumes', label: 'Noms de costumes (WatWowMap)', repo: 'WatWowMap/pogo-data-api' },
  { name: 'leekduck', label: 'Raids, événements, études (Leek Duck via ScrapedDuck)', repo: 'bigfoott/ScrapedDuck', branch: 'data' },
];

class DataService {
  private raw: Dataset | null = null;
  private served: { etag: string; body: string } | null = null;
  private events: ArchivedEvent[] = [];
  private eventsBody = '[]';
  private status: DataStatus = {
    generatedAt: null, version: null, lastAttemptAt: null, lastError: null, durationMs: null, nextRunAt: null,
    refreshHours: env.dataRefreshHours, running: false, stats: null, eventsArchived: 0, sources: [],
  };
  private timer: NodeJS.Timeout | null = null;
  private overridesCache: ManualOverrides | null = null;
  /** Dex numbers ever seen on Leek Duck (raids, eggs, research, events): proof a species is in the game. */
  private seenSpecies = new Set<number>();

  get ready() { return this.raw !== null; }
  /** Raw generated dataset (no manager overrides), for matching jobs. */
  get rawDataset(): Dataset | null { return this.raw; }
  getStatus(): DataStatus { return { ...this.status, eventsArchived: this.events.length }; }
  getEventsBody() { return this.eventsBody; }

  async start() {
    await mkdir(env.dataDir, { recursive: true });
    await this.loadFromDisk();
    const ageMs = this.status.generatedAt ? Date.now() - new Date(this.status.generatedAt).getTime() : Infinity;
    const refreshMs = env.dataRefreshHours * 3600_000;
    const outdated = this.status.pipelineVersion !== PIPELINE_VERSION;
    const delay = outdated ? 0 : Math.max(0, refreshMs - ageMs);
    if (delay === 0) void this.refresh(outdated ? `pipeline v${this.status.pipelineVersion ?? '?'} -> v${PIPELINE_VERSION}` : 'startup');
    this.schedule(delay);
  }

  private schedule(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.status.nextRunAt = new Date(Date.now() + delayMs).toISOString();
    this.timer = setTimeout(() => void this.refresh('scheduled').catch((e) => console.error('refresh failed', e)), delayMs);
    this.timer.unref();
  }

  private async loadFromDisk() {
    try {
      this.raw = JSON.parse(await readFile(path.join(env.dataDir, FILES.dataset), 'utf8')) as Dataset;
      this.status.generatedAt = this.raw.generatedAt;
      this.status.version = this.raw.version;
      this.served = null;
    } catch {}
    try {
      this.events = JSON.parse(await readFile(path.join(env.dataDir, FILES.events), 'utf8')) as ArchivedEvent[];
      this.eventsBody = JSON.stringify(this.events);
    } catch {}
    try {
      this.seenSpecies = new Set(JSON.parse(await readFile(path.join(env.dataDir, FILES.seen), 'utf8')) as number[]);
    } catch {}
    try {
      const saved = JSON.parse(await readFile(path.join(env.dataDir, FILES.status), 'utf8')) as Partial<DataStatus>;
      this.status = { ...this.status, ...saved, running: false, refreshHours: env.dataRefreshHours };
    } catch {}
    if (this.raw) console.log(`dataset loaded from disk: v${this.raw.version} (${this.raw.variants.length} variants)`);
  }

  /** Rebuilds everything. Safe to call concurrently: a second call while running is ignored. */
  async refresh(reason: string): Promise<boolean> {
    if (this.status.running) return false;
    this.status.running = true;
    this.status.lastAttemptAt = new Date().toISOString();
    const started = Date.now();
    console.log(`dataset refresh (${reason})`);
    try {
      if (env.githubToken) process.env.GITHUB_TOKEN = env.githubToken;
      const liveEvents = await fetchLiveEvents().catch((e: Error) => (console.log(`  events unavailable: ${e.message}`), [] as Awaited<ReturnType<typeof fetchLiveEvents>>));
      const merged = mergeEvents(this.events, liveEvents);
      await this.collectSeenSpecies(merged.all);
      const { dataset, stats } = await buildDataset({
        fetch: { cacheDir: path.join(env.dataDir, 'cache'), maxAgeHours: 0, offline: false },
        extraReleased: this.seenSpecies,
        log: (m) => console.log(`  ${m}`),
      });
      this.raw = dataset;
      this.served = null;
      this.events = merged.all;
      this.eventsBody = JSON.stringify(this.events);
      this.status.generatedAt = dataset.generatedAt;
      this.status.version = dataset.version;
      this.status.stats = stats;
      this.status.pipelineVersion = PIPELINE_VERSION;
      this.status.lastError = null;
      this.status.sources = await this.probeSources();
      await writeFile(path.join(env.dataDir, FILES.dataset), JSON.stringify(dataset));
      await writeFile(path.join(env.dataDir, FILES.events), this.eventsBody);
      console.log(`dataset refreshed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${merged.added} new events`);
      return true;
    } catch (e) {
      this.status.lastError = (e as Error).message;
      console.error('dataset refresh failed:', e);
      return false;
    } finally {
      this.status.durationMs = Date.now() - started;
      this.status.running = false;
      // after a failure, try again within the hour instead of waiting for the next slot
      this.schedule(this.status.lastError ? Math.min(3600_000, env.dataRefreshHours * 3600_000) : env.dataRefreshHours * 3600_000);
      await writeFile(path.join(env.dataDir, FILES.status), JSON.stringify({ ...this.status, running: false })).catch(() => {});
    }
  }

  /** Every Pokémon picture Leek Duck references proves the species is catchable: remember its dex number for good. */
  private async collectSeenSpecies(events: ArchivedEvent[]) {
    const before = this.seenSpecies.size;
    const texts: string[] = [JSON.stringify(events)];
    for (const f of ['raids.json', 'research.json', 'eggs.json']) {
      texts.push(await fetch(SCRAPEDDUCK + f).then((r) => (r.ok ? r.text() : '')).catch(() => ''));
    }
    for (const t of texts) {
      for (const m of t.matchAll(/\/(?:pm(\d{1,4})\.|pokemon_icon_(\d{3})_)/g)) this.seenSpecies.add(Number(m[1] ?? m[2]));
    }
    if (this.seenSpecies.size !== before) await writeFile(path.join(env.dataDir, FILES.seen), JSON.stringify([...this.seenSpecies].sort((a, b) => a - b))).catch(() => {});
    console.log(`  species seen on Leek Duck: ${this.seenSpecies.size} (+${this.seenSpecies.size - before})`);
  }

  /** Asks GitHub when each upstream repo last changed; best effort, never blocks the dataset. */
  private async probeSources(): Promise<SourceFreshness[]> {
    const headers: Record<string, string> = { 'user-agent': 'mydexpogo', accept: 'application/vnd.github+json' };
    if (env.githubToken) headers.authorization = `Bearer ${env.githubToken}`;
    const out: SourceFreshness[] = [];
    for (const s of SOURCE_REPOS) {
      const url = `https://api.github.com/repos/${s.repo}/commits?per_page=1${s.branch ? `&sha=${s.branch}` : ''}`;
      const updatedAt = await fetch(url, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (Array.isArray(j) && j[0] ? (j[0].commit?.committer?.date as string) : null))
        .catch(() => null);
      out.push({ name: s.name, label: s.label, updatedAt, url: `https://github.com/${s.repo}` });
    }
    const pictures = await fetch('https://trade.pokemongopro.com/assets/pokemon_images.txt', { method: 'HEAD', headers: { 'user-agent': 'mydexpogo' } })
      .then((r) => r.headers.get('last-modified'))
      .catch(() => null);
    out.push({ name: 'pictures', label: 'Images (pokemongopro, miroir PokeMiners)', updatedAt: pictures ? new Date(pictures).toISOString() : null, url: 'https://trade.pokemongopro.com' });
    const shiny = await fetch('https://pogoapi.net/api/v1/shiny_pokemon.json', { method: 'HEAD', headers: { 'user-agent': 'mydexpogo' } })
      .then((r) => r.headers.get('last-modified'))
      .catch(() => null);
    out.push({ name: 'shiny', label: 'Shinies sortis (pogoapi.net)', updatedAt: shiny ? new Date(shiny).toISOString() : null, url: 'https://pogoapi.net' });
    return out;
  }

  /** Dataset with manager overrides merged, cached until the next change. */
  async getServed(): Promise<{ etag: string; body: string } | null> {
    if (!this.raw) return null;
    if (this.served) return this.served;
    const manual = await this.loadOverrides();
    const body = JSON.stringify(applyManualOverrides(this.raw, manual));
    const etag = `"${this.raw.version}-${Object.keys(manual).length}-${hashShort(body)}"`;
    this.served = { etag, body };
    return this.served;
  }

  invalidateOverrides() {
    this.overridesCache = null;
    this.served = null;
  }

  async loadOverrides(): Promise<ManualOverrides> {
    if (this.overridesCache) return this.overridesCache;
    const rows = await db.select().from(schema.variantOverrides);
    const manual: ManualOverrides = {};
    for (const r of rows) {
      manual[r.variantKey] = {
        released: r.released,
        label: r.labelEn ? { en: r.labelEn, ...(r.labelFr ? { fr: r.labelFr } : {}) } : null,
      };
    }
    this.overridesCache = manual;
    return manual;
  }
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 97) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const dataService = new DataService();
