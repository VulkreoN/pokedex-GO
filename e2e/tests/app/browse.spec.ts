import { clipboard, expect, test } from '../fixtures.js';

test.describe('without an account', () => {
  test('home sends visitors to the login page, which lets them browse anyway', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Tes listes de chasse Pokémon GO' })).toBeVisible();
    await page.getByRole('link', { name: 'Parcourir le Pokédex sans compte' }).click();
    await expect(page).toHaveURL(/\/dex$/);
  });

  test('unknown routes fall back to home', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the Pokédex lists species and searches by name, French name and number', async ({ page }) => {
    await page.goto('/dex');
    const search = page.getByPlaceholder('Nom ou numéro');
    await expect(page.getByRole('link', { name: /Bulbizarre/ }).first()).toBeVisible();
    // A search switches to the exploded view: one card per form, named "Ajouter <species> <form>".
    await search.fill('pikachu');
    await expect(page.getByRole('button', { name: /^Ajouter Pikachu/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Ajouter Bulbizarre/ })).toHaveCount(0);
    await search.fill('salamèche');
    await expect(page.getByRole('button', { name: /^Ajouter Salamèche/ }).first()).toBeVisible();
    await search.fill('150');
    await expect(page.getByRole('button', { name: /^Ajouter Mewtwo/ }).first()).toBeVisible();
  });

  test('filters narrow the Pokédex and show as removable chips', async ({ page }) => {
    await page.goto('/dex');
    await page.getByRole('button', { name: 'Filtres' }).click();
    await page.getByRole('button', { name: 'Costumes', exact: true }).click();
    await page.keyboard.press('Escape');
    const chip = page.getByRole('button', { name: /Costumes ✕/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveCount(0);
  });

  test('a species page shows its variants, shiny art, and asks to log in before adding', async ({ page }) => {
    await page.goto('/dex/25');
    await expect(page.getByRole('heading', { name: '#25 Pikachu' })).toBeVisible();
    await page.getByRole('button', { name: /Shiny/ }).first().click();
    await expect(page.getByRole('button', { name: /Shiny/ }).first()).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Ajouter Pikachu/ }).first().click();
    await expect(page.getByRole('link', { name: 'Connecte-toi pour continuer.' })).toBeVisible();
  });

  test('protected pages redirect to login', async ({ page }) => {
    await page.goto('/lists');
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/friends');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the theme toggle switches to dark and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dex');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Sombre' }).click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
  });
});

test.describe('PvP', () => {
  test('search, open a form and see its evolution ranked', async ({ page }) => {
    await page.goto('/pvp');
    await page.getByPlaceholder('Chercher un Pokémon').fill('marill');
    await page.getByRole('link', { name: /^Marill/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Azumarill' })).toBeVisible(); // evolution line
    await expect(page.getByText('Après évolution')).toBeVisible();
  });

  test('IVs live in the URL: a 0/15/15 Azumarill is rank 1 in Great League', async ({ page }) => {
    await page.goto('/pvp/184?a=0&d=15&s=15&l=20');
    const great = page.locator('div.rounded-xl', { hasText: 'Ligue Super' }).first();
    await expect(great.getByText('#1', { exact: true })).toBeVisible();
    await expect(great).toContainText('100,0');
    await expect(great).toContainText('Depuis le niveau 20');
    await expect(great).toContainText('poussières');
  });

  test('a CP finds the level, and a Pokémon over the cap is flagged', async ({ page }) => {
    await page.goto('/pvp/150?a=15&d=15&s=15');
    await page.getByPlaceholder('PC').fill('4178');
    await expect(page.getByText('Niveau 40', { exact: true })).toBeVisible();
    await expect(page.locator('select')).toHaveValue('40');
    await expect(page.getByText(/Trop haut : déjà 4178 PC/).first()).toBeVisible();
  });

  test('moving a slider updates the URL', async ({ page }) => {
    await page.goto('/pvp/184');
    await page.locator('input[type=range]').first().fill('7');
    await expect(page).toHaveURL(/a=7/);
  });
});

test.describe('game tab', () => {
  test('every section renders', async ({ page }) => {
    await page.goto('/game');
    await expect(page.getByText(/Raids \d étoiles|Impossible de charger/).first()).toBeVisible({ timeout: 20_000 });
    for (const tab of ['Raids Dynamax', 'Événements', 'Études', 'Œufs']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });

  test('tools: bottle caps copies the candidate search and tracks tasks', async ({ page }) => {
    await page.goto('/game');
    await page.getByRole('button', { name: 'Outils', exact: true }).click();
    await page.getByRole('button', { name: 'Copier', exact: true }).click();
    expect(await clipboard(page)).toBe('4attack,4defense&4attack,4hp&4defense,4hp&!4*&!shadow&shiny');
    await page.getByRole('button', { name: 'Chromatiques seulement' }).click();
    await expect(page.locator('code')).toHaveText('4attack,4defense&4attack,4hp&4defense,4hp&!4*&!shadow');
    await page.getByRole('button', { name: 'PV', exact: true }).click();
    await page.locator('main input[type=range]').fill('13');
    await expect(page.getByText('2 tâches pour atteindre 15')).toBeVisible();
    await expect(page.getByText('Faire éclore 30 Œufs avec lui en copain')).toBeVisible();
  });
});

test.describe('installable app', () => {
  test('serves a manifest and a service worker', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).name).toBe('MyDexPoGo');
    expect((await request.get('/sw.js')).status()).toBe(200);
  });
});

test('multi-select can hide costumes and / or forms', async ({ page }) => {
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('raichu');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  const costume = page.getByRole('button', { name: /^Ajouter Raichu (Chapeau de fête|Party Hat)/ });
  const alola = page.getByRole('button', { name: /^Ajouter Raichu Alola/ });
  const base = page.getByRole('button', { name: 'Ajouter Raichu', exact: true });
  await expect(costume.first()).toBeVisible();
  await expect(alola).toBeVisible();

  await page.getByRole('button', { name: 'Sans costumes' }).click();
  await expect(costume).toHaveCount(0);
  await expect(alola).toBeVisible();

  await page.getByRole('button', { name: 'Sans formes' }).click();
  await expect(alola).toHaveCount(0);
  await expect(base).toBeVisible();

  await page.getByRole('button', { name: 'Sans costumes' }).click();
  await expect(costume.first()).toBeVisible();
  await expect(alola).toHaveCount(0);
});

test('multi-select can hide Megas and Gigantamax apart from forms', async ({ page }) => {
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('dracaufeu');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  const mega = page.getByRole('button', { name: /^Ajouter Dracaufeu Méga/ });
  const gmax = page.getByRole('button', { name: /^Ajouter Dracaufeu Giga/ });
  await expect(mega.first()).toBeVisible();
  await expect(gmax.first()).toBeVisible();
  await page.getByRole('button', { name: 'Sans formes' }).click();
  await expect(mega.first()).toBeVisible(); // forms only: Megas and Gigantamax have their own switches
  await page.getByRole('button', { name: 'Sans Méga' }).click();
  await expect(mega).toHaveCount(0);
  await expect(gmax.first()).toBeVisible();
  await page.getByRole('button', { name: 'Sans Gigamax' }).click();
  await expect(gmax).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter Dracaufeu', exact: true })).toBeVisible();
});

test('family order puts Pichu before Pikachu and Raichu, at #25', async ({ page }) => {
  await page.goto('/dex');
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Famille', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Famille ✕/ })).toBeVisible();
  const names = await page.locator('main ul > li').evaluateAll((lis) => lis.slice(0, 40).map((li) => li.textContent ?? ''));
  const at = (n: string) => names.findIndex((x) => x.includes(n));
  expect(at('Pichu')).toBeGreaterThan(-1);
  expect(at('Pichu')).toBeLessThan(at('Pikachu'));
  expect(at('Pikachu')).toBeLessThan(at('Raichu'));
  expect(at('Arbok')).toBeLessThan(at('Pichu')); // the family sits at #25, after Ekans' family
});
