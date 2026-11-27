import { zValidator } from '@hono/zod-validator';
import { variantImageUrl } from '@mydexpogo/shared';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { fetchOEmbed, parseTweetUrl } from '../game/oembed.js';
import { getPromoCodes } from '../game/promo.js';
import { getEventSpawns } from '../game/eventSpawns.js';
import { getRichEventById, getRichEvents } from '../game/eventDetails.js';
import type { SpeciesSpriteLookup } from '../game/regionalEvents.js';
import { dataService } from '../data/service.js';
import { getResearch } from '../game/research.js';
import { itemFr, questFr } from '../lib/gameTexts.js';
import { LEAGUES, getBattleData, getPopularTeams, getPvpDetails, getPvpRankings, type League } from '../game/pvpRankings.js';
import { rateLimit } from '../lib/ratelimit.js';

const serialize = (p: typeof schema.posts.$inferSelect) => ({ ...p, postedAt: p.postedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString() });

const ALLOWED_ASSET_HOSTS = new Set([
  'cdn.leekduck.com',
  'leekduck.com',
  'www.leekduck.com',
  'raw.githubusercontent.com',
  'trade.pokemongopro.com',
  'static.wikia.nocookie.net',
  'www.serebii.net',
]);

function buildSpeciesSpriteLookup(): SpeciesSpriteLookup | undefined {
  const ds = dataService.rawDataset;
  if (!ds) return undefined;
  const coverByDex = new Map<number, (typeof ds.variants)[number]>();
  for (const v of ds.variants) {
    if (!coverByDex.has(v.dex) || (v.kind === 'base' && v.gender !== 'f')) coverByDex.set(v.dex, v);
  }
  const map: SpeciesSpriteLookup = new Map();
  for (const sp of ds.species) {
    const v = coverByDex.get(sp.dex);
    if (!v) continue;
    const img = variantImageUrl(ds, v, false);
    if (img) map.set(sp.name.en.toLowerCase(), { dex: sp.dex, image: img });
  }
  return map;
}
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const MAX_ASSET_BYTES = 3 * 1024 * 1024;

function parseAllowedAssetUrl(raw: string | undefined): URL | null {
  if (!raw || raw.length > 500) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!ALLOWED_ASSET_HOSTS.has(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

/** Game tab data that is not a ScrapedDuck JSON: curated X posts, promo codes, field research, PvPoke rankings. */
export const gameRoutes = new Hono<AuthEnv>()
  .get('/posts', async (c) => {
    const rows = await db.select().from(schema.posts).orderBy(desc(schema.posts.postedAt), desc(schema.posts.createdAt)).limit(100);
    c.header('cache-control', 'no-cache');
    return c.json({ posts: rows.map(serialize) });
  })
  .get('/promo-codes', async (c) => {
    try {
      return c.json({ codes: await getPromoCodes() });
    } catch (e) {
      return c.json({ codes: [], error: (e as Error).message });
    }
  })
  /** What appears in the wild during current and upcoming events. */
  .get('/event-spawns', async (c) => {
    try {
      return c.json({ events: await getEventSpawns() });
    } catch (e) {
      return c.json({ events: [], error: (e as Error).message }, 502);
    }
  })
  /** Same-origin CORS-safe proxy for event bonus icons, banners & sprites during PNG/PDF infographic export. */
  .get('/asset', rateLimit({ windowMs: 60_000, max: 180 }), async (c) => {
    let current = parseAllowedAssetUrl(c.req.query('url'));
    if (!current) return c.json({ error: 'invalid_url' }, 400);
    try {
      let res: Response | null = null;
      for (let hops = 0; hops < 4; hops++) {
        res = await fetch(current.toString(), {
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; mydexpogo/1.0)' },
          redirect: 'manual',
          signal: AbortSignal.timeout(6_000),
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          void res.body?.cancel();
          if (!loc) return c.json({ error: 'invalid_redirect' }, 400);
          let next: URL;
          try {
            next = new URL(loc, current);
          } catch {
            return c.json({ error: 'invalid_redirect' }, 400);
          }
          const allowed = parseAllowedAssetUrl(next.toString());
          if (!allowed) return c.json({ error: 'invalid_redirect' }, 400);
          current = allowed;
          continue;
        }
        break;
      }
      if (!res || !res.ok) return c.json({ error: 'upstream_failed' }, 502);
      const ct = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(ct)) {
        void res.body?.cancel();
        return c.json({ error: 'invalid_type' }, 415);
      }
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_ASSET_BYTES) {
        void res.body?.cancel();
        return c.json({ error: 'too_large' }, 413);
      }
      if (!res.body) return c.json({ error: 'upstream_failed' }, 502);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ASSET_BYTES) {
          void reader.cancel();
          return c.json({ error: 'too_large' }, 413);
        }
        chunks.push(value);
      }
      if (total === 0) return c.json({ error: 'too_large' }, 413);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const ch of chunks) {
        out.set(ch, offset);
        offset += ch.byteLength;
      }
      c.header('content-type', ct);
      c.header('cache-control', 'public, max-age=86400');
      c.header('x-content-type-options', 'nosniff');
      return c.body(out, 200);
    } catch {
      return c.json({ error: 'upstream_failed' }, 502);
    }
  })
  /** Rich event details (bonuses, debuts, tiered raids, GO Pass, ticket rewards, regional events) for automatic event infographics. */
  .get('/events', async (c) => {
    try {
      return c.json({ events: await getRichEvents(buildSpeciesSpriteLookup()) });
    } catch (e) {
      return c.json({ events: [], error: (e as Error).message }, 502);
    }
  })
  /** On-demand rich event detail for any event clicked from the weekly timeline (including raids, GBL, regional, past events). */
  .get('/events/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const event = await getRichEventById(id, dataService.findArchivedEvent(id) ?? null, buildSpeciesSpriteLookup());
      if (!event) return c.json({ error: 'not_found' }, 404);
      return c.json({ event });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  })
  .get('/research', async (c) => {
    try {
      // The game's own French for the tasks and the item rewards, next to Leek Duck's English.
      const categories = await Promise.all(
        (await getResearch()).map(async (cat) => ({
          ...cat,
          tasks: await Promise.all(
            cat.tasks.map(async (task) => ({
              ...task,
              textFr: (await questFr(task.text)) ?? undefined,
              rewards: await Promise.all(task.rewards.map(async (r) => (r.kind === 'item' ? { ...r, nameFr: (await itemFr(r.name)) ?? undefined } : r))),
            })),
          ),
        })),
      );
      return c.json({ categories });
    } catch (e) {
      return c.json({ categories: [], error: (e as Error).message }, 502);
    }
  })
  .get('/pvp-rankings', async (c) => {
    try {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(await getPvpRankings());
    } catch (e) {
      return c.json({ great: [], ultra: [], error: (e as Error).message }, 502);
    }
  })
  .get('/pvp-rankings/:dex{[0-9]+}', async (c) => {
    try {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(await getPvpDetails(Number(c.req.param('dex'))));
    } catch (e) {
      return c.json({ rankings: [], error: (e as Error).message }, 502);
    }
  })
  .get('/pvp-battle/:dex{[0-9]+}', async (c) => {
    try {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(await getBattleData(Number(c.req.param('dex'))));
    } catch (e) {
      return c.json({ species: [], moves: [], recommended: {}, error: (e as Error).message }, 502);
    }
  })
  .get('/pvp-teams/:league', async (c) => {
    const league = c.req.param('league') as League;
    if (!LEAGUES.includes(league)) return c.json({ error: 'not_found' }, 404);
    try {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(await getPopularTeams(league));
    } catch (e) {
      return c.json({ updated: null, teams: [], error: (e as Error).message }, 502);
    }
  })
  .post('/posts', requireRole('manager'), zValidator('json', z.object({ url: z.string().max(300) })), async (c) => {
    const { url } = c.req.valid('json');
    if (!parseTweetUrl(url)) return c.json({ error: 'invalid_url' }, 400);
    let post;
    try {
      post = await fetchOEmbed(url);
    } catch (e) {
      return c.json({ error: 'oembed_failed', message: (e as Error).message }, 502);
    }
    const values = { ...post, addedBy: c.get('user').id };
    await db.insert(schema.posts).values(values).onConflictDoUpdate({ target: schema.posts.id, set: { text: post.text, html: post.html, links: post.links, codes: post.codes, postedAt: post.postedAt } });
    const [row] = await db.select().from(schema.posts).where(eq(schema.posts.id, post.id)).limit(1);
    return c.json({ post: serialize(row!) }, 201);
  })
  .delete('/posts/:id', requireRole('manager'), async (c) => {
    await db.delete(schema.posts).where(eq(schema.posts.id, c.req.param('id')));
    return c.json({ ok: true });
  });
