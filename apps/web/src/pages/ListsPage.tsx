import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ListSummary, ListVisibility } from '@mydexpogo/shared';
import { Button, Chip, Empty, IconButton, Progress, Sheet, Spinner, TextField, TopBar } from '../components/ui.js';
import { useAllFriendLists } from '../lib/social.js';
import { useT } from '../lib/i18n.js';
import { useCreateList, useLists, usePinList, useReorderLists } from '../lib/lists.js';

export function VisibilityField({ value, onChange }: { value: ListVisibility; onChange: (v: ListVisibility) => void }) {
  const t = useT();
  // "Anyone with the link" is gone: a list is mine or my friends'. The share link stays available on friends' lists.
  const opts: [ListVisibility, string][] = [['private', t.vis_private], ['friends', t.vis_friends]];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink-2">{t.list_visibility}</legend>
      <div className="space-y-1">
        {opts.map(([v, label]) => (
          <label key={v} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-paper-2">
            <input type="radio" name="visibility" value={v} checked={value === v} onChange={() => onChange(v)} className="h-4 w-4 accent-go" />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function VisibilityIcon({ v }: { v: ListVisibility }) {
  const t = useT();
  const label = { private: t.vis_private, friends: t.vis_friends, link: t.vis_link }[v];
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className="text-ink-3">
      {v === 'private' && <path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />}
      {v === 'friends' && <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />}
      {v === 'link' && <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />}
    </svg>
  );
}

export function ListsPage() {
  const t = useT();
  const lists = useLists();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'friends' ? 'friends' : 'mine';
  const friendLists = useAllFriendLists(tab === 'friends');
  const create = useCreateList();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('friends');
  const [ordering, setOrdering] = useState(false);
  const reorder = useReorderLists();
  const move = (i: number, by: number) => {
    const ids = (lists.data ?? []).map((l) => l.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), description: description.trim() || null, visibility });
    setOpen(false);
    setName('');
    setDescription('');
  };

  return (
    <>
      <TopBar
        title={t.nav_lists}
        actions={
          tab === 'mine' ? (
            <IconButton label={t.new_list} onClick={() => setOpen(true)} className="bg-ink text-paper hover:bg-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </IconButton>
          ) : null
        }
      >
        <div className="mx-auto flex max-w-3xl gap-2 px-3 pb-2">
          <Chip active={tab === 'mine'} onClick={() => setParams({}, { replace: true })}>{t.lists_mine}</Chip>
          <Chip active={tab === 'friends'} onClick={() => setParams({ tab: 'friends' }, { replace: true })}>{t.lists_friends}</Chip>
        </div>
      </TopBar>
      {tab === 'friends' ? (
        <main className="mx-auto max-w-3xl px-3 pb-24">
          <FriendLists lists={friendLists.data} pending={friendLists.isPending} />
        </main>
      ) : (
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {lists.isPending && <Spinner />}
        {lists.data?.length === 0 && (
          <Empty>
            {t.no_lists_yet}
            <br />
            <Button tone="primary" className="mt-4" onClick={() => setOpen(true)}>{t.new_list}</Button>
          </Empty>
        )}
        {(lists.data?.length ?? 0) > 1 && (
          <div className="flex items-center gap-3 py-2">
            <p className="min-w-0 flex-1 text-xs text-ink-3">{ordering ? t.reorder_hint : ''}</p>
            <button type="button" aria-pressed={ordering} onClick={() => setOrdering((v) => !v)} className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${ordering ? 'bg-sky text-white' : 'bg-paper-2 text-ink'}`}>
              {ordering ? t.pick_done : t.reorder}
            </button>
          </div>
        )}
        <ul className="space-y-2">
          {lists.data?.map((l, i) =>
            ordering ? (
              <li key={l.id} className="card flex items-center gap-2 p-2 pl-3">
                <span className="min-w-0 flex-1 truncate font-bold">{l.name}</span>
                <IconButton label={t.move_up} className="h-10 w-10 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                </IconButton>
                <IconButton label={t.move_down} className="h-10 w-10 disabled:opacity-30" disabled={i === lists.data!.length - 1} onClick={() => move(i, 1)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </IconButton>
              </li>
            ) : (
              <ListCard key={l.id} l={l} />
            ),
          )}
        </ul>
      </main>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t.new_list}>
        <form onSubmit={submit} className="space-y-3">
          <TextField label={t.list_name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
          <TextField label={t.list_description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          <VisibilityField value={visibility} onChange={setVisibility} />
          <Button tone="primary" className="w-full" type="submit" disabled={create.isPending || !name.trim()}>{t.create}</Button>
        </form>
      </Sheet>
    </>
  );
}

function ListCard({ l, showVisibility = true, pinnable = false }: { l: ListSummary; showVisibility?: boolean; pinnable?: boolean }) {
  const t = useT();
  const pin = usePinList();
  return (
    <li className="relative">
      <Link to={`/lists/${l.id}`} className="card block p-3 transition hover:brightness-[0.98]">
        <div className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[17px] font-bold ${pinnable ? 'pr-9' : ''}`}>{l.name}</span>
          {showVisibility && <VisibilityIcon v={l.visibility} />}
        </div>
        {l.description && <p className="mt-0.5 truncate text-sm text-ink-2">{l.description}</p>}
        <div className="mt-2 flex items-center gap-3">
          <Progress done={l.doneCount} total={l.entryCount} />
          <span className="tnum shrink-0 text-xs font-semibold text-ink-2">{t.progress(l.doneCount, l.entryCount)}</span>
        </div>
      </Link>
      {pinnable && <PinButton on={!!l.favorite} label={l.favorite ? t.unpin : t.pin} onClick={() => pin.mutate({ id: l.id, on: !l.favorite })} className="absolute right-1.5 top-1.5" />}
    </li>
  );
}

/** A star: pinned things come first. */
export function PinButton({ on, label, onClick, className = '' }: { on: boolean; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-paper-2 ${on ? 'text-shiny' : 'text-ink-3'} ${className}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" /></svg>
    </button>
  );
}

/** Friends' lists, read-only, grouped by friend. They refresh live when a friend edits them. */
function FriendLists({ lists, pending }: { lists: ListSummary[] | undefined; pending: boolean }) {
  const t = useT();
  if (pending) return <Spinner />;
  if (!lists?.length) return <Empty>{t.friends_lists_empty}</Empty>;
  // Pinned collections on top, then each friend (pinned friends first) with their collections in their own order.
  const pinned = lists.filter((l) => l.favorite);
  const byOwner = new Map<string, ListSummary[]>();
  const owners = [...lists].sort((a, b) => Number(!!b.ownerFavorite) - Number(!!a.ownerFavorite) || a.ownerName.localeCompare(b.ownerName));
  for (const o of owners) if (!byOwner.has(o.ownerId)) byOwner.set(o.ownerId, lists.filter((l) => l.ownerId === o.ownerId));
  return (
    <>
      {pinned.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-base font-bold">{t.pinned} <span className="tnum font-normal text-ink-3">{pinned.length}</span></h2>
          <ul className="space-y-2">{pinned.map((l) => <ListCard key={l.id} l={{ ...l, description: l.description ? `${l.ownerName} · ${l.description}` : l.ownerName }} showVisibility={false} pinnable />)}</ul>
        </section>
      )}
      {[...byOwner.values()].map((ls) => (
        <section key={ls[0]!.ownerId} className="mb-5">
          <h2 className="mb-2 text-base font-bold">
            {ls[0]!.ownerFavorite && <span className="mr-1 text-shiny" aria-hidden="true">★</span>}
            <Link to={`/friends/${ls[0]!.ownerId}`} className="hover:underline">{ls[0]!.ownerName}</Link> <span className="tnum font-normal text-ink-3">{ls.length}</span>
          </h2>
          <ul className="space-y-2">{ls.map((l) => <ListCard key={l.id} l={l} showVisibility={false} pinnable />)}</ul>
        </section>
      ))}
    </>
  );
}
