/**
 * API integration suite. Needs a running API on a FRESH database: the first account registered here must become admin.
 * Run through scripts/test-all.sh, or: API_URL=http://localhost:3100 pnpm --filter @mydexpogo/api test:int
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { isValidVariantKey, type Dataset } from '@mydexpogo/shared';
import { Client, PASSWORD, name, register } from './client.js';

let ds: Dataset;
let admin: Awaited<ReturnType<typeof register>>;
let alice: Awaited<ReturnType<typeof register>>;
let bob: Awaited<ReturnType<typeof register>>;
const anon = new Client();

beforeAll(async () => {
  // The dataset is built at API startup: wait for it.
  for (let i = 0; i < 90; i++) {
    const r = await anon.get('/data/pokedex.json');
    if (r.status === 200) {
      ds = r.body;
      break;
    }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  if (!ds) throw new Error('dataset never became ready');
  admin = await register(name('admin'));
  if (admin.user.role !== 'admin') throw new Error('the first account is not admin: the database is not fresh');
  alice = await register(name('alice'));
  bob = await register(name('bob'));
});

describe('health and errors', () => {
  it('answers health and returns JSON 404s', async () => {
    expect((await anon.get('/health')).body).toMatchObject({ ok: true, version: expect.any(String) });
    const r = await anon.get('/nope');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found' });
  });

  it('sends security headers', async () => {
    const r = await anon.get('/health');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});

describe('dataset', () => {
  it('serves a consistent Pokédex', () => {
    expect(ds.species.length).toBeGreaterThan(1000);
    expect(ds.variants.length).toBeGreaterThan(1500);
    const keys = ds.variants.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => !isValidVariantKey(k))).toEqual([]);
    const dexes = new Set(ds.species.map((s) => s.dex));
    expect(ds.variants.filter((v) => !dexes.has(v.dex))).toEqual([]);
    expect(ds.species.every((s) => s.name.en && s.types.length >= 1)).toBe(true);
    expect(ds.species.find((s) => s.dex === 25)?.name.fr ?? ds.species.find((s) => s.dex === 25)?.name.en).toBe('Pikachu');
  });

  it('ships PvP data whose evolutions all resolve', () => {
    const pvp = ds.pvp!;
    expect(pvp.cpm.length).toBeGreaterThanOrEqual(51);
    expect(pvp.pokemon.length).toBeGreaterThan(900);
    const keys = new Set(pvp.pokemon.map((p) => p.key));
    expect(keys.size).toBe(pvp.pokemon.length);
    const broken = pvp.pokemon.flatMap((p) => (p.evolutions ?? []).filter((k) => !keys.has(k)).map((k) => `${p.key}->${k}`));
    expect(broken).toEqual([]);
    expect(pvp.pokemon.every((p) => p.atk > 0 && p.def > 0 && p.sta > 0)).toBe(true);
  });

  it('uses ETags and never lets browsers keep a stale copy', async () => {
    const r = await anon.get('/data/pokedex.json');
    const etag = r.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect((await anon.get('/data/pokedex.json', { 'if-none-match': etag })).status).toBe(304);
  });

  it('serves the event archive and the freshness status', async () => {
    expect(Array.isArray((await anon.get('/data/events-archive.json')).body)).toBe(true);
    const s = (await anon.get('/data/status')).body;
    expect(s.version).toBe(ds.version);
    expect(Array.isArray(s.sources)).toBe(true);
  });
});

describe('accounts', () => {
  it('validates usernames and passwords', async () => {
    const c = new Client();
    expect((await c.post('/auth/register', { username: 'ab', password: PASSWORD })).status).toBe(400);
    expect((await c.post('/auth/register', { username: 'bad name!', password: PASSWORD })).status).toBe(400);
    expect((await c.post('/auth/register', { username: name('short'), password: '1234567' })).status).toBe(400);
  });

  it('gives later accounts the user role and refuses duplicate names, whatever the case', async () => {
    expect(alice.user.role).toBe('user');
    expect(alice.user.friendCode).toMatch(/^\d{12}$/);
    const r = await new Client().post('/auth/register', { username: alice.user.username.toUpperCase(), password: PASSWORD });
    expect(r.status).toBe(409);
  });

  it('settles simultaneous sign-ups with the same name: one account, the rest told it is taken', async () => {
    const username = name('race');
    const statuses = await Promise.all(Array.from({ length: 5 }, () => new Client().post('/auth/register', { username, password: PASSWORD }).then((r) => r.status)));
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
  });

  it('sets an HttpOnly, SameSite session cookie', async () => {
    const c = new Client();
    const r = await c.post('/auth/login', { username: alice.user.username, password: PASSWORD });
    const cookie = r.headers.getSetCookie().find((h) => h.startsWith('sid='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('logs in case-insensitively and rejects wrong credentials the same way', async () => {
    const c = new Client();
    expect((await c.post('/auth/login', { username: alice.user.username.toUpperCase(), password: PASSWORD })).status).toBe(200);
    const wrongPass = await new Client().post('/auth/login', { username: alice.user.username, password: 'wrong-password' });
    const noUser = await new Client().post('/auth/login', { username: name('ghost'), password: PASSWORD });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body).toEqual(noUser.body);
  });

  it('reports the current user, and nobody once logged out', async () => {
    const c = new Client();
    expect((await c.get('/auth/me')).body).toEqual({ user: null });
    await c.post('/auth/login', { username: bob.user.username, password: PASSWORD });
    const stolen = c.cookie;
    expect((await c.get('/auth/me')).body.user.username).toBe(bob.user.username);
    await c.post('/auth/logout');
    expect((await c.get('/auth/me')).body.user).toBeNull();
    // The old token is dead server side, not just forgotten by the client.
    const replay = new Client();
    replay.cookie = stolen;
    expect((await replay.get('/auth/me')).body.user).toBeNull();
  });

  it('changes the password and closes every other session', async () => {
    const u = await register(name('pw'));
    const other = new Client();
    await other.post('/auth/login', { username: u.user.username, password: PASSWORD });
    expect((await u.post('/auth/password', { current: 'nope-nope', password: 'new-password-1' })).status).toBe(401);
    expect((await u.post('/auth/password', { current: PASSWORD, password: 'short' })).status).toBe(400);
    expect((await u.post('/auth/password', { current: PASSWORD, password: 'new-password-1' })).status).toBe(200);
    expect((await u.get('/auth/me')).body.user.username).toBe(u.user.username);
    expect((await other.get('/auth/me')).body.user).toBeNull();
    expect((await new Client().post('/auth/login', { username: u.user.username, password: PASSWORD })).status).toBe(401);
    expect((await new Client().post('/auth/login', { username: u.user.username, password: 'new-password-1' })).status).toBe(200);
    expect((await u.del('/auth/me', { password: 'new-password-1' })).status).toBe(200);
  });

  it('resets a password with a one-time admin code', async () => {
    const u = await register(name('reset'));
    expect((await alice.post(`/users/${u.user.id}/reset-code`)).status).toBe(403);
    expect((await admin.post('/users/does-not-exist/reset-code')).status).toBe(404);
    const issued = await admin.post(`/users/${u.user.id}/reset-code`);
    expect(issued.status).toBe(200);
    const code: string = issued.body.code;
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

    const c = new Client();
    expect((await c.post('/auth/reset', { username: u.user.username, code: 'AAAA-BBBB-CCCC', password: 'brand-new-pass' })).status).toBe(401);
    expect((await c.post('/auth/reset', { username: name('ghost'), code, password: 'brand-new-pass' })).status).toBe(401);
    // Codes are accepted without dashes and in lower case.
    const ok = await c.post('/auth/reset', { username: u.user.username, code: code.replace(/-/g, '').toLowerCase(), password: 'brand-new-pass' });
    expect(ok.status).toBe(200);
    expect((await c.get('/auth/me')).body.user.username).toBe(u.user.username);
    expect((await u.get('/auth/me')).body.user).toBeNull(); // old session closed
    expect((await new Client().post('/auth/reset', { username: u.user.username, code, password: 'another-pass-1' })).status).toBe(401); // single use
    expect((await new Client().post('/auth/login', { username: u.user.username, password: PASSWORD })).status).toBe(401);
    expect((await c.del('/auth/me', { password: 'brand-new-pass' })).status).toBe(200);
  });

  it('deletes an account only with its password', async () => {
    const u = await register(name('bye'));
    expect((await u.del('/auth/me', { password: 'wrong-password' })).status).toBe(401);
    expect((await u.del('/auth/me', { password: PASSWORD })).status).toBe(200);
    expect((await new Client().post('/auth/login', { username: u.user.username, password: PASSWORD })).status).toBe(401);
  });

  it('rejects protected routes without a session', async () => {
    for (const p of ['/lists', '/friends', '/users', '/feed']) expect((await anon.get(p)).status, p).toBe(401);
    expect((await anon.post('/auth/password', { current: 'x', password: 'yyyyyyyy' })).status).toBe(401);
  });
});

describe('roles', () => {
  let manager: Awaited<ReturnType<typeof register>>;
  beforeAll(async () => {
    manager = await register(name('mgr'));
  });

  it('keeps admin pages for admins', async () => {
    expect((await alice.get('/users')).status).toBe(403);
    expect((await alice.post('/data/refresh')).status).toBe(403);
    const list = await admin.get('/users');
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(4);
    expect(list.body.users[0].role).toBe('admin');
  });

  it('searches and pages accounts', async () => {
    const r = await admin.get(`/users?q=${encodeURIComponent(alice.user.username.toUpperCase())}`);
    expect(r.body.users.map((u: any) => u.username)).toEqual([alice.user.username]);
    expect(r.body.total).toBe(1);
    expect((await admin.get('/users?q=%25')).status).toBe(200);
    expect((await admin.get('/users?offset=10000')).body.users).toEqual([]);
  });

  it('changes roles, but not your own', async () => {
    expect((await admin.patch(`/users/${admin.user.id}/role`, { role: 'user' })).status).toBe(400);
    expect((await admin.patch(`/users/${manager.user.id}/role`, { role: 'boss' })).status).toBe(400);
    expect((await admin.patch('/users/nobody/role', { role: 'manager' })).status).toBe(404);
    expect((await alice.patch(`/users/${manager.user.id}/role`, { role: 'admin' })).status).toBe(403);
    const r = await admin.patch(`/users/${manager.user.id}/role`, { role: 'manager' });
    expect(r.body).toEqual({ ok: true, role: 'manager' });
    expect((await manager.get('/auth/me')).body.user.role).toBe('manager'); // effective on the live session
    expect((await manager.get('/users')).status).toBe(403); // manager is not admin
  });

  it('lets managers mark a variant released, and the served dataset follows', async () => {
    const target = ds.variants.find((v) => v.datamined)!;
    expect(target).toBeTruthy();
    expect((await alice.put(`/overrides/${encodeURIComponent(target.key)}`, { released: true })).status).toBe(403);
    expect((await manager.put('/overrides/not..a..key', { released: true })).status).toBe(400);
    expect((await manager.put(`/overrides/${encodeURIComponent(target.key)}`, { released: true, label: { en: 'Test label', fr: 'Libellé test' } })).status).toBe(200);
    const after = (await anon.get('/data/pokedex.json')).body as Dataset;
    const v = after.variants.find((x) => x.key === target.key)!;
    expect(v.datamined).toBe(false);
    expect(v.label).toEqual({ en: 'Test label', fr: 'Libellé test' });
    const listed = (await anon.get('/overrides')).body.overrides.find((o: any) => o.variantKey === target.key);
    expect(listed.updatedBy).toBe(manager.user.username);

    expect((await manager.del(`/overrides/${encodeURIComponent(target.key)}`)).status).toBe(200);
    const restored = ((await anon.get('/data/pokedex.json')).body as Dataset).variants.find((x) => x.key === target.key)!;
    expect(restored.datamined).toBe(true);
  });

  it('opens the review queue to managers only', async () => {
    expect((await alice.get('/feed')).status).toBe(403);
    expect((await manager.get('/feed')).status).toBe(200);
    expect((await manager.post('/feed/poll')).status).toBe(403);
  });

  it('rejects invalid variant keys when applying a review item', async () => {
    const r = await manager.post('/feed/unknown-item/apply', { variantKeys: ['not a key'] });
    expect(r.status).toBe(400);
  });

  it('lets managers curate X posts, with URL checks', async () => {
    expect((await anon.get('/game/posts')).status).toBe(200);
    expect((await alice.post('/game/posts', { url: 'https://x.com/g47ix/status/1' })).status).toBe(403);
    expect((await manager.post('/game/posts', { url: 'https://evil.example/status/1' })).status).toBe(400);
  });
});

describe('lists', () => {
  let listId: string;
  // Genderless Pokémon: one entry per target, so the counts below stay simple (genders have their own tests).
  const keys = () => ds.variants.filter((v) => !v.datamined && v.genders?.length === 0).slice(0, 3).map((v) => v.key);

  it('creates a list with validation', async () => {
    expect((await alice.post('/lists', { name: '' })).status).toBe(400);
    expect((await alice.post('/lists', { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await alice.post('/lists', { name: 'Ok', visibility: 'public' })).status).toBe(400);
    expect((await alice.post('/lists', { name: 'Ok', visibility: 'link' })).status).toBe(400); // no longer a visibility
    const r = await alice.post('/lists', { name: 'Shinies à chasser', description: 'Test' });
    expect(r.status).toBe(201);
    expect(r.body.list.visibility).toBe('friends');
    listId = r.body.list.id;
  });

  it('adds entries, each gender / shiny / trait combination counting apart', async () => {
    const [a, b] = keys();
    const bg = Object.keys(ds.backgrounds ?? {})[0];
    const entries = [
      { variantKey: a, shiny: false },
      { variantKey: a, shiny: true },
      { variantKey: a, shiny: true, tag: 'lucky' },
      { variantKey: b, shiny: false, tag: bg ? `bg:${bg}` : 'background' },
    ];
    const r = await alice.put(`/lists/${listId}/entries`, { entries });
    expect(r.status).toBe(200);
    expect(r.body.list.entries).toHaveLength(4);
    // Same key again updates in place instead of duplicating.
    const again = await alice.put(`/lists/${listId}/entries`, { entries: [{ variantKey: a, shiny: true, done: true, note: 'eu' }] });
    expect(again.body.list.entries).toHaveLength(4);
    expect(again.body.list.doneCount).toBe(1);
  });

  it('refuses bad keys, bad traits and oversized batches', async () => {
    expect((await alice.put(`/lists/${listId}/entries`, { entries: [{ variantKey: 'pikachu', shiny: false }] })).status).toBe(400);
    expect((await alice.put(`/lists/${listId}/entries`, { entries: [{ variantKey: '25', shiny: false, tag: 'golden' }] })).status).toBe(400);
    expect((await alice.put(`/lists/${listId}/entries`, { entries: [] })).status).toBe(400);
    const big = Array.from({ length: 3001 }, (_, i) => ({ variantKey: String((i % 1000) + 1), shiny: i >= 1000, gender: 'm' }));
    expect((await alice.put(`/lists/${listId}/entries`, { entries: big })).status).toBe(400);
  });

  it('keeps lists away from strangers', async () => {
    expect((await bob.get(`/lists/${listId}`)).status).toBe(403);
    expect((await bob.patch(`/lists/${listId}`, { name: 'hacked' })).status).toBe(404);
    expect((await bob.put(`/lists/${listId}/entries`, { entries: [{ variantKey: '1', shiny: false }] })).status).toBe(404);
    expect((await bob.del(`/lists/${listId}`)).status).toBe(404);
    expect((await bob.post(`/lists/${listId}/copy`)).status).toBe(403);
    expect((await alice.get('/lists/does-not-exist')).status).toBe(404);
  });

  it('renames and removes entries', async () => {
    expect((await alice.patch(`/lists/${listId}`, { name: 'Renommée' })).body.list.name).toBe('Renommée');
    const [a] = keys();
    const r = await alice.del(`/lists/${listId}/entries`, { entries: [{ variantKey: a, shiny: true, tag: 'lucky' }] });
    expect(r.body.list.entries).toHaveLength(3);
  });

  it('shares by link, readable logged out, copyable logged in', async () => {
    const share = await alice.post(`/lists/${listId}/share`);
    const token = share.body.shareToken;
    expect(token).toBeTruthy();
    const pub = await anon.get(`/shared/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.list.shareToken).toBeNull(); // never leaked to non-owners
    expect(pub.body.list.entries).toHaveLength(3);
    expect((await anon.post(`/shared/${token}/copy`)).status).toBe(401);
    const copy = await bob.post(`/shared/${token}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body.list.entries.every((e: any) => !e.done && !e.note)).toBe(true);
    expect(copy.body.list.ownerId).toBe(bob.user.id);
    expect((await alice.del(`/lists/${listId}/share`)).status).toBe(200);
    expect((await anon.get(`/shared/${token}`)).status).toBe(404);
  });

  it('cannot share a private list', async () => {
    const priv = (await alice.post('/lists', { name: 'Privée', visibility: 'private' })).body.list.id;
    expect((await alice.post(`/lists/${priv}/share`)).status).toBe(409);
    await alice.del(`/lists/${priv}`);
  });

  it('cuts the share link when a list goes private', async () => {
    const token = (await alice.post(`/lists/${listId}/share`)).body.shareToken;
    expect((await anon.get(`/shared/${token}`)).status).toBe(200);
    await alice.patch(`/lists/${listId}`, { visibility: 'private' });
    expect((await anon.get(`/shared/${token}`)).status).toBe(404);
    await alice.patch(`/lists/${listId}`, { visibility: 'friends' });
  });

  it('lists only my own lists', async () => {
    const mine = (await bob.get('/lists')).body.lists;
    expect(mine.every((l: any) => l.ownerId === bob.user.id)).toBe(true);
  });
});

describe('genders in lists', () => {
  let listId: string;
  const put = (entries: object[]) => alice.put(`/lists/${listId}/entries`, { entries });
  const rows = (r: any, key: string) => r.body.list.entries.filter((e: any) => e.variantKey === key).map((e: any) => e.gender).sort();
  beforeAll(async () => {
    listId = (await alice.post('/lists', { name: 'Sexes' })).body.list.id;
  });

  it('expands a Pokémon that has both genders into one entry per gender', async () => {
    const r = await put([{ variantKey: '25', shiny: false }]);
    expect(rows(r, '25')).toEqual(['f', 'm']);
  });

  it('stores the female picture key as the neutral key plus gender f', async () => {
    const r = await put([{ variantKey: '26.g2', shiny: true }]);
    expect(r.body.list.entries.find((e: any) => e.variantKey === '26' && e.shiny)).toMatchObject({ gender: 'f' });
    expect(r.body.list.entries.some((e: any) => e.variantKey.endsWith('.g2'))).toBe(false);
  });

  it('follows the game master: no male Nidoran♀, no gender on Magnemite', async () => {
    expect((await put([{ variantKey: '29', shiny: false, gender: 'm' }])).body).toMatchObject({ error: 'invalid_gender', variantKey: '29' });
    expect(rows(await put([{ variantKey: '29', shiny: false }]), '29')).toEqual(['f']);
    expect(rows(await put([{ variantKey: '32', shiny: false }]), '32')).toEqual(['m']);
    expect((await put([{ variantKey: '81', shiny: false, gender: 'f' }])).status).toBe(400);
    expect(rows(await put([{ variantKey: '81', shiny: false }]), '81')).toEqual(['']);
  });

  it('knows single-gender costumes', async () => {
    const femaleOnly = ds.variants.find((v) => v.dex === 25 && v.kind === 'costume' && v.genders?.length === 1 && v.genders[0] === 'f');
    expect(femaleOnly).toBeTruthy();
    expect((await put([{ variantKey: femaleOnly!.key, shiny: false, gender: 'm' }])).status).toBe(400);
    expect(rows(await put([{ variantKey: femaleOnly!.key, shiny: false }]), femaleOnly!.key)).toEqual(['f']);
  });

  it('refuses variants the Pokédex does not know', async () => {
    expect((await put([{ variantKey: '25.fNOT_A_REAL_FORM', shiny: false }])).body).toMatchObject({ error: 'unknown_variant' });
  });

  it('tracks each gender apart, and removes all of them when no gender is given', async () => {
    let r = await put([{ variantKey: '25', shiny: false, gender: 'm', done: true }]);
    expect(r.body.list.entries.filter((e: any) => e.variantKey === '25').map((e: any) => [e.gender, e.done])).toEqual(
      expect.arrayContaining([['m', true], ['f', false]]),
    );
    r = await alice.del(`/lists/${listId}/entries`, { entries: [{ variantKey: '25', shiny: false, gender: 'm' }] });
    expect(rows(r, '25')).toEqual(['f']);
    r = await alice.del(`/lists/${listId}/entries`, { entries: [{ variantKey: '29', shiny: false }] });
    expect(rows(r, '29')).toEqual([]);
  });
});

describe('friends', () => {
  let listId: string;
  beforeAll(async () => {
    listId = (await alice.get('/lists')).body.lists[0].id;
  });

  it('validates friend codes', async () => {
    expect((await alice.post('/friends/requests', { friendCode: '123' })).status).toBe(400);
    expect((await alice.post('/friends/requests', { friendCode: alice.user.friendCode })).status).toBe(400);
    const unknown = alice.user.friendCode === '000000000000' ? '111111111111' : '000000000000';
    expect((await alice.post('/friends/requests', { friendCode: unknown })).status).toBe(404);
  });

  it('runs the request flow; only the recipient can accept', async () => {
    const spaced = bob.user.friendCode.replace(/(\d{4})(?=\d)/g, '$1 ');
    const sent = await alice.post('/friends/requests', { friendCode: spaced });
    expect(sent.status).toBe(201);
    expect((await alice.post('/friends/requests', { friendCode: bob.user.friendCode })).status).toBe(409);
    const req = (await bob.get('/friends/requests')).body.requests.find((r: any) => r.from.id === alice.user.id);
    expect((await alice.post(`/friends/requests/${req.id}/accept`)).status).toBe(404);
    expect((await admin.post(`/friends/requests/${req.id}/accept`)).status).toBe(404);
    expect((await bob.post(`/friends/requests/${req.id}/accept`)).status).toBe(200);
    expect((await alice.get('/friends')).body.friends.map((f: any) => f.id)).toEqual([bob.user.id]);
    expect((await alice.post('/friends/requests', { friendCode: bob.user.friendCode })).status).toBe(409);
  });

  it('shows friends my non-private lists only', async () => {
    const theirs = await bob.get(`/friends/${alice.user.id}/lists`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.lists.map((l: any) => l.id)).toContain(listId);
    const one = await bob.get(`/lists/${listId}`);
    expect(one.body.access).toBe('friend');
    expect(one.body.list.shareToken).toBeNull();
    await alice.patch(`/lists/${listId}`, { visibility: 'private' });
    expect((await bob.get(`/lists/${listId}`)).status).toBe(403);
    expect((await bob.get(`/friends/${alice.user.id}/lists`)).body.lists.map((l: any) => l.id)).not.toContain(listId);
    await alice.patch(`/lists/${listId}`, { visibility: 'friends' });
    expect((await admin.get(`/friends/${alice.user.id}/lists`)).status).toBe(403);
  });

  it('accepts directly when the other side already asked', async () => {
    const carol = await register(name('carol'));
    await carol.post('/friends/requests', { friendCode: alice.user.friendCode });
    const r = await alice.post('/friends/requests', { friendCode: carol.user.friendCode });
    expect(r.body.accepted).toBe(true);
    await carol.del('/auth/me', { password: PASSWORD });
  });

  it('declines and unfriends', async () => {
    const dave = await register(name('dave'));
    await dave.post('/friends/requests', { friendCode: alice.user.friendCode });
    const req = (await alice.get('/friends/requests')).body.requests.find((r: any) => r.from.id === dave.user.id);
    expect((await alice.post(`/friends/requests/${req.id}/decline`)).status).toBe(200);
    expect((await alice.post(`/friends/requests/${req.id}/accept`)).status).toBe(404);
    await dave.del('/auth/me', { password: PASSWORD });

    expect((await bob.del(`/friends/${alice.user.id}`)).status).toBe(200);
    expect((await alice.get('/friends')).body.friends.map((f: any) => f.id)).not.toContain(bob.user.id);
    expect((await bob.get(`/lists/${listId}`)).status).toBe(403);
  });
});

describe('game data', () => {
  it('serves promo codes with redemption links (or a clean upstream error)', async () => {
    const r = await anon.get('/game/promo-codes');
    expect([200, 502]).toContain(r.status);
    if (r.status === 200) for (const c of r.body.codes) expect(c.redeemUrl).toBe(`https://store.pokemongo.com/offer-redemption?passcode=${c.code}`);
  });

  it('serves PvPoke rankings for Great and Ultra League (or a clean upstream error)', async () => {
    const r = await anon.get('/game/pvp-rankings');
    expect([200, 502]).toContain(r.status);
    if (r.status === 200) {
      for (const league of ['great', 'ultra', 'master']) {
        expect(r.body[league].length).toBeGreaterThan(20);
        expect(r.body[league][0]).toMatchObject({ rank: 1, dex: expect.any(Number), atk: expect.any(Number) });
      }
    }
  });

  it('serves field research with event tasks apart (or a clean upstream error)', async () => {
    const r = await anon.get('/game/research');
    expect([200, 502]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body.categories.length).toBeGreaterThan(0);
      for (const c of r.body.categories) if (c.end) expect(Date.parse(c.end)).toBeGreaterThan(Date.now());
    }
  });
});

describe('my PvP Pokémon', () => {
  it('saves, edits and removes them, privately', async () => {
    expect((await anon.get('/pvp-pokemon')).status).toBe(401);
    const created = await alice.post('/pvp-pokemon', { formKey: '184', atk: 0, def: 15, sta: 15, level: 20, note: 'raid' });
    expect(created.status).toBe(201);
    const id = created.body.pokemon.id;
    expect((await alice.post('/pvp-pokemon', { formKey: 'nope', atk: 0, def: 0, sta: 0 })).status).toBe(400);
    expect((await alice.post('/pvp-pokemon', { formKey: '184', atk: 16, def: 0, sta: 0 })).status).toBe(400);
    expect((await alice.post('/pvp-pokemon', { formKey: '184', atk: 1, def: 1, sta: 1, level: 20.3 })).status).toBe(400);
    expect((await alice.patch(`/pvp-pokemon/${id}`, { level: 21.5 })).body.pokemon).toMatchObject({ level: 21.5, atk: 0, note: 'raid' });
    // Someone else's: not visible, not editable.
    expect((await bob.get('/pvp-pokemon')).body.pokemon.map((p: any) => p.id)).not.toContain(id);
    expect((await bob.patch(`/pvp-pokemon/${id}`, { level: 30 })).status).toBe(404);
    expect((await bob.del(`/pvp-pokemon/${id}`)).status).toBe(404);
    expect((await alice.get('/pvp-pokemon')).body.pokemon[0]).toMatchObject({ id, formKey: '184', level: 21.5 });
    expect((await alice.del(`/pvp-pokemon/${id}`)).status).toBe(200);
    expect((await alice.get('/pvp-pokemon')).body.pokemon).toEqual([]);
  });
});

describe('client errors', () => {
  it('groups the same browser error, keeps only the path, and shows them to admins only', async () => {
    const message = `TypeError: x is undefined ${Date.now()}`;
    const stack = `${message}\n    at render (https://dex.example/assets/index-AbCd1234.js:1:2345)`;
    const c = new Client();
    expect((await c.post('/client-errors', { message, stack, url: 'https://dex.example/s/secret-token?x=1', appVersion: 'abc' })).status).toBe(200);
    // Same bug in the next build: other line, other file hash, still one row.
    expect((await c.post('/client-errors', { message, stack: stack.replace('AbCd1234.js:1:2345', 'Zz9Yy8Xx.js:1:99'), url: 'https://dex.example/dex' })).status).toBe(200);
    expect((await c.post('/client-errors', { message: '' })).status).toBe(400);
    expect((await anon.get('/client-errors')).status).toBe(401);
    expect((await alice.get('/client-errors')).status).toBe(403);
    const list = await admin.get('/client-errors');
    const row = list.body.errors.find((e: any) => e.message === message);
    expect(row).toMatchObject({ count: 2, url: '/dex' });
    expect(JSON.stringify(list.body)).not.toContain('secret-token');
  });
});

describe('admin panel', () => {
  it('shows the dashboard and the health of the sources to admins only', async () => {
    expect((await alice.get('/admin/stats')).status).toBe(403);
    const stats = await admin.get('/admin/stats');
    expect(stats.body.users).toBeGreaterThanOrEqual(3);
    expect(stats.body.active7).toBeGreaterThanOrEqual(1); // the admin, at least
    expect(stats.body.signupsByWeek).toHaveLength(8);
    const health = await admin.get('/admin/health');
    expect(health.body).toMatchObject({ version: expect.any(String), dataset: expect.any(Object), sources: expect.any(Object) });
    expect((await admin.post('/admin/health/nope/refresh')).status).toBe(404);
  });

  it('suspends an account (login refused, sessions cut), shows its details, logs it out, deletes it', async () => {
    const u = await register(name('susp'));
    const detail = await admin.get(`/admin/users/${u.user.id}`);
    expect(detail.body.counts).toMatchObject({ lists: 0, sessions: 1 });
    expect((await admin.post(`/admin/users/${u.user.id}/suspend`, { suspended: true })).status).toBe(200);
    expect((await u.get('/auth/me')).body.user).toBeNull();
    expect((await new Client().post('/auth/login', { username: u.user.username, password: PASSWORD })).body.error).toBe('suspended');
    expect((await admin.post(`/admin/users/${u.user.id}/suspend`, { suspended: false })).status).toBe(200);
    const again = new Client();
    expect((await again.post('/auth/login', { username: u.user.username, password: PASSWORD })).status).toBe(200);
    expect((await admin.post(`/admin/users/${u.user.id}/logout`)).body.sessions).toBe(1);
    expect((await again.get('/auth/me')).body.user).toBeNull();
    expect((await admin.post(`/admin/users/${admin.user.id}/suspend`, { suspended: true })).status).toBe(400);
    expect((await admin.del(`/admin/users/${u.user.id}`)).status).toBe(200);
    expect((await admin.get(`/admin/users/${u.user.id}`)).status).toBe(404);
  });

  it("tells a player when an admin changes their account, even with every notification switched off", async () => {
    const u = await register(name('acct'));
    await u.put('/notifications/prefs', { friend_request: false, friend_accepted: false, offer: false, offer_caught: false, raid: false, announcement: false });
    await admin.patch(`/users/${u.user.id}/role`, { role: 'manager' });
    await admin.post(`/users/${u.user.id}/reset-code`);
    expect((await u.get('/notifications/prefs')).body.prefs).toMatchObject({ raid: false, announcement: false });
    const items = (await u.get('/notifications')).body.items.filter((n: any) => n.type === 'account');
    expect(items.map((n: any) => n.data.change).sort()).toEqual(['reset_code', 'role']);
    expect(items.find((n: any) => n.data.change === 'role').data).toMatchObject({ role: 'manager', before: 'user' });
    expect(items[0].actor.username).toBe(admin.user.username);
  });

  it('closes sign-ups, opens them by invitation, caps them per day', async () => {
    try {
      await admin.put('/admin/signups', { mode: 'closed', dailyCap: null });
      expect((await new Client().get('/auth/signup-mode')).body.mode).toBe('closed');
      expect((await new Client().post('/auth/register', { username: name('closed'), password: PASSWORD })).body.error).toBe('signups_closed');

      await admin.put('/admin/signups', { mode: 'invite', dailyCap: null });
      expect((await new Client().post('/auth/register', { username: name('noinv'), password: PASSWORD })).body.error).toBe('invite_required');
      expect((await new Client().post('/auth/register', { username: name('badinv'), password: PASSWORD, invite: 'AAAA-BBBB-CCCC' })).body.error).toBe('invalid_invite');
      const { code } = (await admin.post('/admin/invites', { note: 'test', maxUses: 1, days: 1 })).body;
      expect((await new Client().post('/auth/register', { username: name('inv'), password: PASSWORD, invite: code.toLowerCase() })).status).toBe(201);
      expect((await new Client().post('/auth/register', { username: name('inv2'), password: PASSWORD, invite: code })).body.error).toBe('invalid_invite'); // used up
      expect((await admin.get('/admin/signups')).body.invites[0]).toMatchObject({ uses: 1, maxUses: 1 });

      await admin.put('/admin/signups', { mode: 'open', dailyCap: 1 });
      expect((await new Client().post('/auth/register', { username: name('capped'), password: PASSWORD })).body.error).toBe('signups_full');
    } finally {
      await admin.put('/admin/signups', { mode: 'open', dailyCap: null });
    }
    expect((await new Client().post('/auth/register', { username: name('reopened'), password: PASSWORD })).status).toBe(201);
  });

  it("journals changes and undoes a manager's correction", async () => {
    const key = ds.variants.find((v) => v.kind === 'costume')!.key;
    await admin.put(`/overrides/${encodeURIComponent(key)}`, { released: true });
    await admin.put(`/overrides/${encodeURIComponent(key)}`, { released: false });
    const log = (await admin.get('/admin/audit')).body.entries;
    const last = log.find((e: any) => e.targetId === key && e.action === 'override.set');
    expect(last).toMatchObject({ actor: admin.user.username, undoable: true, data: { before: { released: true }, after: { released: false } } });
    expect((await admin.post(`/admin/audit/${last.id}/undo`)).status).toBe(200);
    const o = (await anon.get('/overrides')).body.overrides.find((x: any) => x.variantKey === key);
    expect(o.released).toBe(true);
    expect((await admin.post(`/admin/audit/${last.id}/undo`)).status).toBe(400); // once
    await admin.del(`/overrides/${encodeURIComponent(key)}`);
    expect((await admin.get('/admin/audit')).body.entries.map((e: any) => e.action)).toContain('override.reset');
  });

  it('takes players reports for managers, and shows one announcement banner to everyone', async () => {
    expect((await anon.post('/reports', { variantKey: '25', kind: 'name' })).status).toBe(401);
    const r = await alice.post('/reports', { variantKey: '25', kind: 'name', message: 'wrong costume name' });
    expect(r.status).toBe(201);
    expect((await alice.get('/reports')).status).toBe(403);
    const open = (await admin.get('/reports')).body.reports;
    expect(open.find((x: any) => x.id === r.body.id)).toMatchObject({ by: alice.user.username, message: 'wrong costume name' });
    expect((await admin.patch(`/reports/${r.body.id}`, { status: 'resolved' })).status).toBe(200);
    expect((await admin.get('/reports')).body.reports.map((x: any) => x.id)).not.toContain(r.body.id);

    expect((await alice.post('/admin/announcements', { message: 'nope' })).status).toBe(403);
    const a = await admin.post('/admin/announcements', { message: 'Maintenance ce soir à 22 h', level: 'warning' });
    expect(a.status).toBe(201);
    expect((await anon.get('/announcements')).body.announcement).toMatchObject({ message: 'Maintenance ce soir à 22 h', level: 'warning' });
    await admin.post('/admin/announcements', { message: 'Nouveau : simulateur de combat', link: '/pvp/battle' });
    expect((await anon.get('/announcements')).body.announcement.message).toBe('Nouveau : simulateur de combat'); // one at a time
    await admin.patch(`/admin/announcements/${(await anon.get('/announcements')).body.announcement.id}`, { active: false });
    expect((await anon.get('/announcements')).body.announcement).toBeNull();
  });
});

describe('abuse protection', () => {
  it('rate-limits login attempts per client', async () => {
    const c = new Client();
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await c.post('/auth/login', { username: name('ghost'), password: 'wrong-password' })).status);
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
