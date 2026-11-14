import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Species, VariantKind } from '@mydexpogo/shared';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { VariantCard } from '../components/VariantCard.js';
import { Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { matchesQuery, normalize, useDataset } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';

type Filter = 'all' | 'costume' | 'form' | 'regional' | 'mega' | 'datamined';
const FILTER_KINDS: Record<Exclude<Filter, 'all' | 'datamined'>, VariantKind[]> = { costume: ['costume'], form: ['form'], regional: ['regional'], mega: ['mega', 'gmax'] };

export function PokedexPage() {
  const t = useT();
  const { lang } = useLang();
  const dataset = useDataset();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [gen, setGen] = useState(0);
  const [shiny, setShiny] = useState(false);
  const [forceExploded, setForceExploded] = useState(false);
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const q = useDeferredValue(normalize(query));
  /** Exploded = one card per form/costume instead of one tile per species. Automatic with a filter or a search. */
  const exploded = forceExploded || filter !== 'all' || q !== '';

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

  const cards = useMemo(() => {
    const idx = dataset.data;
    if (!idx || !exploded) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const out: { species: Species; group: VariantGroup }[] = [];
    for (const s of rows) {
      let vs = idx.variantsByDex.get(s.dex) ?? [];
      if (filter === 'datamined') vs = vs.filter((v) => v.datamined);
      else if (filter !== 'all') vs = vs.filter((v) => FILTER_KINDS[filter].includes(v.kind));
      for (const g of groupVariants(vs)) {
        if (words.length) {
          const hay = normalize(`${s.dex} ${s.name.en} ${s.name.fr ?? ''} ${g.label?.en ?? ''} ${g.label?.fr ?? ''}`);
          if (!words.every((w) => hay.includes(w))) continue;
        }
        out.push({ species: s, group: g });
      }
    }
    return out;
  }, [dataset.data, exploded, rows, filter, q]);

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
      <TopBar title={t.nav_dex}>
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
          <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
            {filters.map(([f, label]) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {label}
              </Chip>
            ))}
            <select
              value={gen}
              onChange={(e) => setGen(Number(e.target.value))}
              aria-label={t.filter_gen}
              className="min-h-9 shrink-0 rounded-full border border-line bg-transparent px-3 text-sm font-medium text-ink-2"
            >
              <option value={0}>{t.filter_gen} {t.gen_all.toLowerCase()}</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                <option key={g} value={g}>{t.filter_gen} {g}</option>
              ))}
            </select>
            <Chip active={forceExploded || exploded} onClick={() => setForceExploded((v) => !v)} aria-label={t.exploded_view}>
              {t.exploded_view}
            </Chip>
            <Chip active={shiny} onClick={() => setShiny((v) => !v)}>
              <Sparkle className={shiny ? 'text-shiny' : ''} /> {t.shiny}
            </Chip>
          </div>
        </div>
      </TopBar>
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {dataset.isPending && <Spinner />}
        {dataset.isError && <Empty>{t.err_generic}</Empty>}
        {dataset.data && (
          <>
            <p className="tnum py-2 text-xs font-semibold text-ink-3">{exploded ? t.variants_count(cards.length) : t.species_count(rows.length)}</p>
            {(exploded ? cards.length : rows.length) === 0 && <Empty>{t.nothing_here}</Empty>}
            {exploded && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {cards.map(({ species, group }) => (
                  <li key={`${species.dex}-${group.id}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 190px' }}>
                    <VariantCard idx={dataset.data} species={species} group={group} shiny={shiny} showSpecies onAdd={setAdding} />
                  </li>
                ))}
              </ul>
            )}
            {!exploded && <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {rows.map((s) => {
                const idx = dataset.data;
                const cover = idx.coverOf.get(s.dex)!;
                const vs = idx.variantsByDex.get(s.dex) ?? [];
                const extra = vs.filter((v) => v.kind !== 'base').length;
                const hasDatamined = vs.some((v) => v.datamined);
                return (
                  <li key={s.dex} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 118px' }}>
                    <Link to={`/dex/${s.dex}`} className="card flex flex-col items-center px-1 pb-2 pt-1 transition hover:brightness-[0.97]">
                      <div className="relative">
                        <span className="tnum absolute -left-1 top-0 text-[11px] font-semibold text-ink-3">#{s.dex}</span>
                        <Sprite idx={idx} variant={cover} shiny={shiny && cover.hasShiny} muted={!s.released} size={72} />
                        {extra > 0 && (
                          <span className="tnum absolute -right-1 bottom-0 rounded-md bg-ink px-1 text-[10px] font-bold text-card">+{extra}</span>
                        )}
                        {hasDatamined && <span className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-sky" aria-label={t.filter_datamined} />}
                      </div>
                      <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(s.name, lang)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>}
          </>
        )}
      </main>
      {dataset.data && <AddToListSheet idx={dataset.data} group={adding} initialShiny={shiny} onClose={() => setAdding(null)} />}
    </>
  );
}
