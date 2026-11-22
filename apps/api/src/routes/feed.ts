import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { isValidVariantKey } from '@mydexpogo/shared';
import { requireRole, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { feedService } from '../feed/service.js';

/** Manager review queue of release signals. */
export const feedRoutes = new Hono<AuthEnv>()
  .use(requireRole('manager'))
  .get('/', async (c) => {
    const status = (c.req.query('status') ?? 'new') as 'new' | 'done' | 'ignored' | 'all';
    const items = await feedService.list(status);
    return c.json({ items: items.map((i) => ({ ...i, postedAt: i.postedAt.toISOString(), fetchedAt: i.fetchedAt.toISOString(), handledAt: i.handledAt?.toISOString() ?? null })), status: feedService.status });
  })
  .post('/poll', requireRole('admin'), async (c) => {
    await feedService.poll(`manual by ${c.get('user').username}`);
    return c.json({ status: feedService.status });
  })
  .post('/:id/apply', zValidator('json', z.object({ variantKeys: z.array(z.string().refine(isValidVariantKey, 'invalid variant key')).max(200) })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    const { variantKeys } = c.req.valid('json');
    const [item] = await db.select({ id: schema.feedItems.id }).from(schema.feedItems).where(eq(schema.feedItems.id, id)).limit(1);
    if (!item) return c.json({ error: 'not_found' }, 404);
    await feedService.applyReleased(variantKeys, me.id);
    await db.update(schema.feedItems).set({ status: 'done', handledBy: me.id, handledAt: new Date() }).where(eq(schema.feedItems.id, id));
    feedService.status.pending = Math.max(0, feedService.status.pending - 1);
    return c.json({ ok: true });
  })
  .post('/:id/ignore', async (c) => {
    const me = c.get('user');
    await db.update(schema.feedItems).set({ status: 'ignored', handledBy: me.id, handledAt: new Date() }).where(eq(schema.feedItems.id, c.req.param('id')));
    feedService.status.pending = Math.max(0, feedService.status.pending - 1);
    return c.json({ ok: true });
  })
  .post('/:id/reopen', async (c) => {
    await db.update(schema.feedItems).set({ status: 'new', handledBy: null, handledAt: null }).where(eq(schema.feedItems.id, c.req.param('id')));
    return c.json({ ok: true });
  });
