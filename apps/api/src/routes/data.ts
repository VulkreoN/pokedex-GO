import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { isValidVariantKey, neutralKey } from '@mydexpogo/shared';
import { z } from 'zod';
import { requireRole, type AuthEnv } from '../auth.js';
import { dataService } from '../data/service.js';
import { feedService } from '../feed/service.js';
import { db, schema } from '../db/index.js';
import { hashToken } from '../lib/ids.js';
import { syncCollectionsForOverrides } from '../lists/syncOverrides.js';
import { randomBytes } from 'node:crypto';
import { audit } from '../lib/audit.js';
import { notifyAccount } from '../notify/service.js';

/** An override as the journal keeps it, to show it and to put it back. */
/** The categories a manager can put a variant in. */
const VARIANT_KINDS = ['base', 'costume', 'form', 'regional', 'mega', 'gmax'] as const;

export const overrideState = (o: typeof schema.variantOverrides.$inferSelect) => ({
  released: o.released,
  label: o.labelEn || o.labelFr ? { en: o.labelEn ?? '', fr: o.labelFr } : null,
  genders: o.genders,
  shinyReleased: o.shinyReleased,
  noEvolve: o.noEvolve,
  noMega: o.noMega,
  kind: o.kind,
  hidden: o.hidden,
});

/** Public: the generated dataset, the event archive, and the freshness status. */
export const dataRoutes = new Hono<AuthEnv>()
  .get('/pokedex.json', async (c) => {
    const served = await dataService.getServed();
    if (!served) return c.json({ error: 'dataset_not_ready', status: dataService.getStatus() }, 503);
    if (c.req.header('if-none-match') === served.etag) return c.body(null, 304);
    c.header('etag', served.etag);
    c.header('cache-control', 'no-cache'); // always revalidate: the ETag makes it a cheap 304
    c.header('content-type', 'application/json; charset=utf-8');
    return c.body(served.body);
  })
  .get('/tools.json', async (c) => {
    const tools = await dataService.getTools();
    if (!tools) return c.json({ error: 'dataset_not_ready' }, 503);
    if (c.req.header('if-none-match') === tools.etag) return c.body(null, 304);
    c.header('etag', tools.etag);
    c.header('cache-control', 'no-cache');
    c.header('content-type', 'application/json; charset=utf-8');
    return c.body(tools.body);
  })
  .get('/events-archive.json', (c) => {
    c.header('cache-control', 'no-cache');
    c.header('content-type', 'application/json; charset=utf-8');
    return c.body(dataService.getEventsBody());
  })
  .get('/status', (c) => c.json({ ...dataService.getStatus(), feed: feedService.status }))
  .post('/refresh', requireRole('admin'), async (c) => {
    const started = await dataService.refresh(`manual by ${c.get('user').username}`);
    return c.json({ started, status: dataService.getStatus() }, started ? 202 : 409);
  });

const labelSchema = z
  .object({
    en: z.string().trim().max(60).optional(),
    fr: z.string().trim().max(60).optional(),
  })
  .refine((l) => !!(l.en || l.fr), 'label cannot be empty');

const overrideBody = z.object({
  released: z.boolean().nullable().optional(),
  label: labelSchema.nullable().optional(),
  /** For forms the game master does not describe yet: which genders exist ([] = genderless). */
  genders: z.array(z.enum(['m', 'f'])).max(2).refine((g) => new Set(g).size === g.length, 'duplicate gender').nullable().optional(),
  /** The variant is out but its shiny is not (or the other way round). */
  shinyReleased: z.boolean().nullable().optional(),
  /** The "can't evolve" mark, when the game master gets it wrong. */
  noEvolve: z.boolean().nullable().optional(),
  /** The "no Mega" mark, by hand. */
  noMega: z.boolean().nullable().optional(),
  kind: z.enum(VARIANT_KINDS).nullable().optional(),
  /** true = hide/remove this bogus variant from the Pokédex (restorable anytime). */
  hidden: z.boolean().nullable().optional(),
});

/** Managers: force a variant released / not released, rename it, or remove/restore bogus variants. */
export const overrideRoutes = new Hono<AuthEnv>()
  .get('/', async (c) => {
    const rows = await db
      .select({ o: schema.variantOverrides, by: schema.users.username })
      .from(schema.variantOverrides)
      .leftJoin(schema.users, eq(schema.users.id, schema.variantOverrides.updatedBy))
      .orderBy(sql`${schema.variantOverrides.updatedAt} desc`);
    return c.json({
      overrides: rows.map(({ o, by }) => ({
        variantKey: o.variantKey,
        released: o.released,
        label: o.labelEn || o.labelFr ? { en: o.labelEn ?? '', fr: o.labelFr ?? undefined } : null,
        genders: o.genders,
        shinyReleased: o.shinyReleased,
        noEvolve: o.noEvolve,
        noMega: o.noMega,
        kind: o.kind,
        hidden: o.hidden,
        meta: dataService.rawVariantMeta(o.variantKey),
        updatedBy: by,
        updatedAt: o.updatedAt.toISOString(),
      })),
    });
  })
  /**
   * Managers: the same change on many variants at once (released, shiny out, can't evolve, category, label, hidden).
   * A field left out is not touched, and each variant keeps its other corrections. One journal line per variant.
   */
  .patch(
    '/',
    requireRole('manager'),
    zValidator(
      'json',
      z.object({
        keys: z.array(z.string()).min(1).max(1000),
        released: z.boolean().nullable().optional(),
        label: labelSchema.nullable().optional(),
        shinyReleased: z.boolean().nullable().optional(),
        noEvolve: z.boolean().nullable().optional(),
        noMega: z.boolean().nullable().optional(),
        kind: z.enum(VARIANT_KINDS).nullable().optional(),
        hidden: z.boolean().nullable().optional(),
      }),
    ),
    async (c) => {
      const { keys, ...patch } = c.req.valid('json');
      if (!keys.every(isValidVariantKey)) return c.json({ error: 'invalid_variant_key' }, 400);
      const me = c.get('user').id;
      const was = new Map(await Promise.all(keys.map(async (k) => [k, await dataService.shownState(k)] as const)));
      const befores = new Map<string, typeof schema.variantOverrides.$inferSelect>();
      for (const k of keys) {
        const [before] = await db.select().from(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, k)).limit(1);
        if (before) befores.set(k, before);
        const nextLabelEn = patch.label !== undefined ? (patch.label?.en || null) : (before?.labelEn ?? null);
        const nextLabelFr = patch.label !== undefined ? (patch.label?.fr || null) : (before?.labelFr ?? null);
        const values = {
          variantKey: k,
          released: patch.released !== undefined ? patch.released : (before?.released ?? null),
          labelEn: nextLabelEn,
          labelFr: nextLabelFr,
          genders: before?.genders ?? null,
          shinyReleased: patch.shinyReleased !== undefined ? patch.shinyReleased : (before?.shinyReleased ?? null),
          noEvolve: patch.noEvolve !== undefined ? patch.noEvolve : (before?.noEvolve ?? null),
          noMega: patch.noMega !== undefined ? patch.noMega : (before?.noMega ?? null),
          kind: patch.kind !== undefined ? patch.kind : (before?.kind ?? null),
          hidden: patch.hidden !== undefined ? patch.hidden : (before?.hidden ?? null),
          updatedBy: me,
          updatedAt: new Date(),
        };
        if (values.released === null && !values.labelEn && !values.labelFr && !values.genders && values.shinyReleased === null && values.noEvolve === null && values.noMega === null && values.kind === null && values.hidden === null) {
          await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, k));
        } else {
          await db.insert(schema.variantOverrides).values(values).onConflictDoUpdate({ target: schema.variantOverrides.variantKey, set: values });
        }
      }
      dataService.invalidateOverrides();
      const nowMap = new Map(await Promise.all(keys.map(async (k) => [k, await dataService.shownState(k)] as const)));
      const sync = await syncCollectionsForOverrides(
        keys.map((k) => ({
          key: k,
          was: was.get(k) ?? null,
          now: nowMap.get(k) ?? null,
          explicit: { released: patch.released, shinyReleased: patch.shinyReleased, hidden: patch.hidden },
        })),
        await dataService.variants(),
      );
      const recordedPruned = new Set<string>();
      for (const k of keys) {
        const before = befores.get(k);
        const nk = neutralKey(k);
        const pruned = !recordedPruned.has(nk) ? sync.prunedByKey.get(nk) : undefined;
        if (pruned?.length) recordedPruned.add(nk);
        await audit(me, 'override.set', 'variant', k, {
          before: before ? overrideState(before) : null,
          after: patch,
          was: was.get(k),
          now: nowMap.get(k),
          bulk: keys.length,
          ...(pruned?.length ? { pruned } : {}),
        });
      }
      return c.json({ ok: true, count: keys.length, updatedLists: sync.listsUpdated, removedEntries: sync.entriesRemoved });
    },
  )
  .put('/:key', requireRole('manager'), zValidator('json', overrideBody), async (c) => {
    const key = c.req.param('key');
    if (!isValidVariantKey(key)) return c.json({ error: 'invalid_variant_key' }, 400);
    const body = c.req.valid('json');
    const [before] = await db.select().from(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key)).limit(1);
    const was = await dataService.shownState(key);
    const values = {
      variantKey: key,
      released: body.released ?? null,
      labelEn: body.label?.en || null,
      labelFr: body.label?.fr || null,
      genders: body.genders ?? null,
      shinyReleased: body.shinyReleased ?? null,
      noEvolve: body.noEvolve ?? null,
      noMega: body.noMega ?? null,
      kind: body.kind ?? null,
      hidden: body.hidden ?? null,
      updatedBy: c.get('user').id,
      updatedAt: new Date(),
    };
    if (values.released === null && !values.labelEn && !values.labelFr && !values.genders && values.shinyReleased === null && values.noEvolve === null && values.noMega === null && values.kind === null && values.hidden === null) {
      await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key));
    } else {
      await db.insert(schema.variantOverrides).values(values).onConflictDoUpdate({ target: schema.variantOverrides.variantKey, set: values });
    }
    dataService.invalidateOverrides();
    const now = await dataService.shownState(key);
    const sync = await syncCollectionsForOverrides(
      [
        {
          key,
          was,
          now,
          explicit: { released: body.released, shinyReleased: body.shinyReleased, hidden: body.hidden, genders: body.genders },
        },
      ],
      await dataService.variants(),
    );
    const pruned = sync.prunedByKey.get(neutralKey(key));
    // was / now: what players saw before and see after, so the journal can say what changed.
    await audit(c.get('user').id, 'override.set', 'variant', key, {
      before: before ? overrideState(before) : null,
      after: {
        released: values.released,
        label: values.labelEn || values.labelFr ? { en: values.labelEn ?? '', fr: values.labelFr } : null,
        genders: values.genders,
        shinyReleased: values.shinyReleased,
        noEvolve: values.noEvolve,
        noMega: values.noMega,
        kind: values.kind,
        hidden: values.hidden,
      },
      was,
      now,
      ...(pruned?.length ? { pruned } : {}),
    });
    return c.json({ ok: true, updatedLists: sync.listsUpdated, removedEntries: sync.entriesRemoved });
  })
  .delete('/:key', requireRole('manager'), async (c) => {
    const key = c.req.param('key');
    const [before] = await db.select().from(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key)).limit(1);
    const was = await dataService.shownState(key);
    await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantKey, key));
    dataService.invalidateOverrides();
    const now = await dataService.shownState(key);
    const sync = await syncCollectionsForOverrides([{ key, was, now }], await dataService.variants());
    const pruned = sync.prunedByKey.get(neutralKey(key));
    if (before) await audit(c.get('user').id, 'override.reset', 'variant', key, { before: overrideState(before), after: null, was, now, ...(pruned?.length ? { pruned } : {}) });
    return c.json({ ok: true, updatedLists: sync.listsUpdated, removedEntries: sync.entriesRemoved });
  });

/** Admin: promote or demote accounts. */
export const userRoutes = new Hono<AuthEnv>()
  .use(requireRole('admin'))
  .get('/', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const digits = q.replace(/\D/g, '');
    const filter = c.req.query('filter') ?? 'all';
    const sort = c.req.query('sort') ?? 'role';
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);

    const conds = [];
    if (q) {
      conds.push(
        digits.length >= 4
          ? sql`(lower(${schema.users.username}) like lower(${'%' + q + '%'}) or ${schema.users.friendCode} like ${'%' + digits + '%'})`
          : sql`lower(${schema.users.username}) like lower(${'%' + q + '%'})`,
      );
    }
    if (filter === 'staff') conds.push(sql`${schema.users.role} in ('admin', 'manager')`);
    else if (filter === 'suspended') conds.push(sql`${schema.users.suspendedAt} is not null`);
    else if (filter === 'push') conds.push(sql`exists (select 1 from ${schema.pushSubscriptions} where ${schema.pushSubscriptions.userId} = ${schema.users.id})`);

    const where = conds.length ? sql.join(conds, sql` and `) : sql`true`;
    const [count] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users).where(where);
    const order =
      sort === 'recent'
        ? [sql`${schema.users.lastSeenAt} desc nulls last`, sql`${schema.users.createdAt} desc`]
        : sort === 'created'
          ? [sql`${schema.users.createdAt} desc`]
          : [sql`case ${schema.users.role} when 'admin' then 0 when 'manager' then 1 else 2 end`, sql`${schema.users.createdAt} desc`];

    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        friendCode: schema.users.friendCode,
        createdAt: schema.users.createdAt,
        lastSeenAt: schema.users.lastSeenAt,
        suspendedAt: schema.users.suspendedAt,
        listsCount: sql<number>`(select count(*) from ${schema.lists} where ${schema.lists.ownerId} = ${schema.users.id})`.mapWith(Number),
      })
      .from(schema.users)
      .where(where)
      .orderBy(...order)
      .limit(50)
      .offset(offset);
    return c.json({
      users: rows.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        suspendedAt: u.suspendedAt?.toISOString() ?? null,
      })),
      total: count?.n ?? 0,
      offset,
    });
  })
  /** Issues a one-time reset code (shown once to the admin, valid 24h). */
  .post('/:id/reset-code', async (c) => {
    const id = c.req.param('id');
    const code = randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'); // XXXX-XXXX-XXXX
    const [u] = await db.update(schema.users).set({ resetHash: hashToken(code.replace(/-/g, '')), resetExpiresAt: new Date(Date.now() + 24 * 3600_000) }).where(eq(schema.users.id, id)).returning({ username: schema.users.username });
    if (!u) return c.json({ error: 'not_found' }, 404);
    await audit(c.get('user').id, 'user.reset_code', 'user', id, { username: u.username });
    await notifyAccount(id, c.get('user').id, 'reset_code');
    return c.json({ username: u.username, code, expiresInHours: 24 });
  })
  .patch('/:id/role', zValidator('json', z.object({ role: z.enum(['user', 'manager', 'admin']) })), async (c) => {
    const me = c.get('user');
    const id = c.req.param('id');
    if (id === me.id) return c.json({ error: 'self' }, 400);
    const [prev] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
    const [u] = await db.update(schema.users).set({ role: c.req.valid('json').role }).where(eq(schema.users.id, id)).returning();
    if (!u) return c.json({ error: 'not_found' }, 404);
    await audit(me.id, 'user.role', 'user', id, { username: u.username, before: prev?.role, after: u.role });
    if (prev?.role !== u.role) await notifyAccount(id, me.id, 'role', { role: u.role, before: prev?.role });
    return c.json({ ok: true, role: u.role });
  });
