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
  test('every section renders', async ({ page }) => {
    await page.goto('/game');
    await expect(page.getByText(/Raids \d étoiles|Impossible de charger/).first()).toBeVisible({ timeout: 20_000 });
    for (const tab of ['Dynamax', 'Événements', 'Études', 'Œufs']) {
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
  for (const gone of ['778.fBUSTED', '877.fHANGRY', '845.fGULPING', '845.fGORGING', '681.fBLADE', '555.fZEN']) expect(keys.has(gone), gone).toBe(false);
  for (const kept of ['778.fDISGUISED', '877.fFULL_BELLY', '845', '681.fSHIELD']) expect(keys.has(kept), kept).toBe(true);
  for (const dup of ['854', '855', '888', '889', '877', '982', '1012']) expect(keys.has(dup), dup).toBe(false);
  expect(ds.aliases['778.fBUSTED']).toBe('778.fDISGUISED');
});
