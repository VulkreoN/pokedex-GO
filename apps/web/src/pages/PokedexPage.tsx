import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Species, Variant, VariantKind } from '@mydexpogo/shared';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { BulkAddSheet } from '../components/BulkAddSheet.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { VariantCard, variantForGender, type GenderFilter } from '../components/VariantCard.js';
import { Button, Chip, Empty, Sheet, Spinner, TopBar } from '../components/ui.js';
import { familyOrder, matchesQuery, normalize, pvpOf, useDataset } from '../lib/dataset.js';
import { LeagueIcon, PvpTops } from '../components/PvpTops.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { localized, useLang, useT } from '../lib/i18n.js';

/** Appeared in the last 45 days. */
export const isRecent = (iso: string | undefined) => !!iso && Date.now() - new Date(iso).getTime() < 45 * 86_400_000;

/** What the Pokédex can show, each one on or off: no way to ask for costumes and no costumes at once. */
const KINDS: VariantKind[] = ['base', 'costume', 'form', 'regional', 'mega', 'gmax'];
const ALL_KINDS = new Set(KINDS);

export function PokedexPage() {
  const t = useT();
  const { lang } = useLang();
  const dataset = useDataset();
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<Set<VariantKind>>(ALL_KINDS);
  const [onlyDatamined, setOnlyDatamined] = useState(false);
  const [gen, setGen] = useState(0);
  const [shiny, setShiny] = useState(false);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [forceExploded, setForceExploded] = useState(false);
  const [sort, setSort] = useState<'dex' | 'new' | 'family'>('dex');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const [multi, setMulti] = useState(false);
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
  const [ticked, setTicked] = useState<Map<string, VariantGroup>>(new Map());
  const [bulkOpen, setBulkOpen] = useState(false);
  const q = useDeferredValue(normalize(query));
  /** Exploded = one card per form/costume instead of one tile per species. Automatic with a filter or a search. */
  const allKinds = kinds.size === KINDS.length;
  const exploded = forceExploded || !allKinds || onlyDatamined || q !== '' || multi;
  const activeCount = (allKinds ? 0 : 1) + (onlyDatamined ? 1 : 0) + (gen ? 1 : 0) + (shiny ? 1 : 0) + (gender !== 'all' ? 1 : 0) + (forceExploded ? 1 : 0) + (sort !== 'dex' ? 1 : 0);
  const shown = (v: Variant) => kinds.has(v.kind) && (!onlyDatamined || !!v.datamined);
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

  const rows = useMemo(() => {
    const idx = dataset.data;
    if (!idx) return [];
    return idx.ds.species.filter((s) => {
      if (gen && s.gen !== gen) return false;
      if (q && !q.split(/\s+/).filter(Boolean).some((w) => matchesQuery(idx, s.dex, w))) return false;
      if (allKinds && !onlyDatamined) return true;
      return (idx.variantsByDex.get(s.dex) ?? []).some(shown);
    });
  }, [dataset.data, q, kinds, onlyDatamined, gen]);

  /** Newest first: a species ranks by the most recent of its variants. */
  const newest = (dex: number) => (dataset.data?.variantsByDex.get(dex) ?? []).reduce((m, v) => (v.firstSeen && v.firstSeen > m ? v.firstSeen : m), '');
  const sortedRows = useMemo(() => {
    if (sort === 'new') return [...rows].sort((a, b) => newest(b.dex).localeCompare(newest(a.dex)) || a.dex - b.dex);
    if (sort === 'family' && dataset.data) return familyOrder(dataset.data, rows);
    return rows;
  }, [rows, sort, dataset.data]);

  const cards = useMemo(() => {
    const idx = dataset.data;
    if (!idx || !exploded) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const out: { species: Species; group: VariantGroup; id: string }[] = [];
    for (const s of sort === 'family' ? sortedRows : rows) {
      const vs = (idx.variantsByDex.get(s.dex) ?? []).filter(shown);
      for (const g of groupVariants(vs)) {
        // A gender filter keeps what exists in that gender (game master): no female-only costume under ♂, no genderless.
        if (gender !== 'all' && !((g.variants.find((v) => v.gender !== 'f') ?? g.variants[0]!).genders ?? ['m', 'f']).includes(gender)) continue;
        if (words.length) {
          const hay = normalize(`${s.dex} ${s.name.en} ${s.name.fr ?? ''} ${g.label?.en ?? ''} ${g.label?.fr ?? ''}`);
          if (!words.every((w) => hay.includes(w))) continue;
        }
        out.push({ species: s, group: g, id: `${s.dex}-${g.id}` });
      }
    }
    if (sort === 'new') out.sort((a, b) => (b.group.variants[0]!.firstSeen ?? '').localeCompare(a.group.variants[0]!.firstSeen ?? '') || a.species.dex - b.species.dex);
    return out;
  }, [dataset.data, exploded, rows, sortedRows, kinds, onlyDatamined, q, gender, sort]);

  const toggleTick = (id: string, g: VariantGroup) =>
    setTicked((m) => {
      const n = new Map(m);
      n.has(id) ? n.delete(id) : n.set(id, g);
      return n;
    });
  const reset = () => {
    setKinds(ALL_KINDS);
    setOnlyDatamined(false);
    setGen(0);
    setShiny(false);
    setGender('all');
    setForceExploded(false);
    setSort('dex');
  };
  const resultCount = exploded ? t.variants_count(cards.length) : t.species_count(rows.length);
  const check = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;

  return (
    <>
      <TopBar
        title={t.nav_dex}
      >
        <div className="mx-auto max-w-3xl px-3 pb-2">
          <input
            type="search"
            inputMode="search"
            placeholder={t.search_placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border px-3 text-[16px] shadow-card placeholder:text-ink-3 focus:outline-none"
            aria-label={t.search_placeholder}
          />
          {/* The three ways to change what the grid shows, side by side. */}
          <div className="mt-2 flex items-center gap-2">
            <Chip active={activeCount > 0} onClick={() => setFiltersOpen(true)} aria-label={t.filters}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              {t.filters}
              {activeCount > 0 && <span className="tnum rounded-full bg-go px-1.5 text-[11px] font-bold leading-4 text-white">{activeCount}</span>}
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
              {gen > 0 && <Chip active onClick={() => setGen(0)}>{t.filter_gen} {gen} ✕</Chip>}
              {gender !== 'all' && <Chip active onClick={() => setGender('all')}>{gender === 'm' ? `♂ ${t.male}` : `♀ ${t.female}`} ✕</Chip>}
              {shiny && <Chip active onClick={() => setShiny(false)}><Sparkle className="text-shiny" /> {t.shiny} ✕</Chip>}
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

      <main className="mx-auto max-w-3xl px-3 pb-28">
        {dataset.isPending && <Spinner />}
        {dataset.isError && <Empty>{t.err_generic}</Empty>}
        <InstallBanner />
        {dataset.data && (
          <>
            <p className="tnum flex items-center gap-2 py-2 text-xs font-semibold text-ink-3">
              {resultCount}
              {multi && cards.length > 0 && (
                <>
                  <button type="button" className="ml-auto text-sky" onClick={() => setTicked(new Map(cards.map((c) => [c.id, c.group])))}>{t.select_all_visible}</button>
                  <button type="button" className="text-ink-3" onClick={() => setTicked(new Map())}>{t.clear}</button>
                </>
              )}
            </p>
            {multi && <p className="mb-2 text-xs text-ink-3">{t.multi_hint}</p>}
            {(exploded ? cards.length : rows.length) === 0 && <Empty>{t.nothing_here}</Empty>}
            {exploded && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {cards.map(({ species, group, id }) => (
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
                      showPvp={pvpMode}
                      onAdd={(g) => (multi ? toggleTick(id, g) : setAdding(g))}
                    />
                  </li>
                ))}
              </ul>
            )}
            {!exploded && (
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {sortedRows.map((s) => {
                  const idx = dataset.data;
                  const cover = idx.coverOf.get(s.dex)!;
                  const shown = gender === 'all' ? cover : variantForGender(groupVariants((idx.variantsByDex.get(s.dex) ?? []).filter((v) => v.kind === 'base'))[0] ?? { id: '', label: null, variants: [cover] }, gender);
                  const vs = idx.variantsByDex.get(s.dex) ?? [];
                  const extra = vs.filter((v) => v.kind !== 'base').length;
                  const hasDatamined = vs.some((v) => v.datamined);
                  return (
                    <li key={s.dex} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 118px' }}>
                      <Link to={`/dex/${s.dex}`} className="card flex flex-col items-center px-1 pb-2 pt-1 transition hover:brightness-[0.97]">
                        <div className="relative">
                          <span className="tnum absolute -left-1 top-0 text-[11px] font-semibold text-ink-3">#{s.dex}</span>
                          <Sprite idx={idx} variant={shown} shiny={shiny && shown.hasShiny} muted={!s.released} size={72} />
                          {extra > 0 && <span className="tnum absolute -right-1 bottom-0 rounded-md bg-ink px-1 text-[10px] font-bold text-card">+{extra}</span>}
                          {hasDatamined && <span className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-sky" aria-label={t.filter_datamined} />}
                          {isRecent(newest(s.dex)) && <span className="absolute -left-2 bottom-0 rounded-md bg-go px-1 text-[9px] font-bold text-white">{t.new_badge}</span>}
                        </div>
                        <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(s.name, lang)}</span>
                        {pvpMode && <PvpTops p={pvpOf(idx, cover)} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      {multi && ticked.size > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-[64px] z-20 px-3">
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl bg-go px-3 py-2 text-white shadow-lg">
            <span className="tnum min-w-0 flex-1 truncate text-sm font-bold">{t.bulk_title(ticked.size)}</span>
            <Button tone="ghost" className="min-h-9 bg-white px-3 text-sm text-go-ink hover:bg-white" onClick={() => setBulkOpen(true)}>{t.add}</Button>
          </div>
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t.filters}>
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
              <Chip active={onlyDatamined} onClick={() => setOnlyDatamined((v) => !v)}>{t.only_datamined}</Chip>
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
            <Button tone="ghost" className="flex-1" onClick={reset} disabled={activeCount === 0}>{t.filter_reset}</Button>
            <Button tone="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>{t.see_results(resultCount)}</Button>
          </div>
        </div>
      </Sheet>

      {dataset.data && <AddToListSheet idx={dataset.data} group={adding} initialShiny={shiny} onClose={() => setAdding(null)} />}
      <BulkAddSheet open={bulkOpen} groups={[...ticked.values()]} gender={gender} onClose={() => setBulkOpen(false)} onDone={() => { setTicked(new Map()); setMulti(false); }} />
    </>
  );
}
