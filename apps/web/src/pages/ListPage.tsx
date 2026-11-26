import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { ListDetail, ListDetailEntry, ListEntry, ListVisibility } from '@mydexpogo/shared';
import { ImportSearch } from '../components/ImportSearch.js';
import { ListHistory } from '../components/ListHistory.js';
import { FormBlindWarning, SearchSettingsPanel, SearchStrings, useSearchSettings } from '../components/SearchStrings.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, CardsSkeleton, Chip, Empty, HoldButton, IconButton, Progress, Sheet, SwitchThumb, TextField, TopBar, useRolling } from '../components/ui.js';
import { copyText } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { entryVariant, genderSymbol, matchesQuery, normalize, tagLabel, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCopyList, useDeleteList, useList, useRemoveEntries, useShareList, useSharedList, useUpdateList, type ListAccess } from '../lib/lists.js';
import { useUpsertEntries } from '../lib/lists.js';
import { VisibilityField } from './ListsPage.js';
import { useFollowList, useOffer } from '../lib/social.js';
import { CARD_SORTS, cardDone, cardMissing, cardsOf, sortCards, type CardSort, type EntryCard } from '../lib/cards.js';
import { exportListPdf, fileSlug } from '../lib/pdf.js';
import { canCopyPicture, canSharePictures, copyPicture, downloadBlob, renderListImages, sharePictures, type ImageLayout } from '../lib/shareImage.js';
import { exportSearch } from '../lib/searchString.js';
import { selection } from '../lib/selection.js';
import { celebrate, feedback } from '../lib/feedback.js';
import { useProgressive } from '../lib/progressive.js';

/** The collection opened last on this device, for the app icon's shortcut. */
export function LastListRedirect() {
  let last: string | null = null;
  try {
    last = localStorage.getItem('lastList');
  } catch {}
  return <Navigate to={last ? `/lists/${last}` : '/lists'} replace />;
}

export function ListPage() {
  const { id } = useParams<{ id: string }>();
  const q = useList(id!);
  useEffect(() => {
    if (!q.data) return;
    try {
      localStorage.setItem('lastList', id!);
    } catch {}
  }, [id, q.data]);
  return <ListView query={q} id={id!} />;
}

export function SharedListPage() {
  const { token } = useParams<{ token: string }>();
  const q = useSharedList(token!);
  return <ListView query={q} token={token!} />;
}

type Q = { data?: { list: ListDetail; access: ListAccess; following?: boolean }; isPending: boolean; isError: boolean; error: unknown };

function ListView({ query, id, token }: { query: Q; id?: string; token?: string }) {
  const t = useT();
  const dataset = useDataset();
  const me = useMe();
  if (query.isPending || dataset.isPending) return <main className="mx-auto max-w-3xl px-3 pt-20"><CardsSkeleton count={9} className="grid-cols-3 sm:grid-cols-5" /></main>;
  if (query.isError || !query.data || !dataset.data) {
    return (
      <>
        <TopBar title={t.nav_lists} back />
        <Empty>
          {t.err_not_found}
          {!me.data && <><br /><Link to="/login" className="mt-2 inline-block font-semibold text-sky">{t.login_required}</Link></>}
        </Empty>
      </>
    );
  }
  return <ListBody idx={dataset.data} list={query.data.list} access={query.data.access} following={query.data.following} id={id} token={token} loggedIn={!!me.data} meName={me.data?.username} />;
}

type View = 'missing' | 'caught' | 'all';

function ListBody({ idx, list, access, following, id, token, loggedIn, meName }: { idx: DatasetIndex; list: ListDetail; access: ListAccess; following?: boolean; id?: string; token?: string; loggedIn: boolean; meName?: string }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const owner = access === 'owner';
  const friend = access === 'friend';
  const offer = useOffer(list.id);
  const follow = useFollowList(list.id);
  const [exporting, setExporting] = useState<'save' | 'copy' | 'share' | 'pdf' | null>(null);
  const [imageLayout, setImageLayout] = useState<ImageLayout>('preview');
  const [sharing, setSharing] = useState(false);
  const [exportMissing, setExportMissing] = useState(true);
  // The game search and its QR code at the end of the picture / PDF: on unless the player turned it off (kept).
  const [withSearch, setWithSearchState] = useState(() => {
    try {
      return localStorage.getItem('exportWithSearch') !== '0';
    } catch {
      return true;
    }
  });
  const setWithSearch = (on: boolean) => {
    setWithSearchState(on);
    try {
      localStorage.setItem('exportWithSearch', on ? '1' : '0');
    } catch {}
  };
  const [view, setView] = useState<View>('missing');
  const [query, setQuery] = useState('');
  const [strings, setStrings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<EntryCard | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  // Several cards at once: tapping a card picks it instead of ticking it.
  const [picking, setPicking] = useState(false);
  /** Picked genders of cards: `${card id}|${gender}`. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickSex, setPickSex] = useState<'all' | 'm' | 'f'>('all');
  const [pickVersion, setPickVersion] = useState<'all' | 'normal' | 'shiny'>('all');
  const [bulkBusy, setBulkBusy] = useState(false);
  const upsert = useUpsertEntries();
  const remove = useRemoveEntries();
  const update = useUpdateList(list.id);
  const del = useDeleteList();
  const share = useShareList();
  const copy = useCopyList();

  // One card per target; ♂ / ♀ are tracked inside it. A card is "missing" while one of its genders is.
  const [sort, setSortState] = useState<CardSort>(() => {
    try {
      const saved = localStorage.getItem('listSort') as CardSort | null;
      if (saved && CARD_SORTS.includes(saved)) return saved;
    } catch {}
    return 'added';
  });
  const setSort = (v: CardSort) => {
    setSortState(v);
    try {
      localStorage.setItem('listSort', v);
    } catch {}
  };
  const rank = useMemo(() => new Map(idx.ds.variants.map((v, i) => [v.key, i])), [idx]);
  const allCards = useMemo(() => cardsOf(list.entries), [list.entries]);
  // Search by name, number or costume / form name ("sorcière"), like the Pokédex; any word may match.
  const words = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);
  const cards = useMemo(
    () =>
      sortCards(
        allCards.filter((c) => {
          if (!(view === 'all' || (view === 'caught' ? c.members.some((m) => m.done) : cardMissing(c)))) return false;
          if (!words.length) return true;
          const v = idx.variantByKey.get(c.variantKey) ?? entryVariant(idx, c.variantKey, 'm');
          if (!v) return false;
          const label = normalize(`${v.label?.en ?? ''} ${v.label?.fr ?? ''}`);
          return words.some((w) => matchesQuery(idx, v.dex, w) || (!/^\d+$/.test(w) && label.includes(w)));
        }),
        sort,
        {
          rank: (k) => rank.get(k) ?? Number.MAX_SAFE_INTEGER,
          name: (k) => localized(idx.speciesByDex.get(idx.variantByKey.get(k)?.dex ?? 0)?.name, lang) ?? '',
        },
      ),
    [allCards, view, words, sort, rank, idx, lang],
  );
  const done = list.entries.filter((e) => e.done).length;
  // The count rolls up as cards are ticked.
  const rolledDone = useRolling(done);
  // A big collection builds its first cards at once, the next ones as they come near the screen.
  const { shown: shownCards, more: cardsMore, sentinel: cardsSentinel } = useProgressive(cards, `${view}|${sort}|${query}`);

  /** A sound and a vibration for each tick; the last missing Pokémon of the collection gets confetti. */
  /** Plays the reward, and returns the milestone reached (25, 50, 75) for the message, if any. */
  const reward = (members: ListDetailEntry[], value: boolean): number | undefined => {
    const changed = new Set(members.map((m) => `${m.variantKey}|${m.gender}|${m.shiny}|${m.tag}`));
    const total = list.entries.length;
    const before = list.entries.filter((e) => e.done).length;
    const after = list.entries.filter((e) => (changed.has(`${e.variantKey}|${e.gender}|${e.shiny}|${e.tag}`) ? value : e.done)).length;
    // A quarter, half, three quarters crossed on the way up: a step worth a sound and a word.
    const step = [75, 50, 25].find((p) => before * 100 < p * total && after * 100 >= p * total);
    if (value && total > 0 && after === total) {
      feedback('success');
      celebrate();
    } else if (value && step) {
      feedback('milestone');
      return step;
    } else feedback(value ? 'tick' : 'untick');
    return undefined;
  };
  const writeDone = (members: ListDetailEntry[], value: boolean | ((m: ListDetailEntry) => boolean)) =>
    upsert.mutateAsync({ id: list.id, entries: members.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, done: typeof value === 'function' ? value(m) : value, note: m.note })) });
  const setDone = (members: ListDetailEntry[], value: boolean) => {
    const step = reward(members, value);
    void writeDone(members, value);
    // A tap by mistake is easy with a finger: ticked or unticked, it can be taken back.
    const message = step ? t.milestone(step) : value ? t.ticked(members.length) : t.unticked(members.length);
    toast(message, { action: { label: t.undo, onClick: () => void writeDone(members, !value) } });
  };
  const setOffer = (m: ListDetailEntry, on: boolean) => {
    feedback(on ? 'tick' : 'untick');
    offer.mutate({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, on });
  };

  /** Owner: one gender caught / not caught. Friend: "I have this one" for that gender, if still hunted. */
  const toggleMember = (m: ListDetailEntry) => {
    if (friend) {
      if (!m.done) setOffer(m, !m.offeredByMe);
    } else if (owner) setDone([m], !m.done);
  };
  /** Tapping the card does it for every gender at once. */
  const toggleCard = (c: EntryCard) => {
    if (friend) {
      const open = c.members.filter((m) => !m.done);
      const on = !open.every((m) => m.offeredByMe);
      for (const m of open) if (!!m.offeredByMe !== on) setOffer(m, on);
    } else if (owner) setDone(c.members, cardMissing(c));
  };
  // The same settings as "Copy for the game", always for the missing ones.
  const searchSettings = useSearchSettings();
  const ss = { ...searchSettings.settings, onlyMissing: true };
  const exportedSearch = useMemo(() => exportSearch(idx, list.entries, ss), [idx, list.entries, ss.gameLang, ss.exclude, ss.preEvolutions, ss.maxLength]);
  const search = exportedSearch.text;

  const memberId = (c: EntryCard, m: ListDetailEntry) => `${c.id}|${m.gender}`;
  const fits = (c: EntryCard, m: ListDetailEntry, sex = pickSex, version = pickVersion) =>
    (sex === 'all' || !m.gender || m.gender === sex) && (version === 'all' || (version === 'shiny') === c.shiny);
  const pickedMembers = allCards.flatMap((c) => c.members.filter((m) => picked.has(memberId(c, m))));
  /** A card picks its genders that fit the filters (all of them when none fits); tapping again lets them go. */
  const togglePick = (c: EntryCard) => {
    feedback(c.members.some((m) => picked.has(memberId(c, m))) ? 'untick' : 'tick');
    setPicked((p) => {
      const fitting = c.members.filter((m) => fits(c, m));
      const ids = (fitting.length ? fitting : c.members).map((m) => memberId(c, m));
      const n = new Set(p);
      if (ids.every((id) => n.has(id))) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };
  const toggleMemberPick = (c: EntryCard, m: ListDetailEntry) => setPicked((p) => { const n = new Set(p); const id = memberId(c, m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickAll = () => setPicked(new Set(cards.flatMap((c) => c.members.filter((m) => fits(c, m)).map((m) => memberId(c, m)))));
  /** A filter narrows what is already picked, so "All", then "Shiny", then "♀" leaves the shiny females. */
  const setPickFilter = (sex: typeof pickSex, version: typeof pickVersion) => {
    setPickSex(sex);
    setPickVersion(version);
    setPicked((p) => new Set(allCards.flatMap((c) => c.members.filter((m) => p.has(memberId(c, m)) && fits(c, m, sex, version)).map((m) => memberId(c, m)))));
  };
  const stopPicking = () => { setPicking(false); setPicked(new Set()); setPickSex('all'); setPickVersion('all'); };
  const bulk = async (run: () => Promise<unknown>) => {
    setBulkBusy(true);
    try {
      await run();
      stopPicking();
    } catch {
      toast(t.err_generic);
    } finally {
      setBulkBusy(false);
    }
  };
  const inParts = async <T,>(items: T[], send: (part: T[]) => Promise<unknown>) => {
    for (let k = 0; k < items.length; k += 1000) await send(items.slice(k, k + 1000));
  };
  const bulkDone = (value: boolean) => {
    const changing = pickedMembers.filter((m) => m.done !== value);
    const step = reward(changing, value);
    if (changing.length) toast(step ? t.milestone(step) : value ? t.ticked(changing.length) : t.unticked(changing.length), { action: { label: t.undo, onClick: () => void writeDone(changing, !value) } });
    return bulk(() => inParts(pickedMembers.filter((m) => m.done !== value), (part) => part.length ? upsert.mutateAsync({ id: list.id, entries: part.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, done: value, note: m.note })) }) : Promise.resolve()));
  };
  const bulkRemove = () => {
    if (!confirm(t.pick_confirm_remove(pickedMembers.length))) return;
    const gone = pickedMembers;
    void bulk(async () => {
      await inParts(gone, (part) => remove.mutateAsync({ id: list.id, entries: part.map((m) => ({ variantKey: m.variantKey, shiny: m.shiny, tag: m.tag, gender: m.gender })) }));
      toast(t.removed(gone.length), { action: { label: t.undo, onClick: () => void inParts(gone, (part) => writeDone(part, (m) => m.done)) } });
    });
  };
  const bulkOffer = () => bulk(async () => { for (const m of pickedMembers.filter((m) => !m.done && !m.offeredByMe)) await offer.mutateAsync({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, on: true }); });
  const toBasket = () => {
    const entries = pickedMembers.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag }));
    selection.add(entries);
    toast(t.added_to_selection(entries.length));
    stopPicking();
  };
  /** Image: saved, copied or shared, each on its own (no silent fallback that would do it twice). */
  const exportAs = async (kind: 'save' | 'copy' | 'share' | 'pdf') => {
    setExporting(kind);
    try {
      if (kind === 'pdf') await exportListPdf(idx, list, lang, t, { onlyMissing: exportMissing, search: withSearch ? search : null });
      else {
        const blobs = await renderListImages(idx, list, lang, t, { onlyMissing: exportMissing, search: withSearch ? search : null, layout: imageLayout });
        const names = blobs.map((_, i) => `${fileSlug(list.name)}${blobs.length > 1 ? `-${i + 1}` : ''}.png`);
        if (kind === 'save') {
          blobs.forEach((b, i) => downloadBlob(b, names[i]!));
          toast(t.images_saved(blobs.length));
        } else if (kind === 'copy') {
          if (blobs.length > 1) {
            toast(t.image_copy_pages(blobs.length));
            return;
          }
          await copyPicture(blobs[0]!);
          toast(t.image_copied);
        } else if (!(await sharePictures(blobs, names, list.name))) return;
      }
      setSharing(false);
    } catch {
      toast(t.err_generic);
    } finally {
      setExporting(null);
    }
  };

  const shareUrl = list.shareToken ? `${location.origin}/s/${list.shareToken}` : null;

  return (
    <>
      <TopBar
        title={list.name}
        back
        actions={
          <>
            {(owner || friend) && id && (
              <IconButton label={t.history} onClick={() => setHistoryOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
              </IconButton>
            )}
            {owner ? (
              <IconButton label={t.edit} onClick={() => setEditing(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </IconButton>
            ) : friend && following !== undefined ? (
              <Button tone="ghost" className="min-h-9 shrink-0 bg-white/20 px-3 text-sm text-white hover:bg-white/30" disabled={follow.isPending} onClick={() => follow.mutate(!following)}>
                {following ? t.unfollow : t.follow}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="mx-auto max-w-3xl px-3 pb-2">
          {!owner && <p className="muted text-sm">{t.by(list.ownerName)}</p>}
          {friend && <p className="muted text-sm">{t.offer_hint(list.ownerName)}</p>}
          {friend && following === false && <p className="muted text-sm">{t.unfollowed_hint}</p>}
          {list.description && <p className="muted text-sm">{list.description}</p>}
          <div className="mt-2 flex items-center gap-3">
            <Progress done={done} total={list.entries.length} />
            <span className="muted tnum shrink-0 text-xs font-semibold">{t.progress(rolledDone, list.entries.length)}</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {(['missing', 'caught', 'all'] as View[]).map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)}>{{ missing: t.missing, caught: t.caught, all: t.filter_all }[v]}</Chip>
            ))}

          </div>
<div className="mt-2 flex gap-2">
          <Button tone="ghost" className="flex-1 gap-2 bg-white text-go-ink shadow-card hover:bg-white dark:bg-white/15 dark:text-white dark:hover:bg-white/20" onClick={() => setStrings(true)} disabled={list.entries.length === 0}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>
            {t.copy_for_game}
          </Button>
            <Button tone="ghost" className="gap-2 bg-white text-go-ink shadow-card hover:bg-white dark:bg-white/15 dark:text-white dark:hover:bg-white/20" onClick={() => { setExportMissing(view !== 'all'); setSharing(true); }} disabled={list.entries.length === 0}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              {t.export_share}
            </Button>
          </div>
        </div>
      </TopBar>

      <main className={`mx-auto max-w-3xl px-3 ${picking ? 'pb-72' : 'pb-44'}`}>
        {list.entries.length === 0 && (
          <Empty>
            {t.empty_list}
            {owner && (
              <>
                <br />
                <Link to="/dex" className="mt-3 inline-block font-semibold text-sky">{t.nav_dex}</Link>
                <br />
                <button type="button" onClick={() => setImporting(true)} className="mt-2 inline-block font-semibold text-sky">{t.import_title}</button>
              </>
            )}
          </Empty>
        )}
        {allCards.length > 8 && (
          <input
            type="search"
            inputMode="search"
            placeholder={t.list_search}
            aria-label={t.list_search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-2 min-h-10 w-full rounded-xl border border-line bg-card px-3 text-[16px] placeholder:text-ink-3 focus:outline-none"
          />
        )}
        {list.entries.length > 0 && cards.length === 0 && words.length > 0 && <Empty>{t.list_search_none(query.trim())}</Empty>}
        {list.entries.length > 0 && cards.length === 0 && !words.length && <Empty>{view === 'missing' ? t.all_caught : view === 'caught' ? t.none_caught : t.nothing_here}</Empty>}
        {cards.length > 0 && (owner || (loggedIn && list.entries.length > 0)) && (
          <div className="flex items-center gap-3 pt-2 text-xs text-ink-3">
            {list.entries.length > 1 ? (
              <label className="flex min-w-0 flex-1 items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CardSort)}
                  aria-label={t.sort_title}
                  className="min-h-8 min-w-0 max-w-full rounded-full border border-line bg-card py-0 pl-2.5 pr-7 text-sm font-semibold text-ink"
                >
                  {CARD_SORTS.map((k) => <option key={k} value={k}>{t.card_sort[k]}</option>)}
                </select>
              </label>
            ) : (
              <span className="flex-1" />
            )}
            {loggedIn && (
              <button type="button" aria-pressed={picking} onClick={() => (picking ? stopPicking() : setPicking(true))} className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${picking ? 'bg-sky text-white' : 'bg-paper-2 text-ink'}`}>
                {picking ? t.pick_done : t.pick_mode}
              </button>
            )}
          </div>
        )}
        {cards.length > 0 && (picking || owner) && <p className="pb-2 pt-1.5 text-xs text-ink-3">{picking ? t.pick_hint : t.list_owner_hint}</p>}
        {cards.length > 0 && !picking && !owner && <div className="pb-2" />}
        <ul className="stagger grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shownCards.map((c) => {
            const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
            const sp = v && idx.speciesByDex.get(v.dex);
            if (!v || !sp) return null;
            const allDone = cardDone(c);
            const gendered = c.members.some((m) => m.gender);
            const myOffers = c.members.some((m) => m.offeredByMe);
            const offerLines = owner ? c.members.filter((m) => !m.done && m.offers?.length) : [];
            const isPicked = picking && c.members.some((m) => picked.has(memberId(c, m)));
            return (
              <li key={c.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 150px' }}>
                <div className={`card relative flex h-full flex-col items-center px-1 pb-2 pt-1 ${isPicked ? 'ring-[3px] ring-sky' : allDone ? 'ring-2 ring-go' : myOffers ? 'ring-2 ring-sky' : ''}`}>
                  {picking && (
                    <span className={`pointer-events-none absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${isPicked ? 'border-sky bg-sky text-white' : 'border-line bg-card'}`} aria-hidden="true">
                      {isPicked && <svg className="pop" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
                    </span>
                  )}
                  {owner && !picking && (
                    <button type="button" onClick={() => setSelected(c)} className="absolute left-0.5 top-0.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2" aria-label={t.entry_options} title={t.entry_options}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => (picking ? togglePick(c) : toggleCard(c))}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      // A long press starts picking several cards.
                      if (!picking && loggedIn) { setPicking(true); setPicked(new Set([c.id])); } else if (!picking) setSelected(c);
                    }}
                    aria-pressed={picking ? isPicked : friend ? c.members.filter((m) => !m.done).every((m) => m.offeredByMe) : allDone}
                    aria-label={`${localized(sp.name, lang)}${v.label ? ` ${localized(v.label, lang)}` : ''}`}
                    className={`flex w-full flex-col items-center transition ${picking || owner || (friend && cardMissing(c)) ? 'active:scale-[0.97]' : 'cursor-default'}`}
                  >
                    <div className="relative">
                      {/* Pale only next to caught ones ("All"): a page of missing ones stays bright. */}
                      <Sprite idx={idx} variant={v} shiny={c.shiny} dim={!allDone && view === 'all'} size={72} />
                      {c.shiny && <Sparkle key={String(allDone)} className={`absolute -right-1 top-0 ${allDone ? 'flare text-shiny' : 'text-ink-3'}`} />}
                      {allDone && (
                        <span className="pop absolute -left-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full bg-go text-white">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                        </span>
                      )}
                      {v.datamined && !allDone && <span className="absolute -right-1 bottom-0 h-2 w-2 rounded-full bg-sky" />}
                    </div>
                    <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(sp.name, lang)}</span>
                    {v.label && <span className="w-full truncate text-center text-[10px] leading-tight text-ink-3">{localized(v.label, lang)}</span>}
                    {c.tag && <span className="w-full truncate text-center text-[10px] font-semibold leading-tight text-ink-2">{tagLabel(idx, c.tag, t)}</span>}
                  </button>
                  {gendered && (
                    <div className="mt-1 flex gap-1">
                      {c.members.map((m) => {
                        const label = `${genderSymbol(m.gender)} ${m.gender === 'm' ? t.male : t.female}`;
                        const state = m.done ? t.caught : m.offeredByMe ? t.offer_mine : t.missing;
                        return (
                          <button
                            key={m.gender}
                            type="button"
                            onClick={() => (picking ? toggleMemberPick(c, m) : toggleMember(m))}
                            aria-pressed={picking ? picked.has(memberId(c, m)) : friend ? !!m.offeredByMe : m.done}
                            aria-label={picking ? `${label} : ${t.pick_mode}` : `${label} : ${state}`}
                            title={`${label} : ${state}`}
                            className={`flex h-7 min-w-9 items-center justify-center gap-0.5 rounded-full border-2 px-1.5 text-[13px] font-bold transition ${
                              picking
                                ? picked.has(memberId(c, m)) ? 'border-sky bg-sky text-white' : 'border-line text-ink-3'
                                : m.done ? 'border-go bg-go text-white' : m.offeredByMe ? 'border-sky bg-sky/15 text-sky' : 'border-line text-ink-3'
                            }`}
                          >
                            {genderSymbol(m.gender)}
                            {m.done && <span className="pop text-[10px]">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {myOffers && <span className="mt-0.5 rounded-md bg-sky/15 px-1.5 text-[10px] font-bold text-sky">{t.offer_mine}</span>}
                  {offerLines.map((m) => (
                    <span key={m.gender} className="mt-0.5 max-w-full truncate rounded-md bg-sky/15 px-1.5 text-[10px] font-bold text-sky">
                      {genderSymbol(m.gender)} {t.offer_by(m.offers!.map((o) => o.username))}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
          {cardsMore && <li ref={cardsSentinel} aria-hidden="true" className="col-span-full h-1" />}
        </ul>

        {!owner && loggedIn && (
          <Button
            tone="primary"
            className="mt-6 w-full"
            disabled={copy.isPending}
            onClick={async () => {
              const r = await copy.mutateAsync(token ? { token } : { id: list.id });
              toast(t.list_copied);
              navigate(`/lists/${r.list.id}`);
            }}
          >
            {t.copy_list}
          </Button>
        )}
        {!owner && !loggedIn && (
          <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-sky">{t.login_required}</Link></p>
        )}
      </main>

      {picking && (
        <div className="pb-safe fixed inset-x-0 bottom-[64px] z-30 px-3" role="toolbar" aria-label={t.pick_count(picked.size)}>
          <div className="mx-auto max-w-3xl rounded-card bg-card p-2 shadow-lg ring-1 ring-line">
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <p className="flex-1 text-sm font-semibold">{t.pick_count(pickedMembers.length)}</p>
              <button type="button" className="text-sm font-semibold text-sky" onClick={pickAll}>{t.pick_all}</button>
              <button type="button" className="text-sm font-semibold text-sky" onClick={() => setPicked(new Set())}>{t.pick_none}</button>
              {/* Stays on screen while scrolling, unlike the toggle above the cards. */}
              <button type="button" className="rounded-full bg-sky px-3 py-1 text-sm font-semibold text-white" onClick={stopPicking}>{t.pick_done}</button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label={t.pick_filters}>
              {(['m', 'f'] as const).map((g) => (
                <Chip key={g} active={pickSex === g} onClick={() => setPickFilter(pickSex === g ? 'all' : g, pickVersion)} className="min-h-8 px-2.5 text-xs">{g === 'm' ? `♂ ${t.male}` : `♀ ${t.female}`}</Chip>
              ))}
              {(['normal', 'shiny'] as const).map((v) => (
                <Chip key={v} active={pickVersion === v} onClick={() => setPickFilter(pickSex, pickVersion === v ? 'all' : v)} className="min-h-8 px-2.5 text-xs">{v === 'shiny' ? `✨ ${t.shiny}` : t.bulk_normal}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {owner && (
                <>
                  <Button tone="primary" className="min-h-10 flex-1 px-3 text-sm" disabled={!pickedMembers.length || bulkBusy} onClick={() => bulkDone(true)}>{t.pick_caught}</Button>
                  <Button className="min-h-10 flex-1 px-3 text-sm" disabled={!pickedMembers.length || bulkBusy} onClick={() => bulkDone(false)}>{t.pick_missing}</Button>
                </>
              )}
              {friend && <Button tone="primary" className="min-h-10 flex-1 px-3 text-sm" disabled={!pickedMembers.some((m) => !m.done) || bulkBusy} onClick={bulkOffer}>{t.pick_offer}</Button>}
              <Button className="min-h-10 flex-1 px-3 text-sm" disabled={!pickedMembers.length || bulkBusy} onClick={toBasket}>{t.pick_basket}</Button>
              {owner && <Button tone="danger" className="min-h-10 flex-1 px-3 text-sm" disabled={!pickedMembers.length || bulkBusy} onClick={bulkRemove}>{t.pick_remove}</Button>}
            </div>
          </div>
        </div>
      )}

      {owner && !picking && (
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-[64px] z-20 px-3">
          <div className="mx-auto flex max-w-3xl justify-end gap-2">
            <button type="button" onClick={() => setImporting(true)} aria-label={t.import_title} title={t.import_title} className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-card px-4 font-semibold text-ink shadow-lg ring-1 ring-line hover:brightness-[0.98]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></svg>
              {t.import_short}
            </button>
            <Link to="/dex" className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-go px-5 font-semibold text-white shadow-lg hover:brightness-110">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {t.add_pokemon}
            </Link>
          </div>
        </div>
      )}

      <Sheet open={sharing} onClose={() => setSharing(false)} title={t.export_title}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={exportMissing} onClick={() => setExportMissing(true)}>{t.export_scope_missing}</Chip>
            <Chip active={!exportMissing} onClick={() => setExportMissing(false)}>{t.export_scope_all}</Chip>
          </div>
          <section className="card space-y-3 p-3" aria-label={t.export_image}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-go-soft text-go-ink">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
              </span>
              <span>
                <span className="block font-semibold">{t.export_image}</span>
                <span className="block text-xs text-ink-3">{t.export_image_hint}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={imageLayout === 'preview'} onClick={() => setImageLayout('preview')} className="min-h-8 px-2.5 text-xs">{t.export_layout_preview}</Chip>
              <Chip active={imageLayout === 'compact'} onClick={() => setImageLayout('compact')} className="min-h-8 px-2.5 text-xs">{t.export_layout_compact}</Chip>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button tone="primary" className="min-h-10 flex-1 px-3 text-sm" disabled={!!exporting} onClick={() => exportAs('save')}>{exporting === 'save' ? t.export_working : t.export_save}</Button>
              {canCopyPicture() && <Button className="min-h-10 flex-1 px-3 text-sm" disabled={!!exporting} onClick={() => exportAs('copy')}>{exporting === 'copy' ? t.export_working : t.copy}</Button>}
              {canSharePictures() && <Button className="min-h-10 flex-1 px-3 text-sm" disabled={!!exporting} onClick={() => exportAs('share')}>{exporting === 'share' ? t.export_working : t.share}</Button>}
            </div>
          </section>
          <button
            type="button"
            disabled={!!exporting}
            onClick={() => exportAs('pdf')}
            aria-label={t.export_pdf}
            className="card flex w-full items-center gap-3 p-3 text-left transition hover:brightness-[0.98] active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-go-soft text-go-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
            </span>
            <span>
              <span className="block font-semibold">{exporting === 'pdf' ? t.export_working : t.export_pdf_short}</span>
              <span className="block text-xs text-ink-3">{t.export_pdf_hint}</span>
            </span>
          </button>
          <button type="button" aria-pressed={withSearch} onClick={() => setWithSearch(!withSearch)} className="flex w-full items-center gap-3 rounded-card border border-line px-3 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.export_search_toggle}</span>
              <span className="block text-xs text-ink-3">{t.export_with_search}</span>
            </span>
            <SwitchThumb on={withSearch} />
          </button>
          {withSearch && (
            <>
              {!search && <p className="text-xs text-ink-3">{t.export_search_empty}</p>}
              {search && exportedSearch.blind.length > 0 && <FormBlindWarning idx={idx} variants={exportedSearch.blind} />}
              <SearchSettingsPanel s={searchSettings} showOnlyMissing={false} />
            </>
          )}
        </div>
      </Sheet>

      {owner && (
        <Sheet open={importing} onClose={() => setImporting(false)} title={t.import_title}>
          {importing && <ImportSearch idx={idx} list={list} onDone={() => setImporting(false)} />}
        </Sheet>
      )}

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title={t.history}>
        {historyOpen && <ListHistory idx={idx} listId={list.id} me={meName} />}
      </Sheet>

      <Sheet open={strings} onClose={() => setStrings(false)} title={t.game_strings_title}>
        <SearchStrings idx={idx} entries={list.entries} />
      </Sheet>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? localized(idx.speciesByDex.get(idx.variantByKey.get(selected.variantKey)?.dex ?? 0)?.name, lang) : ''}>
        {selected && (
          <div className="space-y-2">
            {selected.members.map((m) => (
              <div key={m.gender} className="space-y-1">
                <Button className="w-full" onClick={() => { toggleMember(m); setSelected(null); }} disabled={!owner}>
                  {m.done ? t.mark_missing(genderSymbol(m.gender)) : t.mark_caught(genderSymbol(m.gender))}
                </Button>
                {owner && m.offers?.length ? <p className="text-sm text-ink-2">{genderSymbol(m.gender)} {t.offer_by(m.offers.map((o) => o.username))}</p> : null}
              </div>
            ))}
            <Link to={`/dex/${idx.variantByKey.get(selected.variantKey)?.dex}`} className="block"><Button className="w-full">{t.nav_dex}</Button></Link>
            {owner && (
              <Button
                tone="danger"
                className="w-full"
                onClick={async () => {
                  const gone = selected.members;
                  await remove.mutateAsync({ id: list.id, entries: [{ variantKey: selected.variantKey, shiny: selected.shiny, tag: selected.tag }] });
                  setSelected(null);
                  toast(t.removed(1), { action: { label: t.undo, onClick: () => void writeDone(gone, (m) => m.done) } });
                }}
              >
                {t.remove_entry}
              </Button>
            )}
          </div>
        )}
      </Sheet>

      {owner && id && (
        <EditSheet
          open={editing}
          onClose={() => setEditing(false)}
          list={list}
          shareUrl={shareUrl}
          onSave={async (body) => { await update.mutateAsync(body); setEditing(false); }}
          onShare={async (on) => { await share.mutateAsync({ id: list.id, on }); }}
          onDelete={async () => { await del.mutateAsync(list.id); navigate('/lists'); }}
        />
      )}
    </>
  );
}

/** The phone's own share menu (Messages, Discord…), where there is one; computers usually keep "Copy link". */
const canShareLink = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;

function EditSheet({ open, onClose, list, shareUrl, onSave, onShare, onDelete }: { open: boolean; onClose: () => void; list: ListDetail; shareUrl: string | null; onSave: (b: { name: string; description: string | null; visibility: ListVisibility }) => Promise<void>; onShare: (on: boolean) => Promise<void>; onDelete: () => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [visibility, setVisibility] = useState<ListVisibility>(list.visibility);
  return (
    <Sheet open={open} onClose={onClose} title={t.edit}>
      <div className="space-y-3">
        <TextField label={t.list_name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <TextField label={t.list_description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <VisibilityField value={visibility} onChange={setVisibility} />
        <Button tone="primary" className="w-full" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), description: description.trim() || null, visibility })}>{t.save}</Button>
        <div className="rounded-card border border-line p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">{t.share} {shareUrl && <Badge tone="grass">{t.share_on}</Badge>}</div>
          {shareUrl ? (
            <div className="space-y-2">
              <code className="block break-all rounded-lg bg-paper-2 p-2 text-xs">{shareUrl}</code>
              <div className="flex gap-2">
                {canShareLink() && (
                  <Button tone="primary" className="flex-1" onClick={() => void navigator.share({ title: list.name, url: shareUrl }).catch(() => {})}>{t.share_link}</Button>
                )}
                <Button className="flex-1" onClick={async () => { if (await copyText(shareUrl)) toast(t.link_copied); }}>{t.copy_link}</Button>
                <Button tone="ghost" onClick={() => onShare(false)}>{t.share_off}</Button>
              </div>
            </div>
          ) : list.visibility === 'private' ? (
            <p className="text-sm text-ink-2">{t.share_private_hint}</p>
          ) : (
            <Button className="w-full" onClick={() => onShare(true)}>{t.copy_link}</Button>
          )}
        </div>
        <HoldButton className="w-full" onConfirm={onDelete}>{t.delete_list}</HoldButton>
      </div>
    </Sheet>
  );
}
