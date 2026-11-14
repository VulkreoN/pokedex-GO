/**
 * Feed job: polls PokeMiners' Discord channels (followed into your server) and the official news,
 * stores every item with its candidate variants, auto-applies game master confirmations,
 * and leaves the rest to managers in the review queue.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Species } from '@mydexpogo/shared';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import type { FeedAttachment, FeedMatch } from '../db/schema.js';
import { env } from '../env.js';
import { fetchMessages, snowflakeDate, type DiscordMessage } from './discord.js';
import { candidatesFor } from './match.js';
import { fetchNewsPost, listNewsSlugs } from './news.js';

const MAX_TEXT_ATTACHMENT = 300_000;
const MAX_FILE = 8_000_000;

export interface FeedStatus {
  enabled: { discord: string[]; news: string[] };
  lastRunAt: string | null;
  lastError: string | null;
  running: boolean;
  pending: number;
}

class FeedService {
  private timer: NodeJS.Timeout | null = null;
  status: FeedStatus = { enabled: { discord: Object.keys(env.discordChannels), news: env.newsLocales }, lastRunAt: null, lastError: null, running: false, pending: 0 };

  get filesDir() {
    return path.join(env.dataDir, 'feed');
  }

  start() {
    void mkdir(this.filesDir, { recursive: true }).catch(() => {});
    if (!env.discordToken && env.newsLocales.length === 0) return;
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
      if (env.discordToken) {
        for (const [name, channelId] of Object.entries(env.discordChannels)) {
          await this.pollDiscord(name, channelId).catch((e: Error) => errors.push(`discord:${name}: ${e.message}`));
        }
      }
      for (const locale of env.newsLocales) {
        await this.pollNews(locale).catch((e: Error) => errors.push(`news:${locale}: ${e.message}`));
      }
      this.status.lastError = errors.length ? errors.join(' | ') : null;
      if (errors.length) console.warn(`feed (${reason}):`, errors.join(' | '));
    } finally {
      this.status.lastRunAt = new Date().toISOString();
      this.status.running = false;
      this.status.pending = await this.pendingCount();
    }
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

  private async pollDiscord(name: string, channelId: string) {
    const source = `discord:${name}`;
    let after = await this.cursor(source);
    if (!after) {
      // first run: start from messages of the last 14 days
      const since = Date.now() - 14 * 86_400_000;
      after = String((BigInt(since - 1420070400000) << 22n));
    }
    for (let page = 0; page < 10; page++) {
      const msgs = await fetchMessages(channelId, after);
      if (msgs.length === 0) break;
      for (const m of msgs) {
        await this.storeDiscord(source, m);
        after = m.id;
      }
      await this.setCursor(source, after!);
      if (msgs.length < 50) break;
    }
  }

  private async storeDiscord(source: string, m: DiscordMessage) {
    const id = `discord:${m.id}`;
    const attachments: FeedAttachment[] = [];
    let extraText = '';
    await mkdir(path.join(this.filesDir, m.id), { recursive: true });
    for (const a of m.attachments) {
      const att: FeedAttachment = { name: a.filename, file: null, contentType: a.content_type ?? null, size: a.size };
      const isText = /\.(txt|json|md|proto)$/i.test(a.filename) || (a.content_type ?? '').startsWith('text/');
      if (a.size <= MAX_FILE) {
        try {
          const res = await fetch(a.url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            const safe = a.filename.replace(/[^A-Za-z0-9._-]/g, '_');
            await writeFile(path.join(this.filesDir, m.id, safe), buf);
            att.file = `${m.id}/${safe}`;
            if (isText && a.size <= MAX_TEXT_ATTACHMENT) {
              att.text = buf.toString('utf8');
              extraText += `\n${att.text}`;
            }
          }
        } catch {}
      }
      attachments.push(att);
    }
    const embedText = m.embeds.map((e) => [e.title, e.description].filter(Boolean).join('\n')).join('\n');
    const content = [m.content, embedText].filter(Boolean).join('\n');
    const ds = dataService.rawDataset;
    const matches: FeedMatch[] = ds ? candidatesFor(`${content}\n${extraText}`, ds, this.speciesById()) : [];
    // Game master confirmations are applied right away: in the game master means usable in game.
    const auto = source === 'discord:gm' && matches.some((x) => x.reason.startsWith('game master'));
    await db
      .insert(schema.feedItems)
      .values({ id, source, title: null, content, url: null, attachments, matches, status: auto ? 'done' : 'new', auto, postedAt: new Date(m.timestamp || snowflakeDate(m.id)) })
      .onConflictDoNothing();
    if (auto) await this.applyReleased(matches.filter((x) => x.reason.startsWith('game master')).map((x) => x.variantKey), null);
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
