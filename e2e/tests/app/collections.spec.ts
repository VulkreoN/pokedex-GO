import { expect, test } from '@playwright/test';
import { apiCreateList, apiRegister } from '../fixtures.js';

test('a collection keeps a history of what happened in it', async ({ page }) => {
  await apiRegister(page.request);
  const list = { id: await apiCreateList(page.request, 'Histoire', ['1', '4']) };
  await page.request.put(`/api/lists/${list.id}/entries`, { data: { entries: [{ variantKey: '1', shiny: false, done: true }] } });
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Historique' }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByText(/^Tu as coché \d+ Pokémon comme attrapés?$/)).toBeVisible();
  await expect(sheet.getByText(/^Tu as ajouté \d+ Pokémon$/)).toBeVisible();
  await expect(sheet.getByText('Tu as créé la collection')).toBeVisible();
});

test('several cards at once: tick, send to the basket, remove', async ({ page }) => {
  await apiRegister(page.request);
  const list = { id: await apiCreateList(page.request, 'Plusieurs', ['1', '4', '7']) };
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Sélectionner' }).click();
  await page.getByRole('button', { name: 'Bulbizarre', exact: true }).click();
  await page.getByRole('button', { name: 'Salamèche', exact: true }).click();
  const bar = page.getByRole('toolbar');
  // A card picks both its genders; a filter narrows the selection to one of them.
  await expect(bar.getByText('4 sélectionnés')).toBeVisible();
  await bar.getByRole('button', { name: '♀ Femelle' }).click();
  await expect(bar.getByText('2 sélectionnés')).toBeVisible();
  await bar.getByRole('button', { name: 'Attrapés' }).click();
  await expect(bar).toHaveCount(0);
  const after = (await (await page.request.get(`/api/lists/${list.id}`)).json()).list;
  expect(after.entries.filter((e: { done: boolean }) => e.done).map((e: { variantKey: string; gender: string }) => `${e.variantKey}${e.gender}`).sort()).toEqual(['1f', '4f']);

  await page.getByRole('button', { name: 'Sélectionner' }).click();
  await page.getByRole('button', { name: 'Tout', exact: true }).click();
  await page.getByRole('toolbar').getByRole('button', { name: '♂ Mâle' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('toolbar').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/lists/${list.id}`)).json()).list.entries.length).toBe(3);
});

test('a game search pasted into a collection adds what it shows', async ({ page }) => {
  await apiRegister(page.request);
  const list = { id: await apiCreateList(page.request, 'Import', ['1']) };
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Importer une recherche du jeu' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByLabel('Recherche du jeu').fill('1-3&!costume&!shiny&cp10-500');
  await expect(sheet.getByText(/^Ignoré .*cp10-500/)).toBeVisible();
  await expect(sheet.getByText(/déjà dans la collection/)).toBeVisible();
  await sheet.getByRole('button', { name: /^Ajouter \d+ Pokémon$/ }).click();
  await expect(page.getByText(/Pokémon ajoutés/)).toBeVisible();
  const keys = new Set((await (await page.request.get(`/api/lists/${list.id}`)).json()).list.entries.map((e: { variantKey: string }) => e.variantKey));
  expect([...keys].sort()).toEqual(expect.arrayContaining(['1', '2', '3']));
});

test('shinies can be kept in the game string by unticking the exclusion', async ({ page }) => {
  await apiRegister(page.request);
  const list = (await (await page.request.post('/api/lists', { data: { name: 'Shinies' } })).json()).list;
  await page.request.put(`/api/lists/${list.id}/entries`, { data: { entries: [{ variantKey: '1', gender: 'm', shiny: true }, { variantKey: '4', gender: 'm', shiny: false }] } });
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Français' }).click();
  await expect(sheet.locator('code').first()).toContainText('!chromatique&');
  await expect(sheet.getByText(/Décoche « Chromatiques »/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Chromatiques', exact: true }).click();
  const codes = (await sheet.locator('code').allTextContents()).join('\n');
  expect(codes).toMatch(/(^|[&,])chromatique/);
  expect(codes).not.toContain('!chromatique&!costume');
});
