import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag } from '@mydexpogo/shared';
import { useState } from 'react';
import type { VariantGroup } from './AddToList.js';
import type { GenderFilter } from './VariantCard.js';
import { useT } from '../lib/i18n.js';
import { selection } from '../lib/selection.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet } from './ui.js';

/** One version of a card: a gender ('' when genderless), normal or shiny. */
export interface PickCombo {
  sex: EntryGender;
  shiny: boolean;
}
/** One ticked card of the Pokédex and the versions to add for it (♂, ♀, ♂ shiny, ♀ shiny). */
export interface DexPick {
  group: VariantGroup;
  combos: PickCombo[];
}
export const comboId = (c: PickCombo) => `${c.sex}${c.shiny ? '*' : ''}`;
/** Every version this card exists in, normal ones first. */
export const possibleCombos = (g: VariantGroup): PickCombo[] =>
  (canBeShiny(g) ? [false, true] : [false]).flatMap((shiny) => possibleSexes(g).map((sex) => ({ sex, shiny })));
const product = (g: VariantGroup, sexes: EntryGender[], shinies: boolean[]) => possibleCombos(g).filter((c) => sexes.includes(c.sex) && shinies.includes(c.shiny));

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
  return { group, combos: product(group, sexes.length ? sexes : possible, [shinyView && canBeShiny(group)]) };
}

function entriesOf(picks: DexPick[], tags: Set<EntryTag>) {
  const out: { variantKey: string; gender: EntryGender; shiny: boolean; tag: EntryTag }[] = [];
  for (const p of picks) {
    // Only what exists: a female-only costume gets no male entry, a Pokémon without a shiny no shiny one.
    const exists = new Set(possibleCombos(p.group).map(comboId));
    for (const c of p.combos.filter((x) => exists.has(comboId(x))))
      for (const tag of tags) out.push({ variantKey: neutralKey(baseOf(p.group).key), gender: c.sex, shiny: c.shiny, tag });
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

  // The sheet's chips set every card at once; they light up while every card matches.
  const sexesOf = (p: DexPick) => [...new Set(p.combos.map((c) => c.sex))];
  const shiniesOf = (p: DexPick) => [...new Set(p.combos.map((c) => c.shiny))];
  const same = (p: DexPick, sexes: EntryGender[], shinies: boolean[]) => {
    const want = product(p.group, sexes, shinies).map(comboId).sort().join();
    return want !== '' && want === p.combos.map(comboId).sort().join();
  };
  const sexChoice = (g: 'all' | 'm' | 'f', p: DexPick): EntryGender[] => (g === 'all' ? possibleSexes(p.group) : possibleSexes(p.group).filter((x) => x === g || x === ''));
  const versionChoice = (v: 'normal' | 'shiny' | 'both') => (v === 'normal' ? [false] : v === 'shiny' ? [true] : [false, true]);
  const allMatch = (f: (p: DexPick) => boolean) => picks.length > 0 && picks.every(f);
  const count = entriesOf(picks, tags).length;

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_title(picks.length)}>
      <p className="mb-3 text-xs text-ink-3">{t.bulk_per_card}</p>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_versions_all}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['normal', 'shiny', 'both'] as const).map((v) => (
          <Chip key={v} active={allMatch((p) => same(p, sexesOf(p), versionChoice(v)))} onClick={() => onApplyAll((p) => ({ ...p, combos: product(p.group, sexesOf(p).length ? sexesOf(p) : possibleSexes(p.group), versionChoice(v)) }))}>
            {{ normal: t.bulk_normal, shiny: t.bulk_shiny, both: t.bulk_both }[v]}
          </Chip>
        ))}
      </div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_gender_all}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', 'm', 'f'] as const).map((g) => (
          <Chip
            key={g}
            active={allMatch((p) => same(p, sexChoice(g, p), shiniesOf(p)))}
            onClick={() => onApplyAll((p) => ({ ...p, combos: product(p.group, sexChoice(g, p), shiniesOf(p).length ? shiniesOf(p) : [false]) }))}
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
