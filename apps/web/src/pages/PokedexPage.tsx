import { useDeferredValue, useLayoutEffect, useMemo, useState } from 'react';
import { Link, useNavigationType, useSearchParams } from 'react-router';
import { neutralKey, type PokemonType, type Rarity, type Species, type Variant, type VariantKind } from '@mydexpogo/shared';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { BulkAddSheet, defaultPick, type DexPick } from '../components/BulkAddSheet.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { TYPE_COLORS } from '../components/TypeBadge.js';
import { VariantCard, variantForGender, type GenderFilter } from '../components/VariantCard.js';
import { Button, CardsSkeleton, Chip, Empty, Sheet, TopBar } from '../components/ui.js';
import { familyOrder, normalize, pvpOf, useDataset } from '../lib/dataset.js';
import { matchesDexToken, suggestListTag } from '../lib/dexSearch.js';
import { LeagueIcon, PvpTops } from '../components/PvpTops.js';
import { InstallBanner, WelcomeResume } from '../components/InstallBanner.js';
import { ManagerSheet } from '../components/ManagerSheet.js';
import { BulkManageSheet } from '../components/BulkManageSheet.js';
import { useMe } from '../lib/auth.js';
import { feedback } from '../lib/feedback.js';
import { localized, typeName, useLang, useT } from '../lib/i18n.js';
import { useList, useMembership } from '../lib/lists.js';
import { useSelection } from '../lib/selection.js';
import { WhatsNewBanner } from '../components/WhatsNew.js';
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
  onlyShinyOut: boolean; onlyBackgrounds: boolean; typeFilter: PokemonType | ''; rarity: Rarity | '';
  gen: number; shiny: boolean; gender: GenderFilter; forceExploded: boolean; sort: 'dex' | 'new' | 'family';
  scrollY: number; built: number;
} = {
  query: '', kinds: null, onlyDatamined: false, hideDatamined: false,
  onlyShinyOut: false, onlyBackgrounds: false, typeFilter: '', rarity: '',
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
  const [typeFilter, setTypeFilter] = useState<PokemonType | ''>(restore?.typeFilter ?? '');
  const [rarity, setRarity] = useState<Rarity | ''>(restore?.rarity ?? '');
  const [gen, setGen] = useState(restore?.gen ?? 0);
  const [shiny, setShiny] = useState(restore?.shiny ?? false);
  const [gender, setGender] = useState<GenderFilter>(restore?.gender ?? 'all');
  const [forceExploded, setForceExploded] = useState(restore?.forceExploded ?? false);
  const [sort, setSort] = useState<'dex' | 'new' | 'family'>(restore?.sort ?? 'dex');
  const [hideInTarget, setHideInTarget] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const [multi, setMulti] = useState(false);
  // Managers correct a variant from any card, search results included, as on the species page.
  const me = useMe();
  const isManager = me.data?.role === 'manager' || me.data?.role === 'admin';
  const [managing, setManaging] = useState<VariantGroup | null>(null);
  const [bulkManaging, setBulkManaging] = useState(false);
  const basketCount = useSelection().length;

  // Target collection mode ("/dex?to=<listId>"): opened from "+ Add Pokémon" inside a collection.
  const targetQuery = useList(targetListId ?? '', !!targetListId && !!me.data);
  const targetList = targetQuery.data?.access === 'owner' ? targetQuery.data.list : undefined;
  const targetDefaultTag = useMemo(() => (targetList ? suggestListTag(targetList.entries) : ''), [targetList]);
  const membership = useMembership(!!me.data && !targetListId);

  /** Status per neutral variant key (caught / present) for either the active target list or all of the player's collections. */
  const variantStatus = useMemo(() => {
    const out = new Map<string, 'caught' | 'present'>();
    const entries = targetList ? targetList.entries : membership.data;
    if (!entries?.length) return out;
    for (const e of entries) {
      if (e.shiny !== shiny) continue;
      const k = neutralKey(e.variantKey);
      const prev = out.get(k);
      if (e.done) out.set(k, 'caught');
      else if (!prev) out.set(k, 'present');
    }
    return out;
  }, [targetList, membership.data, shiny]);

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
  const [ticked, setTicked] = useState<Map<string, DexPick>>(new Map());
  const [bulkOpen, setBulkOpen] = useState(false);
  const q = useDeferredValue(normalize(query));
  /** Exploded = one card per form/costume instead of one tile per species. Automatic with a filter or a search. */
  const allKinds = kinds.size === KINDS.length;
  const exploded = forceExploded || !allKinds || onlyDatamined || onlyShinyOut || onlyBackgrounds || q !== '' || multi;
  const activeCount =
    (allKinds ? 0 : 1) +
    (onlyDatamined ? 1 : 0) +
    (hideDatamined ? 1 : 0) +
    (onlyShinyOut ? 1 : 0) +
    (onlyBackgrounds ? 1 : 0) +
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
    if (typeFilter && !(v.types ?? species?.types ?? []).includes(typeFilter)) return false;
    if (hideInTarget && targetList && variantStatus.has(neutralKey(v.key))) return false;
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
    const hasVariantFilter = !allKinds || onlyDatamined || hideDatamined || onlyShinyOut || onlyBackgrounds || !!typeFilter || (hideInTarget && !!targetList);
    return idx.ds.species.filter((s) => {
      if (gen && s.gen !== gen) return false;
      if (rarity && s.rarity !== rarity) return false;
      if (tokens.length && !tokens.some((w) => matchesDexToken(idx, s.dex, w, labelText, familyCache))) return false;
      if (!hasVariantFilter) return true;
      return (idx.variantsByDex.get(s.dex) ?? []).some((v) => shown(v, s));
    });
  }, [dataset.data, q, kinds, onlyDatamined, hideDatamined, onlyShinyOut, onlyBackgrounds, typeFilter, rarity, gen, labelText, hideInTarget, targetList, variantStatus]);

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
    if (sort === 'new') out.sort((a, b) => (b.group.variants[0]!.firstSeen ?? '').localeCompare(a.group.variants[0]!.firstSeen ?? '') || a.species.dex - b.species.dex);
    return out;
  }, [dataset.data, exploded, rows, sortedRows, kinds, onlyDatamined, hideDatamined, onlyShinyOut, onlyBackgrounds, typeFilter, q, gender, sort, hideInTarget, targetList, variantStatus]);

  const toggleTick = (id: string, g: VariantGroup) => {
    feedback(ticked.has(id) ? 'untick' : 'tick');
    setTicked((m) => {
      const n = new Map(m);
      n.has(id) ? n.delete(id) : n.set(id, defaultPick(g, gender, shiny));
      return n;
    });
  };
  const reset = () => {
    setKinds(ALL_KINDS);
    setOnlyDatamined(false);
    setHideDatamined(false);
    setOnlyShinyOut(false);
    setOnlyBackgrounds(false);
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
  const gridKey = `${q}|${[...kinds].join()}|${onlyDatamined}|${hideDatamined}|${onlyShinyOut}|${onlyBackgrounds}|${typeFilter}|${rarity}|${gen}|${gender}|${sort}|${shiny}|${multi}|${hideInTarget}`;
  const { shown: shownCards, more: cardsMore, sentinel: cardsSentinel } = useProgressive(cards, gridKey, 60, restore?.built);
  const { shown: shownRows, more: rowsMore, sentinel: rowsSentinel } = useProgressive(sortedRows, gridKey, 60, restore?.built);
  // Remembered as it changes, so a Pokémon opened from here comes back to the same place.
  Object.assign(memory, {
    query, kinds, onlyDatamined, hideDatamined, onlyShinyOut, onlyBackgrounds, typeFilter, rarity,
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
      <TopBar title={t.nav_dex}>
        <div className="mx-auto max-w-3xl px-3 pb-2">
          {/* Active target collection banner when arriving from "+ Add Pokémon" inside a collection. */}
          {targetList && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-go-soft px-2.5 py-1.5 text-xs font-semibold text-go-ink">
              <span className="min-w-0 flex-1 truncate">{t.adding_to_banner(targetList.name)}</span>
              <button
                type="button"
                aria-pressed={hideInTarget}
                onClick={() => setHideInTarget((v) => !v)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold transition ${hideInTarget ? 'bg-go text-white' : 'bg-card/80 text-go-ink'}`}
              >
                {t.hide_already_in}
              </button>
              <Link to={`/lists/${targetList.id}`} className="shrink-0 underline">{t.adding_to_back}</Link>
              <button type="button" onClick={exitTarget} aria-label={t.close} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-black/10">✕</button>
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
          <div className="mt-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
            <Chip active={activeCount > 0} onClick={() => setFiltersOpen(true)} aria-label={t.filters}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              {t.filters}
              {activeCount > 0 && <span className="tnum rounded-full bg-go px-1.5 text-[11px] font-bold leading-4 text-white">{activeCount}</span>}
            </Chip>
            <Chip active={shiny} onClick={() => setShiny((v) => !v)} aria-label={t.shiny}>
              <Sparkle className={shiny ? 'text-shiny' : ''} />
              {t.shiny}
            </Chip>
            <Chip active={pvpMode} onClick={() => setPvpMode(!pvpMode)} aria-label={t.pvp_mode}>
              <LeagueIcon league="great" size={16} />
              PvP
            </Chip>
            <Chip active={multi} onClick={() => { setMulti((m) => !m); setTicked(new Map()); }} aria-label={t.multi_select}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
              {t.multi_short}
            </Chip>
          </div>
          {/* Active filters on their own row, each removable with a tap. */}
          {activeCount - (multi && !allKinds ? 1 : 0) > 0 && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
              {!allKinds && !multi && <Chip active onClick={() => setKinds(ALL_KINDS)}>{kindsSummary()} ✕</Chip>}
              {onlyDatamined && <Chip active onClick={() => setOnlyDatamined(false)}>{t.filter_datamined} ✕</Chip>}
              {hideDatamined && <Chip active onClick={() => setHideDatamined(false)}>{t.hide_datamined} ✕</Chip>}
              {onlyShinyOut && <Chip active onClick={() => setOnlyShinyOut(false)}>{t.only_shiny_out} ✕</Chip>}
              {onlyBackgrounds && <Chip active onClick={() => setOnlyBackgrounds(false)}>{t.only_backgrounds} ✕</Chip>}
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
            <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
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

      <main className={`mx-auto max-w-3xl px-3 ${multi && basketCount > 0 ? 'pb-44' : 'pb-28'}`}>
        {dataset.isPending && <CardsSkeleton count={12} />}
        {dataset.isError && <Empty>{t.err_generic}</Empty>}
        <WelcomeResume />
        <InstallBanner />
        <WhatsNewBanner />
        {dataset.data && (
          <>
            <p className="tnum flex items-center gap-2 py-2 text-xs font-semibold text-ink-3">
              {resultCount}
              {multi && cards.length > 0 && (
                <>
                  <button type="button" className="ml-auto text-sky" onClick={() => setTicked((m) => new Map(cards.map((c) => [c.id, m.get(c.id) ?? defaultPick(c.group, gender, shiny)])))}>{t.select_all_visible}</button>
                  <button type="button" className="text-ink-3" onClick={() => setTicked(new Map())}>{t.clear}</button>
                </>
              )}
            </p>
            {multi && <p className="mb-2 text-xs text-ink-3">{t.multi_hint}</p>}
            {(exploded ? cards.length : rows.length) === 0 && <Empty>{t.nothing_here}</Empty>}
            {exploded && (
              <ul className="stagger grid grid-cols-3 gap-2 sm:grid-cols-4">
                {shownCards.map(({ species, group, id }) => {
                  const baseKey = neutralKey((group.variants.find((x) => x.gender !== 'f') ?? group.variants[0]!).key);
                  return (
                    <li key={id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 190px' }}>
                      <VariantCard
                        idx={dataset.data}
                        species={species}
                        group={group}
                        shiny={shiny}
                        gender={gender}
                        showSpecies
                        selectable={multi}
                        selected={ticked.has(id)}
                        pick={ticked.get(id)}
                        onPick={(p) => setTicked((m) => new Map(m).set(id, p))}
                        showPvp={pvpMode}
                        openOnTap
                        speciesLinkSuffix={speciesLinkSuffix}
                        inCollection={variantStatus.get(baseKey) ?? false}
                        onAdd={(g) => (multi ? toggleTick(id, g) : setAdding(g))}
                        onManage={isManager && !multi ? setManaging : undefined}
                      />
                    </li>
                  );
                })}
                {cardsMore && <li ref={cardsSentinel} aria-hidden="true" className="col-span-full h-1" />}
              </ul>
            )}
            {!exploded && (
              <ul className="stagger grid grid-cols-4 gap-2 sm:grid-cols-6">
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
                          <Sprite idx={idx} variant={shownVar} shiny={shiny && shownVar.hasShiny} muted={!s.released} size={72} />
                          {extra > 0 && <span className="tnum absolute -right-1 bottom-0 rounded-md bg-ink px-1 text-[10px] font-bold text-card">+{extra}</span>}
                          {hasDatamined && <span className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-sky" aria-label={t.filter_datamined} />}
                          {coverStatus && !hasDatamined && (
                            <span
                              className={`absolute -right-1 top-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white ${coverStatus === 'caught' ? 'bg-go' : 'bg-sky'}`}
                              title={coverStatus === 'caught' ? t.already_caught_short : t.already_in_list}
                            >
                              {coverStatus === 'caught' ? '✓' : '•'}
                            </span>
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

      {multi && ticked.size > 0 && (
        <div className={`pb-safe fixed inset-x-0 z-20 px-3 ${basketCount > 0 ? 'bottom-[calc(var(--nav-h)+58px)]' : 'bottom-[var(--nav-h)]'}`}>
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl bg-go px-3 py-2 text-white shadow-lg">
            <span className="tnum min-w-0 flex-1 truncate text-sm font-bold">{t.bulk_title(ticked.size)}</span>
            {isManager && <Button tone="ghost" className="min-h-9 bg-white/20 px-3 text-sm text-white hover:bg-white/30" onClick={() => setBulkManaging(true)}>{t.manage_short}</Button>}
            <Button tone="ghost" className="min-h-9 bg-white px-3 text-sm text-go-ink hover:bg-white" onClick={() => setBulkOpen(true)}>{t.add}</Button>
          </div>
        </div>
      )}

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
                <Chip active={onlyDatamined} onClick={() => { setOnlyDatamined((v) => !v); setHideDatamined(false); }}>{t.only_datamined}</Chip>
                <Chip active={hideDatamined} onClick={() => { setHideDatamined((v) => !v); setOnlyDatamined(false); }}>{t.hide_datamined}</Chip>
                <Chip active={onlyShinyOut} onClick={() => { const next = !onlyShinyOut; setOnlyShinyOut(next); if (next) setShiny(true); }}>{t.only_shiny_out}</Chip>
                <Chip active={onlyBackgrounds} onClick={() => setOnlyBackgrounds((v) => !v)}>{t.only_backgrounds}</Chip>
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
                <Chip active={shiny} onClick={() => setShiny((v) => !v)}><Sparkle className={shiny ? 'text-shiny' : ''} /> {t.shiny}</Chip>
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
          initialShiny={shiny}
          targetListId={targetList?.id}
          defaultTag={targetDefaultTag}
          onClose={() => setAdding(null)}
        />
      )}
      {isManager && <ManagerSheet group={managing} onClose={() => setManaging(null)} />}
      {isManager && <BulkManageSheet open={bulkManaging} groups={[...ticked.values()].map((p) => p.group)} onClose={() => setBulkManaging(false)} onDone={() => { setTicked(new Map()); setMulti(false); }} />}
      <BulkAddSheet
        idx={dataset.data}
        open={bulkOpen}
        picks={[...ticked.values()]}
        targetListId={targetList?.id}
        defaultTag={targetDefaultTag}
        onApplyAll={(change) => setTicked((m) => new Map([...m].map(([k, p]) => [k, change(p)])))}
        onClose={() => setBulkOpen(false)}
        onDone={() => { setTicked(new Map()); setMulti(false); }}
      />
    </>
  );
}
