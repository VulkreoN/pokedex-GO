import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Badge, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { useDataset } from '../lib/dataset.js';
import { localized, typeName, useLang, useT } from '../lib/i18n.js';

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
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const idx = dataset.data;
  const species = idx?.speciesByDex.get(dex);
  const variants = useMemo(() => idx?.variantsByDex.get(dex) ?? [], [idx, dex]);

  const sections = useMemo(() => {
    const by = (kinds: string[]) => groupVariants(variants.filter((v) => kinds.includes(v.kind)));
    return [
      [t.normal, by(['base'])],
      [t.filter_regional, by(['regional'])],
      [t.filter_forms, by(['form'])],
      [t.filter_costumes, by(['costume'])],
      [t.filter_mega, by(['mega', 'gmax'])],
    ] as [string, VariantGroup[]][];
  }, [variants, t]);

  if (dataset.isPending) return <Spinner />;
  if (!idx || !species) return <Empty>{t.err_not_found}</Empty>;
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
            <span key={ty} className="rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ background: TYPE_COLORS[ty] ?? '#888' }}>{typeName(ty, lang)}</span>
          ))}
          {species.rarity !== 'normal' && <Badge tone="muted">{t[`rarity_${species.rarity}`]}</Badge>}
          {!species.released && <Badge tone="datamined">{t.unreleased_species}</Badge>}
          {species.shinyReleased === false && <Badge tone="muted">{t.no_shiny}</Badge>}
          <span className="ml-auto" />
          <Chip active={!shiny} onClick={() => setShiny(false)}>{t.normal}</Chip>
          <Chip active={shiny} onClick={() => setShiny(true)}>
            <Sparkle className={shiny ? 'text-shiny' : ''} /> {t.shiny}
          </Chip>
        </div>

        {sections.map(([title, groups]) =>
          groups.length ? (
            <section key={title} className="mb-5">
              <h2 className="mb-2 text-base font-bold">{title} <span className="tnum font-normal text-[var(--ink-3)]">{groups.length}</span></h2>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {groups.map((g) => {
                  const v = g.variants[0]!;
                  const shinyMissing = shiny && !v.hasShiny;
                  const datamined = g.variants.some((x) => x.datamined);
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => setAdding(g)}
                        className="flex h-full w-full flex-col items-center rounded-card border border-[var(--dust)] px-1.5 pb-2 pt-2 text-center transition hover:bg-[var(--paper-2)]/60 active:scale-[0.98]"
                        aria-label={`${t.add} ${localized(g.label, lang) || localized(species.name, lang)}`}
                      >
                        <div className="relative">
                          <Sprite idx={idx} variant={v} shiny={shiny && v.hasShiny} muted={shinyMissing} size={88} />
                          {g.variants.length > 1 && <span className="absolute -right-2 top-0 text-[11px] font-bold text-[var(--ink-3)]">♂♀</span>}
                          {shiny && v.hasShiny && <Sparkle className="absolute -left-2 top-0 text-shiny" />}
                        </div>
                        <span className="mt-1 line-clamp-2 w-full text-[12px] font-semibold leading-tight">{localized(g.label, lang) || localized(species.name, lang)}</span>
                        <span className="mt-1 flex flex-wrap justify-center gap-1">
                          {datamined && <Badge tone="datamined">{t.datamined}</Badge>}
                          {shinyMissing && <Badge tone="muted">{t.no_shiny}</Badge>}
                          {v.noEvolve && <Badge tone="muted">{t.no_evolve}</Badge>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
        {variants.some((v) => v.datamined) && <p className="text-xs text-[var(--ink-3)]">{t.datamined_hint}</p>}
      </main>
      <AddToListSheet idx={idx} group={adding} initialShiny={shiny} onClose={() => setAdding(null)} />
    </>
  );
}
