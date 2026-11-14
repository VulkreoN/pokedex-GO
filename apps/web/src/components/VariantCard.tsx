import { Link } from 'react-router';
import type { Species } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { Sparkle, Sprite } from './Sprite.js';
import { Badge } from './ui.js';

/** One form/costume of a species (male and female merged), tap to add it to a list. */
export function VariantCard({ idx, species, group, shiny, showSpecies = false, onAdd, onManage }: { idx: DatasetIndex; species: Species; group: VariantGroup; shiny: boolean; showSpecies?: boolean; onAdd: (g: VariantGroup) => void; onManage?: (g: VariantGroup) => void }) {
  const t = useT();
  const { lang } = useLang();
  const v = group.variants[0]!;
  const shinyMissing = shiny && !v.hasShiny;
  const datamined = group.variants.some((x) => x.datamined);
  const label = localized(group.label, lang);
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => onAdd(group)}
        className="card flex h-full w-full flex-col items-center px-1.5 pb-2 pt-2 text-center transition hover:brightness-[0.97] active:scale-[0.98]"
        aria-label={`${t.add} ${localized(species.name, lang)} ${label}`}
      >
        <div className="relative">
          <Sprite idx={idx} variant={v} shiny={shiny && v.hasShiny} muted={shinyMissing} size={88} />
          {group.variants.length > 1 && <span className="absolute -right-2 top-0 text-[11px] font-bold text-ink-3">♂♀</span>}
          {shiny && v.hasShiny && <Sparkle className="absolute -left-2 top-0 text-shiny" />}
          {showSpecies && <span className="tnum absolute -left-2 -top-1 text-[10px] font-semibold text-ink-3">#{species.dex}</span>}
        </div>
        {showSpecies && <span className="mt-1 w-full truncate text-[12px] font-bold leading-tight">{localized(species.name, lang)}</span>}
        <span className={`line-clamp-2 w-full text-[12px] leading-tight ${showSpecies ? 'text-ink-2' : 'mt-1 font-semibold'}`}>{label || (showSpecies ? t.normal : localized(species.name, lang))}</span>
        <span className="mt-1 flex flex-wrap justify-center gap-1">
          {datamined && <Badge tone="datamined">{t.datamined}</Badge>}
          {shinyMissing && <Badge tone="muted">{t.no_shiny}</Badge>}
          {v.noEvolve && <Badge tone="muted">{t.no_evolve}</Badge>}
        </span>
      </button>
      {showSpecies && (
        <Link to={`/dex/${species.dex}`} className="mt-0.5 w-full rounded-md py-0.5 text-center text-[11px] font-semibold text-ink-3 hover:bg-paper-2">{t.open_species}</Link>
      )}
      {onManage && (
        <button type="button" onClick={() => onManage(group)} className="mt-0.5 w-full rounded-md py-0.5 text-[11px] font-semibold text-sky hover:bg-paper-2">
          {t.manage_variant}
        </button>
      )}
    </div>
  );
}
