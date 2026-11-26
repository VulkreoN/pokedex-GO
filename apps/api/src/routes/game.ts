import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { fetchOEmbed, parseTweetUrl } from '../game/oembed.js';
import { getPromoCodes } from '../game/promo.js';
import { getEventSpawns } from '../game/eventSpawns.js';
import { getResearch } from '../game/research.js';
import { itemFr, questFr } from '../lib/gameTexts.js';
import { LEAGUES, getBattleData, getPopularTeams, getPvpDetails, getPvpRankings, type League } from '../game/pvpRankings.js';

const serialize = (p: typeof schema.posts.$inferSelect) => ({ ...p, postedAt: p.postedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString() });

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
