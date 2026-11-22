import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { fetchOEmbed, parseTweetUrl } from '../game/oembed.js';
import { getPromoCodes } from '../game/promo.js';

const serialize = (p: typeof schema.posts.$inferSelect) => ({ ...p, postedAt: p.postedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString() });

/** Game tab data that is not a Leek Duck JSON: curated X posts and promo codes. */
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
