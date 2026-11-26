import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { EntryTag, ListDetail, ListDetailEntry, ListVisibility } from '@mydexpogo/shared';
import { ExportSheet } from '../components/ExportSheet.js';
import { ImportSearch } from '../components/ImportSearch.js';
import { ListHistory } from '../components/ListHistory.js';
import { CollectionStatsSheet } from '../components/Medals.js';
import { SearchStrings } from '../components/SearchStrings.js';
import { PageTourBanner, PageTourButton } from '../components/PageTour.js';
import { WhatsNewBanner } from '../components/WhatsNew.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, CardsSkeleton, Chip, Empty, HoldButton, IconButton, Progress, Sheet, SwitchThumb, TextField, TopBar, useRolling } from '../components/ui.js';
import { copyText } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { entryVariant, genderSymbol, matchesQuery, normalize, tagLabel, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { buildTemplateEntries, type ListTemplateId } from '../lib/listTemplates.js';
import { useCopyList, useDeleteList, useList, useRemoveEntries, useShareList, useSharedList, useUpdateList, useUpsertEntries, type ListAccess } from '../lib/lists.js';
import { VisibilityField } from './ListsPage.js';
import { flushOfferNotifications, useFollowList, useOffer, type OfferVariantInput } from '../lib/social.js';
import { CARD_SORTS, cardDone, cardMissing, cardsOf, sortCards, type CardSort, type EntryCard } from '../lib/cards.js';
import { selection, useSelection, useSuppressSelectionBar } from '../lib/selection.js';
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
  if (query.isPending || dataset.isPending) return <main className="mx-auto max-w-6xl px-3 pt-20 sm:px-5"><CardsSkeleton count={12} className="grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7" /></main>;
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
  return <ListBody idx={dataset.data} list={query.data.list} access={query.data.access} following={query.data.following} id={id} token={token} loggedIn={!!me.data} meName={me.data?.username} meFriendCode={me.data?.friendCode} />;
}

type View = 'missing' | 'caught' | 'all';

function ListBody({ idx, list, access, following, id, token, loggedIn, meName, meFriendCode }: { idx: DatasetIndex; list: ListDetail; access: ListAccess; following?: boolean; id?: string; token?: string; loggedIn: boolean; meName?: string; meFriendCode?: string }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const owner = access === 'owner';
  const friend = access === 'friend';
  const offer = useOffer(list.id);
  const follow = useFollowList(list.id);
  // Defer "I have it" notifications until the friend leaves this page: ticking then unticking sends nothing.
  const pendingOffersRef = useRef<Map<string, OfferVariantInput>>(new Map());
  const inFlightOffersRef = useRef<Set<Promise<unknown>>>(new Set());
  const offerKey = (m: OfferVariantInput) => `${m.variantKey}|${m.gender}|${m.shiny ? 1 : 0}|${m.tag}`;
  useEffect(() => {
    if (!friend) return;
    const flush = (waitInFlight: boolean) => {
      if (!pendingOffersRef.current.size) return;
      const variants = [...pendingOffersRef.current.values()];
      pendingOffersRef.current.clear();
      if (waitInFlight && inFlightOffersRef.current.size) {
        const waits = [...inFlightOffersRef.current];
        void Promise.allSettled(waits).then(() => flushOfferNotifications(list.id, variants));
      } else {
        flushOfferNotifications(list.id, variants);
      }
    };
    const onHide = () => flush(false);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush(true);
    };
  }, [list.id, friend]);
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState<View>('missing');
  const [shinyFilter, setShinyFilter] = useState<'all' | 'shiny' | 'normal'>('all');
  const [tagFilter, setTagFilter] = useState<EntryTag | 'all'>('all');
  const [offeredOnly, setOfferedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [strings, setStrings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<EntryCard | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  // Several cards at once: tapping a card picks it instead of ticking it.
  const [picking, setPicking] = useState(false);
  useSuppressSelectionBar(picking);
  const basketCount = useSelection().length;
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
  const hasMixedShiny = useMemo(() => allCards.some((c) => c.shiny) && allCards.some((c) => !c.shiny), [allCards]);
  const presentTags = useMemo(() => [...new Set(allCards.map((c) => c.tag).filter((tg): tg is EntryTag => tg !== ''))], [allCards]);
  const hasAnyOffer = useMemo(
    () => allCards.some((c) => (owner ? c.members.some((m) => !m.done && m.offers?.length) : c.members.some((m) => m.offeredByMe))),
    [allCards, owner],
  );
  // Search by name, number or costume / form name ("sorcière"), like the Pokédex; any word may match.
  const words = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);
  const cards = useMemo(
    () =>
      sortCards(
        allCards.filter((c) => {
          if (!(view === 'all' || (view === 'caught' ? c.members.some((m) => m.done) : cardMissing(c)))) return false;
          if (shinyFilter === 'shiny' && !c.shiny) return false;
          if (shinyFilter === 'normal' && c.shiny) return false;
          if (tagFilter !== 'all' && c.tag !== tagFilter) return false;
          if (offeredOnly) {
            const hasOffer = owner ? c.members.some((m) => !m.done && m.offers?.length) : c.members.some((m) => m.offeredByMe);
            if (!hasOffer) return false;
          }
          if (!words.length) return true;
          const v = idx.variantByKey.get(c.variantKey) ?? entryVariant(idx, c.variantKey, 'm');
          if (!v) return false;
          const label = normalize(`${v.label?.en ?? ''} ${v.label?.fr ?? ''} ${c.members.map((m) => m.note ?? '').join(' ')}`);
          return words.some((w) => matchesQuery(idx, v.dex, w) || (!/^\d+$/.test(w) && label.includes(w)));
        }),
        sort,
        {
          rank: (k) => rank.get(k) ?? Number.MAX_SAFE_INTEGER,
          name: (k) => localized(idx.speciesByDex.get(idx.variantByKey.get(k)?.dex ?? 0)?.name, lang) ?? '',
        },
      ),
    [allCards, view, shinyFilter, tagFilter, offeredOnly, owner, words, sort, rank, idx, lang],
  );
  const done = list.entries.filter((e) => e.done).length;
  // The count rolls up as cards are ticked.
  const rolledDone = useRolling(done);
  // A big collection builds its first cards at once, the next ones as they come near the screen.
  const { shown: shownCards, more: cardsMore, sentinel: cardsSentinel } = useProgressive(cards, `${view}|${shinyFilter}|${tagFilter}|${offeredOnly}|${sort}|${query}`);

  const openOptions = (c: EntryCard) => {
    setSelected(c);
    setNoteDraft(c.members.find((m) => m.note)?.note ?? '');
  };
  const saveNote = async () => {
    if (!selected || !owner) return;
    const clean = noteDraft.trim() || null;
    await upsert.mutateAsync({
      id: list.id,
      entries: selected.members.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, done: m.done, note: clean })),
    });
    toast(t.entry_note_saved);
    setSelected(null);
  };
  const fillTemplate = async (tid: ListTemplateId) => {
    const entries = buildTemplateEntries(idx, tid);
    if (!entries.length) return;
    setTemplateBusy(true);
    try {
      await inParts(entries, (part) => upsert.mutateAsync({ id: list.id, entries: part }));
      toast(t.template_count(entries.length));
    } catch {
      toast(t.err_generic);
    } finally {
      setTemplateBusy(false);
    }
  };

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
    const item: OfferVariantInput = { variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag };
    const k = offerKey(item);
    if (on) pendingOffersRef.current.set(k, item);
    else pendingOffersRef.current.delete(k);
    const p = offer.mutateAsync({ ...item, on, deferNotify: true }).catch(() => {
      if (on) pendingOffersRef.current.delete(k);
    });
    inFlightOffersRef.current.add(p);
    void p.finally(() => inFlightOffersRef.current.delete(p));
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
  const bulkOffer = () =>
    bulk(async () => {
      for (const m of pickedMembers.filter((m) => !m.done && !m.offeredByMe)) {
        const item: OfferVariantInput = { variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag };
        await offer.mutateAsync({ ...item, on: true, deferNotify: true });
        pendingOffersRef.current.set(offerKey(item), item);
      }
    });
  const toBasket = () => {
    const entries = pickedMembers.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag }));
    selection.add(entries);
    toast(t.added_to_selection(entries.length));
    stopPicking();
  };

  const shareUrl = list.shareToken ? `${location.origin}/s/${list.shareToken}` : null;

  return (
    <>
      <TopBar
        title={list.name}
        back
        actions={
          <>
            {list.entries.length > 0 && (
              <IconButton label={t.stats_title} onClick={() => setStatsOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
              </IconButton>
            )}
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
            <PageTourButton page="list" />
          </>
        }
      >
        <div className="mx-auto max-w-6xl px-3 pb-2 sm:px-5">
          {!owner && <p className="muted text-sm">{t.by(list.ownerName)}</p>}
          {friend && <p className="muted text-sm">{t.offer_hint(list.ownerName)}</p>}
          {friend && following === false && <p className="muted text-sm">{t.unfollowed_hint}</p>}
          {list.description && <p className="muted text-sm">{list.description}</p>}
          <div className="mt-2 flex items-center gap-3">
            <Progress done={done} total={list.entries.length} />
            <span className="muted tnum shrink-0 text-xs font-semibold">{t.progress(rolledDone, list.entries.length)}</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {(['missing', 'caught', 'all'] as View[]).map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)}>{{ missing: t.missing, caught: t.caught, all: t.filter_all }[v]}</Chip>
            ))}
            {hasAnyOffer && (
              <Chip active={offeredOnly} onClick={() => setOfferedOnly((v) => !v)}>{t.list_filter_offered}</Chip>
            )}
            {hasMixedShiny && (
              <>
                <Chip active={shinyFilter === 'shiny'} onClick={() => setShinyFilter((v) => (v === 'shiny' ? 'all' : 'shiny'))}>
                  <Sparkle className={shinyFilter === 'shiny' ? 'text-shiny' : ''} /> {t.shiny}
                </Chip>
                <Chip active={shinyFilter === 'normal'} onClick={() => setShinyFilter((v) => (v === 'normal' ? 'all' : 'normal'))}>{t.normal}</Chip>
              </>
            )}
            {presentTags.map((tg) => (
              <Chip key={tg} active={tagFilter === tg} onClick={() => setTagFilter((v) => (v === tg ? 'all' : tg))}>
                {tagLabel(idx, tg, t)}
              </Chip>
            ))}
          </div>
<div className="mt-2 flex gap-2">
          <Button tone="ghost" className="flex-1 gap-2 bg-white text-go-ink shadow-card hover:bg-white dark:bg-white/15 dark:text-white dark:hover:bg-white/20" onClick={() => setStrings(true)} disabled={list.entries.length === 0}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>
            {t.copy_for_game}
          </Button>
            <Button tone="ghost" className="gap-2 bg-white text-go-ink shadow-card hover:bg-white dark:bg-white/15 dark:text-white dark:hover:bg-white/20" onClick={() => setSharing(true)} disabled={list.entries.length === 0}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              {t.export_share}
            </Button>
          </div>
        </div>
      </TopBar>

      <main className={`mx-auto max-w-6xl px-3 sm:px-5 ${picking ? 'pb-72' : 'pb-44'}`}>
        <WhatsNewBanner />
        <PageTourBanner page="list" />
        {list.entries.length === 0 && (
          <Empty>
            {t.empty_list}
            {owner && (
              <>
                <br />
                <Link to={`/dex?to=${list.id}`} className="mt-3 inline-block font-semibold text-sky">{t.nav_dex}</Link>
                <br />
                <button type="button" onClick={() => setImporting(true)} className="mt-2 inline-block font-semibold text-sky">{t.import_title}</button>
                <div className="mt-5 text-left">
                  <p className="mb-2 text-center text-xs font-semibold text-ink-3">{t.template_title}</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {(['living_released', 'shiny_released', 'costumes', 'mega_gmax', 'gen1'] as ListTemplateId[]).map((tid) => (
                      <Chip key={tid} disabled={templateBusy} onClick={() => void fillTemplate(tid)} className="min-h-8 px-2.5 text-xs">
                        {templateBusy ? t.template_filling : t.templates[tid]}
                      </Chip>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Empty>
        )}
        {allCards.length > 8 && (
          <div className="relative mt-2">
            <input
              type="search"
              inputMode="search"
              placeholder={t.list_search}
              aria-label={t.list_search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">✕</button>
            )}
          </div>
        )}
        {list.entries.length > 0 && cards.length === 0 && words.length > 0 && <Empty>{t.list_search_none(query.trim())}</Empty>}
        {list.entries.length > 0 && cards.length === 0 && !words.length && (
          <Empty>{shinyFilter !== 'all' || tagFilter !== 'all' || offeredOnly ? t.nothing_here : view === 'missing' ? t.all_caught : view === 'caught' ? t.none_caught : t.nothing_here}</Empty>
        )}
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
        <ul className="stagger grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
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
                    <button type="button" onClick={() => openOptions(c)} className="absolute left-0.5 top-0.5 z-10 flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2" aria-label={t.entry_options} title={t.entry_options}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => (picking ? togglePick(c) : toggleCard(c))}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      // A long press starts picking several cards (every gender of the pressed card).
                      if (!picking && loggedIn) { setPicking(true); setPicked(new Set(c.members.map((m) => memberId(c, m)))); } else if (!picking) openOptions(c);
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
                    {c.members.find((m) => m.note)?.note && (
                      <span className="w-full truncate text-center text-[10px] italic leading-tight text-ink-3">{c.members.find((m) => m.note)!.note}</span>
                    )}
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
                            className={`flex h-8 min-w-10 items-center justify-center gap-0.5 rounded-full border-2 px-1.5 text-[13px] font-bold transition ${
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
        <div className="pb-safe fixed inset-x-0 bottom-[var(--nav-h)] z-30 px-3" role="toolbar" aria-label={t.pick_count(picked.size)}>
          <div className="mx-auto max-w-6xl rounded-card bg-card p-2 shadow-lg ring-1 ring-line">
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
        <div className={`pb-safe pointer-events-none fixed inset-x-0 z-20 px-3 ${basketCount > 0 ? 'bottom-[calc(var(--nav-h)+58px)]' : 'bottom-[var(--nav-h)]'}`}>
          <div className="mx-auto flex max-w-6xl justify-end gap-2">
            <button type="button" onClick={() => setImporting(true)} aria-label={t.import_title} title={t.import_title} className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-card px-4 font-semibold text-ink shadow-lg ring-1 ring-line hover:brightness-[0.98]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></svg>
              {t.import_short}
            </button>
            <Link to={`/dex?to=${list.id}`} className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-go px-5 font-semibold text-white shadow-lg hover:brightness-110">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {t.add_pokemon}
            </Link>
          </div>
        </div>
      )}

      <ExportSheet open={sharing} onClose={() => setSharing(false)} idx={idx} list={list} defaultOnlyMissing={view !== 'all'} friendCode={owner ? meFriendCode : undefined} />

      {owner && (
        <Sheet open={importing} onClose={() => setImporting(false)} title={t.import_title}>
          {importing && <ImportSearch idx={idx} list={list} onDone={() => setImporting(false)} />}
        </Sheet>
      )}

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title={t.history}>
        {historyOpen && <ListHistory idx={idx} listId={list.id} me={meName} />}
      </Sheet>

      <Sheet open={strings} onClose={() => setStrings(false)} title={t.game_strings_title}>
        {strings && <SearchStrings idx={idx} entries={list.entries} />}
      </Sheet>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? localized(idx.speciesByDex.get(idx.variantByKey.get(selected.variantKey)?.dex ?? 0)?.name, lang) : ''}>
        {selected && (() => {
          const sv = entryVariant(idx, selected.variantKey, selected.members.every((m) => m.gender === 'f') ? 'f' : 'm');
          const ssp = sv && idx.speciesByDex.get(sv.dex);
          return (
            <div className="space-y-3">
              {sv && ssp && (
                <div className="flex items-center gap-3 rounded-card bg-paper-2 p-2.5">
                  <span className="relative shrink-0">
                    <Sprite idx={idx} variant={sv} shiny={selected.shiny} size={52} />
                    {selected.shiny && <Sparkle className="absolute -right-0.5 top-0 text-shiny" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{localized(ssp.name, lang)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-2">
                      {sv.label && <span>{localized(sv.label, lang)}</span>}
                      {selected.shiny && <Badge tone="shiny">{t.shiny}</Badge>}
                      {selected.tag && <Badge tone="muted">{tagLabel(idx, selected.tag, t)}</Badge>}
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {selected.members.map((m) => (
                  <div key={m.gender} className="space-y-1">
                    <Button className="w-full" onClick={() => { toggleMember(m); setSelected(null); }} disabled={!owner}>
                      {m.done ? t.mark_missing(genderSymbol(m.gender)) : t.mark_caught(genderSymbol(m.gender))}
                    </Button>
                    {owner && m.offers?.length ? <p className="text-sm text-ink-2">{genderSymbol(m.gender)} {t.offer_by(m.offers.map((o) => o.username))}</p> : null}
                  </div>
                ))}
              </div>
              {owner && (
                <div className="space-y-2 rounded-card border border-line p-3">
                  <TextField
                    label={t.entry_note_label}
                    placeholder={t.entry_note_placeholder}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    maxLength={200}
                  />
                  <Button tone="primary" className="min-h-10 w-full text-sm" disabled={upsert.isPending} onClick={() => void saveNote()}>
                    {t.save}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Link to={`/dex/${idx.variantByKey.get(selected.variantKey)?.dex}`} className="flex-1"><Button className="w-full">{t.nav_dex}</Button></Link>
                {loggedIn && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const entries = selected.members.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag }));
                      selection.add(entries);
                      toast(t.added_to_selection(entries.length));
                      setSelected(null);
                    }}
                  >
                    {t.pick_basket}
                  </Button>
                )}
              </div>
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
          );
        })()}
      </Sheet>

      <CollectionStatsSheet open={statsOpen} onClose={() => setStatsOpen(false)} idx={idx} list={list} />
      {owner && id && (
        <EditSheet
          open={editing}
          onClose={() => setEditing(false)}
          list={list}
          shareUrl={shareUrl}
          onSave={async (body) => { await update.mutateAsync(body); setEditing(false); }}
          onShare={async (on) => { await share.mutateAsync({ id: list.id, on }); }}
          onDuplicate={async () => {
            const r = await copy.mutateAsync({ id: list.id });
            toast(t.list_duplicated);
            setEditing(false);
            navigate(`/lists/${r.list.id}`);
          }}
          onDelete={async () => { await del.mutateAsync(list.id); navigate('/lists'); }}
        />
      )}
    </>
  );
}

/** The phone's own share menu (Messages, Discord…), where there is one; computers usually keep "Copy link". */
const canShareLink = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;

function EditSheet({
  open,
  onClose,
  list,
  shareUrl,
  onSave,
  onShare,
  onDuplicate,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  list: ListDetail;
  shareUrl: string | null;
  onSave: (b: { name: string; description: string | null; visibility: ListVisibility; alertPreEvolutions: boolean }) => Promise<void>;
  onShare: (on: boolean) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [visibility, setVisibility] = useState<ListVisibility>(list.visibility);
  const [alertPreEvolutions, setAlertPreEvolutions] = useState(!!list.alertPreEvolutions);
  useEffect(() => {
    if (!open) return;
    setName(list.name);
    setDescription(list.description ?? '');
    setVisibility(list.visibility);
    setAlertPreEvolutions(!!list.alertPreEvolutions);
  }, [open, list.name, list.description, list.visibility, list.alertPreEvolutions]);
  return (
    <Sheet open={open} onClose={onClose} title={t.edit}>
      {open && (
        <div className="space-y-3">
          <TextField label={t.list_name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <TextField label={t.list_description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
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
          <Button tone="primary" className="w-full" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), description: description.trim() || null, visibility, alertPreEvolutions })}>{t.save}</Button>
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
          <Button className="w-full" onClick={() => void onDuplicate()}>{t.duplicate_list}</Button>
          <HoldButton className="w-full" onConfirm={onDelete}>{t.delete_list}</HoldButton>
        </div>
      )}
    </Sheet>
  );
}
