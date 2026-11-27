import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { AppNotification, LiveEvent } from '@mydexpogo/shared';
import { requireAuth, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';
import { hub } from '../notify/hub.js';
import { sentLog, vapidKeys } from '../notify/push.js';

const actor = alias(schema.users, 'actor');
const DEFAULT_NOTIFY_PREFS = { friend_request: true, friend_accepted: true, offer: true, offer_caught: true, raid: true, spawn: true, quest: true, announcement: true, admin: true };
const MAX_SSE_PER_USER = 15;

/** Inbox and push notification settings. */
export const notificationRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const me = c.get('user');
    const rows = await db
      .select({ n: schema.notifications, actorName: actor.username, listName: schema.lists.name })
      .from(schema.notifications)
      .leftJoin(actor, eq(actor.id, schema.notifications.actorId))
      .leftJoin(schema.lists, eq(schema.lists.id, schema.notifications.listId))
      .where(eq(schema.notifications.userId, me.id))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50);
    const [unread] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt)));
    const items: AppNotification[] = rows.map(({ n, actorName, listName }) => ({
      id: n.id,
      type: n.type,
      actor: n.actorId && actorName ? { id: n.actorId, username: actorName } : null,
      list: n.listId && listName ? { id: n.listId, name: listName } : null,
      data: n.data,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    }));
    return c.json({ items, unread: unread?.n ?? 0 });
  })
  /**
   * Deletes one notification, or all of them without an id; what admins did to the account included (the admin
   * journal keeps it).
   */
  .delete('/:id?', async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    await db
      .delete(schema.notifications)
      .where(and(eq(schema.notifications.userId, me.id), id ? eq(schema.notifications.id, id) : sql`true`));
    hub.emit([me.id], { type: 'notification' });
    return c.json({ ok: true });
  })
  /** Marks the given notifications read, or all of them without ids. */
  .post('/read', zValidator('json', z.object({ ids: z.array(z.string()).max(200).optional() })), async (c) => {
    const me = c.get('user');
    const { ids } = c.req.valid('json');
    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt), ids ? inArray(schema.notifications.id, ids) : sql`true`));
    hub.emit([me.id], { type: 'notification' });
    return c.json({ ok: true });
  })
  .get('/prefs', async (c) => {
    const [u] = await db.select({ prefs: schema.users.notifyPrefs }).from(schema.users).where(eq(schema.users.id, c.get('user').id));
    return c.json({ prefs: { ...DEFAULT_NOTIFY_PREFS, ...(u?.prefs ?? {}) } });
  })
  // Every kind can be switched off but 'account': what an admin does to your account always reaches you.
  .put('/prefs', zValidator('json', z.object({ friend_request: z.boolean(), friend_accepted: z.boolean(), offer: z.boolean(), offer_caught: z.boolean(), raid: z.boolean(), spawn: z.boolean(), quest: z.boolean(), announcement: z.boolean(), admin: z.boolean() }).partial()), async (c) => {
    const me = c.get('user');
    const [u] = await db.select({ prefs: schema.users.notifyPrefs }).from(schema.users).where(eq(schema.users.id, me.id));
    const prefs = { ...(u?.prefs ?? {}), ...c.req.valid('json') };
    await db.update(schema.users).set({ notifyPrefs: prefs }).where(eq(schema.users.id, me.id));
    return c.json({ prefs: { ...DEFAULT_NOTIFY_PREFS, ...prefs } });
  });

const subscription = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'https only'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const pushRoutes = new Hono<AuthEnv>()
  .get('/key', async (c) => c.json({ publicKey: (await vapidKeys()).publicKey }))
  .post('/subscribe', requireAuth, zValidator('json', subscription), async (c) => {
    const me = c.get('user');
    const { endpoint, keys } = c.req.valid('json');
    // A device belongs to whoever is logged in on it now.
    await db
      .insert(schema.pushSubscriptions)
      .values({ endpoint, userId: me.id, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth } });
    return c.json({ ok: true }, 201);
  })
  .post('/unsubscribe', requireAuth, zValidator('json', z.object({ endpoint: z.string().max(1000) })), async (c) => {
    await db
      .delete(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.endpoint, c.req.valid('json').endpoint), eq(schema.pushSubscriptions.userId, c.get('user').id)));
    return c.json({ ok: true });
  })
  /** Test support only (PUSH_DRY_RUN=1): what would have been sent to me. */
  .get('/sent', requireAuth, (c) => {
    if (!env.pushDryRun) return c.json({ error: 'not_found' }, 404);
    return c.json({ sent: sentLog.filter((s) => s.userId === c.get('user').id).map((s) => s.message) });
  });

/** Live events for the open app: list changes from friends, friend changes, new notifications. */
export const streamRoutes = new Hono<AuthEnv>().use(requireAuth).get('/', (c) => {
  const me = c.get('user');
  if (hub.countFor(me.id) >= MAX_SSE_PER_USER) return c.json({ error: 'too_many_connections' }, 429);
  c.header('cache-control', 'no-cache, no-transform');
  c.header('x-accel-buffering', 'no');
  return streamSSE(c, async (stream) => {
    const queue: LiveEvent[] = [];
    let wake: (() => void) | null = null;
    const off = hub.subscribe(me.id, (e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => {
      off();
      wake?.();
    });
    await stream.writeSSE({ event: 'ready', data: '{}' });
    while (!stream.aborted) {
      while (queue.length) await stream.writeSSE({ event: 'live', data: JSON.stringify(queue.shift()) });
      // Wait for an event or send a heartbeat every 25 s so proxies keep the connection open.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>((ok) => {
        wake = ok;
        timer = setTimeout(ok, 25_000);
      });
      clearTimeout(timer);
      wake = null;
      if (!queue.length && !stream.aborted) await stream.write(': ping\n\n');
    }
    off();
  });
});
