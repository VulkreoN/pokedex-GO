/** Read-only checks of a running deployment: nothing here creates accounts or writes data. */
import { expect, test } from '@playwright/test';

test('the app loads without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dex');
  await expect(page.getByPlaceholder('Nom ou numéro')).toBeVisible();
  await expect(page.getByRole('link', { name: /Bulbizarre/ }).first()).toBeVisible();
  for (const path of ['/game', '/pvp/184?a=0&d=15&s=15', '/dex/25']) {
    await page.goto(path);
    await expect(page.locator('main')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('API health, dataset and freshness', async ({ request }) => {
  expect((await (await request.get('/api/health')).json()).ok).toBe(true);
  const res = await request.get('/api/data/pokedex.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-cache');
  const ds = await res.json();
  expect(ds.species.length).toBeGreaterThan(1000);
  expect(ds.pvp?.pokemon.length).toBeGreaterThan(900);
  const status = await (await request.get('/api/data/status')).json();
  expect(status.lastError).toBeNull();
  expect(Date.now() - new Date(status.generatedAt).getTime()).toBeLessThan((status.refreshHours + 2) * 3600_000);
});

test('field research is read from Leek Duck (a failure means their markup changed)', async ({ request }) => {
  const res = await request.get('/api/game/research');
  expect(res.status(), 'the app falls back to ScrapedDuck meanwhile: encounters only, no event tasks, no items').toBe(200);
  const { categories } = await res.json();
  const rewards = categories.flatMap((c: any) => c.tasks.flatMap((t: any) => t.rewards));
  expect(rewards.some((r: any) => r.kind === 'encounter')).toBe(true);
  expect(rewards.some((r: any) => r.kind === 'item')).toBe(true);
});

test('only a handful of variants are flagged new', async ({ request }) => {
  const ds = await (await request.get('/api/data/pokedex.json')).json();
  const cut = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const recent = ds.variants.filter((v: { firstSeen?: string }) => (v.firstSeen ?? '') >= cut);
  expect(recent.length).toBeLessThan(ds.variants.length * 0.1);
});

test('security headers through the proxy', async ({ request }) => {
  const h = (await request.get('/api/health')).headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('SAMEORIGIN');
  expect(h['strict-transport-security']).toBeTruthy();
});

test('the SPA and the service worker are served with sane caching', async ({ request }) => {
  const index = await request.get('/some/deep/link');
  expect(index.status()).toBe(200);
  expect(await index.text()).toContain('<div id="root">');
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['cache-control'] ?? '').toMatch(/no-cache|max-age=0/);
});

test('a spoofed X-Forwarded-For does not bypass rate limiting', async ({ request }) => {
  // Invalid bodies: rejected with 400 after the limiter counted them, so no account is ever created.
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await request.post('/api/auth/register', { data: { username: 'x' }, headers: { 'x-forwarded-for': `203.0.113.${i + 1}` } });
    statuses.push(r.status());
  }
  expect(statuses).toContain(429);
});
