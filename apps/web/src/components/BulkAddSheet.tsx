import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag } from '@mydexpogo/shared';
import { useState } from 'react';
import type { VariantGroup } from './AddToList.js';
import type { GenderFilter } from './VariantCard.js';
import { useT } from '../lib/i18n.js';
import { selection } from '../lib/selection.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet } from './ui.js';

/** One ticked card of the Pokédex and what to add for it: which genders, normal and / or shiny. */
export interface DexPick {
  group: VariantGroup;
  sexes: EntryGender[];
  shinies: boolean[];
}

const baseOf = (g: VariantGroup) => g.variants.find((x) => x.gender !== 'f') ?? g.variants[0]!;
/** Genders this card exists in ('' for genderless). */
export const possibleSexes = (g: VariantGroup): EntryGender[] => {
  const v = baseOf(g);
  return v.genders?.length === 0 ? [''] : (v.genders ?? ['m', 'f']);
};
export const canBeShiny = (g: VariantGroup) => baseOf(g).hasShiny;

/** A freshly ticked card starts from the Pokédex's filters (gender, shiny view). */
export function defaultPick(group: VariantGroup, gender: GenderFilter, shinyView: boolean): DexPick {
  const possible = possibleSexes(group);
  const sexes = gender === 'all' ? possible : possible.filter((x) => x === gender || x === '');
  return { group, sexes: sexes.length ? sexes : possible, shinies: [shinyView && canBeShiny(group)] };
}

function entriesOf(picks: DexPick[], tags: Set<EntryTag>) {
  const out: { variantKey: string; gender: EntryGender; shiny: boolean; tag: EntryTag }[] = [];
  for (const p of picks) {
    const possible = possibleSexes(p.group);
    // Only what exists: a female-only costume gets no male entry, a Pokémon without a shiny no shiny one.
    for (const sex of p.sexes.filter((x) => possible.includes(x)))
      for (const shiny of p.shinies.filter((s) => !s || canBeShiny(p.group)))
        for (const tag of tags) out.push({ variantKey: neutralKey(baseOf(p.group).key), gender: sex, shiny, tag });
  }
  return out;
}

/** Adds every ticked card, each with its own genders and versions, into the selection basket. */
export function BulkAddSheet({ open, picks, onApplyAll, onClose, onDone }: { open: boolean; picks: DexPick[]; onApplyAll: (change: (p: DexPick) => DexPick) => void; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [tags, setTags] = useState<Set<EntryTag>>(new Set(['']));
  const toggleTag = (tg: EntryTag) =>
    setTags((prev) => {
      if (tg === '') return new Set(['']);
      const n = new Set(prev);
      n.delete('');
      n.has(tg) ? n.delete(tg) : n.add(tg);
      return n.size ? n : new Set(['']);
    });

  const versionOf = (p: DexPick) => (p.shinies.length === 2 ? 'both' : p.shinies[0] ? 'shiny' : 'normal');
  const sexOf = (p: DexPick) => {
    const real = p.sexes.filter((x) => x !== '');
    return real.length === 1 ? real[0]! : 'all';
  };
  const allSame = <T,>(f: (p: DexPick) => T, v: T) => picks.length > 0 && picks.every((p) => f(p) === v);
  const count = entriesOf(picks, tags).length;

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_title(picks.length)}>
      <p className="mb-3 text-xs text-ink-3">{t.bulk_per_card}</p>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_versions_all}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['normal', 'shiny', 'both'] as const).map((v) => (
          <Chip key={v} active={allSame(versionOf, v)} onClick={() => onApplyAll((p) => ({ ...p, shinies: v === 'normal' ? [false] : v === 'shiny' ? [true] : [false, true] }))}>
            {{ normal: t.bulk_normal, shiny: t.bulk_shiny, both: t.bulk_both }[v]}
          </Chip>
        ))}
      </div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_gender_all}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', 'm', 'f'] as const).map((g) => (
          <Chip
            key={g}
            active={allSame(sexOf, g)}
            onClick={() => onApplyAll((p) => {
              const possible = possibleSexes(p.group);
              return { ...p, sexes: g === 'all' ? possible : possible.filter((x) => x === g || x === '') };
            })}
          >
            {g === 'all' ? `♂ ♀ ${t.gender_both}` : g === 'm' ? `♂ ${t.male}` : `♀ ${t.female}`}
          </Chip>
        ))}
      </div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.trait}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ENTRY_TAGS.map((tg) => (
          <Chip key={tg} active={tags.has(tg)} onClick={() => toggleTag(tg)} className="min-h-8 px-2.5 text-xs">{t[`tag_${tg}`]}</Chip>
        ))}
      </div>
      <p className="mb-3 text-xs text-ink-3">{t.bulk_gender_hint}</p>
      <Button
        tone="primary"
        className="w-full"
        disabled={count === 0}
        onClick={() => {
          const e = entriesOf(picks, tags);
          selection.add(e);
          toast(t.added_to_selection(e.length));
          onDone();
          onClose();
        }}
      >
        {t.bulk_add(count)}
      </Button>
    </Sheet>
  );
}
