import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db, schema } from './db/index.js';
import { env } from './env.js';
import { hashToken, newId, newSessionToken } from './lib/ids.js';

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;

export type Role = 'user' | 'manager' | 'admin';
export type AuthUser = { id: string; username: string; friendCode: string; role: Role; createdAt: Date };

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  return verify(stored, password).catch(() => false);
}

export async function createSession(c: Context, userId: string): Promise<void> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.cookieSecure,
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function userFromRequest(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const rows = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt, sid: schema.sessions.id })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.sid));
    return null;
  }
  // A suspended account's sessions stop working at once.
  if (row.user.suspendedAt) return null;
  const { id, username, friendCode, role, createdAt, lastSeenAt } = row.user;
  if (!lastSeenAt || Date.now() - lastSeenAt.getTime() > 3600_000) {
    void db.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, id)).catch(() => {});
  }
  return { id, username, friendCode, role, createdAt };
}

export type AuthEnv = { Variables: { user: AuthUser } };

/** Rejects with 401 unless a valid session cookie is present. */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await userFromRequest(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};

export function publicUser(u: AuthUser) {
  return { id: u.id, username: u.username, friendCode: u.friendCode, role: u.role, createdAt: u.createdAt.toISOString() };
}

const RANK: Record<Role, number> = { user: 0, manager: 1, admin: 2 };

/** Requires a session and at least the given role. */
export const requireRole = (role: Role): MiddlewareHandler<AuthEnv> => async (c, next) => {
  const user = await userFromRequest(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (RANK[user.role] < RANK[role]) return c.json({ error: 'forbidden' }, 403);
  c.set('user', user);
  await next();
};

export { newId };
