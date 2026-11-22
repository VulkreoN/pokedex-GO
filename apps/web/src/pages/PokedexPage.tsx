import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Species, Variant, VariantKind } from '@mydexpogo/shared';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { BulkAddSheet } from '../components/BulkAddSheet.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { VariantCard, variantForGender, type GenderFilter } from '../components/VariantCard.js';
import { Button, Chip, Empty, IconButton, Sheet, Spinner, TopBar } from '../components/ui.js';
import { familyOrder, matchesQuery, normalize, useDataset } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';

type Filter = 'all' | 'costume' | 'form' | 'regional' | 'mega' | 'datamined';
/** Appeared in the last 45 days. */
export const isRecent = (iso: string | undefined) => !!iso && Date.now() - new Date(iso).getTime() < 45 * 86_400_000;

const FILTER_KINDS: Record<Exclude<Filter, 'all' | 'datamined'>, VariantKind[]> = { costume: ['costume'], form: ['form'], regional: ['regional'], mega: ['mega', 'gmax'] };

export function PokedexPage() {
  const t = useT();
  const { lang } = useLang();
  const dataset = useDataset();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [gen, setGen] = useState(0);
  const [shiny, setShiny] = useState(false);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [forceExploded, setForceExploded] = useState(false);
  const [sort, setSort] = useState<'dex' | 'new' | 'family'>('dex');
  /** Hide costumes, forms (regional and others), Megas, Gigantamax: all on = base Pokémon only. */
  const [noCostume, setNoCostume] = useState(false);
  const [noForms, setNoForms] = useState(false);
  const [noMega, setNoMega] = useState(false);
  const [noGmax, setNoGmax] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const [multi, setMulti] = useState(false);
  const [ticked, setTicked] = useState<Map<string, VariantGroup>>(new Map());
  const [bulkOpen, setBulkOpen] = useState(false);
  const q = useDeferredValue(normalize(query));
  /** Exploded = one card per form/costume instead of one tile per species. Automatic with a filter or a search. */
  const exploded = forceExploded || filter !== 'all' || q !== '' || multi || noCostume || noForms || noMega || noGmax;
  const activeCount = (filter !== 'all' ? 1 : 0) + (gen ? 1 : 0) + (shiny ? 1 : 0) + (gender !== 'all' ? 1 : 0) + (forceExploded ? 1 : 0) + (sort !== 'dex' ? 1 : 0) + (noCostume ? 1 : 0) + (noForms ? 1 : 0) + (noMega ? 1 : 0) + (noGmax ? 1 : 0);
  const hidden = (v: Variant) =>
    (noCostume && v.kind === 'costume') || (noForms && (v.kind === 'regional' || v.kind === 'form')) || (noMega && v.kind === 'mega') || (noGmax && v.kind === 'gmax');

  const rows = useMemo(() => {
    const idx = dataset.data;
    if (!idx) return [];
    return idx.ds.species.filter((s) => {
      if (gen && s.gen !== gen) return false;
      if (q && !q.split(/\s+/).filter(Boolean).some((w) => matchesQuery(idx, s.dex, w))) return false;
      if (filter === 'all') return true;
      const vs = idx.variantsByDex.get(s.dex) ?? [];
      if (filter === 'datamined') return vs.some((v) => v.datamined);
      return vs.some((v) => FILTER_KINDS[filter].includes(v.kind));
    });
  }, [dataset.data, q, filter, gen]);

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
      let vs = idx.variantsByDex.get(s.dex) ?? [];
      if (filter === 'datamined') vs = vs.filter((v) => v.datamined);
      else if (filter !== 'all') vs = vs.filter((v) => FILTER_KINDS[filter].includes(v.kind));
      if (noCostume || noForms || noMega || noGmax) vs = vs.filter((v) => !hidden(v));
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
  }, [dataset.data, exploded, rows, sortedRows, filter, q, gender, sort, noCostume, noForms, noMega, noGmax]);

  const toggleTick = (id: string, g: VariantGroup) =>
    setTicked((m) => {
      const n = new Map(m);
      n.has(id) ? n.delete(id) : n.set(id, g);
      return n;
    });
  const reset = () => {
    setFilter('all');
    setGen(0);
    setShiny(false);
    setGender('all');
    setForceExploded(false);
    setSort('dex');
    setNoCostume(false);
    setNoForms(false);
    setNoMega(false);
    setNoGmax(false);
  };

  const filters: [Filter, string][] = [
    ['all', t.filter_all],
    ['costume', t.filter_costumes],
    ['form', t.filter_forms],
    ['regional', t.filter_regional],
    ['mega', t.filter_mega],
    ['datamined', t.filter_datamined],
  ];

  return (
    <>
      <TopBar
        title={t.nav_dex}
        actions={
          <IconButton label={t.filters} onClick={() => setFiltersOpen(true)} className="relative">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
            {activeCount > 0 && <span className="tnum absolute right-1 top-1 rounded-full bg-go px-1.5 text-[10px] font-bold text-white">{activeCount}</span>}
          </IconButton>
        }
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
          <div className="mt-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
            {filter !== 'all' && <Chip active onClick={() => setFilter('all')}>{filters.find((f) => f[0] === filter)![1]} ✕</Chip>}
            {gen > 0 && <Chip active onClick={() => setGen(0)}>{t.filter_gen} {gen} ✕</Chip>}
            {gender !== 'all' && <Chip active onClick={() => setGender('all')}>{gender === 'm' ? `♂ ${t.male}` : `♀ ${t.female}`} ✕</Chip>}
            {shiny && <Chip active onClick={() => setShiny(false)}><Sparkle className="text-shiny" /> {t.shiny} ✕</Chip>}
            {forceExploded && !multi && <Chip active onClick={() => setForceExploded(false)}>{t.exploded_view} ✕</Chip>}
            {sort === 'new' && <Chip active onClick={() => setSort('dex')}>{t.sort_new} ✕</Chip>}
            {sort === 'family' && <Chip active onClick={() => setSort('dex')}>{t.sort_family} ✕</Chip>}
            {/* Always at hand while ticking cards; otherwise shown once switched on. */}
            {(multi || noCostume) && <Chip active={noCostume} onClick={() => setNoCostume((v) => !v)}>{t.filter_no_costume}{noCostume && !multi ? ' ✕' : ''}</Chip>}
            {(multi || noForms) && <Chip active={noForms} onClick={() => setNoForms((v) => !v)}>{t.filter_no_forms}{noForms && !multi ? ' ✕' : ''}</Chip>}
            {(multi || noMega) && <Chip active={noMega} onClick={() => setNoMega((v) => !v)}>{t.filter_no_mega}{noMega && !multi ? ' ✕' : ''}</Chip>}
            {(multi || noGmax) && <Chip active={noGmax} onClick={() => setNoGmax((v) => !v)}>{t.filter_no_gmax}{noGmax && !multi ? ' ✕' : ''}</Chip>}
            <Chip active={multi} onClick={() => { setMulti((m) => !m); setTicked(new Map()); }} className="ml-auto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
              {t.multi_select}
            </Chip>
          </div>
        </div>
      </TopBar>

      <main className="mx-auto max-w-3xl px-3 pb-28">
        {dataset.isPending && <Spinner />}
        {dataset.isError && <Empty>{t.err_generic}</Empty>}
        {dataset.data && (
          <>
            <p className="tnum flex items-center gap-2 py-2 text-xs font-semibold text-ink-3">
              {exploded ? t.variants_count(cards.length) : t.species_count(rows.length)}
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
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.filter_kind}</p>
            <div className="flex flex-wrap gap-1.5">{filters.map(([f, label]) => <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{label}</Chip>)}</div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.filter_hide}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={noCostume} onClick={() => setNoCostume((v) => !v)}>{t.filter_no_costume}</Chip>
              <Chip active={noForms} onClick={() => setNoForms((v) => !v)}>{t.filter_no_forms}</Chip>
              <Chip active={noMega} onClick={() => setNoMega((v) => !v)}>{t.filter_no_mega}</Chip>
              <Chip active={noGmax} onClick={() => setNoGmax((v) => !v)}>{t.filter_no_gmax}</Chip>
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
          <div className="flex flex-wrap gap-1.5">
            <Chip active={shiny} onClick={() => setShiny((v) => !v)}><Sparkle className={shiny ? 'text-shiny' : ''} /> {t.shiny}</Chip>
            <Chip active={forceExploded} onClick={() => setForceExploded((v) => !v)}>{t.exploded_view}</Chip>
          </div>
          <div className="flex gap-2">
            <Button tone="ghost" className="flex-1" onClick={reset}>{t.filter_reset}</Button>
            <Button tone="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>{t.close}</Button>
          </div>
        </div>
      </Sheet>

      {dataset.data && <AddToListSheet idx={dataset.data} group={adding} initialShiny={shiny} onClose={() => setAdding(null)} />}
      <BulkAddSheet open={bulkOpen} groups={[...ticked.values()]} gender={gender} onClose={() => setBulkOpen(false)} onDone={() => { setTicked(new Map()); setMulti(false); }} />
    </>
  );
}
