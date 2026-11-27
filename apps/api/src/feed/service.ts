/**
 * Feed job: polls the official news, stores every article with its candidate variants,
 * and leaves them to managers in the review queue.
 */
import { recordSource } from '../lib/health.js';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Species } from '@mydexpogo/shared';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';
import { candidatesFor } from './match.js';
import { fetchNewsPost, listNewsSlugs } from './news.js';

export interface FeedStatus {
  enabled: { news: string[] };
  lastRunAt: string | null;
  lastError: string | null;
  running: boolean;
  pending: number;
}

class FeedService {
  private timer: NodeJS.Timeout | null = null;
  status: FeedStatus = { enabled: { news: env.newsLocales }, lastRunAt: null, lastError: null, running: false, pending: 0 };

  start() {
    if (env.newsLocales.length === 0) return;
    const run = () => void this.poll('scheduled');
    setTimeout(run, 20_000).unref();
    this.timer = setInterval(run, env.feedPollMinutes * 60_000);
    this.timer.unref();
  }

  async poll(reason: string): Promise<void> {
    if (this.status.running) return;
    this.status.running = true;
    const errors: string[] = [];
    try {
      for (const locale of env.newsLocales) {
        await this.pollNews(locale).catch((e: Error) => errors.push(`news:${locale}: ${e.message}`));
      }
      this.status.lastError = errors.length ? errors.join(' | ') : null;
      if (env.newsLocales.length) recordSource('feed', errors.length ? new Error(errors.join(' | ')) : undefined);
      if (errors.length) console.warn(`feed (${reason}):`, errors.join(' | '));
    } catch (e) {
      this.status.lastError = (e as Error).message;
    } finally {
      this.status.lastRunAt = new Date().toISOString();
      this.status.running = false;
      this.status.pending = await this.pendingCount().catch(() => this.status.pending);
    }
  }

  async refreshPending(): Promise<number> {
    this.status.pending = await this.pendingCount();
    return this.status.pending;
  }

  private async pendingCount(): Promise<number> {
    const rows = await db.select({ id: schema.feedItems.id }).from(schema.feedItems).where(eq(schema.feedItems.status, 'new'));
    return rows.length;
  }

  private async cursor(source: string): Promise<string | null> {
    const [row] = await db.select().from(schema.feedCursors).where(eq(schema.feedCursors.source, source)).limit(1);
    return row?.cursor ?? null;
  }
  private async setCursor(source: string, cursor: string) {
    await db.insert(schema.feedCursors).values({ source, cursor, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.feedCursors.source, set: { cursor, updatedAt: new Date() } });
  }

  private speciesById(): Map<string, Species> {
    const ds = dataService.rawDataset;
    return new Map((ds?.species ?? []).map((s) => [s.id, s]));
  }

  private async pollNews(locale: string) {
    const source = `news:${locale}`;
    const slugs = await listNewsSlugs(locale);
    const ids = slugs.map((s) => `news:${locale}:${s}`);
    const existing = new Set((await db.select({ id: schema.feedItems.id }).from(schema.feedItems).where(inArray(schema.feedItems.id, ids))).map((r) => r.id));
    const first = !(await this.cursor(source));
    for (const slug of slugs) {
      const id = `news:${locale}:${slug}`;
      if (existing.has(id)) continue;
      const post = await fetchNewsPost(locale, slug);
      const ds = dataService.rawDataset;
      const matches = ds ? candidatesFor(`${post.title}\n${post.text}`, ds, this.speciesById()) : [];
      await db
        .insert(schema.feedItems)
        .values({
          id,
          source,
          title: post.title,
          content: post.text,
          url: post.url,
          attachments: post.image ? [{ name: 'image', file: null, contentType: 'image/*', size: 0, text: post.image }] : [],
          matches,
          // on the very first run, older news with nothing to confirm are archived silently
          status: first && matches.length === 0 ? 'ignored' : 'new',
          auto: false,
          postedAt: post.postedAt,
        })
        .onConflictDoNothing();
    }
    await this.setCursor(source, new Date().toISOString());
  }

  /** Writes "released" overrides for the given keys (system when userId is null). */
  async applyReleased(keys: string[], userId: string | null) {
    for (const key of keys) {
      await db
        .insert(schema.variantOverrides)
        .values({ variantKey: key, released: true, updatedBy: userId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: schema.variantOverrides.variantKey, set: { released: true, updatedBy: userId, updatedAt: new Date() } });
    }
    if (keys.length) dataService.invalidateOverrides();
  }

  async list(status: 'new' | 'done' | 'ignored' | 'all', limit = 50) {
    const q = db.select().from(schema.feedItems).orderBy(desc(schema.feedItems.postedAt)).limit(limit);
    const rows = status === 'all' ? await q : await q.where(eq(schema.feedItems.status, status));
    return rows;
  }
}

export const feedService = new FeedService();
