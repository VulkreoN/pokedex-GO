import { apiCreateList, apiRegister, expect, test } from '../fixtures.js';

test('unticking and removing can be undone from the message', async ({ page }) => {
  await apiRegister(page.request);
  const id = await apiCreateList(page.request, 'Annuler', ['81', '133:m']);
  await page.request.put(`/api/lists/${id}/entries`, { data: { entries: [{ variantKey: '81', gender: '', shiny: false, done: true }] } });
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await page.getByRole('button', { name: 'Magnéti', exact: true }).click();
  await expect(page.getByText('0 / 2 attrapés')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByText('1 / 2 attrapés')).toBeVisible();

  // Ticked by mistake: same.
  await page.getByRole('button', { name: 'Évoli', exact: true }).click();
  await expect(page.getByText('Marqué attrapé')).toBeVisible();
  await expect(page.getByText('2 / 2 attrapés')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByText('1 / 2 attrapés')).toBeVisible();

  // Removed by mistake: back with its caught state.
  await page.locator('main li', { hasText: 'Magnéti' }).getByRole('button', { name: 'Options' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: /Retirer/ }).click();
  await expect(page.locator('main li', { hasText: 'Magnéti' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.locator('main li', { hasText: 'Magnéti' })).toHaveCount(1);
  await expect(page.getByText('1 / 2 attrapés')).toBeVisible();
});

test('half of a collection is worth a word', async ({ page }) => {
  await apiRegister(page.request);
  const id = await apiCreateList(page.request, 'Moitié', ['81', '100']);
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Magnéti', exact: true }).click();
  await expect(page.getByText('50 % de la collection !')).toBeVisible();
});

test('copy buttons say "Copied ✓"; species have their cry; the header takes the team colour', async ({ page }) => {
  await apiRegister(page.request);
  const id = await apiCreateList(page.request, 'Copie', ['1']);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Copier', exact: true }).click();
  await expect(page.locator('dialog[open]').getByText('Copié ✓')).toBeVisible();

  await page.goto('/dex/25');
  await expect(page.getByRole('button', { name: 'Écouter le cri de Pikachu' })).toBeVisible();

  await page.goto('/me?tab=prefs');
  await page.getByRole('button', { name: 'Bravoure' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-team', 'valor');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-team', 'valor');
});

test('notifications can be cleared one by one or all at once', async ({ browser }) => {
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.12.${Math.floor(Math.random() * 250)}.1` } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.12.${Math.floor(Math.random() * 250)}.2` } });
  const pa = await a.newPage();
  const pb = await b.newPage();
  const ua = await apiRegister(pa.request);
  await apiRegister(pb.request);
  await pb.request.post('/api/friends/requests', { data: { friendCode: ua.friendCode } });
  await pa.goto('/notifications');
  await expect(pa.getByText(/veut être ton ami/)).toBeVisible();
  await pa.getByRole('button', { name: 'Effacer cette notification' }).first().click();
  await expect(pa.getByText(/veut être ton ami/)).toHaveCount(0);
  await pa.reload();
  await expect(pa.getByText(/veut être ton ami/)).toHaveCount(0);
  await a.close();
  await b.close();
});

test('the app opens from what this device kept, even when the server does not answer; logging out wipes it', async ({ page }) => {
  await apiRegister(page.request);
  await apiCreateList(page.request, 'Gardée', ['1']);
  await page.goto('/lists');
  await expect(page.getByText('Gardée')).toBeVisible();
  await page.goto('/dex');
  await expect(page.getByRole('button', { name: /^Ajouter Bulbizarre/ }).first().or(page.getByText('Bulbizarre').first())).toBeVisible();
  await page.waitForTimeout(2500); // the cache is written behind (throttled)

  // The server is gone: collections and the Pokédex still show.
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/lists');
  await expect(page.getByText('Gardée')).toBeVisible();
  await page.goto('/dex');
  await expect(page.getByText('Bulbizarre').first()).toBeVisible();
  await page.unroute('**/api/**');

  // Logging out leaves nothing of the account on the device.
  await page.goto('/me');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.waitForTimeout(2500);
  const kept = await page.evaluate(() => new Promise<string>((ok) => {
    const req = indexedDB.open('keyval-store');
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readonly').objectStore('keyval').get('app-cache');
      tx.onsuccess = () => ok(String(tx.result ?? ''));
      tx.onerror = () => ok('');
    };
    req.onerror = () => ok('');
  }));
  expect(kept).not.toContain('Gardée');
});

test('Me leads to an About page: who made the app, the Discord, the version', async ({ page }) => {
  await page.goto('/me?tab=prefs');
  await page.getByRole('link', { name: /À propos/ }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByText('Hakim', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Rejoindre le Discord/ })).toHaveAttribute('href', 'https://discord.gg/9P6XF7SPge');
  await expect(page.getByText('Version de l’appli')).toBeVisible();
  await expect(page.getByText(/^\d+ Pokémon · \d+ variantes/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confidentialité et cookies' })).toBeVisible();
  await expect(page.getByText(/posts X/i)).toHaveCount(0);
});

test("what's new after an update: a global banner with version badge, closed for good, version/date toggle in About", async ({ page }) => {
  await apiRegister(page.request);
  await page.goto('/game');
  const banner = page.getByRole('complementary', { name: 'Quoi de neuf' });
  await expect(banner).toBeVisible();
  await expect(banner.getByText(/^v\d+\.\d+/)).toBeVisible();
  await banner.getByRole('button', { name: 'Compris' }).click();
  await expect(banner).toBeHidden();
  await page.goto('/dex');
  await expect(page.getByRole('searchbox').first()).toBeVisible();
  await expect(banner).toBeHidden();
  await page.goto('/about#news');
  await expect(page.getByRole('heading', { name: 'Nouveautés' })).toBeVisible();
  const byVersion = page.getByRole('button', { name: 'Par version', exact: true });
  const byDate = page.getByRole('button', { name: 'Par date', exact: true });
  await expect(byVersion).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('v1.3', { exact: true }).first()).toBeVisible();
  await byDate.click();
  await expect(byDate).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('v1.3', { exact: true }).first()).toBeVisible();
});
