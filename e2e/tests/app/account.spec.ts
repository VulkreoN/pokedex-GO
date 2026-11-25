import { PASSWORD, adminLogin, apiCreateList, apiRegister, clipboard, expect, test, uiLogin, uniq } from '../fixtures.js';

test('a new player signs up, builds a list, copies it for the game and shares it', async ({ page, browser }) => {
  const username = uniq('player');

  // Sign up through the UI.
  await page.goto('/login');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Pseudo').fill(username);
  const pw = page.getByLabel('Mot de passe', { exact: true });
  await pw.fill(PASSWORD);
  // What was typed can be shown, and the password is asked twice.
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Afficher le mot de passe' }).first().click();
  await expect(pw).toHaveAttribute('type', 'text');
  await page.getByLabel('Confirme le mot de passe').fill(`${PASSWORD}x`);
  await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer un compte' }).last()).toBeDisabled();
  await page.getByLabel('Confirme le mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  // A new account starts with the welcome tour; skipping it leads to the Pokédex.
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(page).toHaveURL(/\/dex$/);

  // Create a list.
  await page.getByRole('link', { name: 'Collections' }).click();
  await page.getByRole('button', { name: 'Nouvelle collection' }).first().click();
  await page.getByLabel('Nom').fill('Shinies à chasser');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByText('Shinies à chasser')).toBeVisible();

  // Add Pikachu, normal and shiny, from its page.
  await page.goto('/dex/25');
  await page.getByRole('button', { name: /^Ajouter Pikachu/ }).first().click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: /^Normal \+ shiny|^Les deux|Normal ♂♀/ }).first().click().catch(() => {});
  await sheet.getByRole('checkbox').first().check();
  await sheet.getByRole('button', { name: /^Ajouter · / }).click();
  await expect(page.getByText(/Ajouté à 1 collection/)).toBeVisible();

  // The list shows the entries and builds the in-game search.
  await page.goto('/lists');
  await page.getByText('Shinies à chasser').click();
  await expect(page.getByText(/\d+ \/ \d+ attrapés/)).toBeVisible();
  await page.getByRole('button', { name: 'Copier pour le jeu' }).click();
  const strings = page.locator('dialog[open]');
  await expect(strings).toContainText('25');
  await strings.getByRole('button', { name: 'Copier', exact: true }).first().click();
  expect(await clipboard(page)).toContain('25');
  await page.keyboard.press('Escape');

  // Share by link; a logged-out visitor can read it.
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Copier le lien' }).click();
  const link = page.locator('dialog[open] code');
  await expect(link).toContainText('/s/');
  const url = (await link.textContent())!;
  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto(url.replace(/^https?:\/\/[^/]+/, test.info().project.use.baseURL!));
  await expect(vp.getByText('Shinies à chasser')).toBeVisible();

  // Making it private cuts the link.
  await page.locator('dialog[open]').getByText('Moi seulement').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Enregistrer' }).click();
  await vp.reload();
  await expect(vp.getByText('Shinies à chasser')).toHaveCount(0);
  await visitor.close();
});

test('a player changes their password, logs back in, then deletes the account', async ({ page }) => {
  const user = await apiRegister(page.request);
  await page.goto('/me');
  await expect(page.getByText(user.username)).toBeVisible();

  await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByLabel('Mot de passe actuel').fill(PASSWORD);
  await sheet.getByLabel('Nouveau mot de passe').fill('a-brand-new-one');
  await sheet.getByLabel('Confirme le mot de passe').fill('a-brand-new-one');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Mot de passe changé')).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Pseudo').fill(user.username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText('Pseudo ou mot de passe incorrect.')).toBeVisible();
  await uiLogin(page, user.username, 'a-brand-new-one');

  await page.goto('/me');
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await page.locator('dialog[open]').getByLabel('Mot de passe', { exact: true }).fill('a-brand-new-one');
  await page.locator('dialog[open]').getByRole('button', { name: /Supprimer/ }).last().click();
  await expect(page).toHaveURL(/\/(login|dex)$/);
  const again = await page.request.post('/api/auth/login', { data: { username: user.username, password: 'a-brand-new-one' } });
  expect(again.status()).toBe(401);
});

test('friends add each other by code and see each other’s lists', async ({ browser }) => {
  const a = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.1.1' } });
  const b = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.1.2' } });
  const pa = await a.newPage();
  const pb = await b.newPage();
  for (const p of [pa, pb]) p.on('dialog', (d) => void d.accept());
  const ua = await apiRegister(pa.request, uniq('ash'));
  const ub = await apiRegister(pb.request, uniq('misty'));
  await apiCreateList(pa.request, 'Ma collection Kanto', ['1:m', '4:m', '7:m']);

  await pb.goto('/friends');
  await pb.getByPlaceholder('Code ami à 12 chiffres').fill(ua.friendCode);
  await pb.getByRole('button', { name: 'Envoyer' }).click();
  await expect(pb.getByRole('listitem').getByText(`Demande envoyée à ${ua.username}`)).toBeVisible();

  await pa.goto('/friends');
  await pa.getByRole('button', { name: 'Accepter' }).click();
  await expect(pa.getByText(ub.username)).toBeVisible();

  await pb.reload();
  await pb.getByText(ua.username).click();
  await pb.getByText('Ma collection Kanto').click();
  await expect(pb.getByText('0 / 3 attrapés')).toBeVisible();
  await expect(pb.getByRole('button', { name: 'Copier cette collection chez moi' })).toBeVisible();

  await pb.goto('/friends');
  await expect(pb.getByText(/^1 collection · ami depuis /)).toBeVisible();
  // Removing a friend: from the friend's menu, asked twice.
  await pb.getByRole('button', { name: `Options pour ${ua.username}` }).click();
  await pb.locator('dialog[open]').getByRole('button', { name: 'Retirer' }).click();
  await pb.locator('dialog[open]').getByRole('button', { name: `Confirmer : retirer ${ua.username}` }).click();
  await expect(pb.getByText("Pas encore d'amis. Échange ton code pour voir leurs collections.")).toBeVisible();
  await a.close();
  await b.close();
});

test('an admin issues a reset code that lets a player choose a new password', async ({ browser }) => {
  const adminCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.2.1' } });
  const playerCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.2.2' } });
  const admin = await adminCtx.newPage();
  const player = await playerCtx.newPage();
  // ADMIN_USERNAMES=e2eadmin on the test API makes this account admin.
  await adminLogin(admin.request);
  const target = await apiRegister(player.request, uniq('forgetful'));
  await player.request.post('/api/auth/logout');

  await admin.goto('/me');
  await admin.getByRole('link', { name: /Panneau admin/ }).click();
  await admin.getByRole('tab', { name: 'Comptes' }).click();
  await admin.getByPlaceholder('Chercher un pseudo').fill(target.username);
  await admin.getByRole('button', { name: new RegExp(target.username) }).click();
  const sheet = admin.locator('dialog[open]');
  // Promote to manager and back, from the account's sheet.
  await sheet.getByRole('button', { name: 'Gérant' }).click();
  await expect(sheet.getByRole('button', { name: 'Gérant' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Dresseur' }).click();
  await expect(sheet.getByRole('button', { name: 'Dresseur' })).toHaveAttribute('aria-pressed', 'true');

  await sheet.getByRole('button', { name: 'Code de réinit.' }).click();
  const issued = sheet.locator('code');
  await expect(issued).toHaveText(/[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/);
  const code = (await issued.textContent())!.trim();

  await player.goto('/login');
  await player.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
  await player.getByLabel('Pseudo').fill(target.username);
  await player.getByLabel('Code').fill('0000-0000-0000');
  await player.getByLabel('Nouveau mot de passe').fill('fresh-password-9');
  await player.getByLabel('Confirme le mot de passe').fill('fresh-password-9');
  await player.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(player.getByText('Code invalide ou expiré.')).toBeVisible();
  await player.getByLabel('Code').fill(code);
  await player.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(player).toHaveURL(/\/dex$/);

  // The journal says who gave the code, never the password.
  await admin.goto('/admin?tab=audit');
  await admin.getByRole('button', { name: 'Comptes', exact: true }).click();
  await expect(admin.getByText(new RegExp(`^${target.username} a réinitialisé son mot de passe avec le code donné par `))).toBeVisible();
  await expect(admin.getByText(`${target.username} a créé son compte`, { exact: true })).toBeVisible();

  // Suspended with a reason: on the account and in the journal; renamed from the same sheet.
  await admin.goto('/admin?tab=users');
  await admin.getByPlaceholder('Chercher un pseudo').fill(target.username);
  await admin.getByRole('button', { name: new RegExp(target.username) }).click();
  await sheet.getByRole('button', { name: 'Suspendre', exact: true }).click();
  await sheet.getByLabel('Motif (noté dans le journal)').fill('Spam de demandes');
  await sheet.getByRole('button', { name: 'Suspendre le compte' }).click();
  await expect(sheet.getByText('« Spam de demandes »')).toBeVisible();
  const renamed = uniq('renamed');
  await sheet.getByLabel('Pseudo').fill(renamed);
  await sheet.getByRole('button', { name: 'Renommer', exact: true }).click();
  await expect(admin.getByText('Renommé', { exact: true })).toBeVisible();
  await admin.keyboard.press('Escape');
  await admin.goto('/admin?tab=audit');
  await expect(admin.getByText('Motif : « Spam de demandes »')).toBeVisible();
  await expect(admin.getByText(new RegExp(`a renommé le compte ${target.username} en ${renamed}`))).toBeVisible();

  await adminCtx.close();
  await playerCtx.close();
});

test('a manager marks a datamined variant released from its card, for everyone', async ({ browser }) => {
  const adminCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.3.1' } });
  const mgrCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.3.2' } });
  const admin = await adminCtx.newPage();
  const mgr = await mgrCtx.newPage();
  await adminLogin(admin.request);
  const m = await apiRegister(mgr.request, uniq('mgr'));
  expect((await admin.request.patch(`/api/users/${m.id}/role`, { data: { role: 'manager' } })).status()).toBe(200);

  const ds = await (await mgr.request.get('/api/data/pokedex.json')).json();
  // Not one the gender review test corrects at the same time (recent Pikachu costumes).
  const target = ds.variants.find((v: any) => v.datamined && v.kind === 'costume' && v.label && !v.gender && !v.gendersGuessed && v.dex !== 25);
  const sp = ds.species.find((s: any) => s.dex === target.dex);
  const cardName = `Ajouter ${sp.name.fr ?? sp.name.en} ${target.label.fr ?? target.label.en}`;
  const cardOf = (p: typeof mgr) => p.locator('li', { has: p.getByRole('button', { name: cardName, exact: true }) });

  await mgr.goto(`/dex/${target.dex}`);
  // First paint of a species with many forms, while other tests build PDFs and pictures: more time.
  await expect(cardOf(mgr).getByText('Pas encore sorti', { exact: true })).toBeVisible({ timeout: 20_000 });
  await cardOf(mgr).getByRole('button', { name: 'Gérer cette variante' }).click();
  const sheet = mgr.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Sortie', exact: true }).click();
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(mgr.getByText('Enregistré', { exact: true })).toBeVisible();

  // Everyone gets it: a logged-out visitor no longer sees the "not released" badge.
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  await visitor.goto(`/dex/${target.dex}`);
  await expect(cardOf(visitor)).toBeVisible();
  await expect(cardOf(visitor).getByText('Pas encore sorti', { exact: true })).toHaveCount(0);

  // Back to automatic.
  await cardOf(mgr).getByRole('button', { name: 'Gérer cette variante' }).click();
  await sheet.getByRole('button', { name: 'Automatique', exact: true }).first().click(); // release status (the second one is genders)
  // Saved before the visitor looks again (a busy machine could reload first and see the old state).
  const saved = mgr.waitForResponse((r) => /\/api\/overrides\//.test(r.url()) && ['PUT', 'DELETE'].includes(r.request().method()));
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  expect((await saved).ok()).toBe(true);
  await visitor.reload();
  await expect(cardOf(visitor).getByText('Pas encore sorti', { exact: true })).toBeVisible();
  await visitorCtx.close();
  await adminCtx.close();
  await mgrCtx.close();
});

test("a crash in a player's browser reaches the admins' error list", async ({ browser }) => {
  const playerCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.4.1' } });
  const adminCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.4.2' } });
  const player = await playerCtx.newPage();
  const admin = await adminCtx.newPage();
  const message = uniq('boom');
  await player.goto('/dex');
  await player.evaluate((m) => setTimeout(() => { throw new Error(m); }), message);
  await adminLogin(admin.request);
  await expect.poll(async () => (await admin.request.get('/api/client-errors')).text(), { timeout: 10_000 }).toContain(message);
  await admin.goto('/admin?tab=errors');
  await expect(admin.getByRole('heading', { name: 'Erreurs chez les joueurs' })).toBeVisible();
  await expect(admin.getByText(`Error: ${message}`, { exact: true })).toBeVisible();
  await playerCtx.close();
  await adminCtx.close();
});

test('admin panel: only for admins, an announcement reaches everyone, a report reaches the managers', async ({ browser }) => {
  const adminCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.5.1' } });
  const playerCtx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.5.2' } });
  const admin = await adminCtx.newPage();
  const player = await playerCtx.newPage();
  await adminLogin(admin.request);
  await apiRegister(player.request, uniq('rep'));

  // Not for players.
  await player.goto('/admin');
  await expect(player).toHaveURL(/\/me$/);
  await expect(player.getByRole('link', { name: /Panneau admin/ })).toHaveCount(0);

  await admin.goto('/admin');
  await expect(admin.getByText('comptes', { exact: true })).toBeVisible();
  await admin.getByRole('tab', { name: 'Santé' }).click();
  await expect(admin.getByText('Version en ligne')).toBeVisible();

  // An announcement shows on everyone's pages, and can be closed.
  await admin.getByRole('tab', { name: 'Annonces' }).click();
  const message = `Test ${uniq('annonce')}`;
  await admin.getByLabel('Message').fill(message);
  // Published before the player looks (a busy machine could open the page first).
  const published = admin.waitForResponse((r) => /\/api\/admin\/announcements$/.test(r.url()) && r.request().method() === 'POST');
  await admin.getByRole('button', { name: 'Publier' }).click();
  expect((await published).ok()).toBe(true);
  await player.goto('/dex');
  await expect(player.getByRole('status').getByText(message)).toBeVisible();
  await player.getByRole('button', { name: 'Fermer l’annonce' }).click();
  await expect(player.getByText(message)).toHaveCount(0);
  await admin.getByRole('button', { name: 'Retirer' }).first().click();

  // A player reports a mistake; it waits on the admin panel, gets handled, and the journal keeps it.
  await player.goto('/dex/25');
  await player.getByRole('button', { name: 'Signaler une erreur' }).click();
  const sheet = player.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Image' }).click();
  await sheet.getByLabel('Précise (facultatif)').fill('la casquette est floue');
  await sheet.getByRole('button', { name: 'Envoyer' }).click();
  await expect(player.getByText('Merci ! Un gérant va regarder.')).toBeVisible();
  await admin.goto('/admin?tab=reports');
  const report = admin.locator('li', { hasText: 'la casquette est floue' });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Traité' }).click();
  await expect(report).toHaveCount(0);
  await admin.getByRole('tab', { name: 'Journal' }).click();
  await expect(admin.getByText(/a traité un signalement sur Pikachu/).first()).toBeVisible();
  await adminCtx.close();
  await playerCtx.close();
});

test('the welcome tour: game language, a first list, friends, notifications; not shown again', async ({ page }) => {
  await apiRegister(page.request, uniq('new'));
  // An account that has not done the tour is offered to finish it on the Pokédex.
  await page.goto('/dex');
  await page.getByRole('link', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: /^Bienvenue/ })).toBeVisible();
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  expect(await page.evaluate(() => localStorage.getItem('gameLang'))).toBe('en');
  await page.getByRole('radio', { name: /Chanceux à échanger/ }).click();
  await page.getByRole('button', { name: 'Créer la collection' }).click();
  // The friend code of the game, now (or "Later").
  await expect(page.getByRole('heading', { name: 'Ton code ami' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plus tard' })).toBeVisible();
  const game = `7${Date.now()}`.slice(0, 12);
  await page.getByLabel('Code ami du jeu').fill(game);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Ajoute tes amis' })).toBeVisible();
  await expect(page.getByText(game.replace(/(\d{4})(?=\d)/g, '$1 '), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Terminer et ouvrir ma collection' }).click();
  await expect(page).toHaveURL(/\/lists\//);
  await expect(page.getByRole('heading', { name: 'Chanceux à échanger' })).toBeVisible();
  expect((await (await page.request.get('/api/auth/me')).json()).user.onboarded).toBe(true);
  await page.goto('/dex');
  await expect(page.getByRole('link', { name: 'Continuer' })).toHaveCount(0);
  // It can be replayed from Me.
  await page.goto('/me');
  await page.getByRole('link', { name: /Revoir la visite guidée/ }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});
