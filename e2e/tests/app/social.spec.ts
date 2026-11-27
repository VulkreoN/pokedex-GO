import { readFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { apiCreateList, apiRegister, expect, test, uniq } from '../fixtures.js';

/** Two friends in two browsers; the owner has a list. */
async function friends(browser: Browser, ip: number) {
  // Fresh addresses each time (friend requests are rate-limited per IP), so the test can also be repeated.
  const last = () => 1 + Math.floor(Math.random() * 250);
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.7.${ip}.${last()}` } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.8.${ip}.${last()}` } });
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
  await apiCreateList(s.friend.request, 'Ma collection à moi', ['150']);
  await s.friend.goto('/lists');
  await expect(s.friend.getByText('Ma collection à moi')).toBeVisible();
  await expect(s.friend.getByText('Recherche Kanto')).toHaveCount(0);
  await s.friend.getByRole('button', { name: 'Collections de mes amis' }).click();
  await expect(s.friend).toHaveURL(/tab=friends/);
  await expect(s.friend.getByRole('link', { name: s.uo.username })).toBeVisible();
  await expect(s.friend.getByText('Recherche Kanto')).toBeVisible();
  await expect(s.friend.getByText('Ma collection à moi')).toHaveCount(0);
  await s.close();
});

test("a friend's list updates live while I look at it", async ({ browser }) => {
  const s = await friends(browser, 2);
  await s.friend.goto(`/lists/${s.listId}`);
  await expect(s.friend.getByText('0 / 4 attrapés')).toBeVisible();
  await expect(s.friend.locator('html')).toHaveAttribute('data-live', 'ready');
  // The owner catches one; the friend's open page follows without reloading.
  await s.owner.request.put(`/api/lists/${s.listId}/entries`, { data: { entries: [{ variantKey: '25', gender: 'm', shiny: false, done: true }] } });
  await expect(s.friend.getByText('1 / 4 attrapés')).toBeVisible({ timeout: 10_000 });
  await s.owner.request.put(`/api/lists/${s.listId}/entries`, { data: { entries: [{ variantKey: '133', gender: 'f', shiny: false }] } });
  await expect(s.friend.getByText('1 / 5 attrapés')).toBeVisible({ timeout: 10_000 });
  await s.close();
});

test('"I have it" reaches the owner live, and notifies only when leaving the page', async ({ browser }) => {
  const s = await friends(browser, 3);
  await s.owner.goto(`/lists/${s.listId}`);
  await expect(s.owner.getByText('0 / 4 attrapés')).toBeVisible();

  await s.friend.goto(`/lists/${s.listId}`);
  await expect(s.friend.getByText(`Touche un Pokémon que tu as pour prévenir ${s.uo.username}.`)).toBeVisible();
  const bulbasaur = s.friend.locator('li', { hasText: 'Bulbizarre' }).getByRole('button').first();

  // Ticking then immediately unticking must NOT notify the owner when leaving the page.
  await bulbasaur.click();
  await expect(bulbasaur).toHaveAttribute('aria-pressed', 'true');
  await expect(s.owner.locator('li', { hasText: 'Bulbizarre' }).getByText(`${s.uf.username} l'a`)).toBeVisible({ timeout: 10_000 });
  await bulbasaur.click();
  await expect(bulbasaur).toHaveAttribute('aria-pressed', 'false');
  await expect(s.owner.locator('li', { hasText: 'Bulbizarre' }).getByText(`${s.uf.username} l'a`)).toHaveCount(0, { timeout: 10_000 });
  await s.friend.getByRole('link', { name: 'Amis' }).click();
  await expect(s.friend).toHaveURL(/\/friends$/);
  await s.owner.goto('/dex');
  await expect(s.owner.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();

  // Ticking and staying on the page updates the owner's list live without notifying yet; leaving sends the notification.
  await s.owner.goto(`/lists/${s.listId}`);
  await s.friend.goto(`/lists/${s.listId}`);
  const bulba2 = s.friend.locator('li', { hasText: 'Bulbizarre' }).getByRole('button').first();
  await bulba2.click();
  await expect(bulba2).toHaveAttribute('aria-pressed', 'true');
  await expect(s.friend.locator('li', { hasText: 'Bulbizarre' }).getByText("Je l'ai")).toBeVisible();
  await expect(s.owner.locator('li', { hasText: 'Bulbizarre' }).getByText(`${s.uf.username} l'a`)).toBeVisible({ timeout: 10_000 });

  await s.owner.goto('/dex');
  await expect(s.owner.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();

  // Friend leaves the collection page -> batched notification is flushed and lights the owner's bell live.
  await Promise.all([
    s.friend.waitForResponse((r) => r.url().includes(`/api/lists/${s.listId}/offers/notify`) && r.status() === 200),
    s.friend.getByRole('link', { name: 'Amis' }).click(),
  ]);
  await expect(s.owner.getByRole('link', { name: 'Notifications (1)' })).toBeVisible({ timeout: 10_000 });
  await s.owner.getByRole('link', { name: 'Notifications (1)' }).click();
  await expect(s.owner.getByText(`${s.uf.username} a un Pokémon de ta collection « Recherche Kanto »`)).toBeVisible();
  // Opening it marks it read (the page changes in the app; the test reloads afterwards, so it waits for the answer).
  await Promise.all([
    s.owner.waitForResponse((r) => r.url().includes('/api/notifications/read')),
    s.owner.getByText(`${s.uf.username} a un Pokémon de ta collection « Recherche Kanto »`).click(),
  ]);
  await expect(s.owner).toHaveURL(new RegExp(`/lists/${s.listId}\\?filter=offered$`));
  await s.owner.goto('/dex'); // the bell lives on top-level pages
  await expect(s.owner.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible({ timeout: 10_000 }); // read
  await s.owner.goto(`/lists/${s.listId}`);
  await expect(s.owner.locator('html')).toHaveAttribute('data-live', 'ready');

  // Taking it back removes the mark.
  await s.friend.goto(`/lists/${s.listId}`);
  const bulba3 = s.friend.locator('li', { hasText: 'Bulbizarre' }).getByRole('button').first();
  await bulba3.click();
  await expect(bulba3).toHaveAttribute('aria-pressed', 'false');
  await expect(s.owner.locator('li', { hasText: 'Bulbizarre' }).getByText(`${s.uf.username} l'a`)).toHaveCount(0, { timeout: 10_000 });
  await s.close();
});

test('a friend request lights the bell live', async ({ browser }) => {
  const ip = () => `10.7.4.${1 + Math.floor(Math.random() * 250)}`;
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const pa = await a.newPage();
  const pb = await b.newPage();
  const ua = await apiRegister(pa.request, uniq('bell'));
  const ub = await apiRegister(pb.request, uniq('asker'));
  await pa.goto('/dex');
  await expect(pa.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  // Live from here: slow machines (CI) could send the request before the page listens.
  await expect(pa.locator('html')).toHaveAttribute('data-live', 'ready');
  await pb.request.post('/api/friends/requests', { data: { friendCode: ua.friendCode } });
  await expect(pa.getByRole('link', { name: 'Notifications (1)' })).toBeVisible({ timeout: 10_000 });
  await pa.goto('/notifications');
  await expect(pa.getByText(`${ub.username} veut être ton ami`)).toBeVisible();
  // Answered from the notification itself.
  await pa.getByRole('button', { name: 'Accepter' }).click();
  await expect(pa.getByRole('button', { name: 'Accepter' })).toHaveCount(0);
  expect((await (await pa.request.get('/api/friends')).json()).friends.map((f: { id: string }) => f.id)).toContain(ub.id);
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
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Exporter en PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('export-test.pdf');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const text = bytes.toString('latin1');
  expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(6);
  expect(bytes.length).toBeGreaterThan(20_000);
  // The in-game search for the missing ones is on the first page, as text that can be copied.
  expect(text).toContain('Recherche dans le jeu');
  expect(text).toMatch(/1,4,7,133,150/);
  await ctx.close();
});

test('a list shares as a picture, with its in-game search', async ({ browser }) => {
  const ctx = await browser.newContext({ acceptDownloads: true, extraHTTPHeaders: {} });
  const page = await ctx.newPage();
  await apiRegister(page.request, uniq('img'));
  const id = await apiCreateList(page.request, 'Pour Discord', ['1', '4', '7', '25', '133', '150']);
  await page.request.put(`/api/lists/${id}/entries`, { data: { entries: [{ variantKey: '25', shiny: false, done: true }] } });
  await page.goto(`/lists/${id}`);
  await expect(page.locator('main img').first()).toBeVisible();
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('button', { name: 'Manquants seulement' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByText(/QR code pour la copier/)).toBeVisible();
  // "Save" always downloads, on a computer too.
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), sheet.getByRole('button', { name: 'Enregistrer' }).click()]);
  expect(download.suggestedFilename()).toBe('pour-discord.png');
  const png = await readFile((await download.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1080); // width
  expect(png.readUInt32BE(20)).toBeGreaterThan(1000); // header, two rows of cards, the search
  await expect(page.getByText('Image enregistrée')).toBeVisible();
  await ctx.close();
});

test('a long list: every card in compact pictures, and a PDF even when the search is too long for a QR code', async ({ browser }) => {
  const ctx = await browser.newContext({ acceptDownloads: true, extraHTTPHeaders: {} });
  const page = await ctx.newPage();
  await apiRegister(page.request, uniq('long'));
  // Alternate genders over every species that has both: a search far past what a QR code holds.
  const ds = await (await page.request.get('/api/data/pokedex.json')).json();
  const both = (ds.variants as { key: string; kind: string; genders?: string[] }[]).filter((v) => v.kind === 'base' && v.genders?.length === 2);
  const id = await apiCreateList(page.request, 'Longue', both.map((v, i) => `${v.key}:${i % 2 ? 'm' : 'f'}`));
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Tout, en compact' }).click();
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(/^\d+ images enregistrées$/)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => downloads.length).toBeGreaterThan(1);
  expect(downloads[0]).toBe('longue-1.png');
  // Multi-image export keeps the per-page download tray open for mobile browsers that drop downloads 2..N.
  await expect(sheet.getByRole('button', { name: /^Image 1\/\d+$/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Image 2\/\d+$/ })).toBeVisible();

  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), sheet.getByRole('button', { name: 'Exporter en PDF' }).click()]);
  const bytes = await readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // Pictures are shrunk: a few hundred Pokémon stay a reasonable file.
  expect(bytes.length).toBeLessThan(40_000_000);
  expect(bytes.toString('latin1')).toContain('Trop longue pour un QR code');
  await ctx.close();
});

test('image and PDF exports support custom styles (shiny, lucky…), custom note, and friend code', async ({ browser }) => {
  const ctx = await browser.newContext({ acceptDownloads: true, extraHTTPHeaders: {} });
  const page = await ctx.newPage();
  const user = await apiRegister(page.request, uniq('style'));
  const list = (await (await page.request.post('/api/lists', { data: { name: 'Chasse Shiny' } })).json()).list;
  await page.request.put(`/api/lists/${list.id}/entries`, {
    data: { entries: [{ variantKey: '1', gender: 'm', shiny: true }, { variantKey: '4', gender: 'm', shiny: true }] },
  });
  await page.goto(`/lists/${list.id}`);
  await expect(page.locator('main img').first()).toBeVisible();
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  const sheet = page.locator('dialog[open]');

  // Auto mode picks the Shiny theme for a shiny list and previews it live.
  await expect(sheet.getByRole('button', { name: 'Auto · Shiny' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('[data-export-theme="shiny"]')).toBeVisible();

  // Switching to Female and Lucky updates the live preview and remembers the choice.
  await sheet.getByRole('button', { name: 'Femelle ♀', exact: true }).click();
  await expect(sheet.locator('[data-export-theme="female"]')).toBeVisible();
  await sheet.getByRole('button', { name: 'Mâle ♂', exact: true }).click();
  await expect(sheet.locator('[data-export-theme="male"]')).toBeVisible();
  await sheet.getByRole('button', { name: 'Chanceux', exact: true }).click();
  await expect(sheet.locator('[data-export-theme="lucky"]')).toBeVisible();
  await sheet.getByLabel('Message sur le visuel (optionnel)').fill('MP Discord pour trade');
  await sheet.getByRole('button', { name: /Afficher mon code ami/ }).click();
  await expect(sheet.locator('[data-export-theme="lucky"]')).toContainText('MP Discord pour trade');

  // Export themed PNG.
  const [pngDl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), sheet.getByRole('button', { name: 'Enregistrer' }).click()]);
  const png = await readFile((await pngDl.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1080);

  // Reopen: chosen style & friend-code switch stayed saved; export themed PDF with note & friend code.
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Chanceux', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByLabel('Message sur le visuel (optionnel)').fill('MP Discord pour trade');
  const [pdfDl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), sheet.getByRole('button', { name: 'Exporter en PDF' }).click()]);
  const pdf = await readFile((await pdfDl.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const pdfStr = pdf.toString('latin1');
  expect(pdfStr).toContain('MP Discord pour trade');
  expect(pdfStr).toContain(user.friendCode.replace(/(\d{4})(?=\d)/g, '$1 '));
  await ctx.close();
});

test('notification settings: one switch per kind, saved on the account', async ({ page }) => {
  await apiRegister(page.request);
  await page.goto('/me?tab=prefs');
  await expect(page.getByRole('heading', { name: 'Notifications sur cet appareil' })).toBeVisible();
  const offer = page.getByRole('button', { name: 'un ami a un Pokémon de mes collections' });
  await expect(offer).toHaveAttribute('aria-pressed', 'true');
  await offer.click();
  await expect(offer).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: 'un ami a un Pokémon de mes collections' })).toHaveAttribute('aria-pressed', 'false');
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

test("a friend's QR code, read from a screenshot, fills in the friend code", async ({ browser }) => {
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.5.1' } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.5.2' } });
  const shower = await a.newPage();
  const scanner = await b.newPage();
  const ua = await apiRegister(shower.request, uniq('qrs'));
  await apiRegister(scanner.request, uniq('qrr'));

  await shower.goto('/friends');
  await shower.getByRole('button', { name: 'Mon QR code' }).click();
  const qrImg = shower.getByRole('img', { name: ua.friendCode });
  await qrImg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const png = await qrImg.screenshot();

  // Also disable BarcodeDetector on the scanner context so jsQR is always exercised (matching Linux CI).
  await scanner.addInitScript(() => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
  await scanner.goto('/friends');
  await scanner.getByRole('tab', { name: 'Ajouter', exact: true }).click();
  await scanner.getByRole('button', { name: 'Scanner un QR code' }).click();
  await scanner.locator('dialog[open] input[type=file]').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png });
  await expect(scanner.getByPlaceholder('Code ami à 12 chiffres')).toHaveValue(ua.friendCode.replace(/(\d{4})(?=\d)/g, '$1 '));
  await scanner.getByRole('button', { name: 'Envoyer' }).click();
  await expect(scanner.getByText(`Demande envoyée à ${ua.username}`).first()).toBeVisible();
  await a.close();
  await b.close();
});

test('my friend code can be replaced by the one of the game', async ({ page }) => {
  await apiRegister(page.request);
  await page.goto('/friends');
  await page.getByRole('button', { name: 'Modifier' }).click();
  const sheet = page.locator('dialog[open]');
  const game = `8${Date.now()}`.slice(0, 12);
  await sheet.getByLabel('Code ami du jeu').fill(game.replace(/(\d{4})(?=\d)/g, '$1 '));
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Code ami mis à jour')).toBeVisible();
  await expect(page.getByText(game.replace(/(\d{4})(?=\d)/g, '$1 '), { exact: true })).toBeVisible();
});

test('friend profile shows their shared collections, badges and postcards without a Trades tab', async ({ browser }) => {
  const { owner, friend, uf, close } = await friends(browser, 29);
  try {
    const created = (await (await friend.request.post('/api/lists', { data: { name: 'Dex Kanto', visibility: 'friends' } })).json()).list;
    await friend.request.put(`/api/lists/${created.id}/entries`, {
      data: { entries: [{ variantKey: '25', gender: 'm', shiny: true, tag: '', done: true }] },
    });

    await owner.goto(`/friends/${uf.id}`);
    await expect(owner.getByRole('link', { name: /Dex Kanto/ })).toBeVisible();
    await expect(owner.getByRole('heading', { name: 'Badges & médailles' })).toBeVisible();
    await expect(owner.getByRole('heading', { name: /Cartes postales Prismillon/ })).toBeVisible();
    await expect(owner.getByRole('button', { name: /Échanges/ })).toHaveCount(0);
    await owner.getByRole('button', { name: 'Marquer Ami Chanceux' }).click();
    await expect(owner.getByText('✨ Ami Chanceux')).toBeVisible();
  } finally {
    await close();
  }
});

test('Lucky Friends toggle persists, postcards edit inline in Vivillon tab, show on Friends & profile, and discover matches Vivillon', async ({ browser }) => {
  const { owner, uf, close } = await friends(browser, 31);
  const c1 = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.32.1' } });
  const c2 = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.32.2' } });
  const sender = await c1.newPage();
  const seeker = await c2.newPage();
  try {
    // 1. Lucky Friends toggle persists on FriendsPage, and global Trades tab is replaced by Add + Vivillon tabs.
    await owner.goto('/friends');
    await expect(owner.getByRole('tab', { name: /Échanges/ })).toHaveCount(0);
    await expect(owner.getByRole('tab', { name: 'Ajouter', exact: true })).toBeVisible();
    await expect(owner.getByRole('tab', { name: /Prismillon/ })).toBeVisible();
    const row = owner.locator('li', { hasText: uf.username });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Marquer Ami Chanceux' }).click();
    await expect(row.getByText('✨ Ami Chanceux')).toBeVisible();
    await owner.reload();
    await expect(owner.locator('li', { hasText: uf.username }).getByText('✨ Ami Chanceux')).toBeVisible();

    // 2. Vivillon postcards: sender declares Ocean (unlimited) + Sandstorm (3) directly in Friends -> Prismillon.
    const uSender = await apiRegister(sender.request, uniq('vivi_send'));
    const uSeeker = await apiRegister(seeker.request, uniq('vivi_seek'));
    const vList = (await (await seeker.request.post('/api/lists', { data: { name: 'Mes Prismillon', visibility: 'friends' } })).json()).list;
    await seeker.request.put(`/api/lists/${vList.id}/entries`, {
      data: { entries: [{ variantKey: '666.fOCEAN', gender: 'm', shiny: false, tag: '', done: false }] },
    });

    await sender.goto('/friends?tab=postcards');
    await sender.getByRole('button', { name: 'Gérer mes cartes' }).click();
    const sheet = sender.locator('dialog[open]');
    await sheet.getByRole('button', { name: /Soleil Levant/ }).click();
    await sheet.getByRole('button', { name: /Sable/ }).click();
    await sheet.getByRole('button', { name: 'Quantité' }).last().click();
    await sheet.getByRole('button', { name: /Enregistrer/ }).click();
    await expect(sender.getByText('Cartes postales enregistrées')).toBeVisible();
    await expect(sender.getByText('Soleil Levant').first()).toBeVisible();
    await expect(sender.getByText('×3').first()).toBeVisible();

    // 3. Seeker visits Friends -> Prismillon, sees inline manage button, Ocean missing & sender suggested, sends request in 1 tap.
    await seeker.goto('/friends');
    await seeker.getByRole('tab', { name: /Prismillon/ }).click();
    await expect(seeker).toHaveURL(/\/friends\?tab=postcards$/);
    await expect(seeker.getByRole('button', { name: 'Gérer mes cartes' })).toBeVisible();
    await expect(seeker.getByText('1 motif manquant dans tes collections')).toBeVisible();
    const suggestion = seeker.locator('li', { hasText: uSender.username });
    await expect(suggestion).toBeVisible();
    await expect(suggestion.getByText('Soleil Levant')).toBeVisible();
    await expect(suggestion.getByText('×3')).toBeVisible();
    await suggestion.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(suggestion.getByText('Demande envoyée')).toBeVisible();

    // 4. Sender accepts; now seeker sees sender's postcards directly on /friends and on sender's /friends/:id profile.
    await sender.goto('/friends');
    await sender.locator('li', { hasText: uSeeker.username }).getByRole('button', { name: 'Accepter' }).click();
    await expect(sender.getByRole('link', { name: new RegExp(uSeeker.username) })).toBeVisible();
    await seeker.goto('/friends?tab=postcards');
    await expect(seeker.locator('li', { hasText: uSender.username })).toHaveCount(0);

    await seeker.goto('/friends');
    const friendRow = seeker.locator('li', { hasText: uSender.username });
    await expect(friendRow.getByText('Soleil Levant')).toBeVisible();
    await expect(friendRow.getByText('×3')).toBeVisible();
    await friendRow.getByRole('link', { name: new RegExp(uSender.username) }).click();
    await expect(seeker).toHaveURL(new RegExp(`/friends/${uSender.id}$`));
    await expect(seeker.getByText('Soleil Levant')).toBeVisible();
    await expect(seeker.getByRole('heading', { name: 'Badges & médailles' })).toBeVisible();
  } finally {
    await close();
    await c1.close();
    await c2.close();
  }
});
