import { useFollowList } from '../lib/social.js';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useToast } from '../components/toast.js';
import { Button, CopyButton, Empty, HoldButton, IconButton, Progress, Sheet, Spinner, TextField, TopBar } from '../components/ui.js';
import { errorMessage, fmtCode } from '../lib/errors.js';
import { useMe, useSetFriendCode } from '../lib/auth.js';
import { useLang, useT } from '../lib/i18n.js';
import { PinButton } from './ListsPage.js';
import { useFriendLists, useFriendRequests, useFriends, usePinFriend, useRemoveFriend, useRespondFriendRequest, useSendFriendRequest , type Friend } from '../lib/lists.js';
import { VisibilityIcon } from './ListsPage.js';
import { FriendQr, QrScanSheet } from '../components/FriendQr.js';

export { errorMessage, fmtCode };

/**
 * Puts the friend code of the game on the account, typed or read from a screenshot of its QR code. Used in Friends
 * and in the welcome tour.
 */
export function FriendCodeForm({ current, onSaved, note = true }: { current: string; onSaved: () => void; note?: boolean }) {
  const t = useT();
  const toast = useToast();
  const save = useSetFriendCode();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync(code);
      toast(t.my_code_saved);
      setCode('');
      onSaved();
    } catch (err) {
      setError(errorMessage(t, err));
    }
  };
  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        <TextField label={t.my_code_game} placeholder={fmtCode(current)} inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <p role="alert" className="text-sm text-berry">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" className="shrink-0" onClick={() => setScanning(true)} aria-label={t.qr_scan} title={t.qr_scan}>QR</Button>
          <Button tone="primary" type="submit" className="flex-1" disabled={save.isPending || code.replace(/\D/g, '').length !== 12}>{t.save}</Button>
        </div>
        {note && <p className="text-xs text-ink-3">{t.my_code_edit_note}</p>}
      </form>
      <QrScanSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onCode={(c) => {
          setScanning(false);
          setCode(fmtCode(c));
          setError(null);
        }}
      />
    </>
  );
}

function FriendCodeSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t.my_code_edit_title}>
      <p className="mb-3 text-sm text-ink-2">{t.my_code_edit_help}</p>
      <FriendCodeForm current={current} onSaved={onClose} />
    </Sheet>
  );
}

export function FriendsPage() {
  const t = useT();
  const toast = useToast();
  const me = useMe();
  const friends = useFriends();
  const requests = useFriendRequests();
  const send = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();
  const pinFriend = usePinFriend();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Opened from the app icon's "My friend code" shortcut: the QR at once.
  const [showQr, setShowQr] = useState(() => new URLSearchParams(location.search).has('qr'));
  const [scanning, setScanning] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [menuFor, setMenuFor] = useState<Friend | null>(null);
  const { lang } = useLang();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await send.mutateAsync(code);
      toast(r.accepted ? t.now_friends(r.friend!.username) : t.sent_to(r.to!.username));
      setCode('');
    } catch (err) {
      setError(errorMessage(t, err));
    }
  };

  const incoming = requests.data?.filter((r) => r.to.id === me.data?.id) ?? [];
  const outgoing = requests.data?.filter((r) => r.from.id === me.data?.id) ?? [];

  return (
    <>
      <TopBar title={t.friends} />
      <main className="mx-auto max-w-3xl space-y-5 px-3 pb-24">
        {me.data && (
          <section className="sky-header rounded-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm opacity-70">{t.my_code}</span>
              <button type="button" onClick={() => setEditingCode(true)} className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20">{t.my_code_edit}</button>
            </div>
            <div className="tnum mt-1 text-[28px] font-bold tracking-wider">{fmtCode(me.data.friendCode)}</div>
            <div className="mt-2 flex gap-2">
              <CopyButton tone="ghost" className="bg-white/10 text-inherit hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20" text={me.data!.friendCode} />
              <Button tone="ghost" className="bg-white/10 text-inherit hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></svg>
                {showQr ? t.qr_hide : t.qr_show}
              </Button>
            </div>
            {showQr && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <FriendQr code={me.data.friendCode} />
                <p className="text-center text-sm opacity-80">{t.qr_show_hint}</p>
              </div>
            )}
          </section>
        )}

        {me.data && <FriendCodeSheet open={editingCode} onClose={() => setEditingCode(false)} current={me.data.friendCode} />}

        <form onSubmit={submit} className="space-y-2">
          <TextField label={t.add_friend} placeholder={t.friend_code_placeholder} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          {error && <p role="alert" className="text-sm text-berry">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" className="shrink-0" onClick={() => setScanning(true)} aria-label={t.qr_scan} title={t.qr_scan}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
              QR
            </Button>
            <Button tone="primary" type="submit" className="flex-1" disabled={send.isPending || code.replace(/\D/g, '').length !== 12}>{t.send_request}</Button>
          </div>
        </form>
        <QrScanSheet
          open={scanning}
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setScanning(false);
            setCode(fmtCode(c));
            setError(null);
            toast(t.qr_read);
          }}
        />

        {(incoming.length > 0 || outgoing.length > 0) && (
          <section>
            <h2 className="mb-2 text-base font-bold">{t.requests}</h2>
            <ul className="space-y-2">
              {incoming.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-card border border-line p-3">
                  <span className="flex-1 font-semibold">{r.from.username}</span>
                  <Button tone="primary" className="min-h-9 px-3 text-sm" onClick={() => respond.mutate({ id: r.id, action: 'accept' })}>{t.accept}</Button>
                  <Button tone="ghost" className="min-h-9 px-3 text-sm" onClick={() => respond.mutate({ id: r.id, action: 'decline' })}>{t.decline}</Button>
                </li>
              ))}
              {outgoing.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-card border border-dashed border-line p-3 text-ink-2">
                  <span className="flex-1">{t.sent_to(r.to.username)}</span>
                  <Button tone="ghost" className="min-h-9 px-3 text-sm" onClick={() => respond.mutate({ id: r.id, action: 'decline' })}>{t.cancel}</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-base font-bold">{t.friends} <span className="tnum font-normal text-ink-3">{friends.data?.length ?? ''}</span></h2>
          {friends.isPending && <Spinner />}
          {friends.data?.length === 0 && <Empty>{t.no_friends}</Empty>}
          <ul className="space-y-2">
            {friends.data?.map((f) => (
              <li key={f.id} className="card flex items-center gap-2 p-2 pl-3">
                <PinButton on={!!f.favorite} label={f.favorite ? t.unpin : t.pin} onClick={() => pinFriend.mutate({ id: f.id, on: !f.favorite })} className="-ml-1.5" />
                <Link to={`/friends/${f.id}`} className="min-w-0 flex-1 py-1.5">
                  <span className="block truncate font-semibold">{f.username}</span>
                  <span className="block text-xs text-ink-3">{t.friend_line(f.lists ?? 0, new Date(f.since).toLocaleDateString(lang, { month: 'long', year: 'numeric' }))}</span>
                </Link>
                <IconButton label={t.friend_options(f.username)} onClick={() => setMenuFor(f)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
        {/* What is done to a friend, out of the way of a stray tap: see, pin, remove (asked twice). */}
        <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.username ?? ''}>
          {menuFor && (
            <div className="space-y-2">
              <Link to={`/friends/${menuFor.id}`} className="block"><Button className="w-full">{t.friend_see_lists}</Button></Link>
              <Button className="w-full" onClick={() => { pinFriend.mutate({ id: menuFor.id, on: !menuFor.favorite }); setMenuFor(null); }}>{menuFor.favorite ? t.unpin : t.pin}</Button>
              <HoldButton className="w-full" disabled={removeFriend.isPending} onConfirm={async () => { await removeFriend.mutateAsync(menuFor.id); toast(t.friend_removed(menuFor.username)); setMenuFor(null); }}>{t.friend_remove_confirm(menuFor.username)}</HoldButton>
            </div>
          )}
        </Sheet>
      </main>
    </>
  );
}

export function FriendListsPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const q = useFriendLists(id!);
  return (
    <>
      <TopBar title={q.data ? t.friend_lists(q.data.friend.username) : t.friends} back />
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {q.isPending && <Spinner />}
        {q.isError && <Empty>{t.err_not_found}</Empty>}
        {q.data?.lists.length === 0 && <Empty>{t.nothing_here}</Empty>}
        <ul className="space-y-2">
          {q.data?.lists.map((l) => (
            <li key={l.id}>
              <Link to={`/lists/${l.id}`} className="card block p-3 hover:brightness-[0.98]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{l.name}</span>
                  <VisibilityIcon v={l.visibility} />
                </div>
                {l.description && <p className="mt-0.5 truncate text-sm text-ink-2">{l.description}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <Progress done={l.doneCount} total={l.entryCount} />
                  <span className="tnum shrink-0 text-xs font-semibold text-ink-2">{l.entryCount ? t.progress(l.doneCount, l.entryCount) : t.list_empty_short}</span>
                </div>
              </Link>
              {l.following !== undefined && <FollowButton listId={l.id} following={l.following} />}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

/** Friends' lists are followed by default; this hides or brings back one in "Friends' lists". */
function FollowButton({ listId, following }: { listId: string; following: boolean }) {
  const t = useT();
  const follow = useFollowList(listId);
  return (
    <button type="button" disabled={follow.isPending} onClick={() => follow.mutate(!following)} className="mt-1 w-full rounded-lg py-1 text-center text-xs font-semibold text-sky hover:bg-paper-2">
      {following ? t.unfollow : t.follow}
    </button>
  );
}
