import { useDeferredValue, useLayoutEffect, useMemo, useState } from 'react';
import { Link, useNavigationType, useSearchParams } from 'react-router';
import { neutralKey, type PokemonType, type Rarity, type Species, type Variant, type VariantKind } from '@mydexpogo/shared';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { defaultPick, type DexPick } from '../components/BulkAddSheet.js';
import { BannerSlot } from '../components/BannerSlot.js';
import { AddPresetsBar } from '../components/QuickAddSheet.js';
import { picksFromSelection } from '../components/SelectionBar.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { TYPE_COLORS } from '../components/TypeBadge.js';
import { VariantCard, variantForGender, type GenderFilter } from '../components/VariantCard.js';
import { Button, CardsSkeleton, Chip, Empty, Sheet, TopBar } from '../components/ui.js';
import { buildQuickEntries, useAddPrefs } from '../lib/addPrefs.js';
import { familyOrder, normalize, pvpOf, useDataset } from '../lib/dataset.js';
import { matchesDexToken, suggestListTag } from '../lib/dexSearch.js';
import { errorMessage } from '../lib/errors.js';
import { LeagueIcon, PvpTops } from '../components/PvpTops.js';
import { ManagerSheet } from '../components/ManagerSheet.js';
import { useToast } from '../components/toast.js';
import { useMe } from '../lib/auth.js';
import { feedback } from '../lib/feedback.js';
import { localized, typeName, useLang, useT } from '../lib/i18n.js';
import { useList, useMembership, useRemoveEntries, useUpsertEntries } from '../lib/lists.js';
import { selection, useSelection } from '../lib/selection.js';
import { PageTourButton } from '../components/PageTour.js';
import { useProgressive } from '../lib/progressive.js';

/** Appeared in the last 45 days. */
export const isRecent = (iso: string | undefined) => !!iso && Date.now() - new Date(iso).getTime() < 45 * 86_400_000;

/** What the Pokédex can show, each one on or off: no way to ask for costumes and no costumes at once. */
const KINDS: VariantKind[] = ['base', 'costume', 'form', 'regional', 'mega', 'gmax'];
const ALL_KINDS = new Set(KINDS);
const TYPES = Object.keys(TYPE_COLORS) as PokemonType[];
const RARITIES: Rarity[] = ['normal', 'legendary', 'mythic', 'ultra_beast'];

/**
 * Where the Pokédex was when a Pokémon was opened: search, filters, how far down. Going back puts it all back; coming
 * from elsewhere (the menu) starts afresh.
 */
const memory: {
  query: string; kinds: Set<VariantKind> | null; onlyDatamined: boolean; hideDatamined: boolean;
  onlyShinyOut: boolean; onlyBackgrounds: boolean; onlyRecent: boolean; typeFilter: PokemonType | ''; rarity: Rarity | '';
  gen: number; shiny: boolean; gender: GenderFilter; forceExploded: boolean; sort: 'dex' | 'new' | 'family';
  scrollY: number; built: number;
} = {
  query: '', kinds: null, onlyDatamined: false, hideDatamined: false,
  onlyShinyOut: false, onlyBackgrounds: false, onlyRecent: false, typeFilter: '', rarity: '',
  gen: 0, shiny: false, gender: 'all', forceExploded: false, sort: 'dex',
  scrollY: 0, built: 0,
};

export function PokedexPage() {
  const back = useNavigationType() === 'POP';
  const [restore] = useState(() => (back ? { ...memory } : null));
  const [searchParams, setSearchParams] = useSearchParams();
  const targetListId = searchParams.get('to') || undefined;
  const t = useT();
  const { lang } = useLang();
  const dataset = useDataset();
  const [query, setQuery] = useState(restore?.query ?? '');
  const [kinds, setKinds] = useState<Set<VariantKind>>(restore?.kinds ?? ALL_KINDS);
  const [onlyDatamined, setOnlyDatamined] = useState(restore?.onlyDatamined ?? false);
  /** The other way round: only what is in the game. */
  const [hideDatamined, setHideDatamined] = useState(restore?.hideDatamined ?? false);
  const [onlyShinyOut, setOnlyShinyOut] = useState(restore?.onlyShinyOut ?? false);
  const [onlyBackgrounds, setOnlyBackgrounds] = useState(restore?.onlyBackgrounds ?? false);
  const [onlyRecent, setOnlyRecent] = useState(restore?.onlyRecent ?? false);
  const [typeFilter, setTypeFilter] = useState<PokemonType | ''>(restore?.typeFilter ?? '');
  const [rarity, setRarity] = useState<Rarity | ''>(restore?.rarity ?? '');
  const [gen, setGen] = useState(restore?.gen ?? 0);
  const [shiny, setShiny] = useState(restore?.shiny ?? false);
  const [gender, setGender] = useState<GenderFilter>(restore?.gender ?? 'all');
  const [forceExploded, setForceExploded] = useState(restore?.forceExploded ?? false);
  const [sort, setSort] = useState<'dex' | 'new' | 'family'>(restore?.sort ?? 'dex');
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'uncaught' | 'untracked'>('all');
  const [hideInTarget, setHideInTarget] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const [multi, setMulti] = useState(false);
  // Managers correct a variant from any card, search results included, as on the species page.
  const me = useMe();
  const toast = useToast();
  const isManager = me.data?.role === 'manager' || me.data?.role === 'admin';
  const [managing, setManaging] = useState<VariantGroup | null>(null);
  const [prefs, setPrefs] = useAddPrefs();
  const upsert = useUpsertEntries();
  const remove = useRemoveEntries();

  // Target collection mode ("/dex?to=<listId>"): opened from a collection's "Full Pokédex" link.
  const targetQuery = useList(targetListId ?? '', !!targetListId && !!me.data);
  const targetList = targetQuery.data?.access === 'owner' ? targetQuery.data.list : undefined;
  const targetDefaultTag = useMemo(() => (targetList ? suggestListTag(targetList.entries) : ''), [targetList]);
  const oneTapActive = !!targetList && prefs.oneTap && !multi;
  const membership = useMembership(!!me.data && !targetListId);

  /** Existing exact entries in the target list, for 1-tap toggle feedback (preserves notes on undo). */
  const targetEntryMap = useMemo(() => {
    const map = new Map<string, { done: boolean; note: string | null }>();
    if (!targetList) return map;
    for (const e of targetList.entries) {
      map.set(`${neutralKey(e.variantKey)}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`, { done: e.done, note: e.note ?? null });
    }
    return map;
  }, [targetList]);

  /** Status per neutral variant key (caught / present) for either the active target list or all of the player's collections. */
  const effectiveShiny = oneTapActive ? prefs.version === 'shiny' : shiny;
  const variantStatus = useMemo(() => {
    const out = new Map<string, 'caught' | 'present'>();
    const entries = targetList ? targetList.entries : membership.data;
    if (!entries?.length) return out;
    for (const e of entries) {
      if (e.shiny !== effectiveShiny) continue;
      const k = neutralKey(e.variantKey);
      const prev = out.get(k);
      if (e.done) out.set(k, 'caught');
      else if (!prev) out.set(k, 'present');
    }
    return out;
  }, [targetList, membership.data, effectiveShiny]);

  const quickToggleTarget = async (g: VariantGroup) => {
    if (!targetList || !dataset.data) return;
    const tag = targetDefaultTag || prefs.tag;
    const entries = buildQuickEntries(dataset.data, g, {
      version: prefs.version,
      gender: prefs.gender,
      tags: [tag],
      done: prefs.done,
    });
    if (!entries.length) return;
    const sp = dataset.data.speciesByDex.get(g.variants[0]!.dex);
    const name = `${sp ? localized(sp.name, lang) : ''}${g.label ? ` (${localized(g.label, lang)})` : ''}`.trim();
    const allIn = entries.every((e) => targetEntryMap.has(`${e.variantKey}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`));
    try {
      if (allIn) {
        const prevRows = entries.map((e) => {
          const prev = targetEntryMap.get(`${e.variantKey}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`);
          return { ...e, done: prev?.done ?? false, note: prev?.note ?? null };
        });
        await remove.mutateAsync({
          id: targetList.id,
          entries: entries.map(({ variantKey, gender: gd, shiny: sh, tag: tg }) => ({ variantKey, gender: gd, shiny: sh, tag: tg })),
        });
        feedback('untick');
        toast(t.quick_add_removed_one(name), {
          action: { label: t.undo, onClick: () => void upsert.mutateAsync({ id: targetList.id, entries: prevRows }) },
        });
      } else {
        await upsert.mutateAsync({ id: targetList.id, entries });
        feedback('tick');
        toast(t.quick_add_added_one(name), {
          action: {
            label: t.undo,
            onClick: () =>
              void remove.mutateAsync({
                id: targetList.id,
                entries: entries.map(({ variantKey, gender: gd, shiny: sh, tag: tg }) => ({ variantKey, gender: gd, shiny: sh, tag: tg })),
              }),
          },
        });
      }
    } catch (e) {
      toast(errorMessage(t, e));
    }
  };

  /** PvP mode: rank 1 IVs in Great and Ultra League on every card. Remembered per device. */
  const [pvpMode, setPvpModeState] = useState(() => {
    try {
      return localStorage.getItem('dexPvp') === '1';
    } catch {
      return false;
    }
  });
  const setPvpMode = (on: boolean) => {
    setPvpModeState(on);
    try {
      localStorage.setItem('dexPvp', on ? '1' : '0');
    } catch {}
  };
  const selectedItems = useSelection();
  const picksMap = useMemo(
    () => (dataset.data ? picksFromSelection(dataset.data, selectedItems) : new Map<string, DexPick>()),
    [dataset.data, selectedItems],
  );
  const q = useDeferredValue(normalize(query));
  /** Exploded = one card per form/costume instead of one tile per species. Automatic with a filter, search, multi-select, or 1-tap mode. */
  const allKinds = kinds.size === KINDS.length;
  const exploded = forceExploded || !allKinds || onlyDatamined || onlyShinyOut || onlyBackgrounds || onlyRecent || collectionFilter !== 'all' || q !== '' || multi || oneTapActive;
  const activeCount =
    (allKinds ? 0 : 1) +
    (onlyDatamined ? 1 : 0) +
    (hideDatamined ? 1 : 0) +
    (onlyShinyOut ? 1 : 0) +
    (onlyBackgrounds ? 1 : 0) +
    (onlyRecent ? 1 : 0) +
    (collectionFilter !== 'all' ? 1 : 0) +
    (typeFilter ? 1 : 0) +
    (rarity ? 1 : 0) +
    (gen ? 1 : 0) +
    (gender !== 'all' ? 1 : 0) +
    (forceExploded ? 1 : 0) +
    (sort !== 'dex' ? 1 : 0);

  const isShinyOutVariant = (v: Variant, sp: Species | undefined) =>
    v.hasShiny && v.shinyReleased !== false && sp?.shinyReleased !== false && !v.datamined && !!sp?.released;

  const shown = (v: Variant, sp?: Species) => {
    const species = sp ?? dataset.data?.speciesByDex.get(v.dex);
    if (!kinds.has(v.kind)) return false;
    if (onlyDatamined && !v.datamined) return false;
    if (hideDatamined && v.datamined) return false;
    if (onlyShinyOut && !isShinyOutVariant(v, species)) return false;
    if (onlyBackgrounds && !(v.backgrounds?.length)) return false;
    if (onlyRecent && (!isRecent(v.firstSeen) || v.datamined)) return false;
    if (typeFilter && !(v.types ?? species?.types ?? []).includes(typeFilter)) return false;
    if (hideInTarget && targetList && variantStatus.has(neutralKey(v.key))) return false;
    if (!targetList && collectionFilter === 'uncaught' && variantStatus.get(neutralKey(v.key)) !== 'present') return false;
    if (!targetList && collectionFilter === 'untracked' && variantStatus.has(neutralKey(v.key))) return false;
    return true;
  };

  /** The last kind left on cannot be switched off: the Pokédex is never empty by construction. */
  const toggleKind = (k: VariantKind) =>
    setKinds((prev) => {
      if (prev.has(k) && prev.size === 1) return prev;
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const kindName = (k: VariantKind) => t.kinds[k] ?? k;
  const kindLc = (k: VariantKind) => t.kinds_lc[k] ?? k;
  /** "Costumes only" or "No costumes, forms": whichever is shorter. */
  const kindsSummary = () => {
    const on = KINDS.filter((k) => kinds.has(k));
    const off = KINDS.filter((k) => !kinds.has(k));
    return on.length <= off.length ? t.kinds_only(on.map((k, i) => (i ? kindLc(k) : kindName(k))).join(', ')) : t.kinds_without(off.map((k) => kindLc(k)).join(', '));
  };

  /** Costume and form names per species, so "sorcière" finds the witch hats. */
  const labelText = useMemo(() => {
    const idx = dataset.data;
    const out = new Map<number, string>();
    if (!idx) return out;
    for (const [dex, vs] of idx.variantsByDex) out.set(dex, normalize(vs.map((v) => `${v.label?.en ?? ''} ${v.label?.fr ?? ''}`).join(' ')));
    return out;
  }, [dataset.data]);

  const rows = useMemo(() => {
    const idx = dataset.data;
    if (!idx) return [];
    const familyCache = new Map<string, Set<string>>();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const hasVariantFilter = !allKinds || onlyDatamined || hideDatamined || onlyShinyOut || onlyBackgrounds || onlyRecent || !!typeFilter || (hideInTarget && !!targetList) || (!targetList && collectionFilter !== 'all');
    return idx.ds.species.filter((s) => {
      if (gen && s.gen !== gen) return false;
      if (rarity && s.rarity !== rarity) return false;
      if (tokens.length && !tokens.some((w) => matchesDexToken(idx, s.dex, w, labelText, familyCache))) return false;
      if (!hasVariantFilter) return true;
      return (idx.variantsByDex.get(s.dex) ?? []).some((v) => shown(v, s));
    });
  }, [dataset.data, q, kinds, onlyDatamined, hideDatamined, onlyShinyOut, onlyBackgrounds, onlyRecent, typeFilter, rarity, gen, labelText, hideInTarget, targetList, variantStatus, collectionFilter]);

  /** Newest first: a species ranks by the most recent of its variants. `+family` searches show evolution order automatically. */
  const newest = (dex: number) => (dataset.data?.variantsByDex.get(dex) ?? []).reduce((m, v) => (v.firstSeen && v.firstSeen > m ? v.firstSeen : m), '');
  const hasFamilyQuery = q.split(/\s+/).some((w) => w.startsWith('+') && w.length > 1);
  const sortedRows = useMemo(() => {
    if (sort === 'new') return [...rows].sort((a, b) => newest(b.dex).localeCompare(newest(a.dex)) || a.dex - b.dex);
    if ((sort === 'family' || hasFamilyQuery) && dataset.data) return familyOrder(dataset.data, rows);
    return rows;
  }, [rows, sort, hasFamilyQuery, dataset.data]);

  const cards = useMemo(() => {
    const idx = dataset.data;
    if (!idx || !exploded) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const familyCache = new Map<string, Set<string>>();
    const out: { species: Species; group: VariantGroup; id: string }[] = [];
    for (const s of sort === 'family' || hasFamilyQuery ? sortedRows : rows) {
      const vs = (idx.variantsByDex.get(s.dex) ?? []).filter((v) => shown(v, s));
      for (const g of groupVariants(vs)) {
        // A gender filter keeps what exists in that gender (game master): no female-only costume under ♂, no genderless.
        if (gender !== 'all' && !((g.variants.find((v) => v.gender !== 'f') ?? g.variants[0]!).genders ?? ['m', 'f']).includes(gender)) continue;
        if (words.length) {
          const hay = normalize(`${s.dex} ${s.name.en} ${s.name.fr ?? ''} ${g.label?.en ?? ''} ${g.label?.fr ?? ''}`);
          if (!words.every((w) => matchesDexToken(idx, s.dex, w, undefined, familyCache) || hay.includes(w))) continue;
        }
        out.push({ species: s, group: g, id: `${s.dex}-${g.id}` });
      }
    }
    if (sort === 'new') {
      const groupNewest = (g: VariantGroup) => g.variants.reduce((m, v) => (v.firstSeen && v.firstSeen > m ? v.firstSeen : m), '');
      out.sort((a, b) => groupNewest(b.group).localeCompare(groupNewest(a.group)) || a.species.dex - b.species.dex);
    }
    return out;
  }, [dataset.data, exploded, rows, sortedRows, kinds, onlyDatamined, hideDatamined, onlyShinyOut, onlyBackgrounds, onlyRecent, typeFilter, q, gender, sort, hideInTarget, targetList, variantStatus, collectionFilter]);

  const baseKeyOf = (g: VariantGroup) => neutralKey((g.variants.find((x) => x.gender !== 'f') ?? g.variants[0]!).key);
  const savePick = (g: VariantGroup, p: DexPick) => {
    const bk = baseKeyOf(g);
    selection.replaceVariant(bk, p.combos.map((c) => ({ variantKey: bk, gender: c.sex, shiny: c.shiny, tag: '' })));
  };
  const toggleTick = (g: VariantGroup) => {
    const bk = baseKeyOf(g);
    const was = picksMap.has(bk);
    feedback(was ? 'untick' : 'tick');
    if (was) selection.removeVariant(bk);
    else savePick(g, defaultPick(g, gender, effectiveShiny));
  };
  const reset = () => {
    setKinds(ALL_KINDS);
    setOnlyDatamined(false);
    setHideDatamined(false);
    setOnlyShinyOut(false);
    setOnlyBackgrounds(false);
    setOnlyRecent(false);
    setCollectionFilter('all');
    setTypeFilter('');
    setRarity('');
    setGen(0);
    setShiny(false);
    setGender('all');
    setForceExploded(false);
    setSort('dex');
  };
  const exitTarget = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('to');
    setSearchParams(next, { replace: true });
    setHideInTarget(false);
  };
  const speciesLinkSuffix = targetList ? `?to=${targetList.id}` : '';
  const resultCount = exploded ? t.variants_count(cards.length) : t.species_count(rows.length);
  // Long grids build their first cards at once, the next ones as they come near the screen.
  const gridKey = `${q}|${[...kinds].join()}|${onlyDatamined}|${hideDatamined}|${onlyShinyOut}|${onlyBackgrounds}|${onlyRecent}|${collectionFilter}|${typeFilter}|${rarity}|${gen}|${gender}|${sort}|${effectiveShiny}|${multi}|${hideInTarget}`;
  const { shown: shownCards, more: cardsMore, sentinel: cardsSentinel } = useProgressive(cards, gridKey, 60, restore?.built);
  const { shown: shownRows, more: rowsMore, sentinel: rowsSentinel } = useProgressive(sortedRows, gridKey, 60, restore?.built);
  // Remembered as it changes, so a Pokémon opened from here comes back to the same place.
  Object.assign(memory, {
    query, kinds, onlyDatamined, hideDatamined, onlyShinyOut, onlyBackgrounds, onlyRecent, typeFilter, rarity,
    gen, shiny, gender, forceExploded, sort, built: Math.max(shownCards.length, shownRows.length),
  });
  // Detach in layout cleanup before React removes the tall grid on navigation, otherwise the shorter destination page
  // clamps window.scrollY and fires a scroll event that overwrites memory.scrollY before passive useEffect cleanup runs.
  useLayoutEffect(() => {
    if (!restore) memory.scrollY = 0;
    const save = () => { memory.scrollY = window.scrollY; };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      memory.scrollY = window.scrollY;
      window.removeEventListener('scroll', save);
    };
  }, [restore]);
  // Back from a Pokémon: down to where the player was, once the cards are there.
  const ready = !!dataset.data;
  useLayoutEffect(() => {
    if (!ready || !restore?.scrollY) return;
    window.scrollTo(0, restore.scrollY);
    const id = requestAnimationFrame(() => window.scrollTo(0, restore.scrollY));
    return () => cancelAnimationFrame(id);
  }, [ready, restore]);
  const check = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;

  return (
    <>
      <TopBar title={t.nav_dex} actions={<PageTourButton page="dex" />}>
        <div className="mx-auto max-w-6xl px-3 pb-2 sm:px-5">
          {/* Active target collection banner when arriving from a collection. */}
          {targetList && (
            <div className="mb-2 space-y-1.5 rounded-xl bg-go-soft px-2.5 py-1.5 text-xs font-semibold text-go-ink">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate">{t.adding_to_banner(targetList.name)}</span>
                <button
                  type="button"
                  aria-pressed={prefs.oneTap}
                  onClick={() => setPrefs({ oneTap: !prefs.oneTap })}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition ${prefs.oneTap ? 'bg-go text-white' : 'bg-card/85 text-go-ink'}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /></svg>
                  {t.quick_add_one_tap}
                </button>
                <button
                  type="button"
                  aria-pressed={hideInTarget}
                  onClick={() => setHideInTarget((v) => !v)}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold transition ${hideInTarget ? 'bg-go text-white' : 'bg-card/85 text-go-ink'}`}
                >
                  {t.hide_already_in}
                </button>
                <Link to={`/lists/${targetList.id}`} className="shrink-0 underline">{t.adding_to_back}</Link>
                <button type="button" onClick={exitTarget} aria-label={t.close} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-black/10">✕</button>
              </div>
              {oneTapActive && (
                <div className="pt-0.5">
                  <AddPresetsBar compact />
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <input
              type="search"
              inputMode="search"
              placeholder={t.search_placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Opened from the app icon's "Search a Pokémon" shortcut: ready to type.
              autoFocus={new URLSearchParams(location.search).get('focus') === 'search'}
              className="min-h-11 w-full rounded-xl border px-3 pr-10 text-[16px] shadow-card placeholder:text-ink-3"
              aria-label={t.search_placeholder}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t.search_clear}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {/* Quick controls side by side: Filters, 1-tap Shiny, PvP, Multi-select. */}
          <div className="mt-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            <Chip active={activeCount > 0} onClick={() => setFiltersOpen(true)} aria-label={t.filters}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              {t.filters}
              {activeCount > 0 && <span className="tnum rounded-full bg-go px-1.5 text-[11px] font-bold leading-4 text-white">{activeCount}</span>}
            </Chip>
            <Chip
              active={effectiveShiny}
              onClick={() => {
                if (oneTapActive) setPrefs({ version: effectiveShiny ? 'normal' : 'shiny' });
                else setShiny((v) => !v);
              }}
              aria-label={t.shiny}
            >
              <Sparkle className={effectiveShiny ? 'text-shiny' : ''} />
              {t.shiny}
            </Chip>
            <Chip active={pvpMode} onClick={() => setPvpMode(!pvpMode)} aria-label={t.pvp_mode}>
              <LeagueIcon league="great" size={16} />
              PvP
            </Chip>
            <Chip active={multi} onClick={() => setMulti((m) => !m)} aria-label={t.multi_select}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
              {t.multi_short}
              {picksMap.size > 0 && <span className="tnum rounded-full bg-go px-1.5 text-[11px] font-bold leading-4 text-white">{picksMap.size}</span>}
            </Chip>
          </div>
          {/* Active filters on their own row, each removable with a tap. */}
          {activeCount - (multi && !allKinds ? 1 : 0) > 0 && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
              {!allKinds && !multi && <Chip active onClick={() => setKinds(ALL_KINDS)}>{kindsSummary()} ✕</Chip>}
              {onlyDatamined && <Chip active onClick={() => setOnlyDatamined(false)}>{t.filter_datamined} ✕</Chip>}
              {hideDatamined && <Chip active onClick={() => setHideDatamined(false)}>{t.hide_datamined} ✕</Chip>}
              {onlyShinyOut && <Chip active onClick={() => setOnlyShinyOut(false)}>{t.only_shiny_out} ✕</Chip>}
              {onlyBackgrounds && <Chip active onClick={() => setOnlyBackgrounds(false)}>{t.only_backgrounds} ✕</Chip>}
              {onlyRecent && <Chip active onClick={() => setOnlyRecent(false)}>{t.only_recent} ✕</Chip>}
              {collectionFilter !== 'all' && (
                <Chip active onClick={() => setCollectionFilter('all')}>
                  {collectionFilter === 'uncaught' ? t.dex_only_uncaught : t.dex_only_untracked} ✕
                </Chip>
              )}
              {typeFilter && <Chip active onClick={() => setTypeFilter('')}>{typeName(typeFilter, lang)} ✕</Chip>}
              {rarity && <Chip active onClick={() => setRarity('')}>{t[`rarity_${rarity}`]} ✕</Chip>}
              {gen > 0 && <Chip active onClick={() => setGen(0)}>{t.filter_gen} {gen} ✕</Chip>}
              {gender !== 'all' && <Chip active onClick={() => setGender('all')}>{gender === 'm' ? `♂ ${t.male}` : `♀ ${t.female}`} ✕</Chip>}
              {forceExploded && !multi && <Chip active onClick={() => setForceExploded(false)}>{t.exploded_view} ✕</Chip>}
              {sort === 'new' && <Chip active onClick={() => setSort('dex')}>{t.sort_new} ✕</Chip>}
              {sort === 'family' && <Chip active onClick={() => setSort('dex')}>{t.sort_family} ✕</Chip>}
            </div>
          )}
          {/* While ticking cards, the kinds to show stay at hand, on a row of their own. */}
          {multi && (
            <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
              {KINDS.map((k) => (
                <Chip key={k} active={kinds.has(k)} onClick={() => toggleKind(k)} disabled={kinds.has(k) && kinds.size === 1}>
                  {kinds.has(k) && check}
                  {kindName(k)}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </TopBar>

      <main className="mx-auto max-w-6xl px-3 pb-28 sm:px-5">
        {dataset.isPending && <CardsSkeleton count={12} className="grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" />}
        {dataset.isError && <Empty>{t.err_generic}</Empty>}
        <BannerSlot page="dex" includeWelcome includeInstall />
        {dataset.data && (
          <>
            <p className="tnum flex items-center gap-2 py-2 text-xs font-semibold text-ink-3">
              {resultCount}
              {multi && cards.length > 0 && (
                <>
                  <button
                    type="button"
                    className="ml-auto text-sky"
                    onClick={() => {
                      const batch = cards.flatMap((c) => {
                        const bk = baseKeyOf(c.group);
                        if (picksMap.has(bk)) return [];
                        return defaultPick(c.group, gender, effectiveShiny).combos.map((co) => ({ variantKey: bk, gender: co.sex, shiny: co.shiny, tag: '' as const }));
                      });
                      if (batch.length) selection.add(batch);
                    }}
                  >
                    {t.select_all_visible}
                  </button>
                  <button type="button" className="text-ink-3" onClick={() => selection.clear()}>{t.clear}</button>
                </>
              )}
            </p>
            {multi && <p className="mb-2 text-xs text-ink-3">{t.multi_hint}</p>}
            {(exploded ? cards.length : rows.length) === 0 && <Empty>{t.nothing_here}</Empty>}
            {exploded && (
              <ul className="stagger grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {shownCards.map(({ species, group, id }) => {
                  const baseKey = baseKeyOf(group);
                  return (
                    <li key={id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 190px' }}>
                      <VariantCard
                        idx={dataset.data}
                        species={species}
                        group={group}
                        shiny={effectiveShiny}
                        gender={gender}
                        showSpecies
                        selectable={multi}
                        selected={picksMap.has(baseKey)}
                        pick={picksMap.get(baseKey)}
                        onPick={(p) => savePick(group, p)}
                        showPvp={pvpMode}
                        openOnTap
                        speciesLinkSuffix={speciesLinkSuffix}
                        inCollection={variantStatus.get(baseKey) ?? false}
                        quickMode={oneTapActive}
                        onAdd={(g) => (multi ? toggleTick(g) : oneTapActive ? void quickToggleTarget(g) : setAdding(g))}
                        onManage={isManager && !multi ? setManaging : undefined}
                      />
                    </li>
                  );
                })}
                {cardsMore && <li ref={cardsSentinel} aria-hidden="true" className="col-span-full h-1" />}
              </ul>
            )}
            {!exploded && (
              <ul className="stagger grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-9">
                {shownRows.map((s) => {
                  const idx = dataset.data;
                  const cover = idx.coverOf.get(s.dex)!;
                  const shownVar = gender === 'all' ? cover : variantForGender(groupVariants((idx.variantsByDex.get(s.dex) ?? []).filter((v) => v.kind === 'base'))[0] ?? { id: '', label: null, variants: [cover] }, gender);
                  const vs = idx.variantsByDex.get(s.dex) ?? [];
                  const extra = vs.filter((v) => v.kind !== 'base').length;
                  const hasDatamined = vs.some((v) => v.datamined);
                  const coverStatus = variantStatus.get(neutralKey(cover.key));
                  return (
                    <li key={s.dex} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 118px' }}>
                      <Link to={`/dex/${s.dex}${speciesLinkSuffix}`} className="card flex flex-col items-center px-1 pb-2 pt-1 transition hover:brightness-[0.97]">
                        <div className="relative">
                          <span className="tnum absolute -left-1 top-0 text-[11px] font-semibold text-ink-3">#{s.dex}</span>
                          <Sprite idx={idx} variant={shownVar} shiny={effectiveShiny && shownVar.hasShiny} muted={!s.released} size={72} />
                          {extra > 0 && <span className="tnum absolute -right-1 bottom-0 rounded-md bg-ink px-1 text-[10px] font-bold text-card">+{extra}</span>}
                          {coverStatus && (
                            <span
                              className={`absolute -right-1 top-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white ${coverStatus === 'caught' ? 'bg-go' : 'bg-sky'}`}
                              title={coverStatus === 'caught' ? t.already_caught_short : t.already_in_list}
                            >
                              {coverStatus === 'caught' ? '✓' : '•'}
                            </span>
                          )}
                          {hasDatamined && (
                            <span
                              className={`absolute -right-1 h-2 w-2 rounded-full bg-sky ${coverStatus ? 'top-4' : 'top-0'}`}
                              aria-label={t.filter_datamined}
                            />
                          )}
                          {isRecent(newest(s.dex)) && <span className="absolute -left-2 bottom-0 rounded-md bg-go px-1 text-[9px] font-bold text-white">{t.new_badge}</span>}
                        </div>
                        <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(s.name, lang)}</span>
                        {pvpMode && <PvpTops p={pvpOf(idx, cover)} />}
                      </Link>
                    </li>
                  );
                })}
                {rowsMore && <li ref={rowsSentinel} aria-hidden="true" className="col-span-full h-1" />}
              </ul>
            )}
          </>
        )}
      </main>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t.filters}>
        {filtersOpen && (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline gap-3">
                <p className="flex-1 text-xs font-medium text-ink-3">{t.show_title}</p>
                {!allKinds && <button type="button" className="text-xs font-semibold text-sky" onClick={() => setKinds(ALL_KINDS)}>{t.preset_all}</button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <Chip key={k} active={kinds.has(k)} onClick={() => toggleKind(k)} disabled={kinds.has(k) && kinds.size === 1}>
                    {kinds.has(k) && check}
                    {kindName(k)}
                  </Chip>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Chip active={onlyRecent} onClick={() => { const next = !onlyRecent; setOnlyRecent(next); if (next) { setOnlyDatamined(false); setSort('new'); } }}>{t.only_recent}</Chip>
                <Chip active={onlyDatamined} onClick={() => { setOnlyDatamined((v) => !v); setHideDatamined(false); setOnlyRecent(false); }}>{t.only_datamined}</Chip>
                <Chip active={hideDatamined} onClick={() => { setHideDatamined((v) => !v); setOnlyDatamined(false); }}>{t.hide_datamined}</Chip>
                <Chip active={onlyShinyOut} onClick={() => { const next = !onlyShinyOut; setOnlyShinyOut(next); if (next) { if (oneTapActive) setPrefs({ version: 'shiny' }); else setShiny(true); } }}>{t.only_shiny_out}</Chip>
                <Chip active={onlyBackgrounds} onClick={() => setOnlyBackgrounds((v) => !v)}>{t.only_backgrounds}</Chip>
                {me.data && !targetList && (
                  <>
                    <Chip active={collectionFilter === 'uncaught'} onClick={() => setCollectionFilter((v) => (v === 'uncaught' ? 'all' : 'uncaught'))}>{t.dex_only_uncaught}</Chip>
                    <Chip active={collectionFilter === 'untracked'} onClick={() => setCollectionFilter((v) => (v === 'untracked' ? 'all' : 'untracked'))}>{t.dex_only_untracked}</Chip>
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.filter_type}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={typeFilter === ''} onClick={() => setTypeFilter('')} className="min-h-8 px-2.5 text-xs">{t.filter_all}</Chip>
                {TYPES.map((ty) => (
                  <Chip key={ty} active={typeFilter === ty} onClick={() => setTypeFilter(typeFilter === ty ? '' : ty)} className="min-h-8 gap-1.5 px-2.5 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLORS[ty] }} aria-hidden="true" />
                    {typeName(ty, lang)}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.filter_rarity}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={rarity === ''} onClick={() => setRarity('')}>{t.filter_all}</Chip>
                {RARITIES.map((r) => (
                  <Chip key={r} active={rarity === r} onClick={() => setRarity(rarity === r ? '' : r)}>{t[`rarity_${r}`]}</Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.filter_gen}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={gen === 0} onClick={() => setGen(0)}>{t.gen_all}</Chip>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => <Chip key={g} active={gen === g} onClick={() => setGen(g)}>{g}</Chip>)}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.filter_gender}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={gender === 'all'} onClick={() => setGender('all')}>{t.gender_both}</Chip>
                <Chip active={gender === 'm'} onClick={() => setGender('m')}>♂ {t.male}</Chip>
                <Chip active={gender === 'f'} onClick={() => setGender('f')}>♀ {t.female}</Chip>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.sort}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={sort === 'dex'} onClick={() => setSort('dex')}>{t.sort_dex}</Chip>
                <Chip active={sort === 'new'} onClick={() => setSort('new')}>{t.sort_new}</Chip>
                <Chip active={sort === 'family'} onClick={() => setSort('family')}>{t.sort_family}</Chip>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.display_title}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={forceExploded} onClick={() => setForceExploded((v) => !v)}>{t.exploded_view}</Chip>
              </div>
            </div>
            <div className="sticky bottom-0 flex gap-2 bg-card pt-2">
              <Button tone="ghost" className="flex-1" onClick={reset} disabled={activeCount === 0 && !shiny}>{t.filter_reset}</Button>
              <Button tone="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>{t.see_results(resultCount)}</Button>
            </div>
          </div>
        )}
      </Sheet>

      {dataset.data && (
        <AddToListSheet
          idx={dataset.data}
          group={adding}
          initialShiny={effectiveShiny}
          targetListId={targetList?.id}
          defaultTag={targetList && targetDefaultTag ? targetDefaultTag : undefined}
          onClose={() => setAdding(null)}
        />
      )}
      {isManager && <ManagerSheet idx={dataset.data} group={managing} onClose={() => setManaging(null)} />}
    </>
  );
}
