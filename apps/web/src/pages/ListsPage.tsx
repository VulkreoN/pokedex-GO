import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ListSummary, ListVisibility } from '@mydexpogo/shared';
import { Button, Chip, Empty, IconButton, Progress, Sheet, Spinner, SwitchThumb, TextField, TopBar } from '../components/ui.js';
import { BannerSlot } from '../components/BannerSlot.js';
import { PageTourButton } from '../components/PageTour.js';
import { useToast } from '../components/toast.js';
import { normalize, useDataset } from '../lib/dataset.js';
import { errorMessage } from '../lib/errors.js';
import { LIST_TEMPLATES, buildTemplateEntries, type ListTemplateId } from '../lib/listTemplates.js';
import { useAllFriendLists } from '../lib/social.js';
import { useT } from '../lib/i18n.js';
import { useCreateList, useLists, usePinList, useReorderLists, useUpsertEntries } from '../lib/lists.js';
import { feedback } from '../lib/feedback.js';

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
  const toast = useToast();
  const dataset = useDataset();
  const lists = useLists();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'friends' ? 'friends' : 'mine';
  const friendLists = useAllFriendLists(tab === 'friends');
  const create = useCreateList();
  const upsert = useUpsertEntries();
  const [open, setOpen] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('friends');
  const [alertPreEvolutions, setAlertPreEvolutions] = useState(false);
  const [template, setTemplate] = useState<ListTemplateId>('empty');
  const [filling, setFilling] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const reorder = useReorderLists();
  const move = (i: number, by: number) => {
    const ids = (lists.data ?? []).map((l) => l.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    feedback('drop');
    reorder.mutate(arrayMove(ids, i, j));
  };
  // Dragged by the handle: a finger, the mouse or the keyboard (space, arrows, space).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const ids = (lists.data ?? []).map((l) => l.id);
    if (!over || active.id === over.id) return;
    feedback('drop');
    reorder.mutate(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const pickTemplate = (id: ListTemplateId) => {
    const prevAuto = template !== 'empty' ? (t.templates[template] ?? '') : '';
    setTemplate(id);
    if (id !== 'empty' && (!name.trim() || name.trim() === prevAuto)) {
      setName((t.templates[id] ?? '').slice(0, 60));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setFilling(true);
    let createdId: string | null = null;
    try {
      const r = await create.mutateAsync({ name: name.trim(), description: description.trim() || null, visibility, alertPreEvolutions });
      createdId = r.list.id;
      if (template !== 'empty' && dataset.data) {
        const entries = buildTemplateEntries(dataset.data, template);
        for (let k = 0; k < entries.length; k += 1000) {
          await upsert.mutateAsync({ id: r.list.id, entries: entries.slice(k, k + 1000), insertOnly: true });
        }
        if (entries.length) toast(t.template_count(entries.length));
      }
      setOpen(false);
      setName('');
      setDescription('');
      setAlertPreEvolutions(false);
      setTemplate('empty');
    } catch (err) {
      toast(errorMessage(t, err));
      if (createdId) {
        setOpen(false);
        setName('');
        setDescription('');
        setAlertPreEvolutions(false);
        setTemplate('empty');
      }
    } finally {
      setFilling(false);
    }
  };

  return (
    <>
      <TopBar
        title={t.nav_lists}
        actions={<PageTourButton page="lists" />}
      >
        <div className="mx-auto flex max-w-6xl gap-2 px-3 pb-2 sm:px-5">
          <Chip active={tab === 'mine'} onClick={() => setParams({}, { replace: true })}>{t.lists_mine}</Chip>
          <Chip active={tab === 'friends'} onClick={() => setParams({ tab: 'friends' }, { replace: true })}>{t.lists_friends}</Chip>
        </div>
      </TopBar>
      {tab === 'friends' ? (
        <main className="mx-auto max-w-6xl px-3 pb-24 sm:px-5">
          <BannerSlot page="lists" />
          <FriendLists lists={friendLists.data} pending={friendLists.isPending} />
        </main>
      ) : (
      <main className={`mx-auto max-w-6xl px-3 sm:px-5 ${ordering ? 'pb-40' : 'pb-24'}`}>
        <BannerSlot page="lists" />
        {lists.isPending && <Spinner />}
        {lists.data?.length === 0 && (
          <Empty>
            {t.no_lists_yet}
            <br />
            <Button tone="primary" className="mt-4" onClick={() => setOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {t.new_list}
            </Button>
          </Empty>
        )}
        {(lists.data?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            {!ordering && (
              <Button tone="primary" className="min-h-10 px-3.5 text-sm shadow-sm" onClick={() => setOpen(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {t.new_list}
              </Button>
            )}
            <p className="min-w-0 flex-1 text-xs text-ink-3">{ordering ? t.reorder_hint : ''}</p>
            {(lists.data?.length ?? 0) > 1 && (
              <button type="button" aria-pressed={ordering} onClick={() => setOrdering((v) => !v)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${ordering ? 'bg-sky text-white' : 'bg-paper-2 text-ink'}`}>
                {ordering ? t.pick_done : t.reorder}
              </button>
            )}
          </div>
        )}
        {(lists.data?.length ?? 0) > 6 && !ordering && (
          <div className="relative pb-2">
            <input
              type="search"
              inputMode="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={t.search_placeholder}
              aria-label={t.my_lists}
              className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
            />
            {listQuery && (
              <button type="button" onClick={() => setListQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 -mt-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">✕</button>
            )}
          </div>
        )}
        {ordering ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
            <SortableContext items={(lists.data ?? []).map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {lists.data?.map((l, i) => <SortableRow key={l.id} l={l} first={i === 0} last={i === lists.data!.length - 1} onMove={(by) => move(i, by)} />)}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <ul className="stagger grid grid-cols-1 gap-2 md:grid-cols-2">
            {(lists.data ?? [])
              .filter((l) => !listQuery.trim() || normalize(`${l.name} ${l.description ?? ''}`).includes(normalize(listQuery)))
              .map((l) => <ListCard key={l.id} l={l} />)}
          </ul>
        )}
      </main>
      )}
      {ordering && tab === 'mine' && (
        // Stays on screen however far the list scrolls.
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-[var(--nav-h)] z-20 px-3">
          <div className="mx-auto flex max-w-6xl justify-center">
            <button type="button" onClick={() => setOrdering(false)} className="toast-in pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-sky px-6 font-semibold text-white shadow-lg hover:brightness-110">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
              {t.pick_done}
            </button>
          </div>
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t.new_list}>
        {open && (
          <form onSubmit={submit} className="space-y-3">
            <TextField label={t.list_name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
            <TextField label={t.list_description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            <div>
              <p className="mb-1 text-sm font-medium text-ink-2">{t.template_title}</p>
              <p className="mb-2 text-xs text-ink-3">{t.template_hint}</p>
              <div className="flex flex-wrap gap-1.5">
                {LIST_TEMPLATES.map((id) => (
                  <Chip key={id} active={template === id} onClick={() => pickTemplate(id)} className="min-h-8 px-2.5 text-xs">
                    {t.templates[id] ?? id}
                  </Chip>
                ))}
              </div>
            </div>
            <VisibilityField value={visibility} onChange={setVisibility} />
            <button
              type="button"
              aria-pressed={alertPreEvolutions}
              onClick={() => setAlertPreEvolutions((v) => !v)}
              className="flex w-full items-center gap-3 rounded-card border border-line px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.list_alert_pre_evos}</span>
                <span className="block text-xs text-ink-3">{t.list_alert_pre_evos_hint}</span>
              </span>
              <SwitchThumb on={alertPreEvolutions} />
            </button>
            <Button tone="primary" className="w-full" type="submit" disabled={filling || create.isPending || !name.trim()}>
              {filling ? t.template_filling : t.create}
            </Button>
          </form>
        )}
      </Sheet>
    </>
  );
}

/** Collections only move up and down. */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** A collection while reordering: dragged by its handle, or moved with the arrows. */
function SortableRow({ l, first, last, onMove }: { l: ListSummary; first: boolean; last: boolean; onMove: (by: number) => void }) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: l.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card relative flex items-center gap-1 p-2 ${isDragging ? 'z-10 scale-[1.03] shadow-2xl ring-2 ring-go' : ''} transition-[box-shadow,scale]`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t.drag_to_move(l.name)}
        className={`flex h-10 w-9 shrink-0 touch-none items-center justify-center rounded-lg text-ink-3 hover:bg-paper-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
      </button>
      <span className="min-w-0 flex-1 truncate font-bold">{l.name}</span>
      <IconButton label={t.move_up} className="h-10 w-10 disabled:opacity-30" disabled={first} onClick={() => onMove(-1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </IconButton>
      <IconButton label={t.move_down} className="h-10 w-10 disabled:opacity-30" disabled={last} onClick={() => onMove(1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </IconButton>
    </li>
  );
}

function ListCard({ l, showVisibility = true, pinnable = false }: { l: ListSummary; showVisibility?: boolean; pinnable?: boolean }) {
  const t = useT();
  const pin = usePinList();
  const complete = l.entryCount > 0 && l.doneCount === l.entryCount;
  const pct = l.entryCount ? Math.round((l.doneCount / l.entryCount) * 100) : 0;
  return (
    <li className="relative">
      <Link to={`/lists/${l.id}`} className={`card block p-3 transition hover:brightness-[0.98] ${complete ? 'ring-1 ring-go/45' : ''}`}>
        <div className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[17px] font-bold ${pinnable ? 'pr-9' : ''}`}>
            {complete && (
              <span className="mr-1.5 inline-block text-shiny" role="img" aria-label={t.collection_complete} title={t.collection_complete}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="-mt-1 inline" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5Z" /></svg>
              </span>
            )}
            {l.name}
          </span>
          {showVisibility && <VisibilityIcon v={l.visibility} />}
        </div>
        {l.description && <p className="mt-0.5 truncate text-sm text-ink-2">{l.description}</p>}
        <div className="mt-2 flex items-center gap-3">
          <Progress done={l.doneCount} total={l.entryCount} />
          <span className="tnum shrink-0 text-xs font-semibold text-ink-2">
            {l.entryCount ? `${t.progress(l.doneCount, l.entryCount)} · ${pct}%` : t.list_empty_short}
          </span>
        </div>
      </Link>
      {pinnable && <PinButton on={!!l.favorite} label={l.favorite ? t.unpin : t.pin} onClick={() => pin.mutate({ id: l.id, on: !l.favorite })} className="absolute right-1.5 top-1.5" />}
    </li>
  );
}

/** A star: pinned things come first. */
export function PinButton({ on, label, onClick, className = '' }: { on: boolean; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label} onClick={() => { feedback(on ? 'untick' : 'tick'); onClick(); }} className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-paper-2 ${on ? 'text-shiny' : 'text-ink-3'} ${className}`}>
      <svg key={String(on)} className={on ? 'pop' : ''} width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" /></svg>
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
          <ul className="stagger grid grid-cols-1 gap-2 md:grid-cols-2">{pinned.map((l) => <ListCard key={l.id} l={{ ...l, description: l.description ? `${l.ownerName} · ${l.description}` : l.ownerName }} showVisibility={false} pinnable />)}</ul>
        </section>
      )}
      {[...byOwner.values()].map((ls) => (
        <section key={ls[0]!.ownerId} className="mb-5">
          <h2 className="mb-2 text-base font-bold">
            {ls[0]!.ownerFavorite && <span className="mr-1 text-shiny" aria-hidden="true">★</span>}
            <Link to={`/friends/${ls[0]!.ownerId}`} className="hover:underline">{ls[0]!.ownerName}</Link> <span className="tnum font-normal text-ink-3">{ls.length}</span>
          </h2>
          <ul className="stagger grid grid-cols-1 gap-2 md:grid-cols-2">{ls.map((l) => <ListCard key={l.id} l={l} showVisibility={false} pinnable />)}</ul>
        </section>
      ))}
    </>
  );
}
