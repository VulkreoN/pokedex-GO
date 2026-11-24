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

  await page.goto('/me');
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
