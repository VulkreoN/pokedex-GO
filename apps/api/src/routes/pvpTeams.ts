import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { newId } from '../lib/ids.js';

const MAX_TEAMS_PER_USER = 50;
const memberKey = z.string().min(1).max(40).regex(/^\d+(\.f[A-Z0-9_]+)?$/);
const body = z.object({
  name: z.string().trim().min(1).max(60),
  league: z.enum(['great', 'ultra', 'master']),
  members: z.array(memberKey).min(1).max(3),
  note: z.string().trim().max(200).nullable().optional(),
});

const serialize = (t: typeof schema.pvpTeams.$inferSelect) => ({
  id: t.id,
  name: t.name,
  league: t.league,
  members: t.members,
  note: t.note,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

/** Saved teams of up to 3 PvP Pokémon per league, private to the signed-in player. */
export const pvpTeamRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const rows = await db
      .select()
      .from(schema.pvpTeams)
      .where(eq(schema.pvpTeams.userId, c.get('user').id))
      .orderBy(desc(schema.pvpTeams.updatedAt));
    return c.json({ teams: rows.map(serialize) });
  })
  .post('/', zValidator('json', body), async (c) => {
    const me = c.get('user');
    const [count] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.pvpTeams).where(eq(schema.pvpTeams.userId, me.id));
    if ((count?.n ?? 0) >= MAX_TEAMS_PER_USER) return c.json({ error: 'too_many' }, 400);
    const b = c.req.valid('json');
    const [row] = await db
      .insert(schema.pvpTeams)
      .values({ id: newId(), userId: me.id, name: b.name, league: b.league, members: b.members, note: b.note || null })
      .returning();
    return c.json({ team: serialize(row!) }, 201);
  })
  .patch('/:id', zValidator('json', body.partial()), async (c) => {
    const b = c.req.valid('json');
    const [row] = await db
      .update(schema.pvpTeams)
      .set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.league !== undefined ? { league: b.league } : {}),
        ...(b.members !== undefined ? { members: b.members } : {}),
        ...(b.note !== undefined ? { note: b.note || null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.pvpTeams.id, c.req.param('id')), eq(schema.pvpTeams.userId, c.get('user').id)))
      .returning();
    return row ? c.json({ team: serialize(row) }) : c.json({ error: 'not_found' }, 404);
  })
  .delete('/:id', async (c) => {
    const rows = await db
      .delete(schema.pvpTeams)
      .where(and(eq(schema.pvpTeams.id, c.req.param('id')), eq(schema.pvpTeams.userId, c.get('user').id)))
      .returning({ id: schema.pvpTeams.id });
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
  });
