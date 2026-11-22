import { useFollowList } from '../lib/social.js';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useToast } from '../components/toast.js';
import { Button, Empty, Progress, Spinner, TextField, TopBar } from '../components/ui.js';
import { ApiError, copyText } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { useT, type T } from '../lib/i18n.js';
import { useFriendLists, useFriendRequests, useFriends, useRemoveFriend, useRespondFriendRequest, useSendFriendRequest } from '../lib/lists.js';
import { VisibilityIcon } from './ListsPage.js';

export const fmtCode = (c: string) => c.replace(/(\d{4})(?=\d)/g, '$1 ');

export function errorMessage(t: T, e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      invalid_credentials: t.err_invalid_credentials,
      username_taken: t.err_username_taken,
      invalid_code: t.err_invalid_code,
      not_found: t.err_not_found,
      already_friends: t.err_already_friends,
      already_requested: t.err_already_requested,
      self: t.err_self,
      validation: t.err_validation,
    };
    return map[e.code] ?? t.err_generic;
  }
  return t.err_generic;
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
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

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
          <section className="rounded-card sky-header rounded-card p-4">
            <div className="text-sm opacity-70">{t.my_code}</div>
            <div className="tnum mt-1 text-[28px] font-bold tracking-wider">{fmtCode(me.data.friendCode)}</div>
            <Button tone="ghost" className="mt-2 bg-white/10 text-inherit hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20" onClick={async () => { if (await copyText(me.data!.friendCode)) toast(t.copied); }}>{t.copy}</Button>
          </section>
        )}

        <form onSubmit={submit} className="space-y-2">
          <TextField label={t.add_friend} placeholder={t.friend_code_placeholder} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          {error && <p className="text-sm text-berry">{error}</p>}
          <Button tone="primary" type="submit" className="w-full" disabled={send.isPending || code.replace(/\D/g, '').length !== 12}>{t.send_request}</Button>
        </form>

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
              <li key={f.id} className="flex items-center gap-2 rounded-card border border-line p-2 pl-3">
                <Link to={`/friends/${f.id}`} className="min-w-0 flex-1 py-2 font-semibold">{f.username}</Link>
                <Button tone="ghost" className="min-h-9 px-3 text-sm" onClick={() => { if (confirm(`${t.remove_friend} ${f.username} ?`)) removeFriend.mutate(f.id); }}>{t.remove_friend}</Button>
              </li>
            ))}
          </ul>
        </section>
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
                  <span className="tnum shrink-0 text-xs font-semibold text-ink-2">{t.progress(l.doneCount, l.entryCount)}</span>
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
