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
import { feedService } from './feed/service.js';

const app = new Hono<AuthEnv>().basePath('/api');

if (!env.isProd) app.use(logger());
app.use(secureHeaders());
if (env.corsOrigin) app.use(cors({ origin: env.corsOrigin.split(','), credentials: true }));

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);
app.route('/lists', listRoutes);
app.route('/shared', sharedRoutes);
app.route('/friends', friendRoutes);
app.route('/data', dataRoutes);
app.route('/overrides', overrideRoutes);
app.route('/users', userRoutes);
app.route('/feed', feedRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.status === 400 ? 'validation' : 'http_error', message: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export type AppType = typeof app;

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}/api`);
});
void dataService.start().then(() => feedService.start());
