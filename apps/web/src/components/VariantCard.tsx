import { Link } from 'react-router';
import type { Species, Variant } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import { canBeShiny, possibleSexes, type DexPick } from './BulkAddSheet.js';
import { pvpOf, type DatasetIndex } from '../lib/dataset.js';
import { PvpTops } from './PvpTops.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { Sparkle, Sprite } from './Sprite.js';
import { Badge } from './ui.js';
import { isRecent } from '../pages/PokedexPage.js';

/** One form/costume of a species (male and female merged), tap to add it to a list. */
export type GenderFilter = 'all' | 'm' | 'f';

/** Picks which picture of a group to show for a gender filter (species without a female look keep their only picture). */
export function variantForGender(group: VariantGroup, gender: GenderFilter): Variant {
  if (gender === 'all') return group.variants[0]!;
  return group.variants.find((v) => v.gender === gender) ?? group.variants[0]!;
}

export function VariantCard({ idx, species, group, shiny, gender = 'all', showSpecies = false, selectable = false, selected = false, showPvp = false, pick, onPick, onAdd, onManage }: { idx: DatasetIndex; species: Species; group: VariantGroup; shiny: boolean; gender?: GenderFilter; showSpecies?: boolean; selectable?: boolean; selected?: boolean; showPvp?: boolean; pick?: DexPick; onPick?: (p: DexPick) => void; onAdd: (g: VariantGroup) => void; onManage?: (g: VariantGroup) => void }) {
  const t = useT();
  const { lang } = useLang();
  const v = variantForGender(group, gender);
  const shinyMissing = shiny && !v.hasShiny;
  const datamined = group.variants.some((x) => x.datamined);
  const label = localized(group.label, lang);
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => onAdd(group)}
        className={`card flex h-full w-full flex-col items-center px-1.5 pb-2 pt-2 text-center transition hover:brightness-[0.97] active:scale-[0.98] ${selectable && selected ? 'ring-[3px] ring-go' : ''}`}
        aria-label={`${t.add} ${localized(species.name, lang)} ${label}`}
        aria-pressed={selectable ? selected : undefined}
      >
        <div className="relative">
          {selectable && (
            <span className={`absolute -left-3 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[12px] ${selected ? 'border-go bg-go text-white' : 'border-line bg-card text-transparent'}`}>✓</span>
          )}
          <Sprite idx={idx} variant={v} shiny={shiny && v.hasShiny} muted={shinyMissing} size={88} />
          {(() => {
            // Genders from the game master: female-only costumes show ♀ even with a single picture; genderless show nothing.
            const possible = (group.variants.find((x) => x.gender !== 'f') ?? v).genders ?? ['m', 'f'];
            const shown = group.variants.length > 1 && gender !== 'all' ? (gender === 'm' ? '♂' : '♀') : possible.length === 2 ? '♂♀' : possible[0] === 'm' ? '♂' : possible[0] === 'f' ? '♀' : '';
            return shown ? <span className="absolute -right-2 top-0 text-[11px] font-bold text-ink-3" aria-label={shown}>{shown}</span> : null;
          })()}
          {shiny && v.hasShiny && <Sparkle className="absolute -left-2 top-0 text-shiny" />}
          {showSpecies && <span className="tnum absolute -left-2 -top-1 text-[10px] font-semibold text-ink-3">#{species.dex}</span>}
        </div>
        {showSpecies && <span className="mt-1 w-full truncate text-[12px] font-bold leading-tight">{localized(species.name, lang)}</span>}
        <span className={`line-clamp-2 w-full text-[12px] leading-tight ${showSpecies ? 'text-ink-2' : 'mt-1 font-semibold'}`}>{label || (showSpecies ? t.normal : localized(species.name, lang))}</span>
        <span className="mt-1 flex flex-wrap justify-center gap-1">
          {isRecent(v.firstSeen) && <Badge tone="grass">{t.new_badge}</Badge>}
          {datamined && <Badge tone="datamined">{t.datamined}</Badge>}
          {shinyMissing && <Badge tone="muted">{t.no_shiny}</Badge>}
          {v.noEvolve && <Badge tone="muted">{t.no_evolve}</Badge>}
          {v.noMega && <Badge tone="muted">{t.no_mega}</Badge>}
          {v.backgrounds?.length ? <Badge tone="muted">{t.backgrounds_count(v.backgrounds.length)}</Badge> : null}
        </span>
      </button>
      {selectable && selected && pick && onPick && <PickToggles pick={pick} onPick={onPick} />}
      {showPvp && <PvpTops p={pvpOf(idx, group.variants.find((x) => x.gender !== 'f') ?? v)} link />}
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

/** Under a ticked card: which genders and which versions to add for it. At least one of each stays on. */
function PickToggles({ pick, onPick }: { pick: DexPick; onPick: (p: DexPick) => void }) {
  const t = useT();
  const sexes = possibleSexes(pick.group).filter((x) => x !== '');
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? (list.length > 1 ? list.filter((x) => x !== v) : list) : [...list, v]);
  const pill = (on: boolean) => `flex h-6 min-w-[26px] items-center justify-center rounded-full border-2 px-1 text-[11px] font-bold transition ${on ? 'border-go bg-go text-white' : 'border-line bg-card text-ink-3'}`;
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
      {sexes.length > 1 &&
        sexes.map((g) => (
          <button key={g} type="button" aria-pressed={pick.sexes.includes(g)} aria-label={g === 'm' ? t.male : t.female} onClick={() => onPick({ ...pick, sexes: toggle(pick.sexes, g) })} className={pill(pick.sexes.includes(g))}>
            {g === 'm' ? '♂' : '♀'}
          </button>
        ))}
      {canBeShiny(pick.group) && (
        <>
          <button type="button" aria-pressed={pick.shinies.includes(false)} aria-label={t.bulk_normal} onClick={() => onPick({ ...pick, shinies: toggle(pick.shinies, false) })} className={pill(pick.shinies.includes(false))}>N</button>
          <button type="button" aria-pressed={pick.shinies.includes(true)} aria-label={t.shiny} onClick={() => onPick({ ...pick, shinies: toggle(pick.shinies, true) })} className={pill(pick.shinies.includes(true))}>✨</button>
        </>
      )}
    </div>
  );
}
