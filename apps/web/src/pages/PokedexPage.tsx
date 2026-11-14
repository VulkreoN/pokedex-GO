import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { VariantKind } from '@mydexpogo/shared';
import { Sprite } from '../components/Sprite.js';
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
  const q = useDeferredValue(normalize(query));

  const rows = useMemo(() => {
    const idx = dataset.data;
    if (!idx) return [];
    return idx.ds.species.filter((s) => {
      if (gen && s.gen !== gen) return false;
      if (!matchesQuery(idx, s.dex, q)) return false;
      if (filter === 'all') return true;
      const vs = idx.variantsByDex.get(s.dex) ?? [];
      if (filter === 'datamined') return vs.some((v) => v.datamined);
      return vs.some((v) => FILTER_KINDS[filter].includes(v.kind));
    });
  }, [dataset.data, q, filter, gen]);

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
            className="min-h-11 w-full rounded-xl border border-[var(--dust)] bg-[var(--paper-2)] px-3 text-[16px] placeholder:text-[var(--ink-3)] focus:border-sky"
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
              className="min-h-9 shrink-0 rounded-full border border-[var(--dust)] bg-transparent px-3 text-sm font-medium text-[var(--ink-2)]"
            >
              <option value={0}>{t.filter_gen} {t.gen_all.toLowerCase()}</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                <option key={g} value={g}>{t.filter_gen} {g}</option>
              ))}
            </select>
          </div>
        </div>
      </TopBar>
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {dataset.isPending && <Spinner />}
        {dataset.isError && <Empty>{t.err_generic}</Empty>}
        {dataset.data && (
          <>
            <p className="tnum py-2 text-xs text-[var(--ink-3)]">{t.species_count(rows.length)}</p>
            {rows.length === 0 && <Empty>{t.nothing_here}</Empty>}
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {rows.map((s) => {
                const idx = dataset.data;
                const cover = idx.coverOf.get(s.dex)!;
                const vs = idx.variantsByDex.get(s.dex) ?? [];
                const extra = vs.filter((v) => v.kind !== 'base').length;
                const hasDatamined = vs.some((v) => v.datamined);
                return (
                  <li key={s.dex} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 118px' }}>
                    <Link to={`/dex/${s.dex}`} className="flex flex-col items-center rounded-card bg-[var(--paper-2)]/60 px-1 pb-2 pt-1 transition hover:bg-[var(--paper-2)]">
                      <div className="relative">
                        <span className="tnum absolute -left-1 top-0 text-[11px] font-semibold text-[var(--ink-3)]">#{s.dex}</span>
                        <Sprite idx={idx} variant={cover} muted={!s.released} size={72} />
                        {extra > 0 && (
                          <span className="tnum absolute -right-1 bottom-0 rounded-md bg-ink px-1 text-[10px] font-bold text-paper dark:bg-paper dark:text-ink">+{extra}</span>
                        )}
                        {hasDatamined && <span className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-sky" aria-label={t.filter_datamined} />}
                      </div>
                      <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(s.name, lang)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
