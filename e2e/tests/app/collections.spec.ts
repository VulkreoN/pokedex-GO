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
  // Dragged by the handle: the second one goes back on top.
  await page.getByRole('button', { name: 'Réorganiser' }).click();
  const handle = page.getByRole('button', { name: /^Déplacer Deuxième/ });
  const target = page.getByRole('button', { name: /^Déplacer Première/ });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y) * i) / 10 - 10);
  await page.mouse.up();
  await expect(page.locator('main li').first()).toContainText('Deuxième');
  await page.reload();
  await expect(page.locator('main li').first()).toContainText('Deuxième');
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
  await sheet.getByRole('button', { name: 'Aucune', exact: true }).click();
  await expect(sheet.locator('code')).toHaveCount(1);
  expect((await sheet.locator('code').first().textContent())!.length).toBeGreaterThan(500);
  await sheet.getByRole('button', { name: '500', exact: true }).click();
  await expect.poll(() => sheet.locator('code').count()).toBeGreaterThan(1);
  for (const text of await sheet.locator('code').allTextContents()) expect(text.length).toBeLessThanOrEqual(500);
});

test('the last Pokémon of a collection brings confetti; sounds can be switched off in Me', async ({ page }) => {
  await apiRegister(page.request);
  const id = await apiCreateList(page.request, 'Presque', ['81', '25:m']);
  await page.request.put(`/api/lists/${id}/entries`, { data: { entries: [{ variantKey: '81', gender: '', shiny: false, done: true }] } });
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Pikachu', exact: true }).click();
  await expect(page.locator('body > canvas[aria-hidden="true"]')).toHaveCount(1);
  await expect(page.getByText('2 / 2 attrapés')).toBeVisible();
  await expect(page.locator('body > canvas[aria-hidden="true"]')).toHaveCount(0, { timeout: 5000 }); // gone after the burst

  await page.goto('/me');
  const sounds = page.getByRole('button', { name: /^Sons/ });
  await expect(sounds).toHaveAttribute('aria-pressed', 'true');
  await sounds.click();
  await expect(sounds).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('fx-sounds'))).toBe('0');
});

test('a collection can be searched by name, number or costume', async ({ page }) => {
  await apiRegister(page.request);
  const ds = await (await page.request.get('/api/data/pokedex.json')).json();
  const costume = (ds.variants as { key: string; kind: string; dex: number; label?: { fr?: string } }[]).find((v) => v.kind === 'costume' && v.dex === 25 && v.label?.fr)!;
  const id = await apiCreateList(page.request, 'Cherche', ['1', '4', '7', '10', '13', '16', '19', '23', '81', `${costume.key}:m`]);
  await page.goto(`/lists/${id}`);
  const search = page.getByRole('searchbox', { name: 'Chercher dans la collection' });
  const cards = page.locator('main ul > li');
  await expect(cards).toHaveCount(10);
  await search.fill('salameche');
  await expect(cards).toHaveCount(1);
  await search.fill('81');
  await expect(cards).toHaveCount(1);
  await search.fill(costume.label!.fr!.split(' ')[0]!);
  await expect(cards.first()).toBeVisible();
  await search.fill('mewtwo');
  await expect(page.getByText('Aucun Pokémon ne correspond à « mewtwo » ici.')).toBeVisible();
});

test('game search warns when forms, colours or costumes cannot be filtered, and lists the Pokémon concerned', async ({ page }) => {
  await apiRegister(page.request);
  const ds = await (await page.request.get('/api/data/pokedex.json')).json();
  const costume = (ds.variants as { key: string; kind: string; dex: number; label?: { fr?: string } }[]).find((v) => v.kind === 'costume' && v.dex === 25 && v.label?.fr)!;

  // A plain list gets no warning.
  const plainId = await apiCreateList(page.request, 'Simples', ['1', '4']);
  await page.goto(`/lists/${plainId}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  await expect(page.locator('dialog[open]').getByRole('note')).toHaveCount(0);

  // Forms (Squawkabilly, Minior), Paldean Tauros breeds and multi-costume Pikachu trigger the warning and are listed.
  const mixedId = await apiCreateList(page.request, 'Couleurs', ['1', '931.fBLUE:m', '774.fRED', '128.fPALDEA_AQUA', `${costume.key}:m`]);
  await page.goto(`/lists/${mixedId}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const sheet = page.locator('dialog[open]');
  const note = sheet.getByRole('note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Attention : formes ou costumes non distingués');
  await expect(note).toContainText('Tapatoès');
  await expect(note).toContainText('Plumage Bleu');
  await expect(note).toContainText('Météno');
  await expect(note).toContainText('Rouge');
  await expect(note).toContainText('Tauros');
  await expect(note).toContainText('Race Aquatique');
  await expect(note).toContainText('Pikachu');
  await expect(note).not.toContainText('Bulbizarre');

  // Leaving costumes out of the search removes Pikachu from the warning too.
  await sheet.getByRole('button', { name: 'Costumés', exact: true }).click();
  await expect(note).not.toContainText('Pikachu');
  await expect(note).toContainText('Tapatoès');
  await page.keyboard.press('Escape');

  // The same warning appears in the Share sheet when including the in-game search.
  await page.getByRole('button', { name: 'Partager' }).click();
  const shareNote = page.locator('dialog[open]').getByRole('note');
  await expect(shareNote).toBeVisible();
  await expect(shareNote).toContainText('Tapatoès');
  await page.keyboard.press('Escape');

  // More than 8 affected variants collapse behind a "see N more" toggle.
  const vivs = (ds.variants as { key: string; kind: string; dex: number }[]).filter((v) => v.dex === 666 && v.kind === 'form' && !v.key.endsWith('.g2')).slice(0, 10);
  const manyId = await apiCreateList(page.request, 'Prismillons', vivs.map((v) => `${v.key}:m`));
  await page.goto(`/lists/${manyId}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const manyNote = page.locator('dialog[open]').getByRole('note');
  await expect(manyNote.locator('li')).toHaveCount(8);
  await manyNote.getByRole('button', { name: 'voir les 2 autres' }).click();
  await expect(manyNote.locator('li')).toHaveCount(10);
  await manyNote.getByRole('button', { name: 'voir moins' }).click();
  await expect(manyNote.locator('li')).toHaveCount(8);
});

test('collection UX: starter template, contextual /dex?to add, entry notes, filters, long-press and duplicate', async ({ page }) => {
  await apiRegister(page.request);

  // 1. Starter template when creating a new collection.
  await page.goto('/lists');
  await page.getByRole('button', { name: 'Nouvelle collection' }).first().click();
  const createSheet = page.locator('dialog[open]');
  await createSheet.getByRole('button', { name: 'Gen 1 · Kanto', exact: true }).click();
  await expect(createSheet.getByLabel('Nom')).toHaveValue('Gen 1 · Kanto');
  await createSheet.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByText(/Pokémon ajoutés/)).toBeVisible();
  await expect(page.getByText('Gen 1 · Kanto')).toBeVisible();

  // 2. Mixed collection to test notes, shiny/tag filters, long-press pick, contextual add, and duplicate.
  const list = (await (await page.request.post('/api/lists', { data: { name: 'Ma Liste UX' } })).json()).list;
  await page.request.put(`/api/lists/${list.id}/entries`, {
    data: {
      entries: [
        { variantKey: '1', gender: 'm', shiny: false, tag: 'lucky', done: false },
        { variantKey: '4', gender: 'm', shiny: true, tag: '', done: false },
      ],
    },
  });

  await page.goto(`/lists/${list.id}`);
  // Personal note via the card options menu.
  const bulbaCard = page.locator('li', { hasText: 'Bulbizarre' });
  await bulbaCard.getByRole('button', { name: 'Options' }).click();
  const optSheet = page.locator('dialog[open]');
  await optSheet.getByLabel('Note personnelle').fill('Réservé à Tom');
  await optSheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Note enregistrée')).toBeVisible();
  await expect(bulbaCard.getByText('Réservé à Tom')).toBeVisible();

  // Quick Shiny & Tag filters inside the collection.
  await page.getByRole('button', { name: 'Shiny', exact: true }).click();
  await expect(page.locator('main ul > li')).toHaveCount(1);
  await expect(page.getByText('Salamèche')).toBeVisible();
  await page.getByRole('button', { name: 'Shiny', exact: true }).click();
  await page.getByRole('button', { name: 'Chanceux', exact: true }).click();
  await expect(page.locator('main ul > li')).toHaveCount(1);
  await expect(page.getByText('Bulbizarre')).toBeVisible();
  await page.getByRole('button', { name: 'Chanceux', exact: true }).click();

  // Long-press (contextmenu) selects all genders of the pressed card (not 0).
  await bulbaCard.getByRole('button', { name: 'Bulbizarre' }).click({ button: 'right' });
  const bar = page.getByRole('toolbar');
  await expect(bar.getByText('1 sélectionné')).toBeVisible();
  await bar.getByRole('button', { name: 'Terminé' }).click();

  // Contextual "+ Ajouter des Pokémon" keeps the collection pre-selected and shows "Déjà dedans" badges.
  await page.getByRole('link', { name: 'Ajouter des Pokémon' }).click();
  await expect(page).toHaveURL(new RegExp(`/dex\\?to=${list.id}$`));
  await expect(page.getByText('Ajout dans « Ma Liste UX »')).toBeVisible();
  await page.getByPlaceholder('Nom ou numéro').fill('carapuce');
  await page.getByRole('button', { name: 'Ajouter Carapuce', exact: true }).click();
  const addSheet = page.locator('dialog[open]');
  await expect(addSheet.getByLabel(/Ma Liste UX/)).toBeChecked();
  await addSheet.getByRole('button', { name: /^Ajouter · / }).click();
  await expect(page.getByText(/Ajouté à 1 collection/)).toBeVisible();

  // Re-opening Carapuce now shows the "Déjà dedans" badge on Ma Liste UX.
  await page.getByRole('button', { name: 'Ajouter Carapuce', exact: true }).click();
  await expect(page.locator('dialog[open] li', { hasText: 'Ma Liste UX' }).getByText('Déjà dedans')).toBeVisible();
  await page.keyboard.press('Escape');

  // Back to collection -> duplicate own list from Edit sheet.
  await page.getByRole('link', { name: 'Retour', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lists/${list.id}$`));
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Dupliquer cette collection' }).click();
  await expect(page.getByText('Collection dupliquée')).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`/lists/${list.id}$`));
});
