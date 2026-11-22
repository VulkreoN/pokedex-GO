import type { MiddlewareHandler } from 'hono';

/** Small in-memory limiter, enough for a self-hosted single instance. */
export function rateLimit(opts: { windowMs: number; max: number }): MiddlewareHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || h.reset < now) {
      h = { count: 0, reset: now + opts.windowMs };
      hits.set(ip, h);
    }
    h.count++;
    if (h.count > opts.max) return c.json({ error: 'too_many_requests' }, 429);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    await next();
  };
}
