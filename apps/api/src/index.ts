import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { AuthEnv } from './auth.js';
import { env } from './env.js';
import { authRoutes } from './routes/auth.js';
import { friendRoutes } from './routes/friends.js';
import { listRoutes, sharedRoutes } from './routes/lists.js';
import { dataRoutes, overrideRoutes, userRoutes } from './routes/data.js';
import { dataService } from './data/service.js';
import { feedRoutes } from './routes/feed.js';
import { gameRoutes } from './routes/game.js';
import { feedService } from './feed/service.js';
import { notificationRoutes, pushRoutes, streamRoutes } from './routes/notify.js';
import { notifyStaff, pruneNotifications } from './notify/service.js';
import { purgeAccountTrash } from './lib/accountTrash.js';
import { purgeTrash } from './lib/trash.js';
import { resetGameTexts } from './lib/gameTexts.js';
import { vapidKeys } from './notify/push.js';
import { migrateStoredGenders } from './lists/genders.js';
import { migrateAliases } from './lists/aliases.js';
import { sql } from './db/index.js';
import { clientErrorRoutes } from './routes/clientErrors.js';
import { pvpPokemonRoutes } from './routes/pvpPokemon.js';
import { pvpTeamRoutes } from './routes/pvpTeams.js';
import { adminRoutes, announcementRoutes, reportRoutes } from './routes/admin.js';
import { startRaidAlerts } from './notify/raidAlerts.js';

const app = new Hono<AuthEnv>().basePath('/api');

if (!env.isProd) app.use(logger());
app.use(secureHeaders());
if (env.corsOrigin) app.use(cors({ origin: env.corsOrigin.split(','), credentials: true }));

// The deploy job checks this version to know the new release is the one answering.
app.get('/health', (c) => c.json({ ok: true, version: env.appVersion, commit: env.appCommit }));
app.route('/auth', authRoutes);
app.route('/lists', listRoutes);
app.route('/shared', sharedRoutes);
app.route('/friends', friendRoutes);
app.route('/data', dataRoutes);
app.route('/overrides', overrideRoutes);
app.route('/users', userRoutes);
app.route('/feed', feedRoutes);
app.route('/game', gameRoutes);
app.route('/notifications', notificationRoutes);
app.route('/push', pushRoutes);
app.route('/stream', streamRoutes);
app.route('/client-errors', clientErrorRoutes);
app.route('/pvp-pokemon', pvpPokemonRoutes);
app.route('/pvp-teams', pvpTeamRoutes);
app.route('/admin', adminRoutes);
app.route('/announcements', announcementRoutes);
app.route('/reports', reportRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.status === 400 ? 'validation' : 'http_error', message: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export type AppType = typeof app;

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}/api`);
});

// Stopping (a deploy, a restart): no new connections, a moment for requests in flight, then the live streams are
// cut (the apps reconnect to the new instance by themselves) and the database pool is closed.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  const http = server as unknown as { close(): void; closeIdleConnections?(): void; closeAllConnections?(): void };
  http.close();
  http.closeIdleConnections?.();
  setTimeout(() => {
    http.closeAllConnections?.();
    void sql.end({ timeout: 2 }).finally(() => process.exit(0));
  }, 2000).unref();
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
dataService.onDataset(async () => {
  const variants = await dataService.variants();
  if (variants) await migrateStoredGenders(variants);
  const moved = await migrateAliases(dataService.aliases());
  if (moved) console.log(`lists: ${moved} entries moved off folded variants`);
});
void dataService.start().then(() => {
  feedService.start();
  if (!env.pushDryRun) startRaidAlerts();
});
setInterval(() => void pruneNotifications().catch(() => {}), 24 * 3600_000).unref();
// Deleted collections older than 30 days leave the trash.
const purge = () => void Promise.all([purgeTrash(), purgeAccountTrash()]).catch(() => {});
purge();
setInterval(purge, 24 * 3600_000).unref();
// Admins hear about a data update that fails.
dataService.onFailure((error) => notifyStaff({ kind: 'data_error', error }));
// New game texts come with each data update.
dataService.onDataset(() => resetGameTexts());
// Push keys exist from the first start, so the nightly backup always has them.
void vapidKeys().catch((e) => console.error('push keys', e));
