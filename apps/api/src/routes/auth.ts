import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createSession, destroySession, hashPassword, publicUser, requireAuth, userFromRequest, verifyPassword, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { hashToken, newFriendCode, newId } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';
import { env } from '../env.js';

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
    const [countRow] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users);
    const existing = countRow?.n ?? 0;
    const role = existing === 0 || env.adminUsernames.includes(username.toLowerCase()) ? 'admin' : 'user'; // the first account owns the instance
    const [user] = await db.insert(schema.users).values({ id, username, passwordHash, friendCode, role }).returning();
    await createSession(c, id);
    return c.json({ user: publicUser(user!) }, 201);
  })
  .post('/login', rateLimit({ windowMs: 60_000, max: 20 }), zValidator('json', credentials), async (c) => {
    const { username, password } = c.req.valid('json');
    const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.username}) = lower(${username})`).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, password))) return c.json({ error: 'invalid_credentials' }, 401);
    if (user.role !== 'admin' && env.adminUsernames.includes(user.username.toLowerCase())) {
      await db.update(schema.users).set({ role: 'admin' }).where(sql`${schema.users.id} = ${user.id}`);
      user.role = 'admin';
    }
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
  /** Logged-in: change the password, every other session is closed. */
  .post('/password', requireAuth, zValidator('json', z.object({ current: z.string(), password: z.string().min(8).max(200) })), async (c) => {
    const me = c.get('user');
    const [user] = await db.select().from(schema.users).where(sql`${schema.users.id} = ${me.id}`).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, c.req.valid('json').current))) return c.json({ error: 'invalid_credentials' }, 401);
    await db.update(schema.users).set({ passwordHash: await hashPassword(c.req.valid('json').password) }).where(sql`${schema.users.id} = ${me.id}`);
    await db.delete(schema.sessions).where(sql`${schema.sessions.userId} = ${me.id}`);
    await createSession(c, me.id);
    return c.json({ ok: true });
  })
  /** Logged-out: username + one-time code handed over by an admin + new password. */
  .post('/reset', rateLimit({ windowMs: 60_000, max: 10 }), zValidator('json', z.object({ username: z.string().trim().min(3).max(20), code: z.string().trim().min(6).max(40), password: z.string().min(8).max(200) })), async (c) => {
    const { username, code, password } = c.req.valid('json');
    const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.username}) = lower(${username})`).limit(1);
    const valid = user?.resetHash && user.resetExpiresAt && user.resetExpiresAt.getTime() > Date.now() && user.resetHash === hashToken(code.toUpperCase().replace(/-/g, ''));
    if (!user || !valid) return c.json({ error: 'invalid_code' }, 401);
    await db.update(schema.users).set({ passwordHash: await hashPassword(password), resetHash: null, resetExpiresAt: null }).where(sql`${schema.users.id} = ${user.id}`);
    await db.delete(schema.sessions).where(sql`${schema.sessions.userId} = ${user.id}`);
    await createSession(c, user.id);
    return c.json({ user: publicUser({ ...user, role: user.role }) });
  })
  .delete('/me', requireAuth, zValidator('json', z.object({ password: z.string() })), async (c) => {
    const me = c.get('user');
    const [user] = await db.select().from(schema.users).where(sql`${schema.users.id} = ${me.id}`).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, c.req.valid('json').password))) return c.json({ error: 'invalid_credentials' }, 401);
    await db.delete(schema.users).where(sql`${schema.users.id} = ${me.id}`);
    await destroySession(c);
    return c.json({ ok: true });
  });
