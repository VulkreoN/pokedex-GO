import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createSession, destroySession, hashPassword, publicUser, requireAuth, userFromRequest, verifyPassword, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { newFriendCode, newId } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';

const credentials = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'letters, digits and _ only'),
  password: z.string().min(8).max(200),
});

export const authRoutes = new Hono<AuthEnv>()
  .post('/register', rateLimit({ windowMs: 60_000, max: 10 }), zValidator('json', credentials), async (c) => {
    const { username, password } = c.req.valid('json');
    const taken = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.username}) = lower(${username})`).limit(1);
    if (taken.length) return c.json({ error: 'username_taken' }, 409);
    const passwordHash = await hashPassword(password);
    let friendCode = newFriendCode();
    for (let i = 0; i < 5; i++) {
      const clash = await db.select({ id: schema.users.id }).from(schema.users).where(sql`${schema.users.friendCode} = ${friendCode}`).limit(1);
      if (!clash.length) break;
      friendCode = newFriendCode();
    }
    const id = newId();
    const [user] = await db.insert(schema.users).values({ id, username, passwordHash, friendCode }).returning();
    await createSession(c, id);
    return c.json({ user: publicUser(user!) }, 201);
  })
  .post('/login', rateLimit({ windowMs: 60_000, max: 20 }), zValidator('json', credentials), async (c) => {
    const { username, password } = c.req.valid('json');
    const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.username}) = lower(${username})`).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, password))) return c.json({ error: 'invalid_credentials' }, 401);
    await createSession(c, user.id);
    return c.json({ user: publicUser(user) });
  })
  .post('/logout', async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })
  .get('/me', async (c) => {
    const user = await userFromRequest(c);
    return c.json({ user: user ? publicUser(user) : null });
  })
  .delete('/me', requireAuth, zValidator('json', z.object({ password: z.string() })), async (c) => {
    const me = c.get('user');
    const [user] = await db.select().from(schema.users).where(sql`${schema.users.id} = ${me.id}`).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, c.req.valid('json').password))) return c.json({ error: 'invalid_credentials' }, 401);
    await db.delete(schema.users).where(sql`${schema.users.id} = ${me.id}`);
    await destroySession(c);
    return c.json({ ok: true });
  });
