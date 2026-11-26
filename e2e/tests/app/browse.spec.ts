import { adminLogin, apiRegister, clipboard, expect, test } from '../fixtures.js';

test.describe('without an account', () => {
  test('home sends visitors to the login page, which lets them browse anyway', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Tes collections de chasse Pokémon GO' })).toBeVisible();
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
    await page.getByRole('button', { name: 'Costumes', exact: true }).click(); // every kind starts shown: this hides costumes
    await page.keyboard.press('Escape');
    const chip = page.getByRole('button', { name: 'Sans costumes ✕' });
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
    const great = page.locator('[aria-label="Ligue Super"]');
    await expect(great.getByText('#1', { exact: true })).toBeVisible();
    await expect(great.getByText('Rang 1', { exact: true })).toBeVisible(); // verdict
    await expect(great).toContainText('100,0');
    await expect(great).toContainText('Depuis le niveau 20');
    await expect(great).toContainText('poussières');
    await expect(great).not.toContainText('Trouver mieux'); // nothing better to look for
  });

  test('Master League is rated too (15/15/15 at max level), and each league card shows its recommended moves', async ({ page }) => {
    await page.goto('/pvp/809?a=15&d=15&s=15'); // Melmetal
    const master = page.locator('[aria-label="Ligue Master"]');
    await expect(master.getByText('#1', { exact: true })).toBeVisible();
    await expect(master.getByText('Rang 1', { exact: true })).toBeVisible();
    await expect(master).toContainText('Rang 1 : 15/15/15');
    const rankings = await page.request.get('/api/game/pvp-rankings/809');
    if (rankings.status() !== 200) return; // PvPoke unreachable: no moves to show
    const great = page.locator('[aria-label="Ligue Super"]');
    await expect(great.getByText('Attaques conseillées')).toBeVisible();
    await expect(great.getByText('Éclair')).toBeVisible();
    await expect(master.getByText('Attaques conseillées')).toBeVisible();
    await expect(master.getByRole('link', { name: /^PvPoke #\d+$/ })).toHaveAttribute('href', /\/10000\/overall\/melmetal\/$/);
  });

  test('a poor pick shows what rank 1 has more, and a search to find a better one', async ({ page }) => {
    await page.goto('/pvp/184?a=15&d=0&s=0');
    const great = page.locator('[aria-label="Ligue Super"]');
    await expect(great.getByText('Faible', { exact: true })).toBeVisible();
    await expect(great).toContainText('Rang 1 : 0/15/15');
    await expect(great).toContainText('Attaque +15');
    await expect(great).toContainText('Défense -15');
    await expect(great.getByText('Indique son niveau ou son PC')).toBeVisible();
    await expect(great.locator('code')).toHaveText('+azurill&0-1attaque&3-4défense&3-4pv');
    await great.getByRole('button', { name: 'Copier' }).click();
    expect(await clipboard(page)).toBe('+azurill&0-1attaque&3-4défense&3-4pv');
    await great.getByRole('button', { name: 'Plus large' }).click();
    await expect(great.locator('code')).toHaveText('+azurill&0-1attaque&2-4défense&2-4pv');
  });

  test('a CP finds the level, and a Pokémon over the cap is flagged', async ({ page }) => {
    await page.goto('/pvp/150?a=15&d=15&s=15');
    await page.getByPlaceholder('PC').fill('4178');
    await expect(page.getByText('Niveau 40', { exact: true })).toBeVisible();
    await expect(page.locator('select')).toHaveValue('40');
    await expect(page.getByText(/Trop haut : déjà 4178 PC/).first()).toBeVisible();
  });

  test("the start page shows PvPoke's top picks per league, and their rank on the form's page", async ({ page }) => {
    await page.goto('/pvp');
    const top = page.getByRole('heading', { name: 'Les meilleurs du moment' });
    const regulars = page.getByRole('heading', { name: 'Souvent joués en Ligue Super et Hyper' });
    // Until the rankings answer, and for good if PvPoke is unreachable, the fixed list of regulars stands in.
    await expect(top.or(regulars)).toBeVisible();
    await expect(top).toBeVisible({ timeout: 30_000 }).catch(() => {});
    if (!(await top.isVisible())) return;
    await expect(page.getByRole('link', { name: 'PvPoke' })).toHaveAttribute('href', 'https://pvpoke.com/rankings/');
    await page.getByRole('button', { name: /Ligue Hyper/ }).click();
    await expect(page.getByRole('button', { name: /Ligue Hyper/ })).toHaveAttribute('aria-pressed', 'true');
    const first = page.locator('main section', { has: top }).locator('ul li a').first();
    await expect(first).toContainText('#1');
    await first.click();
    await expect(page.getByText(/Ligue Hyper #1/)).toBeVisible();
  });

  test("a form's page shows PvPoke's analysis: rank, moves in French, roles, matchups", async ({ page }) => {
    const rankings = await page.request.get('/api/game/pvp-rankings/809');
    test.skip(rankings.status() !== 200, 'PvPoke unreachable');
    await page.goto('/pvp/809');
    const card = page.getByRole('region', { name: 'Analyse PvPoke' });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/^#\d+$/)).toBeVisible();
    await expect(card.getByText('Attaques conseillées')).toBeVisible();
    await expect(card.getByText('Éclair')).toBeVisible(); // Thunder Shock, in the game's French
    await expect(card.getByText('Ouverture')).toBeVisible();
    await expect(card.getByText('Bat surtout')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Voir sur PvPoke' })).toHaveAttribute('href', /^https:\/\/pvpoke\.com\/rankings\/all\/(1500|2500)\/overall\/melmetal\/$/);
    await card.getByRole('button', { name: /Ligue Hyper/ }).click();
    await expect(card.getByRole('link', { name: 'Voir sur PvPoke' })).toHaveAttribute('href', /\/2500\/overall\/melmetal\/$/);
  });

  test('moving a slider updates the URL', async ({ page }) => {
    await page.goto('/pvp/184');
    await page.locator('input[type=range]').first().fill('7');
    await expect(page).toHaveURL(/a=7/);
  });
});

test.describe('game tab', () => {
  test('every section renders (Events first by default)', async ({ page }) => {
    await page.goto('/game');
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toHaveText('Événements');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Ma semaine|En cours|À venir|Actualités/).first()).toBeVisible({ timeout: 20_000 });
    for (const tab of ['Raids', 'Dynamax', 'Études', 'Œufs']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });

  test('research shows item rewards, which can be hidden', async ({ page }) => {
    await page.goto('/game');
    await page.getByRole('tab', { name: 'Études', exact: true }).click();
    const items = page.getByRole('button', { name: 'Objets', exact: true });
    // Upstream may be down: then only encounters, from the fallback, and no toggle.
    if (!(await items.isVisible({ timeout: 15_000 }).catch(() => false))) return;
    const stardust = page.getByText("Poussière d'étoile").first();
    await expect(stardust).toBeVisible();
    await items.click();
    await expect(page.getByText("Poussière d'étoile")).toHaveCount(0);
  });

  test('tools: bottle caps copies the candidate search and tracks tasks', async ({ page }) => {
    await page.goto('/game');
    await page.getByRole('tab', { name: 'Outils', exact: true }).click();
    await expect(page).toHaveURL(/\/game\?tab=tools$/); // kept when coming back
    await page.getByRole('button', { name: 'Capsules', exact: true }).click();
    await expect(page).toHaveURL(/\/game\?tab=tools&tool=caps$/); // tool persisted in URL
    await page.getByRole('button', { name: 'Copier', exact: true }).click();
    expect(await clipboard(page)).toBe('4attack,4defense&4attack,4hp&4defense,4hp&!4*&!shadow&shiny');
    await page.getByRole('button', { name: 'Chromatiques seulement' }).click();
    await expect(page.locator('code')).toHaveText('4attack,4defense&4attack,4hp&4defense,4hp&!4*&!shadow');
    await page.getByRole('button', { name: 'Français', exact: true }).click();
    await expect(page.locator('code')).toHaveText('4attaque,4défense&4attaque,4pv&4défense,4pv&!4*&!obscur');
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

test('multi-select: each kind of variant switches on and off on its own', async ({ page }) => {
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('raichu');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  const costume = page.getByRole('button', { name: /^Ajouter Raichu (Chapeau de fête|Party Hat)/ });
  const alola = page.getByRole('button', { name: /^Ajouter Raichu d'Alola/ });
  const base = page.getByRole('button', { name: 'Ajouter Raichu', exact: true });
  const top = page.locator('header');
  await expect(costume.first()).toBeVisible();
  await expect(alola).toBeVisible();

  await top.getByRole('button', { name: 'Costumes', exact: true }).click();
  await expect(top.getByRole('button', { name: 'Costumes', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(costume).toHaveCount(0);
  await expect(alola).toBeVisible();

  await top.getByRole('button', { name: 'Régionales', exact: true }).click();
  await expect(alola).toHaveCount(0);
  await expect(base).toBeVisible();

  await top.getByRole('button', { name: 'Costumes', exact: true }).click();
  await expect(costume.first()).toBeVisible();
  await expect(alola).toHaveCount(0);
});

test('multi-select hides Megas and Gigantamax apart from forms', async ({ page }) => {
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('dracaufeu');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  const mega = page.getByRole('button', { name: /^Ajouter Dracaufeu Méga/ });
  const gmax = page.getByRole('button', { name: /^Ajouter Dracaufeu Giga/ });
  const top = page.locator('header');
  await expect(mega.first()).toBeVisible();
  await expect(gmax.first()).toBeVisible();
  await top.getByRole('button', { name: 'Formes', exact: true }).click();
  await expect(mega.first()).toBeVisible();
  await top.getByRole('button', { name: 'Méga', exact: true }).click();
  await expect(mega).toHaveCount(0);
  await expect(gmax.first()).toBeVisible();
  await top.getByRole('button', { name: 'Gigamax', exact: true }).click();
  await expect(gmax).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter Dracaufeu', exact: true })).toBeVisible();
});

test('filters cannot contradict each other: the last kind shown stays on', async ({ page }) => {
  await page.goto('/dex');
  await page.getByRole('button', { name: 'Filtres' }).click();
  const sheet = page.locator('dialog[open]');
  for (const k of ['Normaux', 'Formes', 'Régionales', 'Méga', 'Gigamax']) await sheet.getByRole('button', { name: k, exact: true }).click();
  const costumes = sheet.getByRole('button', { name: 'Costumes', exact: true });
  await expect(costumes).toHaveAttribute('aria-pressed', 'true');
  await expect(costumes).toBeDisabled();
  await expect(sheet.getByRole('button', { name: /^Voir \d+ variantes$/ })).toBeVisible();
  await sheet.getByRole('button', { name: /^Voir / }).click();
  await expect(page.getByRole('button', { name: 'Costumes seulement ✕' })).toBeVisible();
  await expect(page.locator('main').getByText('Rien à afficher.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Costumes seulement ✕' }).click();
  await expect(page.getByText(/^\d+ Pokémon$/)).toBeVisible();
});

test('family order puts Pichu before Pikachu and Raichu, at #25', async ({ page }) => {
  await page.goto('/dex');
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Famille', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Famille ✕/ })).toBeVisible();
  await expect(page.locator('main ul > li').first()).toBeVisible();
  const names = await page.locator('main ul > li').evaluateAll((lis) => lis.slice(0, 40).map((li) => li.textContent ?? ''));
  const at = (n: string) => names.findIndex((x) => x.includes(n));
  expect(at('Pichu')).toBeGreaterThan(-1);
  expect(at('Pichu')).toBeLessThan(at('Pikachu'));
  expect(at('Pikachu')).toBeLessThan(at('Raichu'));
  expect(at('Arbok')).toBeLessThan(at('Pichu')); // the family sits at #25, after Ekans' family
});

test('PvP mode shows the rank 1 IVs per league on the cards', async ({ page }) => {
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('rayquaza');
  await page.getByRole('button', { name: 'Afficher les meilleurs IV PvP' }).click();
  const card = page.locator('li', { has: page.getByRole('button', { name: 'Ajouter Rayquaza', exact: true }) });
  await expect(card.getByLabel(/^Ligue Super · Rang 1 : 0\/15\/12 · Niv\. 14,5 · PC 1499$/)).toBeVisible();
  await expect(card.getByLabel(/^Ligue Hyper · Rang 1 : 0\/15\/15 · Niv\. 24 · PC 2498$/)).toBeVisible();
  // Megas do not battle in leagues: nothing shown.
  const mega = page.locator('li', { has: page.getByRole('button', { name: /^Ajouter Rayquaza Méga/ }) });
  await expect(mega.getByLabel(/^Ligue Super/)).toHaveCount(0);
  // Tapping it opens the PvP page with those IVs.
  await card.getByLabel(/^Ligue Super/).click();
  await expect(page).toHaveURL(/\/pvp\/384\?a=0&d=15&s=12/);
  await page.goto('/dex');
  await expect(page.getByRole('button', { name: 'Afficher les meilleurs IV PvP' })).toHaveAttribute('aria-pressed', 'true'); // remembered
});

test('my PvP Pokémon: saved from the PvP page, listed by their best league rank, updated and removed', async ({ page }) => {
  const { apiRegister } = await import('../fixtures.js');
  await apiRegister(page.request);
  await page.goto('/pvp/183?a=0&d=15&s=15&l=20'); // Marill, rank 1 IVs for a Great League Azumarill
  await page.getByRole('button', { name: 'Enregistrer dans mes Pokémon' }).click();
  await expect(page.getByText('Ajouté à tes Pokémon')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dans mes Pokémon' })).toBeDisabled();
  await expect(page).toHaveURL(/m=/);

  await page.goto('/pvp');
  const mine = page.locator('section', { has: page.getByRole('heading', { name: /^Mes Pokémon/ }) });
  const row = mine.getByRole('link', { name: /Marill/ });
  await expect(row).toContainText('0/15/15');
  await expect(row).toContainText('#1');
  await expect(row).toContainText('en Azumarill');

  await row.click();
  await page.locator('input[type=range]').first().fill('3');
  await page.getByRole('button', { name: 'Enregistrer les changements' }).click();
  await expect(page.getByText('Modifié', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(page.getByText('Retiré de tes Pokémon')).toBeVisible();
  await page.goto('/pvp');
  await expect(page.getByRole('heading', { name: /^Mes Pokémon/ })).toHaveCount(0);
});

test('a team of three: picked from a search, shared weaknesses, and it lives in the URL', async ({ page }) => {
  await page.goto('/pvp');
  await page.getByRole('link', { name: /Composer une équipe/ }).click();
  await expect(page).toHaveURL(/\/pvp\/team/);
  await page.getByRole('button', { name: 'Ajouter' }).first().click();
  await page.locator('dialog[open]').getByPlaceholder('Chercher un Pokémon').fill('azumarill');
  await page.locator('dialog[open]').getByRole('button', { name: /Azumarill/ }).click();
  await expect(page).toHaveURL(/p=184/);

  await page.goto('/pvp/team?l=great&p=184,308,227'); // Azumarill, Medicham, Skarmory
  const weak = page.locator('section', { has: page.getByRole('heading', { name: 'Faiblesses' }) });
  await expect(weak.getByText(/Au moins deux membres/)).toBeVisible();
  await expect(weak.getByText('Électrik').first()).toBeVisible(); // Azumarill and Skarmory, Medicham does not resist it
  await page.getByRole('button', { name: /Ligue Hyper/ }).click();
  await expect(page).toHaveURL(/l=ultra/);
});

test('battle simulator: two Pokémon from the URL, a winner, a timeline and the shield table', async ({ page }) => {
  const data = await page.request.get('/api/game/pvp-battle/184');
  test.skip(data.status() !== 200, 'PvPoke unreachable');
  await page.goto('/pvp/battle?l=great&a=184&b=308'); // Azumarill vs Medicham
  const result = page.getByRole('region', { name: 'Résultat' });
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result.getByText(/gagne$|^Égalité$/)).toBeVisible();
  await expect(result.getByText('Déroulé')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selon les boucliers' })).toBeVisible();
  await expect(page.locator('table td')).toHaveCount(9);
  // Shields and moves are settings in the URL.
  await page.getByRole('region', { name: 'Ton Pokémon' }).getByRole('button', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/as=2/);
  await expect(page.getByRole('link', { name: 'Comparer sur PvPoke' })).toHaveAttribute('href', /pvpoke\.com\/battle\/1500\/azumarill\/medicham\/21\/$/);
});

test('popular teams load into the team builder', async ({ page }) => {
  const teams = await page.request.get('/api/game/pvp-teams/great');
  test.skip(teams.status() !== 200 || (await teams.json()).teams.length === 0, 'PvPoke unreachable');
  await page.goto('/pvp/team');
  await expect(page.getByRole('heading', { name: 'Équipes populaires' })).toBeVisible({ timeout: 20_000 });
  await page.locator('section', { has: page.getByRole('heading', { name: 'Équipes populaires' }) }).getByRole('button').first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get('p') ?? '').toMatch(/^[^,]+,[^,]+,[^,]+$/);
  await expect(page.getByRole('heading', { name: 'Faiblesses' })).toBeVisible();
});

test('PvP pages fit a phone screen: no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/pvp', '/pvp/184?a=0&d=15&s=15', '/pvp/team?p=184,308,227', '/pvp/battle?a=184&b=308']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('a species the game only knows as forms has no extra "Normal" one (Poltchageist, Dudunsparce)', async ({ page }) => {
  await page.goto('/dex/1012');
  await expect(page.getByRole('heading', { name: /Poltchageist/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Normal/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Counterfeit/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Artisan/ }).first()).toBeVisible();
  await page.goto('/dex/854'); // Sinistea: the game's own French names
  await expect(page.getByRole('heading', { name: /Théffroi/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Normal/ })).toHaveCount(0);
  await page.goto('/dex/982');
  await expect(page.getByRole('heading', { name: /^Normal/ })).toHaveCount(0);
});

test('battle-only forms are not in the collection (Mimikyu Busted, Morpeko Hangry, Cramorant Gulping)', async ({ request }) => {
  const ds = await (await request.get('/api/data/pokedex.json')).json();
  const keys = new Set(ds.variants.map((v: { key: string }) => v.key));
  for (const gone of ['778.fBUSTED', '877.fHANGRY', '845.fGULPING', '845.fGORGING', '681.fBLADE', '555.fZEN', '774.fMETEOR', '774.fMETEOR_GREEN']) expect(keys.has(gone), gone).toBe(false);
  expect(ds.variants.filter((v: { dex: number }) => v.dex === 774).map((v: { label: { fr: string } }) => v.label.fr).sort()).toEqual(['Noyau Bleu', 'Noyau Indigo', 'Noyau Jaune', 'Noyau Orange', 'Noyau Rouge', 'Noyau Vert', 'Noyau Violet']);
  for (const kept of ['778.fDISGUISED', '877.fFULL_BELLY', '845', '681.fSHIELD']) expect(keys.has(kept), kept).toBe(true);
  for (const dup of ['854', '855', '888', '889', '877', '982', '1012']) expect(keys.has(dup), dup).toBe(false);
  expect(ds.aliases['778.fBUSTED']).toBe('778.fDISGUISED');
});

test('multi-select: each ticked card chooses its genders and versions', async ({ page }) => {
  await page.goto('/dex');
  await page.evaluate(() => sessionStorage.removeItem('selection'));
  await page.getByPlaceholder('Nom ou numéro').fill('bulbizarre');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  await page.getByRole('button', { name: 'Ajouter Bulbizarre', exact: true }).click();
  // Starts as ♂ and ♀, normal: only the female shiny is wanted here.
  const card = page.locator('li', { has: page.getByRole('button', { name: 'Ajouter Bulbizarre', exact: true }) });
  // ♂, ♀, ♂ shiny and ♀ shiny are separate.
  await card.getByRole('button', { name: 'Mâle', exact: true }).click();
  await card.getByRole('button', { name: 'Femelle Shiny', exact: true }).click();
  await card.getByRole('button', { name: 'Femelle', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Mâle', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(card.getByRole('button', { name: 'Mâle Shiny', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByPlaceholder('Nom ou numéro').fill('salamèche');
  await page.getByRole('button', { name: 'Ajouter Salamèche', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).last().click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('button', { name: 'Mettre 3 entrées dans la sélection' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Mettre 3 entrées dans la sélection' }).click();
  const basket = await page.evaluate(() => JSON.parse(sessionStorage.getItem('selection') ?? '[]') as { variantKey: string; gender: string; shiny: boolean }[]);
  expect(basket.map((b) => `${b.variantKey}${b.gender}${b.shiny ? '*' : ''}`).sort()).toEqual(['1f*', '4f', '4m']);
});

test('multi-select: the sheet switches a version on or off for every ticked card', async ({ page }) => {
  await page.goto('/dex');
  await page.evaluate(() => sessionStorage.removeItem('selection'));
  await page.getByPlaceholder('Nom ou numéro').fill('salamèche');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  await page.getByRole('button', { name: 'Ajouter Salamèche', exact: true }).click();
  await page.getByPlaceholder('Nom ou numéro').fill('carapuce');
  await page.getByRole('button', { name: 'Ajouter Carapuce', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).last().click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('button', { name: '♂ Mâle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: '♀✨ Femelle Shiny', exact: true }).click();
  await sheet.getByRole('button', { name: '♂ Mâle', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Mettre 4 entrées dans la sélection' })).toBeVisible();
});

test('search finds costumes by their name, and unreleased forms can be hidden', async ({ page }) => {
  const ds = await (await page.request.get('/api/data/pokedex.json')).json();
  const costume = ds.variants.find((v: any) => v.kind === 'costume' && !v.datamined && v.label?.fr && /^[A-Za-zÀ-ÿ ]{6,}$/.test(v.label.fr));
  const word = costume.label.fr.split(' ').sort((a: string, b: string) => b.length - a.length)[0];
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill(word);
  await expect(page.getByRole('button', { name: new RegExp(`^Ajouter .*${word}`, 'i') }).first()).toBeVisible();

  // Hiding what is not out yet.
  await page.getByPlaceholder('Nom ou numéro').fill('');
  const released = new Set(ds.species.filter((x: any) => x.released).map((x: any) => x.dex));
  const unreleased = ds.variants.find((v: any) => v.datamined && v.label && !v.gender && released.has(v.dex));
  const sp = ds.species.find((s: any) => s.dex === unreleased.dex);
  // Precise enough to bring the card among the first ones built (long grids build the rest as they scroll in).
  const label = unreleased.label.fr ?? unreleased.label.en;
  await page.getByPlaceholder('Nom ou numéro').fill(`${sp.name.fr ?? sp.name.en} ${label}`);
  const card = page.getByRole('button', { name: `Ajouter ${sp.name.fr ?? sp.name.en} ${label}`, exact: true });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Masquer les non sortis' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: /^Voir / }).click();
  await expect(card).toHaveCount(0);
});

test('a manager marks several cards "shiny not out" at once from the multi-select', async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.9.1' } });
  const page = await ctx.newPage();
  await adminLogin(page.request);
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('bulbizarre');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  await page.getByRole('button', { name: 'Ajouter Bulbizarre', exact: true }).click();
  await page.getByPlaceholder('Nom ou numéro').fill('salamèche');
  await page.getByRole('button', { name: 'Ajouter Salamèche', exact: true }).click();
  await page.getByRole('button', { name: 'Gérer', exact: true }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Shiny pas sorti' }).click();
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('2 cartes mises à jour')).toBeVisible();
  const o = (await (await page.request.get('/api/overrides')).json()).overrides.filter((x: { variantKey: string }) => x.variantKey === '1' || x.variantKey === '4');
  expect(o.map((x: { shinyReleased: boolean }) => x.shinyReleased)).toEqual([false, false]);
  await page.request.patch('/api/overrides', { data: { keys: ['1', '4'], shinyReleased: null } });
  await ctx.close();
});

test('long grids build more cards as they scroll in', async ({ page }) => {
  await page.goto('/dex');
  await page.getByPlaceholder('Nom ou numéro').fill('pikachu');
  const cards = page.locator('main ul > li button[aria-label^="Ajouter Pikachu"]');
  await expect(cards.first()).toBeVisible();
  const first = await cards.count();
  expect(first).toBeLessThanOrEqual(60);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 4000);
  await expect.poll(() => cards.count()).toBeGreaterThan(first);
});

test('game tools: counters for any Pokémon, power-up and trade costs, buddy distances', async ({ page }) => {
  await page.goto('/game?tab=tools');
  // Counters against Mewtwo, picked by name.
  await page.getByRole('searchbox', { name: 'Choisir un Pokémon' }).fill('mewtwo');
  await page.getByRole('button', { name: /^#150 Mewtwo/ }).click();
  const counters = page.getByRole('region', { name: 'Contres de Mewtwo' });
  await expect(counters.getByRole('listitem')).toHaveCount(12);
  await expect(counters.getByText(/Ailes de l’Aurore/)).toBeVisible();
  // Progress bars never overflow 100% and never trigger horizontal scroll inside the sheet.
  const overflow = await counters.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflow).toBe(false);
  await expect(page.getByRole('link', { name: 'Voir sa fiche dans le Pokédex' })).toHaveAttribute('href', '/dex/150');
  await expect(counters.getByText('Faible contre')).toBeVisible();
  // They open over the page; closed to go on.
  await page.keyboard.press('Escape');
  await expect(counters).toHaveCount(0);
  // Special evolutions: the full moon group open, with its next dates; the task group shows the game's words.
  await page.getByRole('button', { name: 'Évolutions spéciales' }).click();
  await expect(page.getByText('Prochaines pleines lunes (heure de ton téléphone)')).toBeVisible();
  await page.getByRole('button', { name: /Avec un objectif à remplir/ }).click();
  await expect(page.getByText(/Fais 10\s+Excellents lancers/)).toBeVisible();
  await expect(page.getByText(/Gagne 70\s+cœurs avec ton copain/)).toBeVisible();
  // Random multi-outcome evolutions (Eevee, Cherubi, Clamperl…) and Tyrogue by HP.
  await page.getByRole('button', { name: /Au hasard/ }).click();
  await expect(page.getByText(/Ceribou → Ceriflor/).first()).toBeVisible();
  await expect(page.getByText(/Évoli → Aquali/)).toBeVisible();
  await page.getByRole('button', { name: /Selon ses IV/ }).click();
  await expect(page.getByText(/si les PV sont son meilleur IV/)).toBeVisible();
  // Searching opens the groups with a match.
  await page.getByRole('searchbox', { name: 'Chercher un Pokémon dans les évolutions' }).fill('sepiatop');
  await expect(page.getByText(/téléphone tenu à l’envers/)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Chercher un Pokémon dans les évolutions' }).fill('');
  // Power-up and trade costs.
  await page.getByRole('button', { name: 'Coûts', exact: true }).click();
  await expect(page.getByText('Poussière pour un échange')).toBeVisible();
  await expect(page.getByRole('cell', { name: /^1\s000\s000$/ })).toBeVisible();
  // Buddy distances.
  await page.getByRole('button', { name: 'Distance copain' }).click();
  await page.getByRole('searchbox', { name: 'Choisir un Pokémon' }).fill('pikachu');
  await page.getByRole('button', { name: /^#25 Pikachu/ }).first().click();
  await expect(page.getByText('1 km', { exact: true }).first()).toBeVisible();
});

test("a Pokémon's page tells how it evolves and how it is evolved into", async ({ page }) => {
  await page.goto('/dex/217');
  const card = page.getByRole('region', { name: 'Évolution' });
  await expect(card.getByText(/pendant la pleine lune/)).toBeVisible();
  await expect(card.getByText(/Prochaine pleine lune :/)).toBeVisible();
  await page.goto('/dex/216');
  await expect(page.getByRole('region', { name: 'Évolution' }).getByText(/Teddiursa → Ursaring/)).toBeVisible();
});

test('back from a Pokémon, the Pokédex is where it was: same search, same place down the list', async ({ page }) => {
  await page.goto('/dex');
  // A search result opens the Pokémon; adding is the button under it.
  const search = page.getByPlaceholder('Nom ou numéro');
  await search.fill('pikachu');
  await page.getByRole('link', { name: /^Pikachu/ }).first().click();
  await expect(page).toHaveURL(/\/dex\/25$/);
  await page.goBack();
  await expect(search).toHaveValue('pikachu');
  await expect(page.getByRole('button', { name: /^Ajouter Pikachu/ }).first()).toBeVisible();
  // Far down the whole list, then back.
  await search.fill('');
  await page.getByRole('link', { name: 'Bulbizarre' }).first().waitFor();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(3000);
  // A card on screen, tapped where it is (no scrolling to it).
  const href = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('main li a[href^="/dex/"]')].find((a) => { const r = a.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 150; })?.getAttribute('href'));
  await page.locator(`main li a[href="${href}"]`).click();
  await expect(page).toHaveURL(/\/dex\/\d+$/);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 400);
});

test('Pokédex 1-tap Shiny, +family and range search, type/rarity filters, and species ♂/♀ + direct multi-select', async ({ page }) => {
  const { apiRegister } = await import('../fixtures.js');
  await apiRegister(page.request);
  const listId = (await (await page.request.post('/api/lists', { data: { name: 'Multi Direct' } })).json()).list.id;

  await page.goto('/dex');
  await expect(page.locator('main ul > li').first()).toBeVisible();

  // 1-tap Shiny chip right on the Pokédex bar.
  const shinyBtn = page.getByRole('button', { name: 'Shiny', exact: true });
  await shinyBtn.click();
  await expect(shinyBtn).toHaveAttribute('aria-pressed', 'true');
  await shinyBtn.click();

  // +family search shows the whole evolution family in stage order; clear button wipes the search.
  const search = page.getByPlaceholder('Nom ou numéro');
  await search.fill('+bulbizarre');
  await expect(page.getByRole('button', { name: 'Ajouter Bulbizarre', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter Herbizarre', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter Florizarre', exact: true })).toBeVisible();
  await search.fill('+pikachu');
  await expect(page.getByRole('button', { name: /^Ajouter Pichu/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ajouter Pikachu/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  await expect(search).toHaveValue('');

  // Dex range search "1-3" shows Bulbasaur, Ivysaur, Venusaur only.
  await search.fill('1-3');
  await expect(page.getByRole('button', { name: 'Ajouter Bulbizarre', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter Florizarre', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ajouter Salamèche/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();

  // Type + Rarity filters inside Filters sheet (Electric + Legendary -> Zapdos).
  await page.getByRole('button', { name: 'Filtres' }).click();
  const filters = page.locator('dialog[open]');
  await filters.getByRole('button', { name: 'Électrik', exact: true }).click();
  await filters.getByRole('button', { name: 'Légendaire', exact: true }).click();
  await filters.getByRole('button', { name: /^Voir / }).click();
  await expect(page.getByRole('link', { name: /Électhor/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Bulbizarre/ })).toHaveCount(0);

  // Species page: ♂/♀ preview switch + multi-select direct add into a collection without going through the basket.
  await page.goto('/dex/25');
  const femaleBtn = page.getByRole('button', { name: 'Femelle', exact: true });
  await femaleBtn.click();
  await expect(femaleBtn).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sélection multiple' }).click();
  await page.getByRole('button', { name: /^Ajouter Pikachu/ }).nth(0).click();
  await page.getByRole('button', { name: /^Ajouter Pikachu/ }).nth(1).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).last().click();
  const bulk = page.locator('dialog[open]');
  await bulk.getByLabel(/Multi Direct/).check();
  await bulk.getByRole('button', { name: /^Ajouter · \d+ sélectionnée/ }).click();
  await expect(page.getByText(/Ajouté à 1 collection/)).toBeVisible();

  const detail = (await (await page.request.get(`/api/lists/${listId}`)).json()).list;
  expect(detail.entries.length).toBeGreaterThanOrEqual(2);
});

test('PvP IV steppers/presets, battle swap, and Me profile stats + inline password error', async ({ page }) => {
  const { apiRegister } = await import('../fixtures.js');
  await apiRegister(page.request);

  // PvP IV stepper buttons & quick presets (Rang 1, 15/15/15) + link to Pokédex page.
  await page.goto('/pvp/184?a=0&d=15&s=14');
  await page.getByRole('button', { name: 'Augmenter PV' }).click();
  await expect(page).toHaveURL(/s=15/);
  await page.getByRole('button', { name: '15/15/15', exact: true }).click();
  await expect(page).toHaveURL(/a=15&d=15&s=15/);
  await expect(page.getByRole('link', { name: /Fiche Pokédex/ })).toHaveAttribute('href', '/dex/184');

  // Battle swap swaps sides A and B in the URL.
  await page.goto('/pvp/battle?l=great&a=184&b=308');
  await page.getByRole('button', { name: /Inverser/ }).click();
  await expect(page).toHaveURL(/a=308&b=184/);

  // Me page: copyable friend code, stats pill, new full-app theme picker, and inline error instead of native alert().
  await page.goto('/me');
  await expect(page.getByRole('link', { name: /0 collection/ })).toBeVisible();
  await page.getByRole('button', { name: 'Team Rocket' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-team', 'rocket');
  await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByLabel('Mot de passe actuel').fill('wrong-password');
  await sheet.getByLabel('Nouveau mot de passe', { exact: true }).fill('new-password-123');
  await sheet.getByLabel('Confirme le mot de passe').fill('new-password-123');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(sheet.getByRole('alert')).toBeVisible();
});

test('game eggs: unified distance filters, source explanations, search, and clean rarity tiers', async ({ page, context }) => {
  await context.route('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/eggs.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([
        { name: 'Bulbasaur', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm1.icon.png', eggType: '1 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 4 },
        { name: 'Charmander', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm4.icon.png', eggType: '1 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 4 },
        { name: 'Galarian Corsola', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm222.fGALARIAN.icon.png', eggType: '7 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
        { name: 'Hisuian Sneasel', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm215.fHISUIAN.icon.png', eggType: '7 km', isAdventureSync: false, isRegional: false, isGiftExchange: true, canBeShiny: true, rarity: 1 },
        { name: 'White-Striped Basculin', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm550.fWHITE_STRIPED.icon.png', eggType: '7 km', isAdventureSync: false, isRegional: false, isGiftExchange: true, canBeShiny: false, rarity: 4 },
        { name: 'Riolu', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm447.icon.png', eggType: '5 km', isAdventureSync: true, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
      ]),
    }),
  );
  await page.goto('/game?tab=eggs');
  // 1 km pool has a single rarity tier -> no cluttered tier header inside it, clear daily source subtitle.
  await expect(page.getByText('Œuf quotidien (incubateur d’aventure)')).toBeVisible();
  // Tapping 7 km shows BOTH friend gifts and Mateo Routes together, with mixed rarity tiers clearly labeled.
  await page.getByRole('button', { name: '7 km', exact: true }).click();
  await expect(page.getByText('Cadeaux d’amis')).toBeVisible();
  await expect(page.getByText('Échange de cadeau avec Mateo en fin de Route')).toBeVisible();
  await expect(page.getByText('Très fréquent')).toBeVisible();
  await expect(page.getByText('Rare', { exact: true })).toBeVisible();
  // Reset distance filter and verify Adventure Sync French label + search across all egg pools.
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await expect(page.getByText(/5 km · Suivi d’exploration/)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Chercher un Pokémon dans les œufs' }).fill('riolu');
  await expect(page.getByText('Riolu')).toBeVisible();
  await expect(page.getByText('Bulbizarre')).toHaveCount(0);
});

test('startup page picker in Me redirects / to the chosen tab or last collection', async ({ page }) => {
  const { apiRegister } = await import('../fixtures.js');
  await apiRegister(page.request);
  const listId = (await (await page.request.post('/api/lists', { data: { name: 'Ma chasse' } })).json()).list.id;

  await page.goto('/me');
  const group = page.getByRole('radiogroup', { name: 'Page au démarrage' });
  await expect(group.getByRole('button', { name: 'Pokédex', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'Jeu', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Jeu', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/');
  await expect(page).toHaveURL(/\/game$/);

  await page.goto(`/lists/${listId}`);
  await expect(page.getByRole('heading', { name: 'Ma chasse' })).toBeVisible();
  await page.goto('/me');
  await page.getByRole('radiogroup', { name: 'Page au démarrage' }).getByRole('button', { name: 'Dernière collection', exact: true }).click();
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));
});

test('My hunts matches exact variants (never Gigantamax/Galarian false positives) and obeys per-list pre-evolution toggle', async ({ page, context }) => {
  const { apiRegister } = await import('../fixtures.js');
  await apiRegister(page.request);
  const listId = (await (await page.request.post('/api/lists', { data: { name: 'Strict Hunts' } })).json()).list.id;
  await page.request.put(`/api/lists/${listId}/entries`, {
    data: {
      entries: [
        { variantKey: '1', shiny: false, tag: '', done: false },
        { variantKey: '143.fGIGANTAMAX', shiny: false, tag: '', done: false },
        { variantKey: '52.fGIGANTAMAX', shiny: false, tag: '', done: false },
        { variantKey: '6', shiny: false, tag: '', done: false },
        { variantKey: '80.fMEGA', shiny: false, tag: '', done: false },
      ],
    },
  });

  await context.route('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/eggs.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([
        { name: 'Charmander', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm4.icon.png', eggType: '1 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
        { name: 'Slowpoke', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm79.icon.png', eggType: '2 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
        { name: 'Galarian Slowpoke', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm79.fGALARIAN.icon.png', eggType: '7 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
        { name: 'Galarian Meowth', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm52.fGALARIAN.icon.png', eggType: '7 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
        { name: 'Snorlax', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm143.icon.png', eggType: '10 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
      ]),
    }),
  );
  await context.route('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([
        {
          name: 'Grass Grunt',
          title: 'Team GO Rocket Grunt',
          type: 'grass',
          quote: 'Don’t tangle with us!',
          firstPokemon: [{ name: 'Bulbasaur', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm1.icon.png', types: ['grass', 'poison'], canBeShiny: true, isEncounter: true }],
          secondPokemon: [],
          thirdPokemon: [],
        },
      ]),
    }),
  );

  // Plain collections match Rocket encounters too (Bulbasaur in Grass Grunt).
  await page.goto('/game?tab=rocket');
  const rocketHunts = page.getByRole('button', { name: 'Mes chasses', exact: true });
  await expect(rocketHunts).toBeVisible();
  await rocketHunts.click();
  await expect(page.getByText('Sbire · Plante')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bulbizarre/ })).toBeVisible();

  // With pre-evolutions OFF: none of Charmander, Slowpoke, Galarian Meowth, or plain Snorlax match -> no "Mes chasses" chip.
  await page.goto('/game?tab=eggs');
  await expect(page.getByText('Miaouss de Galar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mes chasses', exact: true })).toHaveCount(0);

  // Enable per-list pre-evolution matching in the collection's Edit sheet and verify persistence across reload.
  await page.goto(`/lists/${listId}`);
  await page.getByRole('button', { name: 'Modifier' }).click();
  const sheet = page.locator('dialog[open]');
  const preEvoToggle = sheet.getByRole('button', { name: /Pré-évolutions dans Mes chasses et alertes/ });
  await expect(preEvoToggle).toHaveAttribute('aria-pressed', 'false');
  await preEvoToggle.click();
  await expect(preEvoToggle).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(sheet).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Modifier' }).click();
  await expect(page.locator('dialog[open]').getByRole('button', { name: /Pré-évolutions dans Mes chasses et alertes/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // Now Charmander (plain Charizard pre-evo) and Kanto Slowpoke (Mega Slowbro pre-evo) are wanted,
  // while Galarian Slowpoke, Galarian Meowth & plain Snorlax stay excluded!
  await page.goto('/game?tab=eggs');
  const myHunts = page.getByRole('button', { name: 'Mes chasses', exact: true });
  await expect(myHunts).toBeVisible();
  await myHunts.click();
  await expect(page.getByText('Salamèche')).toBeVisible();
  await expect(page.getByText('Ramoloss', { exact: true })).toBeVisible();
  await expect(page.getByText('Ramoloss de Galar')).toHaveCount(0);
  await expect(page.getByText('Miaouss de Galar')).toHaveCount(0);
  await expect(page.getByText('Ronflex')).toHaveCount(0);
});

test('v1.3: Game "Pour moi" overview + countdowns, Collection stats, Trainer medals, Recent filter, and Saved PvP teams', async ({ page, context }) => {
  const { apiRegister } = await import('../fixtures.js');
  await apiRegister(page.request);
  const listId = (await (await page.request.post('/api/lists', { data: { name: 'Ma Gen 1-2' } })).json()).list.id;
  await page.request.put(`/api/lists/${listId}/entries`, {
    data: {
      entries: [
        { variantKey: '1', gender: 'm', shiny: false, tag: '', done: true },
        { variantKey: '4', gender: 'm', shiny: true, tag: '', done: true },
        { variantKey: '25', gender: 'm', shiny: false, tag: '', done: false },
        { variantKey: '143.fGIGANTAMAX', gender: '', shiny: false, tag: '', done: false },
        { variantKey: '152', gender: 'm', shiny: false, tag: '', done: false },
      ],
    },
  });

  // 1. Collection Stats sheet on ListPage.
  await page.goto(`/lists/${listId}`);
  await page.getByRole('button', { name: 'Statistiques', exact: true }).click();
  const statsSheet = page.locator('dialog[open]');
  await expect(statsSheet.getByText('40 %')).toBeVisible();
  await expect(statsSheet.getByText('Chromatiques')).toBeVisible();
  await expect(statsSheet.getByText('Kanto')).toBeVisible();
  await expect(statsSheet.getByText('Johto')).toBeVisible();
  await page.keyboard.press('Escape');

  // 2. Trainer Medals card & full sheet on MePage.
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Mes médailles' })).toBeVisible();
  await page.getByRole('button', { name: 'Voir toutes les médailles' }).click();
  const medalSheet = page.locator('dialog[open]');
  await expect(medalSheet.getByText('Chasse & profil')).toBeVisible();
  await expect(medalSheet.getByText('Régions du Pokédex')).toBeVisible();
  await medalSheet.getByRole('button', { name: /Kanto/ }).click();
  await expect(medalSheet.getByText(/Kanto · 2 \//)).toBeVisible();
  await page.keyboard.press('Escape');

  // 3. Pokédex "Sorties récentes" filter chip.
  await page.goto('/dex');
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Sorties récentes', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: /^Voir / }).click();
  await expect(page.getByRole('button', { name: 'Sorties récentes ✕' })).toBeVisible();

  // 4. Game "Pour moi" overview with live countdown badge on an active Gigantamax event + missing egg.
  const endSoon = new Date(Date.now() + 2 * 3600_000).toISOString();
  const startPast = new Date(Date.now() - 3600_000).toISOString();
  await context.route('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([
        { eventID: 'gmax-snorlax-live', name: 'Gigantamax Snorlax Max Battle Day', eventType: 'max-battles', heading: '', link: 'https://leekduck.com/', image: '', start: startPast, end: endSoon },
      ]),
    }),
  );
  await context.route('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/eggs.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([
        { name: 'Pikachu', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.icon.png', eggType: '2 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, canBeShiny: true, rarity: 1 },
      ]),
    }),
  );
  await page.goto('/game?tab=hunts');
  await expect(page.getByRole('tab', { name: 'Pour moi', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Fin dans /).first()).toBeVisible();
  await expect(page.getByText('Ronflex').first()).toBeVisible();
  await expect(page.getByText('Pikachu').first()).toBeVisible();

  // 5. PvP saved teams of 3: save, reload, load into slots, and delete.
  await page.goto('/pvp/team?l=great&p=184,308,227');
  await page.getByRole('button', { name: 'Enregistrer l’équipe' }).click();
  const saveSheet = page.locator('dialog[open]');
  await saveSheet.getByLabel('Nom de l’équipe').fill('Mon équipe S26');
  await saveSheet.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Équipe enregistrée')).toBeVisible();

  await page.goto('/pvp/team');
  await expect(page.getByRole('heading', { name: /^Mes équipes enregistrées/ })).toBeVisible();
  await page.getByRole('button', { name: 'Charger Mon équipe S26' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('p')).toBe('184,308,227');

  await page.getByRole('button', { name: 'Supprimer Mon équipe S26' }).click();
  await expect(page.getByText('Équipe supprimée')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Mes équipes enregistrées/ })).toHaveCount(0);
});

test('automatic Events tab renders multi-template infographics (Max Battle + Long Event) with French bonuses, raid tiers, GO Pass & tickets', async ({ page, context }) => {
  // Format startPast as 00:00:00 of the current day in Playwright's browser timezone (Europe/Paris) — matching ScrapedDuck's
  // local-time strings — so WeeklySchedule always puts it on "today" even when the CI host runs in UTC (e.g. 23:30 UTC = 00:30 Paris).
  const parisYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const startPast = `${parisYmd}T00:00:00`;
  const endSoon = new Date(Date.now() + 3 * 3600_000).toISOString();
  await context.route('**/api/game/events', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          {
            eventID: 'gmax-inteleon-e2e',
            name: 'Gigantamax Inteleon Max Battle Day',
            eventType: 'max-battles',
            heading: 'Max Battles',
            template: 'max',
            link: 'https://leekduck.com/events/gigantamax-inteleon/',
            image: '',
            start: startPast,
            end: endSoon,
            summary: 'Gigantamax Inteleon arrives!',
            bonuses: [
              { text: 'Max Particle collection limit increased to 1,600', image: 'https://cdn.leekduck.com/assets/img/bonuses/max-particles.png' },
              { text: 'Up to three Special Trades for the day', image: 'https://cdn.leekduck.com/assets/img/bonuses/special-trade.png' },
            ],
            highlights: [],
            featured: [{ name: 'Gigantamax Inteleon', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm818.fGIGANTAMAX.icon.png', canBeShiny: true, newShiny: true }],
            spawnGroups: [],
            raidGroups: [],
            eggGroups: [],
            research: [],
            researchNote: null,
            rocket: [],
            newShinies: [{ name: 'Gigantamax Inteleon', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm818.fGIGANTAMAX.icon.png', canBeShiny: true, newShiny: true }],
            moves: [],
            ticket: {
              title: 'Event Ticket',
              price: 'US$4.99',
              rewards: ['1 Max Mushroom', '25,000 XP', '6,400 Max Particles'],
              bonuses: [{ text: '2× XP from Max Battles', paid: true }],
            },
          },
          {
            eventID: 'mega-clefable-e2e',
            name: 'Clefable Super Mega Raid Day',
            eventType: 'raid-day',
            heading: 'Raid Day',
            template: 'raid_day',
            link: 'https://leekduck.com/events/clefable-super-mega-raid-day/',
            image: '',
            start: startPast,
            end: endSoon,
            summary: 'Mega Clefable makes its Pokémon GO debut during Clefable Super Mega Raid Day on Saturday, November 28, 2026, from 2:00 p.m. to 5:00 p.m. local time!',
            bonuses: [],
            highlights: [
              { kind: 'debut', title: 'Mega Clefable Debut', text: 'Mega Clefable, a Fairy- and Flying-type Pokémon, makes its Pokémon GO debut in Super Mega Raids!' },
              { kind: 'super_max', title: 'New Mega Level: Super Max', text: 'Mega Clefable can reach Super Max Level for the first time. Raise its Mega-Level to Max first, then use Clefable Mega-Energy to reach Super Max.' },
              { kind: 'move', title: 'Moonblast+', text: 'Mega Clefable will know the Charged Attack Moonblast+.' },
            ],
            featured: [{ name: 'Clefable', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm36.icon.png', canBeShiny: true }],
            spawnGroups: [],
            raidGroups: [],
            eggGroups: [],
            research: [],
            researchNote: null,
            rocket: [],
            newShinies: [],
            moves: [],
          },
          {
            eventID: 'champions-e2e',
            name: 'Pokémon Champions Celebration Event 2026',
            eventType: 'event',
            heading: 'Event',
            template: 'event',
            link: 'https://leekduck.com/events/champions/',
            image: '',
            start: startPast,
            end: endSoon,
            summary: null,
            bonuses: [
              { text: 'Increased chance to encounter Kecleon at PokéStops' },
              { text: '2× Candy for catching Pokémon', group: 'Tier 2 – Rank 10' },
              { text: 'GO Pass Deluxe: Receive up to two free Raid Passes per day from spinning Gym Photo Discs', group: 'Tier 3 – Rank 20', paid: true },
            ],
            highlights: [{ kind: 'background', title: 'Special Backgrounds', text: 'Pokémon from raids may have a Special Background.' }],
            featured: [],
            spawnGroups: [{ label: 'Spawns', mons: [{ name: 'Charmander', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm4.icon.png', canBeShiny: true }] }],
            raidGroups: [{ label: 'Five-Star Raids*', mons: [{ name: 'Latias', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm380.icon.png', canBeShiny: true }] }],
            eggGroups: [],
            research: [],
            researchNote: null,
            rocket: [],
            newShinies: [],
            moves: [],
            goPass: { title: 'GO Pass', price: 'US$4.99', freeRewards: ['Lucky Egg'], deluxeRewards: ['Premium Battle Pass'] },
          },
        ],
      }),
    }),
  );

  await context.route('**/api/game/promo-codes', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        codes: [
          { code: 'ADIDASxPOKEMON', title: 'adidas Shoes Avatar Item', description: 'adidas shoes', rewards: [], redeemUrl: 'https://store.pokemongo.com/offer-redemption?passcode=ADIDASxPOKEMON' },
          { code: 'CROCSxPIKACHU', title: 'Pikachu Clog', description: 'Pikachu clog', rewards: [], redeemUrl: 'https://store.pokemongo.com/offer-redemption?passcode=CROCSxPIKACHU' },
        ],
      }),
    }),
  );

  await page.goto('/game?tab=events');
  // Promo codes dropdown starts collapsed by default, expands on click, and supports hiding per-code or all with persistence.
  const promoToggle = page.getByRole('button', { name: /Codes promo actifs/ });
  await expect(promoToggle).toBeVisible();
  await expect(promoToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('ADIDASxPOKEMON')).toHaveCount(0);
  await promoToggle.click();
  await expect(promoToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Objet d’avatar : Chaussures adidas')).toBeVisible();
  await expect(page.getByText('ADIDASxPOKEMON')).toBeVisible();
  await page.getByRole('button', { name: 'Masquer ce code ADIDASxPOKEMON' }).click();
  await expect(page.getByText('ADIDASxPOKEMON')).toHaveCount(0);
  await expect(page.getByText('CROCSxPIKACHU')).toBeVisible();
  await page.getByRole('button', { name: 'Masquer', exact: true }).click();
  await expect(promoToggle).toHaveCount(0);
  await expect(page.getByText('🎁 2 codes promo masqués')).toBeVisible();
  await page.getByRole('button', { name: 'Réafficher' }).click();
  await expect(promoToggle).toBeVisible();

  // Weekly schedule ("Ma semaine") displays today's Gigantamax event right in the calendar
  const weekly = page.getByRole('region', { name: 'Ma semaine' });
  await expect(weekly).toBeVisible();
  await expect(weekly.getByRole('button', { name: /Journée Combat Gigamax : Lézargus/ }).first()).toBeVisible();

  // Gigantamax Max Battle Day card + full sheet
  const gmaxCard = page.locator('main ul button', { hasText: 'Journée Combat Gigamax : Lézargus' });
  await expect(gmaxCard).toBeVisible();
  await expect(gmaxCard.getByText('Limite de Particules Max portée à 1 600')).toBeVisible();
  await gmaxCard.click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByText('Jusqu’à 3 échanges spéciaux par jour')).toBeVisible();
  await expect(sheet.getByText('1 Champi Max')).toBeVisible();
  await expect(sheet.getByText('6 400 Particules Max')).toBeVisible();
  await expect(sheet.getByText('2× PX en Combats Max')).toBeVisible();
  // Export the event infographic as a real PNG image and as a real PDF, reusing page bonus icons via `/api/game/asset`!
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const proxiedUrls: string[] = [];
  await context.route('**/api/game/asset**', (route) => {
    const u = new URL(route.request().url()).searchParams.get('url');
    if (u) proxiedUrls.push(u);
    return route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng });
  });
  const [pngDl] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: /Image PNG/ }).click(),
  ]);
  expect(pngDl.suggestedFilename()).toMatch(/\.png$/);
  expect(proxiedUrls).toContain('https://cdn.leekduck.com/assets/img/bonuses/max-particles.png');
  expect(proxiedUrls).toContain('https://cdn.leekduck.com/assets/img/bonuses/special-trade.png');
  const [pdfDl] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: /PDF/ }).click(),
  ]);
  expect(pdfDl.suggestedFilename()).toMatch(/\.pdf$/);
  await page.keyboard.press('Escape');

  // Super Mega Raid Day promotes Clefable to Méga-Mélodelfe with Fée + Vol types and French move/highlight texts!
  const megaCard = page.locator('main ul button', { hasText: 'Super Journée de Méga-Raids : Mélodelfe' });
  await expect(megaCard).toBeVisible();
  await megaCard.click();
  const megaSheet = page.locator('dialog[open]');
  await expect(megaSheet.getByText('Méga-Mélodelfe', { exact: true })).toBeVisible();
  await expect(megaSheet.getByText('Fée', { exact: true })).toBeVisible();
  await expect(megaSheet.getByText('Vol', { exact: true })).toBeVisible();
  await expect(megaSheet.getByText('Début de Méga-Mélodelfe')).toBeVisible();
  await expect(megaSheet.getByText('Nouveau niveau Méga : Super Max')).toBeVisible();
  await expect(megaSheet.getByText('Pouvoir Lunaire +', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // Long event card + full sheet (Kecleon bonus, Raid 5★, GO Pass Deluxe, Special Background in French)
  const longCard = page.locator('main ul button', { hasText: 'Pokémon Champions Celebration Event 2026' });
  await expect(longCard).toBeVisible();
  await longCard.click();
  const sheet2 = page.locator('dialog[open]');
  await expect(sheet2.getByText('Chances accrues de rencontrer Kecleon aux PokéStops')).toBeVisible();
  await expect(sheet2.getByText('Les Pokémon obtenus en raids peuvent avoir un Fond spécial.')).toBeVisible();
  await expect(sheet2.getByText('Raids 5★')).toBeVisible();
  await expect(sheet2.getByText('Palier 2 · Rang 10')).toBeVisible();
  await expect(sheet2.getByText('Passe de combat premium')).toBeVisible();
  await page.keyboard.press('Escape');

  // Weekly schedule ("Ma semaine") also exports a real PNG poster!
  await weekly.getByRole('button', { name: /Partager \/ PDF/ }).click();
  const weekSheet = page.locator('dialog[open]');
  const [weekPngDl] = await Promise.all([
    page.waitForEvent('download'),
    weekSheet.getByRole('button', { name: /Image PNG/ }).click(),
  ]);
  expect(weekPngDl.suggestedFilename()).toMatch(/^ma-semaine-.*\.png$/);
});

test('admin panel upgrades: overrides manager, health runtime + push test, user search/filters, audit search', async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.1' } });
  const page = await ctx.newPage();
  await adminLogin(page.request);
  // Seed a temporary override on Bulbasaur so the Overrides tab has an active entry to inspect & reset.
  await page.request.put('/api/overrides/1', { data: { shinyReleased: false } });

  await page.goto('/admin?tab=overrides');
  await expect(page.getByRole('link', { name: /Bulbizarre/ })).toBeVisible();
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).first().click();
  await expect(page.getByText('Annulé')).toBeVisible();

  await page.getByRole('tab', { name: 'Santé' }).click();
  await expect(page.getByText('Mémoire API')).toBeVisible();
  await expect(page.getByText('Fiches événements (Leek Duck)')).toBeVisible();
  await page.getByRole('button', { name: /Tester les push sur mon appareil/ }).click();
  await expect(page.getByText(/Aucun appareil abonné|Notification envoyée/)).toBeVisible();

  await page.getByRole('tab', { name: 'Comptes' }).click();
  await page.getByRole('button', { name: 'Staff', exact: true }).click();
  await expect(page.getByRole('button', { name: /admin/i }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Journal' }).click();
  await page.getByPlaceholder(/Filtrer le journal/).fill('override');
  await expect(page.locator('main ul li').first()).toBeVisible();

  await ctx.close();
});

test('desktop & mobile responsive layout: zero overflow and all Game tabs/filters clickable on desktop', async ({ page }) => {
  await apiRegister(page.request);

  // Desktop 1280×800: wide layout, all 9 Game tabs visible without clipping, zero sideways overflow.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ['/dex', '/lists', '/game', '/game?tab=raids', '/pvp', '/friends', '/friends?tab=add', '/me']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `desktop overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await page.goto('/game');
  for (const name of ['Événements', 'Pour moi', 'Raids', 'Pops', 'Dynamax', 'Rocket', 'Études', 'Œufs', 'Outils']) {
    const tab = page.getByRole('tab', { name, exact: true });
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box, `tab ${name} bounding box`).not.toBeNull();
    expect(box!.x + box!.width, `tab ${name} fits in desktop viewport`).toBeLessThanOrEqual(1280);
  }
  // Mobile 360×780: zero sideways overflow on every main page, including weekly calendar in Game > Events.
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/dex', '/lists', '/game', '/friends', '/friends?tab=add', '/me']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `mobile overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test('skippable per-page guided tutorials & ? help sheet across pages', async ({ page }) => {
  await apiRegister(page.request);
  // Complete welcome tour with page guides enabled (default on).
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Plus tard' }).click();
  await page.getByRole('button', { name: 'Plus tard' }).click();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page).toHaveURL(/\/dex$/);

  // Auto guide banner appears on Pokédex, supports stepping and skipping.
  const dexGuide = page.getByRole('complementary', { name: 'Guide rapide · Pokédex' });
  await expect(dexGuide).toBeVisible();
  await expect(dexGuide.getByText('Étape 1 / 4')).toBeVisible();
  await dexGuide.getByRole('button', { name: 'Suivant' }).click();
  await expect(dexGuide.getByText('Étape 2 / 4')).toBeVisible();
  await dexGuide.getByRole('button', { name: 'Passer', exact: true }).click();
  await expect(dexGuide).toBeHidden();

  // Navigating to Game shows the Game guide; "Passer tous les tutos" disables remaining pages.
  await page.goto('/game');
  const gameGuide = page.getByRole('complementary', { name: 'Guide rapide · Jeu' });
  await expect(gameGuide).toBeVisible();
  await gameGuide.getByRole('button', { name: 'Passer tous les tutos' }).click();
  await expect(gameGuide).toBeHidden();

  // Friends no longer auto-shows the banner, but the "?" button in TopBar opens the interactive guide sheet anytime.
  await page.goto('/friends');
  await expect(page.getByRole('complementary', { name: /Guide rapide/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Guide de cette page' }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('heading', { name: /Guide · Amis/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Pokédex', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Recherche puissante' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Re-enabling guides from Me brings the auto guide back.
  await page.goto('/me');
  await page.getByRole('button', { name: 'Relancer sur chaque page' }).click();
  await expect(page.getByRole('complementary', { name: 'Guide rapide · Moi & Réglages' })).toBeVisible();
});

test('power-up cost calculator matches exact Pokémon GO per-step rounding (Shadow, Purified, Lucky)', async ({ page }) => {
  await page.goto('/game?tab=tools');
  await page.getByRole('button', { name: 'Coûts' }).click();
  await page.getByRole('button', { name: '40 → 50' }).click();
  const dl = page.locator('dl').first();
  await expect(dl).toContainText('250');
  await expect(dl).toContainText('296');

  await page.getByRole('button', { name: 'Obscur', exact: true }).click();
  await expect(dl).toContainText('300');
  await expect(dl).toContainText('360');

  await page.getByRole('button', { name: 'Purifié', exact: true }).click();
  await expect(dl).toContainText('225');
  await expect(dl).toContainText('272');

  await page.getByRole('button', { name: 'Chanceux purifié', exact: true }).click();
  await expect(dl).toContainText('112');
  await expect(dl).toContainText('272');

  await page.getByRole('button', { name: '20 → 40' }).click();
  await page.getByRole('button', { name: 'Obscur', exact: true }).click();
  await expect(dl).toContainText('270');
  await expect(dl).toContainText('312');
});

test('managers can remove a bogus variant from the Pokédex and restore it', async ({ page }) => {
  await adminLogin(page.request);
  const ds = (await (await page.request.get('/api/data/pokedex.json')).json()) as {
    variants: { key: string; dex: number; kind: string; label?: { fr?: string; en: string } | null }[];
  };
  // Pick a Pokémon with a clear single-word costume variant (e.g. Bulbasaur, Charmander or Squirtle).
  const target = ds.variants.find((v) => v.dex <= 20 && v.kind === 'costume' && !v.key.endsWith('.g2') && v.label?.en)!;
  expect(target).toBeTruthy();
  const label = target.label!.fr ?? target.label!.en;

  await page.goto(`/dex/${target.dex}`);
  const card = page.locator('li', { hasText: label }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Gérer/ }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: /Maintenir pour supprimer du Pokédex/ }).click({ delay: 1500 });
  await expect(page.getByText('Variante supprimée du Pokédex')).toBeVisible();

  // Variant disappears from the species list and appears inside the collapsible removed-variants panel.
  const details = page.locator('details', { hasText: /variante.*supprimée/ });
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details).toContainText(target.key);
  await details.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByText('Variante restaurée dans le Pokédex')).toBeVisible();
  await expect(page.locator('li', { hasText: label }).first()).toBeVisible();
});
