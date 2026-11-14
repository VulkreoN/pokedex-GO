import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Variant } from '@mydexpogo/shared';
import { AddToListSheet } from '../components/AddToList.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Badge, Button, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { useDataset } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';

const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', grass: '#7ac74c', electric: '#f7d02c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1',
  ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
};

export function SpeciesPage() {
  const t = useT();
  const { lang } = useLang();
  const dex = Number(useParams().dex);
  const dataset = useDataset();
  const [shiny, setShiny] = useState(false);
  const [adding, setAdding] = useState<Variant | null>(null);

  if (dataset.isPending) return <Spinner />;
  const idx = dataset.data;
  const species = idx?.speciesByDex.get(dex);
  if (!idx || !species) return <Empty>{t.err_not_found}</Empty>;
  const variants = idx.variantsByDex.get(dex) ?? [];
  const groups: [string, Variant[]][] = [
    [t.normal, variants.filter((v) => v.kind === 'base')],
    [t.filter_regional, variants.filter((v) => v.kind === 'regional')],
    [t.filter_forms, variants.filter((v) => v.kind === 'form')],
    [t.filter_costumes, variants.filter((v) => v.kind === 'costume')],
    [t.filter_mega, variants.filter((v) => v.kind === 'mega' || v.kind === 'gmax')],
  ];
  const prev = idx.speciesByDex.get(dex - 1);
  const next = idx.speciesByDex.get(dex + 1);

  return (
    <>
      <TopBar
        title={<span><span className="tnum mr-2 text-[var(--ink-3)]">#{dex}</span>{localized(species.name, lang)}</span>}
        back
        actions={
          <div className="flex">
            {prev && <Link to={`/dex/${prev.dex}`} className="tnum px-2 py-2 text-sm font-semibold text-[var(--ink-2)]" aria-label={localized(prev.name, lang)}>‹ {prev.dex}</Link>}
            {next && <Link to={`/dex/${next.dex}`} className="tnum px-2 py-2 text-sm font-semibold text-[var(--ink-2)]" aria-label={localized(next.name, lang)}>{next.dex} ›</Link>}
          </div>
        }
      />
      <main className="mx-auto max-w-3xl px-3 pb-24">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {species.types.map((ty) => (
            <span key={ty} className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white" style={{ background: TYPE_COLORS[ty] ?? '#888' }}>{ty}</span>
          ))}
          {species.rarity !== 'normal' && <Badge tone="muted">{species.rarity.replace('_', ' ')}</Badge>}
          {!species.released && <Badge tone="datamined">{t.unreleased_species}</Badge>}
          {species.shinyReleased === false && <Badge tone="muted">{t.no_shiny}</Badge>}
          <span className="ml-auto" />
          <Chip active={!shiny} onClick={() => setShiny(false)}>{t.normal}</Chip>
          <Chip active={shiny} onClick={() => setShiny(true)}>
            <Sparkle className={shiny ? 'text-shiny' : ''} /> {t.shiny}
          </Chip>
        </div>

        {groups.map(([title, vs]) =>
          vs.length ? (
            <section key={title} className="mb-5">
              <h2 className="mb-2 text-base font-bold">{title} <span className="tnum font-normal text-[var(--ink-3)]">{vs.length}</span></h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {vs.map((v) => {
                  const shinyMissing = shiny && !v.hasShiny;
                  return (
                    <li key={v.key} className="flex flex-col rounded-card border border-[var(--dust)] p-2">
                      <div className="flex items-start gap-2">
                        <Sprite idx={idx} variant={v} shiny={shiny && v.hasShiny} muted={shinyMissing} size={64} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{localized(v.label, lang) || localized(species.name, lang)}</div>
                          <div className="text-xs text-[var(--ink-2)]">{v.gender === 'f' ? t.female : v.gender === 'm' ? t.male : ''}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {v.datamined && <Badge tone="datamined">{t.datamined}</Badge>}
                            {shinyMissing && <Badge tone="muted">{t.no_shiny}</Badge>}
                            {v.noEvolve && <Badge tone="muted">no evolve</Badge>}
                          </div>
                        </div>
                      </div>
                      <Button tone="quiet" className="mt-2 min-h-10 w-full text-sm" disabled={shinyMissing} onClick={() => setAdding(v)}>
                        {shiny && <Sparkle className="text-shiny" />} {t.add}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
        {variants.some((v) => v.datamined) && <p className="text-xs text-[var(--ink-3)]">{t.datamined_hint}</p>}
      </main>
      <AddToListSheet idx={idx} variant={adding} shiny={shiny} onClose={() => setAdding(null)} />
    </>
  );
}
