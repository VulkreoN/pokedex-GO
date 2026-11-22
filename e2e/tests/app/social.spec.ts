import { readFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { apiCreateList, apiRegister, expect, test, uniq } from '../fixtures.js';

/** Two friends in two browsers; the owner has a list. */
async function friends(browser: Browser, ip: number) {
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.7.${ip}.1` } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.7.${ip}.2` } });
  const owner = await a.newPage();
  const friend = await b.newPage();
  const uo = await apiRegister(owner.request, uniq('own'));
  const uf = await apiRegister(friend.request, uniq('frd'));
  await friend.request.post('/api/friends/requests', { data: { friendCode: uo.friendCode } });
  const req = (await (await owner.request.get('/api/friends/requests')).json()).requests[0];
  await owner.request.post(`/api/friends/requests/${req.id}/accept`);
  const listId = await apiCreateList(owner.request, 'Recherche Kanto', ['1:m', '4:m', '7:m', '25:m']);
  await owner.request.post('/api/notifications/read', { data: {} }); // the friend request is old news
  return { a, b, owner, friend, uo, uf, listId, close: async () => { await a.close(); await b.close(); } };
}

test("my lists and my friends' lists live in separate tabs", async ({ browser }) => {
  const s = await friends(browser, 1);
  await apiCreateList(s.friend.request, 'Ma liste à moi', ['150']);
  await s.friend.goto('/lists');
  await expect(s.friend.getByText('Ma liste à moi')).toBeVisible();
  await expect(s.friend.getByText('Recherche Kanto')).toHaveCount(0);
  await s.friend.getByRole('button', { name: 'Listes de mes amis' }).click();
  await expect(s.friend).toHaveURL(/tab=friends/);
  await expect(s.friend.getByRole('link', { name: s.uo.username })).toBeVisible();
  await expect(s.friend.getByText('Recherche Kanto')).toBeVisible();
  await expect(s.friend.getByText('Ma liste à moi')).toHaveCount(0);
  await s.close();
});

test("a friend's list updates live while I look at it", async ({ browser }) => {
  const s = await friends(browser, 2);
  await s.friend.goto(`/lists/${s.listId}`);
  await expect(s.friend.getByText('0 / 4 attrapés')).toBeVisible();
  // The owner catches one; the friend's open page follows without reloading.
  await s.owner.request.put(`/api/lists/${s.listId}/entries`, { data: { entries: [{ variantKey: '25', gender: 'm', shiny: false, done: true }] } });
  await expect(s.friend.getByText('1 / 4 attrapés')).toBeVisible({ timeout: 5000 });
  await s.owner.request.put(`/api/lists/${s.listId}/entries`, { data: { entries: [{ variantKey: '133', gender: 'f', shiny: false }] } });
  await expect(s.friend.getByText('1 / 5 attrapés')).toBeVisible({ timeout: 5000 });
  await s.close();
});

test('"I have it" reaches the owner live, with a notification', async ({ browser }) => {
  const s = await friends(browser, 3);
  await s.owner.goto(`/lists/${s.listId}`);
  await expect(s.owner.getByText('0 / 4 attrapés')).toBeVisible();

  await s.friend.goto(`/lists/${s.listId}`);
  await expect(s.friend.getByText(`Touche un Pokémon que tu as pour prévenir ${s.uo.username}.`)).toBeVisible();
  const bulbasaur = s.friend.locator('li', { hasText: 'Bulbizarre' }).getByRole('button').first();
  await bulbasaur.click();
  await expect(bulbasaur).toHaveAttribute('aria-pressed', 'true');
  await expect(s.friend.locator('li', { hasText: 'Bulbizarre' }).getByText("Je l'ai")).toBeVisible();

  // Owner side: the mark and the bell, without reloading.
  await expect(s.owner.locator('li', { hasText: 'Bulbizarre' }).getByText(`${s.uf.username} l'a`)).toBeVisible({ timeout: 5000 });
  await s.owner.goto('/dex');
  await expect(s.owner.getByRole('link', { name: 'Notifications (1)' })).toBeVisible();
  await s.owner.getByRole('link', { name: 'Notifications (1)' }).click();
  await expect(s.owner.getByText(`${s.uf.username} a un Pokémon de ta liste « Recherche Kanto »`)).toBeVisible();
  await s.owner.getByText(`${s.uf.username} a un Pokémon de ta liste « Recherche Kanto »`).click();
  await expect(s.owner).toHaveURL(new RegExp(`/lists/${s.listId}$`));
  await s.owner.goto('/dex'); // the bell lives on top-level pages
  await expect(s.owner.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible({ timeout: 5000 }); // read
  await s.owner.goto(`/lists/${s.listId}`);

  // Taking it back removes the mark.
  await bulbasaur.click();
  await expect(bulbasaur).toHaveAttribute('aria-pressed', 'false');
  await expect(s.owner.locator('li', { hasText: 'Bulbizarre' }).getByText(`${s.uf.username} l'a`)).toHaveCount(0, { timeout: 5000 });
  await s.close();
});

test('a friend request lights the bell live', async ({ browser }) => {
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.4.1' } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.4.2' } });
  const pa = await a.newPage();
  const pb = await b.newPage();
  const ua = await apiRegister(pa.request, uniq('bell'));
  const ub = await apiRegister(pb.request, uniq('asker'));
  await pa.goto('/dex');
  await expect(pa.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await pb.request.post('/api/friends/requests', { data: { friendCode: ua.friendCode } });
  await expect(pa.getByRole('link', { name: 'Notifications (1)' })).toBeVisible({ timeout: 5000 });
  await pa.goto('/notifications');
  await expect(pa.getByText(`${ub.username} veut être ton ami`)).toBeVisible();
  await a.close();
  await b.close();
});

test('a list exports to a real PDF with its pictures', async ({ browser }) => {
  // A context without the test-only x-forwarded-for header: added to every request, it would make the
  // cross-origin picture fetches non-simple CORS requests that the image hosts reject (real browsers never send it).
  const ctx = await browser.newContext({ acceptDownloads: true, extraHTTPHeaders: {} });
  const page = await ctx.newPage();
  await apiRegister(page.request, uniq('pdf'));
  const id = await apiCreateList(page.request, 'Export test', ['1', '4', '7', '25', '133', '150']);
  await page.request.put(`/api/lists/${id}/entries`, { data: { entries: [{ variantKey: '25', shiny: false, done: true }] } });
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await expect(page.locator('main img').first()).toBeVisible(); // pictures already shown once, as in real use
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Exporter en PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('export-test.pdf');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const text = bytes.toString('latin1');
  expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(6);
  expect(bytes.length).toBeGreaterThan(20_000);
  await ctx.close();
});

test('notification settings: one switch per kind, saved on the account', async ({ page }) => {
  await apiRegister(page.request);
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Notifications sur cet appareil' })).toBeVisible();
  const offer = page.getByLabel('un ami a un Pokémon de mes listes');
  await expect(offer).toBeChecked();
  await offer.uncheck();
  await expect(offer).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel('un ami a un Pokémon de mes listes')).not.toBeChecked();
  const prefs = await (await page.request.get('/api/notifications/prefs')).json();
  expect(prefs.prefs.offer).toBe(false);
});

test('the service worker knows how to show push notifications', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain('push-sw.js');
  const push = await (await request.get('/push-sw.js')).text();
  expect(push).toContain("addEventListener('push'");
  expect(push).toContain("addEventListener('notificationclick'");
});
