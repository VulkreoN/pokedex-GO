/**
 * Friends' lists, "I have it" offers, notifications (inbox + push, dry-run) and live events.
 * Needs the API started with PUSH_DRY_RUN=1 (scripts/test-all.sh does).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { API, Client, name, register } from './client.js';

type U = Awaited<ReturnType<typeof register>>;
let owner: U;
let friend: U;
let stranger: U;
let listId: string;
let privateId: string;

const sub = (n: number) => ({ endpoint: `https://push.example.test/${name('dev')}${n}`, keys: { p256dh: 'BPublicKeyForTests_'.padEnd(40, 'x'), auth: 'authsecret123' } });

/** Opens the live stream as this client and collects events. */
async function listen(c: Client) {
  const ctrl = new AbortController();
  const res = await fetch(`${API}/api/stream`, { headers: { cookie: c.cookie, 'x-forwarded-for': c.ip }, signal: ctrl.signal });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const events: any[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let ready!: () => void;
  const isReady = new Promise<void>((ok) => (ready = ok));
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (block.includes('event: ready')) ready();
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (block.includes('event: live') && data) events.push(JSON.parse(data));
        }
      }
    } catch {}
  })();
  await isReady;
  return {
    events,
    async waitFor(pred: (e: any) => boolean, ms = 3000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (events.some(pred)) return true;
        await new Promise((ok) => setTimeout(ok, 50));
      }
      return false;
    },
    close: () => ctrl.abort(),
  };
}

beforeAll(async () => {
  owner = await register(name('own'));
  friend = await register(name('frd'));
  stranger = await register(name('str'));
  await friend.post('/friends/requests', { friendCode: owner.user.friendCode });
});

describe('notifications', () => {
  it('tells the target about a friend request, in the inbox and by push', async () => {
    const inbox = await owner.get('/notifications');
    expect(inbox.body.unread).toBe(1);
    expect(inbox.body.items[0]).toMatchObject({ type: 'friend_request', actor: { username: friend.user.username } });
  });

  it('accepting notifies the requester', async () => {
    expect((await friend.post('/push/subscribe', sub(1))).status).toBe(201);
    const req = (await owner.get('/friends/requests')).body.requests[0];
    await owner.post(`/friends/requests/${req.id}/accept`);
    const inbox = await friend.get('/notifications');
    expect(inbox.body.items[0]).toMatchObject({ type: 'friend_accepted', actor: { username: owner.user.username } });
    const sent = (await friend.get('/push/sent')).body.sent;
    expect(sent.at(-1)).toMatchObject({ title: `${owner.user.username} a accepté ta demande`, url: `/friends/${owner.user.id}` });
  });

  it('marks everything read', async () => {
    await owner.post('/notifications/read', {});
    expect((await owner.get('/notifications')).body.unread).toBe(0);
  });

  it('only accepts https push endpoints and needs a session', async () => {
    expect((await new Client().post('/push/subscribe', sub(2))).status).toBe(401);
    expect((await owner.post('/push/subscribe', { ...sub(3), endpoint: 'http://insecure.example/x' })).status).toBe(400);
    const key = (await new Client().get('/push/key')).body.publicKey;
    expect(key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  });
});

describe("friends' lists", () => {
  beforeAll(async () => {
    listId = (await owner.post('/lists', { name: 'Cherche' })).body.list.id;
    await owner.put(`/lists/${listId}/entries`, { entries: [{ variantKey: '25', gender: 'f', shiny: true }, { variantKey: '133', gender: 'm', shiny: false }, { variantKey: '1', gender: 'f', shiny: false }] });
    privateId = (await owner.post('/lists', { name: 'Secret', visibility: 'private' })).body.list.id;
  });

  it('lists my friends’ visible lists apart from mine', async () => {
    const r = await friend.get('/lists/friends');
    const ids = r.body.lists.map((l: any) => l.id);
    expect(ids).toContain(listId);
    expect(ids).not.toContain(privateId);
    expect(r.body.lists.find((l: any) => l.id === listId)).toMatchObject({ ownerName: owner.user.username, entryCount: 3, doneCount: 0 });
    expect((await friend.get('/lists')).body.lists.map((l: any) => l.id)).not.toContain(listId);
    expect((await stranger.get('/lists/friends')).body.lists).toEqual([]);
  });

  it('keeps the owner’s order for friends too, new collections on top', async () => {
    const third = (await owner.post('/lists', { name: 'Troisième' })).body.list.id;
    expect((await owner.get('/lists')).body.lists[0].id).toBe(third);
    const order = [listId, third, privateId];
    expect((await owner.put('/lists/order', { ids: order })).status).toBe(200);
    expect((await owner.get('/lists')).body.lists.map((l: any) => l.id)).toEqual(order);
    const seen = (await friend.get(`/friends/${owner.user.id}/lists`)).body.lists.map((l: any) => l.id);
    expect(seen).toEqual([listId, third]);
    // Someone else's collection cannot be moved.
    await stranger.put('/lists/order', { ids: [third, listId] });
    expect((await owner.get('/lists')).body.lists.map((l: any) => l.id)).toEqual(order);
    await owner.del(`/lists/${third}`);
  });

  it('pins a friend and a friend’s collection to the top', async () => {
    expect((await friend.put(`/friends/${owner.user.id}/favorite`, { on: true })).status).toBe(200);
    expect((await friend.get('/friends')).body.friends.find((f: any) => f.id === owner.user.id).favorite).toBe(true);
    expect((await friend.put(`/lists/${listId}/favorite`, { on: true })).status).toBe(200);
    const mine = (await friend.get('/lists/friends')).body.lists.find((l: any) => l.id === listId);
    expect(mine).toMatchObject({ favorite: true, ownerFavorite: true });
    // Only friends can pin, and only collections they can see.
    expect((await stranger.put(`/lists/${listId}/favorite`, { on: true })).status).toBe(404);
    expect((await friend.put(`/lists/${privateId}/favorite`, { on: true })).status).toBe(404);
    expect((await stranger.put(`/friends/${owner.user.id}/favorite`, { on: true })).status).toBe(404);
    await friend.put(`/lists/${listId}/favorite`, { on: false });
    expect((await friend.get('/lists/friends')).body.lists.find((l: any) => l.id === listId).favorite).toBe(false);
  });

  it('pushes list changes live to friends', async () => {
    const live = await listen(friend);
    await owner.patch(`/lists/${listId}`, { description: 'live' });
    expect(await live.waitFor((e) => e.type === 'list' && e.listId === listId)).toBe(true);
    live.close();
  });

  it('keeps live events away from strangers', async () => {
    const live = await listen(stranger);
    await owner.patch(`/lists/${listId}`, { description: 'maj' });
    expect(await live.waitFor((e) => e.type === 'list', 800)).toBe(false);
    live.close();
  });
});

describe('"I have it"', () => {
  it('is for friends only, on existing entries', async () => {
    const body = { variantKey: '25', gender: 'f', shiny: true, on: true };
    expect((await stranger.post(`/lists/${listId}/offers`, body)).status).toBe(403);
    expect((await owner.post(`/lists/${listId}/offers`, body)).status).toBe(403);
    expect((await friend.post(`/lists/${listId}/offers`, { ...body, variantKey: '999' })).status).toBe(404);
    expect((await friend.post(`/lists/${privateId}/offers`, body)).status).toBe(403);
  });

  it('shows the owner who has what, and the friend only their own mark', async () => {
    await owner.post('/push/subscribe', sub(4));
    const r = await friend.post(`/lists/${listId}/offers`, { variantKey: '25', gender: 'f', shiny: true, on: true });
    expect(r.status).toBe(200);
    const mine = r.body.list.entries.find((e: any) => e.variantKey === '25');
    expect(mine.offeredByMe).toBe(true);
    expect(mine.offers).toBeUndefined();
    const ownerView = (await owner.get(`/lists/${listId}`)).body.list.entries.find((e: any) => e.variantKey === '25');
    expect(ownerView.offers).toEqual([{ userId: friend.user.id, username: friend.user.username }]);
    // Logged-out share link viewers see no marks at all.
    const token = (await owner.post(`/lists/${listId}/share`)).body.shareToken;
    const shared = (await new Client().get(`/shared/${token}`)).body.list.entries.find((e: any) => e.variantKey === '25');
    expect(shared.offers).toBeUndefined();
    expect(shared.offeredByMe).toBeUndefined();
  });

  it('groups a burst of marks into one notification and one push', async () => {
    const pushedBefore = (await owner.get('/push/sent')).body.sent.length;
    await friend.post(`/lists/${listId}/offers`, { variantKey: '133', gender: 'm', shiny: false, on: true });
    await friend.post(`/lists/${listId}/offers`, { variantKey: '133', gender: 'm', shiny: false, on: true }); // idempotent
    const inbox = await owner.get('/notifications');
    const offers = inbox.body.items.filter((n: any) => n.type === 'offer');
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ actor: { username: friend.user.username }, list: { id: listId, name: 'Cherche' }, data: { count: 2 } });
    const pushed = (await owner.get('/push/sent')).body.sent;
    expect(pushed.length).toBe(pushedBefore); // the first mark pushed, the second only merged
    expect(pushed.some((m: any) => m.url === `/lists/${listId}` && m.title.startsWith(friend.user.username))).toBe(true);
  });

  it('respects the per-kind switch: inbox yes, push no', async () => {
    const prefs = await owner.put('/notifications/prefs', { offer: false });
    expect(prefs.body.prefs).toEqual({ friend_request: true, friend_accepted: true, offer: false, offer_caught: true });
    await owner.post('/notifications/read', {}); // a new burst starts a new notification
    const before = (await owner.get('/push/sent')).body.sent.length;
    await friend.post(`/lists/${listId}/offers`, { variantKey: '1', gender: 'f', shiny: false, on: true });
    expect((await owner.get('/notifications')).body.unread).toBe(1);
    expect((await owner.get('/push/sent')).body.sent.length).toBe(before);
    await owner.put('/notifications/prefs', { offer: true });
  });

  it('can be taken back, and disappears with the entry or the friendship', async () => {
    await friend.post(`/lists/${listId}/offers`, { variantKey: '25', gender: 'f', shiny: true, on: false });
    let e = (await owner.get(`/lists/${listId}`)).body.list.entries;
    expect(e.find((x: any) => x.variantKey === '25').offers).toBeUndefined();

    await owner.del(`/lists/${listId}/entries`, { entries: [{ variantKey: '133', gender: 'm', shiny: false }] });
    await owner.put(`/lists/${listId}/entries`, { entries: [{ variantKey: '133', gender: 'm', shiny: false }] });
    e = (await owner.get(`/lists/${listId}`)).body.list.entries;
    expect(e.find((x: any) => x.variantKey === '133').offers).toBeUndefined();

    expect(e.find((x: any) => x.variantKey === '1').offers).toHaveLength(1);
    await friend.del(`/friends/${owner.user.id}`);
    e = (await owner.get(`/lists/${listId}`)).body.list.entries;
    expect(e.find((x: any) => x.variantKey === '1').offers).toBeUndefined();
  });
});

describe('following friends\' lists', () => {
  let a: U;
  let b: U;
  let shown: string;
  beforeAll(async () => {
    a = await register(name('fa'));
    b = await register(name('fb'));
    await b.post('/friends/requests', { friendCode: a.user.friendCode });
    await a.post(`/friends/requests/${(await a.get('/friends/requests')).body.requests[0].id}/accept`);
    shown = (await a.post('/lists', { name: 'Visible' })).body.list.id;
  });

  it('follows by default, can stop and start again', async () => {
    expect((await b.get('/lists/friends')).body.lists.map((l: any) => l.id)).toContain(shown);
    expect((await b.get(`/lists/${shown}`)).body.following).toBe(true);
    expect((await b.del(`/lists/${shown}/follow`)).body).toEqual({ following: false });
    expect((await b.get('/lists/friends')).body.lists.map((l: any) => l.id)).not.toContain(shown);
    expect((await b.get(`/lists/${shown}`)).status).toBe(200); // still readable from the friend's page
    expect((await b.get(`/friends/${a.user.id}/lists`)).body.lists.find((l: any) => l.id === shown).following).toBe(false);
    expect((await b.post(`/lists/${shown}/follow`)).body).toEqual({ following: true });
    expect((await b.get('/lists/friends')).body.lists.map((l: any) => l.id)).toContain(shown);
  });

  it('is only for friends', async () => {
    expect((await stranger.del(`/lists/${shown}/follow`)).status).toBe(404);
    expect((await a.del(`/lists/${shown}/follow`)).status).toBe(404); // own list
  });
});

describe('caught after an "I have it"', () => {
  let a: U;
  let b: U;
  let c: U;
  let list: string;
  beforeAll(async () => {
    a = await register(name('ca'));
    b = await register(name('cb'));
    c = await register(name('cc'));
    for (const x of [b, c]) {
      await x.post('/friends/requests', { friendCode: a.user.friendCode });
      const req = (await a.get('/friends/requests')).body.requests.find((r: any) => r.from.id === x.user.id);
      await a.post(`/friends/requests/${req.id}/accept`);
    }
    list = (await a.post('/lists', { name: 'Chasse' })).body.list.id;
    await a.put(`/lists/${list}/entries`, { entries: [{ variantKey: '25', shiny: false }] }); // ♂ and ♀
    await b.post(`/lists/${list}/offers`, { variantKey: '25', gender: 'f', shiny: false, on: true });
    await c.post(`/lists/${list}/offers`, { variantKey: '25', gender: 'f', shiny: false, on: true });
    await c.post(`/lists/${list}/offers`, { variantKey: '25', gender: 'm', shiny: false, on: true });
  });

  it('shows the owner every friend who has it', async () => {
    const f = (await a.get(`/lists/${list}`)).body.list.entries.find((e: any) => e.variantKey === '25' && e.gender === 'f');
    expect(f.offers.map((o: any) => o.username).sort()).toEqual([b.user.username, c.user.username].sort());
  });

  it('tells each of them once it is caught, and clears their marks', async () => {
    await a.put(`/lists/${list}/entries`, { entries: [{ variantKey: '25', gender: 'f', shiny: false, done: true }] });
    for (const x of [b, c]) {
      const n = (await x.get('/notifications')).body.items.find((i: any) => i.type === 'offer_caught');
      expect(n).toMatchObject({ actor: { username: a.user.username }, list: { id: list }, data: { count: 1 } });
    }
    const entries = (await a.get(`/lists/${list}`)).body.list.entries;
    expect(entries.find((e: any) => e.gender === 'f').offers).toBeUndefined();
    expect(entries.find((e: any) => e.gender === 'm').offers).toHaveLength(1); // the male is still hunted
    expect((await b.post(`/lists/${list}/offers`, { variantKey: '25', gender: 'f', shiny: false, on: true })).status).toBe(409);
  });

  it('does not notify again when saving an entry that was already caught', async () => {
    const before = (await b.get('/notifications')).body.items.length;
    await a.put(`/lists/${list}/entries`, { entries: [{ variantKey: '25', gender: 'f', shiny: false, done: true, note: 'x' }] });
    expect((await b.get('/notifications')).body.items.length).toBe(before);
  });
});
