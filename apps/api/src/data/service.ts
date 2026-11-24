/**
 * Dataset job: builds the Pokédex dataset from PokeMiners & co on a schedule, keeps the event
 * archive, and serves everything from memory with manager overrides merged in.
 */
import { recordSource } from '../lib/health.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIRST_SEEN_BEFORE_TRACKING, PIPELINE_VERSION, applyManualOverrides, repairFirstSeen, buildDataset, fetchLiveEvents, mergeEvents, type ArchivedEvent, type ManualOverrides } from '@mydexpogo/data';
import type { Dataset, Gender, LocalizedText, Variant } from '@mydexpogo/shared';
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

const FILES = { dataset: 'pokedex.json', events: 'events-archive.json', status: 'status.json', seen: 'seen-species.json', firstSeen: 'first-seen.json' };
const SCRAPEDDUCK = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/';

const SOURCE_REPOS: { name: string; label: string; repo: string; branch?: string }[] = [
  { name: 'gameMaster', label: 'Game master (PokeMiners)', repo: 'PokeMiners/game_masters' },
  { name: 'assets', label: 'Textes & images Méga (PokeMiners)', repo: 'PokeMiners/pogo_assets' },
  { name: 'costumes', label: 'Noms de costumes (WatWowMap)', repo: 'WatWowMap/pogo-data-api' },
  { name: 'leekduck', label: 'Raids, événements, études (Leek Duck via ScrapedDuck)', repo: 'bigfoott/ScrapedDuck', branch: 'data' },
];

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

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
  /** Variant key -> first date it appeared in a build (estimated on the baseline run). */
  private firstSeen: Record<string, string> | null = null;
  /** Unknown keys get estimates instead of "today" on the next run (first run, or after a repair). */
  private reestimate = false;

  get ready() { return this.raw !== null; }
  /** Raw generated dataset (no manager overrides), for matching jobs. */
  get rawDataset(): Dataset | null { return this.raw; }
  getStatus(): DataStatus { return { ...this.status, eventsArchived: this.events.length }; }
  getEventsBody() { return this.eventsBody; }

  private readyListeners: (() => Promise<void> | void)[] = [];
  /** Runs after the dataset is loaded from disk and after every successful refresh. */
  onDataset(fn: () => Promise<void> | void) {
    this.readyListeners.push(fn);
  }
  private async notifyDataset() {
    for (const fn of this.readyListeners) await Promise.resolve(fn()).catch((e) => console.error('dataset listener', e));
  }

  /** Variant keys the dataset folded into others. */
  aliases(): Record<string, string> | undefined {
    return this.raw?.aliases;
  }

  /** Species names by dex number (null until a dataset is loaded). */
  speciesNames(): Map<number, LocalizedText> | null {
    return this.raw ? new Map(this.raw.species.map((s) => [s.dex, s.name])) : null;
  }

  private variantIndex: { version: string; manual: ManualOverrides; byKey: Map<string, Variant> } | null = null;
  /** What players see for a variant right now (corrections included), for the admin journal's before / after. */
  async shownState(key: string): Promise<{ released: boolean; label: LocalizedText | null; genders: Gender[] | null; shinyReleased: boolean; noEvolve: boolean; noMega: boolean } | null> {
    const v = (await this.variants())?.get(key);
    return v ? { released: !v.datamined, label: v.label, genders: v.genders ?? null, shinyReleased: v.hasShiny && v.shinyReleased !== false, noEvolve: !!v.noEvolve, noMega: !!v.noMega } : null;
  }

  /** Variants of the current dataset by key, managers' corrections included (null until a dataset is loaded). */
  async variants(): Promise<Map<string, Variant> | null> {
    // Datasets built before pipeline v8 have no genders: treat them as unknown rather than "every gender".
    if (!this.raw || !this.raw.variants.some((v) => v.genders)) return null;
    const manual = await this.loadOverrides();
    if (this.variantIndex?.version !== this.raw.version || this.variantIndex.manual !== manual) {
      this.variantIndex = { version: this.raw.version, manual, byKey: new Map(applyManualOverrides(this.raw, manual).variants.map((v) => [v.key, v])) };
    }
    return this.variantIndex.byKey;
  }

  async start() {
    await mkdir(env.dataDir, { recursive: true });
    await this.loadFromDisk();
    await this.notifyDataset();
    const ageMs = this.status.generatedAt ? Date.now() - new Date(this.status.generatedAt).getTime() : Infinity;
    const refreshMs = env.dataRefreshHours * 3600_000;
    const outdated = this.status.pipelineVersion !== PIPELINE_VERSION;
    const delay = outdated ? 0 : Math.max(0, refreshMs - ageMs);
    // refresh() schedules the next run itself when it ends.
    if (delay === 0) void this.refresh(outdated ? `pipeline v${this.status.pipelineVersion ?? '?'} -> v${PIPELINE_VERSION}` : 'startup');
    else this.schedule(delay);
  }

  private schedule(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    const at = Date.now() + delayMs;
    this.status.nextRunAt = new Date(at).toISOString();
    // Node fires timeouts over ~24.8 days immediately: wait in steps instead.
    const tick = () => {
      const left = at - Date.now();
      if (left > MAX_TIMEOUT_MS) this.timer = setTimeout(tick, MAX_TIMEOUT_MS);
      else this.timer = setTimeout(() => void this.refresh('scheduled').catch((e) => console.error('refresh failed', e)), Math.max(0, left));
      this.timer.unref();
    };
    tick();
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
      this.firstSeen = JSON.parse(await readFile(path.join(env.dataDir, FILES.firstSeen), 'utf8')) as Record<string, string>;
      const dropped = repairFirstSeen(this.firstSeen);
      if (dropped) {
        console.log(`first-seen: ${dropped} keys shared one date (tracking artefact), re-estimating them`);
        this.reestimate = true;
      }
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
        knownSince: this.firstSeen ?? {},
        baseline: this.firstSeen === null || this.reestimate,
        log: (m) => console.log(`  ${m}`),
      });
      const next: Record<string, string> = { ...(this.firstSeen ?? {}) };
      let added = 0;
      // Every key is recorded, dated or not: an undated key left out would look brand new on the next run.
      for (const v of dataset.variants) if (!(v.key in next)) { next[v.key] = v.firstSeen ?? FIRST_SEEN_BEFORE_TRACKING; added++; }
      this.firstSeen = next;
      this.reestimate = false;
      await writeFile(path.join(env.dataDir, FILES.firstSeen), JSON.stringify(next)).catch(() => {});
      console.log(`  first-seen: ${Object.keys(next).length} keys (+${added})`);
      this.raw = dataset;
      this.served = null;
      this.events = merged.all;
      this.eventsBody = JSON.stringify(this.events);
      this.status.generatedAt = dataset.generatedAt;
      this.status.version = dataset.version;
      this.status.stats = stats;
      this.status.pipelineVersion = PIPELINE_VERSION;
      this.status.lastError = null;
      recordSource('dataset');
      this.status.sources = await this.probeSources();
      await writeFile(path.join(env.dataDir, FILES.dataset), JSON.stringify(dataset));
      await writeFile(path.join(env.dataDir, FILES.events), this.eventsBody);
      console.log(`dataset refreshed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${merged.added} new events`);
      await this.notifyDataset();
      return true;
    } catch (e) {
      this.status.lastError = (e as Error).message;
      recordSource('dataset', e);
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
        genders: r.genders ?? null,
        shinyReleased: r.shinyReleased,
        noEvolve: r.noEvolve,
        noMega: r.noMega,
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
