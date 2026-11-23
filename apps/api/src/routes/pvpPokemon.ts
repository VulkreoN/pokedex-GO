import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { db, schema } from '../db/index.js';
import { newId } from '../lib/ids.js';

/** Enough for a whole PvP collection, not for a storage dump. */
const MAX_PER_USER = 500;

const iv = z.number().int().min(0).max(15);
const body = z.object({
  formKey: z.string().min(1).max(40).regex(/^\d+(\.f[A-Z0-9_]+)?$/),
  atk: iv,
  def: iv,
  sta: iv,
  level: z.number().min(1).max(51).multipleOf(0.5).nullable().optional(),
  shadow: z.boolean().optional(),
  note: z.string().trim().max(80).nullable().optional(),
});

const serialize = (p: typeof schema.pvpPokemon.$inferSelect) => ({ id: p.id, formKey: p.formKey, atk: p.atk, def: p.def, sta: p.sta, level: p.level, shadow: p.shadow, note: p.note, createdAt: p.createdAt.toISOString() });

/** "My PvP Pokémon": a player's own Pokémon with their IVs, private to them. */
export const pvpPokemonRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const rows = await db.select().from(schema.pvpPokemon).where(eq(schema.pvpPokemon.userId, c.get('user').id)).orderBy(desc(schema.pvpPokemon.createdAt));
    return c.json({ pokemon: rows.map(serialize) });
  })
  .post('/', zValidator('json', body), async (c) => {
    const me = c.get('user');
    const [count] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.pvpPokemon).where(eq(schema.pvpPokemon.userId, me.id));
    if ((count?.n ?? 0) >= MAX_PER_USER) return c.json({ error: 'too_many' }, 400);
    const b = c.req.valid('json');
    const [row] = await db.insert(schema.pvpPokemon).values({ id: newId(), userId: me.id, formKey: b.formKey, atk: b.atk, def: b.def, sta: b.sta, level: b.level ?? null, shadow: b.shadow ?? false, note: b.note || null }).returning();
    return c.json({ pokemon: serialize(row!) }, 201);
  })
  .patch('/:id', zValidator('json', body.partial()), async (c) => {
    const b = c.req.valid('json');
    const [row] = await db
      .update(schema.pvpPokemon)
      .set({ ...b, note: b.note === undefined ? undefined : b.note || null })
      .where(and(eq(schema.pvpPokemon.id, c.req.param('id')), eq(schema.pvpPokemon.userId, c.get('user').id)))
      .returning();
    return row ? c.json({ pokemon: serialize(row) }) : c.json({ error: 'not_found' }, 404);
  })
  .delete('/:id', async (c) => {
    const rows = await db.delete(schema.pvpPokemon).where(and(eq(schema.pvpPokemon.id, c.req.param('id')), eq(schema.pvpPokemon.userId, c.get('user').id))).returning({ id: schema.pvpPokemon.id });
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
  });
