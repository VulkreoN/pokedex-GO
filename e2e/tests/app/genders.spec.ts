import { PASSWORD, adminLogin, apiCreateList, apiRegister, expect, test, uniq } from '../fixtures.js';

test('a list card tracks ♂ and ♀ apart, for any Pokémon', async ({ page }) => {
  await apiRegister(page.request);
  // Bulbasaur looks the same in both genders: it still gets a ♂ and a ♀ to tick.
  const id = await apiCreateList(page.request, 'Sexes', ['1']);
  await page.goto(`/lists/${id}`);
  const card = page.locator('li', { hasText: 'Bulbizarre' });
  const male = card.getByRole('button', { name: /^♂ Mâle/ });
  const female = card.getByRole('button', { name: /^♀ Femelle/ });
  await expect(male).toHaveAttribute('aria-pressed', 'false');
  await expect(female).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('0 / 2 attrapés')).toBeVisible();

  await female.click();
  await expect(female).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 / 2 attrapés')).toBeVisible();
  await expect(card).toBeVisible(); // still in "Missing": the male is not caught yet

  // Tapping the card catches every gender at once; it then leaves the Missing view.
  await card.getByRole('button', { name: 'Bulbizarre' }).click();
  await expect(page.getByText('2 / 2 attrapés')).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Attrapés', exact: true }).click();
  await expect(page.locator('li', { hasText: 'Bulbizarre' }).getByRole('button', { name: /^♂ Mâle : Attrapé/ })).toBeVisible();
});

test('the add sheet only offers the genders a Pokémon exists in', async ({ page }) => {
  await apiRegister(page.request);
  const ds = await (await page.request.get('/api/data/pokedex.json')).json();
  const femaleOnly = ds.variants.find((v: any) => v.dex === 25 && v.kind === 'costume' && v.genders?.length === 1 && v.genders[0] === 'f' && v.label?.fr);
  await page.goto('/dex/25');
  const cardName = `Ajouter Pikachu ${femaleOnly.label.fr}`;
  const cardLi = page.locator('li', { has: page.getByRole('button', { name: cardName, exact: true }) });
  await expect(cardLi.getByLabel('♀')).toBeVisible(); // the card says female, though it has a single picture
  await page.getByRole('button', { name: cardName, exact: true }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByText('Existe seulement en femelle.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^♀ Normal/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^♂/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Nidoran♀ and Magnemite: one gender, none.
  await page.goto('/dex/29');
  await page.getByRole('button', { name: /^Ajouter Nidoran/ }).first().click();
  await expect(page.locator('dialog[open]').getByRole('button', { name: /^♀ Normal/ })).toBeVisible();
  await expect(page.locator('dialog[open]').getByRole('button', { name: /^♂/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/dex/81');
  await page.getByRole('button', { name: /^Ajouter Magnéti/ }).first().click();
  await expect(page.locator('dialog[open]').getByRole('button', { name: /^Normal/ }).last()).toBeVisible();
  await expect(page.locator('dialog[open]').getByRole('button', { name: /^[♂♀]/ })).toHaveCount(0);
});

test('a two-gender Pokémon is added as ♂ + ♀ by default, one card in the list', async ({ page }) => {
  await apiRegister(page.request);
  const id = await apiCreateList(page.request, 'Ajout', ['150']);
  await page.goto('/dex/26');
  await page.getByRole('button', { name: /^Ajouter Raichu$/ }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('button', { name: /^♂ Normal/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: /^♀ Normal/ })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('checkbox').first().check();
  await sheet.getByRole('button', { name: /^Ajouter · 2/ }).click();
  await page.goto(`/lists/${id}`);
  await expect(page.locator('li', { hasText: 'Raichu' })).toHaveCount(1);
  await expect(page.locator('li', { hasText: 'Raichu' }).getByRole('button', { name: /^[♂♀]/ })).toHaveCount(2);
});

test("unfollowing a friend's list hides it from Friends' lists, following brings it back", async ({ browser }) => {
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.6.1.1' } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.6.1.2' } });
  const owner = await a.newPage();
  const me = await b.newPage();
  const uo = await apiRegister(owner.request, uniq('fo'));
  await apiRegister(me.request, uniq('fm'));
  await me.request.post('/api/friends/requests', { data: { friendCode: uo.friendCode } });
  const req = (await (await owner.request.get('/api/friends/requests')).json()).requests[0];
  await owner.request.post(`/api/friends/requests/${req.id}/accept`);
  const listId = await apiCreateList(owner.request, 'Liste suivie', ['150']);

  await me.goto(`/lists/${listId}`);
  await me.getByRole('button', { name: 'Ne plus suivre' }).click();
  await expect(me.getByRole('button', { name: 'Suivre', exact: true })).toBeVisible();
  await me.goto('/lists?tab=friends');
  await expect(me.getByText('Liste suivie')).toHaveCount(0);

  await me.goto(`/friends/${uo.id}`);
  await expect(me.getByText('Liste suivie')).toBeVisible();
  await me.getByRole('button', { name: 'Suivre', exact: true }).click();
  await expect(me.getByRole('button', { name: 'Ne plus suivre' })).toBeVisible();
  await me.goto('/lists?tab=friends');
  await expect(me.getByText('Liste suivie')).toBeVisible();
  await a.close();
  await b.close();
});

test('lists are mine or my friends’: no "anyone with the link" choice any more', async ({ page }) => {
  await apiRegister(page.request);
  await page.goto('/lists');
  await page.getByRole('button', { name: 'Nouvelle liste' }).first().click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByText('Moi seulement')).toBeVisible();
  await expect(sheet.getByText('Mes amis')).toBeVisible();
  await expect(sheet.getByText('Toute personne avec le lien')).toHaveCount(0);
});

test('a manager pins the genders of a form the game master does not describe yet', async ({ browser }) => {
  const adminCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.6.2.1' } });
  const mgrCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.6.2.2' } });
  const admin = await adminCtx.newPage();
  const mgr = await mgrCtx.newPage();
  await adminLogin(admin.request);
  const m = await apiRegister(mgr.request, uniq('gmgr'));
  expect((await admin.request.patch(`/api/users/${m.id}/role`, { data: { role: 'manager' } })).status()).toBe(200);

  const ds = await (await mgr.request.get('/api/data/pokedex.json')).json();
  const guessed = ds.variants.find((v: any) => v.gendersGuessed && v.genders?.length === 2 && !v.gender && v.label?.fr && v.dex === 25) ?? ds.variants.find((v: any) => v.gendersGuessed && v.genders?.length === 2 && !v.gender && v.label?.fr);
  const sp = ds.species.find((s: any) => s.dex === guessed.dex);
  const cardName = `Ajouter ${sp.name.fr ?? sp.name.en} ${guessed.label.fr}`;
  const li = mgr.locator('li', { has: mgr.getByRole('button', { name: cardName, exact: true }) });

  await mgr.goto(`/dex/${guessed.dex}`);
  await li.getByRole('button', { name: 'Gérer cette variante' }).click();
  const sheet = mgr.locator('dialog[open]');
  await expect(sheet.getByText(/ne décrit pas encore cette forme/)).toBeVisible();
  await sheet.getByRole('button', { name: '♂ seulement' }).click();
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(mgr.getByText('Enregistré', { exact: true })).toBeVisible();

  await mgr.reload();
  await mgr.getByRole('button', { name: cardName, exact: true }).click();
  await expect(mgr.locator('dialog[open]').getByText('Existe seulement en mâle.')).toBeVisible();
  await expect(mgr.locator('dialog[open]').getByRole('button', { name: /^♀/ })).toHaveCount(0);
  await mgr.keyboard.press('Escape');

  // Back to automatic: the costume shows up again in the review list, where one tap confirms it.
  await mgr.request.delete(`/api/overrides/${encodeURIComponent(guessed.key)}`);
  await mgr.goto('/review');
  const review = mgr.locator('section', { hasText: 'Sexes à vérifier' });
  const row = review.locator('li', { hasText: guessed.label.fr });
  await expect(row.first()).toBeVisible();
  await row.first().getByRole('button', { name: '♂ et ♀' }).click();
  await expect(mgr.getByText('Enregistré', { exact: true })).toBeVisible();
  await expect(review.locator('li', { hasText: guessed.label.fr })).toHaveCount(0);
  await mgr.request.delete(`/api/overrides/${encodeURIComponent(guessed.key)}`);
  await adminCtx.close();
  await mgrCtx.close();
  void PASSWORD;
});

test('search strings use the game language: mâle / femelle in a French game', async ({ page }) => {
  await apiRegister(page.request);
  // The reported list: Growlithe ♂ and Galarian Farfetch'd ♀ were missing from the in-game results.
  const id = await apiCreateList(page.request, 'Recherche', ['1', '58:m', '72', '83.fGALARIAN:f', '100.fHISUIAN']);
  await page.goto(`/lists/${id}`);
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
  const code = sheet.locator('code').first();
  await expect(code).toContainText('mâle');
  await expect(code).toContainText('femelle');
  await expect(code).not.toContainText('female');
  // One string for the whole list: plain Growlithe leaves Hisuian Growlithe out, normal entries leave shinies and
  // costumes out, and Hisuian Voltorb still fits in.
  await expect(sheet.locator('code')).toHaveCount(1);
  await expect(code).toContainText('!hisui,100');
  await expect(code).toContainText('!chromatique');
  await expect(code).toContainText('!costume');
  await sheet.getByRole('button', { name: 'English' }).click();
  await expect(code).toContainText('female');
  await sheet.getByRole('button', { name: 'Français' }).click();
});
