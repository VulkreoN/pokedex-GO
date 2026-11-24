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

test('shinies are in the game string by default, and can be left out', async ({ page }) => {
  await apiRegister(page.request);
  const list = (await (await page.request.post('/api/lists', { data: { name: 'Shinies' } })).json()).list;
  await page.request.put(`/api/lists/${list.id}/entries`, { data: { entries: [{ variantKey: '1', gender: 'm', shiny: true }, { variantKey: '4', gender: 'm', shiny: false }] } });
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Français' }).click();
  // Only traded and lucky are left out by default: the shiny Bulbasaur is searched for.
  await expect(sheet.getByRole('button', { name: 'Chromatiques', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await sheet.locator('code').allTextContents()).join('\n')).toMatch(/(^|[&,])chromatique/);
  await sheet.getByRole('button', { name: 'Chromatiques', exact: true }).click();
  await expect(sheet.locator('code').first()).toContainText('!chromatique&');
  await expect(sheet.getByText(/Décoche « Chromatiques »/)).toBeVisible();
});

test('a collection sorts by Pokédex order, recently added or name, and remembers it', async ({ page }) => {
  await apiRegister(page.request);
  const id = await apiCreateList(page.request, 'Tri', ['25:m']);
  await page.request.put(`/api/lists/${id}/entries`, { data: { entries: [{ variantKey: '4', gender: 'm', shiny: false }] } });
  await page.request.put(`/api/lists/${id}/entries`, { data: { entries: [{ variantKey: '1', gender: 'm', shiny: false }] } });
  await page.goto(`/lists/${id}`);
  const names = () => page.locator('main ul > li button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '').filter((l) => !/^[♂♀]/.test(l)));
  const sort = page.getByRole('combobox', { name: 'Trier' });
  await sort.selectOption({ label: 'Ordre d’ajout' });
  expect(await names()).toEqual(['Pikachu', 'Salamèche', 'Bulbizarre']);
  await sort.selectOption({ label: 'Ajoutés récemment' });
  expect(await names()).toEqual(['Bulbizarre', 'Salamèche', 'Pikachu']);
  await sort.selectOption({ label: 'Ordre du Pokédex' });
  expect(await names()).toEqual(['Bulbizarre', 'Salamèche', 'Pikachu']);
  await sort.selectOption({ label: 'Nom (A → Z)' });
  expect(await names()).toEqual(['Bulbizarre', 'Pikachu', 'Salamèche']);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Trier' })).toHaveValue('name');
});

test('collections can be put in any order', async ({ page }) => {
  await apiRegister(page.request);
  await apiCreateList(page.request, 'Première', ['1']);
  await apiCreateList(page.request, 'Deuxième', ['4']);
  await page.goto('/lists');
  await expect(page.locator('main li').first()).toContainText('Deuxième'); // the newest on top
  await page.getByRole('button', { name: 'Réorganiser' }).click();
  await page.getByRole('button', { name: 'Descendre' }).first().click();
  await expect(page.locator('main li').first()).toContainText('Première');
  await page.reload();
  await expect(page.locator('main li').first()).toContainText('Première');
});

test('the game string can show pre-evolutions too, keeping gender and luck', async ({ page }) => {
  await apiRegister(page.request);
  const list = (await (await page.request.post('/api/lists', { data: { name: 'Chanceux' } })).json()).list;
  await page.request.put(`/api/lists/${list.id}/entries`, { data: { entries: [{ variantKey: '3', gender: 'f', shiny: false, tag: 'lucky' }] } });
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Français' }).click();
  // The lucky exclusion would hide what is wanted: off for this check.
  await sheet.getByRole('button', { name: 'Déjà chanceux' }).click();
  const code = sheet.locator('code').first();
  await expect(code).not.toContainText('1-3');
  await sheet.getByRole('button', { name: 'Avec les pré-évolutions' }).click();
  await expect(code).toHaveText(/(^|[&,])1-3([&,]|$)|1,2,3/);
  await expect(code).toContainText('femelle');
  await expect(code).toContainText('chanceux');
  // Remembered on this device.
  await page.reload();
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  await expect(page.locator('dialog[open]').getByRole('button', { name: 'Avec les pré-évolutions' })).toHaveAttribute('aria-pressed', 'true');
});

test('a long game search can be cut into strings under a chosen length', async ({ page }) => {
  await apiRegister(page.request);
  const ds = await (await page.request.get('/api/data/pokedex.json')).json();
  const both = (ds.variants as { key: string; kind: string; genders?: string[] }[]).filter((v) => v.kind === 'base' && v.genders?.length === 2).slice(0, 300);
  const id = await apiCreateList(page.request, 'Longue', both.map((v, i) => `${v.key}:${i % 2 ? 'm' : 'f'}`));
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Sans limite' }).click();
  await expect(sheet.locator('code')).toHaveCount(1);
  expect((await sheet.locator('code').first().textContent())!.length).toBeGreaterThan(500);
  await sheet.getByRole('button', { name: '500 car.' }).click();
  await expect.poll(() => sheet.locator('code').count()).toBeGreaterThan(1);
  for (const text of await sheet.locator('code').allTextContents()) expect(text.length).toBeLessThanOrEqual(500);
});
