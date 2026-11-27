import { useFollowList } from '../lib/social.js';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { computeMedals, vivillonPatternFromKey, type VivillonPattern } from '@mydexpogo/shared';
import { MedalsCard } from '../components/Medals.js';
import { Sparkle } from '../components/Sprite.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, Chip, CopyButton, Empty, HoldButton, IconButton, Progress, Sheet, Spinner, TextField, TopBar, buttonClass } from '../components/ui.js';
import { BannerSlot } from '../components/BannerSlot.js';
import { normalize, useDataset } from '../lib/dataset.js';
import { errorMessage, fmtCode } from '../lib/errors.js';
import { useMe, useSetFriendCode } from '../lib/auth.js';
import { useLang, useT } from '../lib/i18n.js';
import { PinButton } from './ListsPage.js';
import { useFriendLists, useFriendRequests, useFriends, useLuckyFriend, useMembership, usePinFriend, useRemoveFriend, useRespondFriendRequest, useSendFriendRequest, type Friend } from '../lib/lists.js';
import { VisibilityIcon } from './ListsPage.js';
import { FriendQr, QrScanSheet } from '../components/FriendQr.js';
import { PageTourButton } from '../components/PageTour.js';
import { MyPostcardsCard, PostcardBadges, PostcardsDiscoverSection } from '../components/VivillonPostcards.js';

function useWantedVivillonSet(): Set<VivillonPattern> {
  const me = useMe();
  const membership = useMembership(!!me.data);
  return useMemo(() => {
    const out = new Set<VivillonPattern>();
    for (const e of membership.data ?? []) {
      if (e.done) continue;
      const p = vivillonPatternFromKey(e.variantKey);
      if (p) out.add(p);
    }
    return out;
  }, [membership.data]);
}

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
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab = rawTab === 'add' ? 'add' : rawTab === 'postcards' ? 'postcards' : 'friends';
  const friends = useFriends();
  const requests = useFriendRequests();
  const send = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();
  const pinFriend = usePinFriend();
  const luckyFriend = useLuckyFriend();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [friendQuery, setFriendQuery] = useState('');
  const [friendFilter, setFriendFilter] = useState<'all' | 'lucky' | 'postcards'>('all');
  // Opened from the app icon's "My friend code" shortcut: the QR at once.
  const [showQr, setShowQr] = useState(() => new URLSearchParams(location.search).has('qr'));
  const [scanning, setScanning] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [menuFor, setMenuFor] = useState<Friend | null>(null);
  const { lang } = useLang();
  const wantedVivillon = useWantedVivillonSet();

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
  const allFriends = friends.data ?? [];
  const anyLucky = allFriends.some((f) => f.lucky);
  const anyWantedPostcard = wantedVivillon.size > 0 && allFriends.some((f) => f.postcards?.some((p) => wantedVivillon.has(p.pattern)));
  const normFriendQ = normalize(friendQuery);
  const visibleFriends = allFriends.filter((f) => {
    if (friendFilter === 'lucky' && !f.lucky) return false;
    if (friendFilter === 'postcards' && !f.postcards?.some((p) => wantedVivillon.has(p.pattern))) return false;
    if (normFriendQ && !normalize(`${f.username} ${f.friendCode}`).includes(normFriendQ)) return false;
    return true;
  });

  return (
    <>
      <TopBar title={t.friends} actions={<PageTourButton page="friends" />}>
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-5" role="tablist">
          <Chip role="tab" aria-selected={tab === 'friends'} active={tab === 'friends'} onClick={() => setParams({}, { replace: true })}>
            {t.friends_tab_list}
            {incoming.length > 0 && <span className="tnum rounded-full bg-go px-1.5 text-[11px] font-bold leading-4 text-white">{incoming.length}</span>}
          </Chip>
          <Chip role="tab" aria-selected={tab === 'add'} active={tab === 'add'} onClick={() => setParams({ tab: 'add' }, { replace: true })}>
            {t.friends_tab_add}
          </Chip>
          <Chip role="tab" aria-selected={tab === 'postcards'} active={tab === 'postcards'} onClick={() => setParams({ tab: 'postcards' }, { replace: true })}>
            🦋 {t.friends_tab_postcards}
          </Chip>
        </div>
      </TopBar>
      <main className="mx-auto max-w-6xl space-y-5 px-3 pb-24 sm:px-5">
        <BannerSlot page="friends" />
        {tab === 'postcards' ? (
          <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
            <MyPostcardsCard />
            <PostcardsDiscoverSection />
          </div>
        ) : tab === 'add' ? (
          <div className="mx-auto max-w-xl space-y-4">
            <form onSubmit={submit} className="card space-y-2.5 p-4">
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
            <button
              type="button"
              onClick={() => setParams({ tab: 'postcards' }, { replace: true })}
              className="card flex w-full items-center gap-3 p-3.5 text-left transition hover:brightness-[0.98] active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky/15 text-lg" aria-hidden="true">🦋</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.postcards_title}</span>
                <span className="block text-xs text-ink-2">{t.friends_add_vivillon_hint}</span>
              </span>
              <span className="text-ink-3" aria-hidden="true">›</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
            <div className="space-y-5">
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
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">{t.friends} <span className="tnum font-normal text-ink-3">{friends.data?.length ?? ''}</span></h2>
                <Button tone="ghost" className="min-h-8 px-2.5 text-xs text-sky" onClick={() => setParams({ tab: 'add' }, { replace: true })}>
                  + {t.friends_tab_add}
                </Button>
              </div>
              {allFriends.length > 4 && (
                <div className="relative mb-2">
                  <input
                    type="search"
                    inputMode="search"
                    value={friendQuery}
                    onChange={(e) => setFriendQuery(e.target.value)}
                    placeholder={t.friends_search}
                    aria-label={t.friends_search}
                    className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
                  />
                  {friendQuery && (
                    <button type="button" onClick={() => setFriendQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">✕</button>
                  )}
                </div>
              )}
              {(anyLucky || anyWantedPostcard) && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  <Chip active={friendFilter === 'all'} onClick={() => setFriendFilter('all')} className="min-h-8 px-2.5 text-xs">{t.friends_filter_all}</Chip>
                  {anyLucky && (
                    <Chip active={friendFilter === 'lucky'} onClick={() => setFriendFilter(friendFilter === 'lucky' ? 'all' : 'lucky')} className="min-h-8 px-2.5 text-xs">
                      ✨ {t.friends_filter_lucky}
                    </Chip>
                  )}
                  {anyWantedPostcard && (
                    <Chip active={friendFilter === 'postcards'} onClick={() => setFriendFilter(friendFilter === 'postcards' ? 'all' : 'postcards')} className="min-h-8 px-2.5 text-xs">
                      🦋 {t.friends_filter_postcards}
                    </Chip>
                  )}
                </div>
              )}
              {friends.isPending && <Spinner />}
              {friends.data?.length === 0 && <Empty>{t.no_friends}</Empty>}
              {allFriends.length > 0 && visibleFriends.length === 0 && <Empty>{t.nothing_here}</Empty>}
              <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {visibleFriends.map((f) => (
                  <li key={f.id} className={`card p-2 pl-3 ${f.lucky ? 'ring-1 ring-shiny/70' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <PinButton on={!!f.favorite} label={f.favorite ? t.unpin : t.pin} onClick={() => pinFriend.mutate({ id: f.id, on: !f.favorite })} className="-ml-1.5" />
                      <Link to={`/friends/${f.id}`} className="min-w-0 flex-1 py-1.5">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{f.username}</span>
                          {f.lucky && <Badge tone="shiny">✨ {t.lucky_friend}</Badge>}
                        </span>
                        <span className="block text-xs text-ink-3">{t.friend_line(f.lists ?? 0, new Date(f.since).toLocaleDateString(lang, { month: 'long', year: 'numeric' }))}</span>
                      </Link>
                      <LuckyButton on={!!f.lucky} label={f.lucky ? t.lucky_unmark : t.lucky_mark} onClick={() => luckyFriend.mutate({ id: f.id, on: !f.lucky })} />
                      <IconButton label={t.friend_options(f.username)} onClick={() => setMenuFor(f)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                      </IconButton>
                    </div>
                    {!!f.postcards?.length && (
                      <div className="mt-1.5 border-t border-line/60 pb-1 pt-2">
                        <PostcardBadges postcards={f.postcards} wantedSet={wantedVivillon} compact />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            {/* What is done to a friend, out of the way of a stray tap: see profile, lucky, pin, remove (asked twice). */}
            <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.username ?? ''}>
              {menuFor && (
                <div className="space-y-2">
                  <Link to={`/friends/${menuFor.id}`} className={buttonClass('quiet', 'w-full')}>{t.friend_see_profile}</Link>
                  <Button className="w-full" onClick={() => { luckyFriend.mutate({ id: menuFor.id, on: !menuFor.lucky }); setMenuFor(null); }}>
                    ✨ {menuFor.lucky ? t.lucky_unmark : t.lucky_mark}
                  </Button>
                  <Button className="w-full" onClick={() => { pinFriend.mutate({ id: menuFor.id, on: !menuFor.favorite }); setMenuFor(null); }}>{menuFor.favorite ? t.unpin : t.pin}</Button>
                  <HoldButton className="w-full" disabled={removeFriend.isPending} onConfirm={async () => { await removeFriend.mutateAsync(menuFor.id); toast(t.friend_removed(menuFor.username)); setMenuFor(null); }}>{t.friend_remove_confirm(menuFor.username)}</HoldButton>
                </div>
              )}
            </Sheet>
          </div>
        )}
      </main>
    </>
  );
}

function LuckyButton({ on, label, onClick, className = '' }: { on: boolean; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-paper-2 active:scale-95 ${on ? 'text-shiny' : 'text-ink-3'} ${className}`}
    >
      <Sparkle className={`h-5 w-5 ${on ? 'scale-110' : 'opacity-60'}`} />
    </button>
  );
}

export function FriendListsPage() {
  const t = useT();
  const { lang } = useLang();
  const { id } = useParams<{ id: string }>();
  const q = useFriendLists(id!);
  const dataset = useDataset();
  const pinFriend = usePinFriend();
  const luckyFriend = useLuckyFriend();
  const wantedVivillon = useWantedVivillonSet();
  const friend = q.data?.friend;
  const isLucky = !!friend?.lucky;
  const isPinned = !!friend?.favorite;
  const lists = q.data?.lists ?? [];
  const totalEntries = lists.reduce((n, l) => n + l.entryCount, 0);
  const totalDone = lists.reduce((n, l) => n + l.doneCount, 0);

  const medals = useMemo(() => {
    if (!dataset.data || !q.data?.profile) return null;
    return computeMedals(dataset.data.ds, q.data.profile);
  }, [dataset.data, q.data?.profile]);

  return (
    <>
      <TopBar
        title={friend ? friend.username : t.friends}
        back
        actions={
          friend ? (
            <div className="flex items-center">
              <PinButton
                on={isPinned}
                label={isPinned ? t.unpin : t.pin}
                onClick={() => pinFriend.mutate({ id: id!, on: !isPinned })}
                className="text-current"
              />
              <LuckyButton
                on={isLucky}
                label={isLucky ? t.lucky_unmark : t.lucky_mark}
                onClick={() => luckyFriend.mutate({ id: id!, on: !isLucky })}
                className="text-current"
              />
            </div>
          ) : undefined
        }
      />
      <main className="mx-auto max-w-6xl space-y-5 px-3 pb-24 sm:px-5">
        {q.isPending && <Spinner />}
        {q.isError && <Empty>{t.err_not_found}</Empty>}
        {friend && (
          <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
            <div className="space-y-5">
              {/* Friend trainer header card */}
              <section className={`card p-4 ${isLucky ? 'ring-1 ring-shiny/70' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[22px] font-bold leading-tight">{friend.username}</h2>
                  {isLucky && <Badge tone="shiny">✨ {t.lucky_friend}</Badge>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="tnum font-mono text-sm text-ink-2">{fmtCode(friend.friendCode)}</span>
                  <CopyButton text={friend.friendCode} className="min-h-8 px-2.5 text-xs" />
                </div>
                {friend.since && (
                  <p className="mt-1 text-xs text-ink-3">
                    {t.friend_since(new Date(friend.since).toLocaleDateString(lang, { month: 'long', year: 'numeric' }))}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                  <span className="tnum rounded-full bg-paper-2 px-2.5 py-1 text-ink-2">
                    {t.me_stats_lists(lists.length)}
                  </span>
                  {totalEntries > 0 && (
                    <span className="tnum rounded-full bg-paper-2 px-2.5 py-1 text-ink-2">
                      {t.friend_stats_caught(totalDone, totalEntries)}
                    </span>
                  )}
                  {q.data?.profile && (
                    <span className="tnum rounded-full bg-paper-2 px-2.5 py-1 text-ink-2">
                      {t.me_stats_friends(q.data.profile.friendsCount)}
                    </span>
                  )}
                </div>
              </section>

              {/* Friend's Vivillon postcards */}
              <section className="card space-y-2.5 p-4">
                <h2 className="text-base font-bold">🦋 {t.friend_postcards_title}</h2>
                {friend.postcards?.length ? (
                  <PostcardBadges postcards={friend.postcards} wantedSet={wantedVivillon} />
                ) : (
                  <p className="text-xs text-ink-3">{t.friend_postcards_empty}</p>
                )}
              </section>

              {/* Friend's badges / medals */}
              {medals && <MedalsCard data={medals} title={t.friend_medals_title} />}
            </div>

            {/* Friend's shared collections */}
            <section>
              <h2 className="mb-2 text-base font-bold">
                {t.friend_collections_title} <span className="tnum font-normal text-ink-3">{lists.length}</span>
              </h2>
              {lists.length === 0 ? (
                <Empty>{t.nothing_here}</Empty>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {lists.map((l) => (
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
              )}
            </section>
          </div>
        )}
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
