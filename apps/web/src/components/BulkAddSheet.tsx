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

  // The same four switches as under the cards, for every card at once. Lit while every card has it on.
  const ALL: PickCombo[] = [{ sex: 'm', shiny: false }, { sex: 'f', shiny: false }, { sex: 'm', shiny: true }, { sex: 'f', shiny: true }];
  // A genderless card follows the normal / shiny part of a switch.
  const matches = (p: DexPick, c: PickCombo) => possibleCombos(p.group).filter((x) => x.shiny === c.shiny && (x.sex === c.sex || x.sex === ''));
  const concerned = (c: PickCombo) => picks.filter((p) => matches(p, c).length > 0);
  const allOn = (c: PickCombo) => concerned(c).length > 0 && concerned(c).every((p) => matches(p, c).every((x) => p.combos.some((y) => comboId(y) === comboId(x))));
  const switchAll = (c: PickCombo) => {
    const on = !allOn(c);
    onApplyAll((p) => {
      const ids = new Set(matches(p, c).map(comboId));
      if (!ids.size) return p;
      if (on) return { ...p, combos: [...p.combos.filter((x) => !ids.has(comboId(x))), ...matches(p, c)] };
      const left = p.combos.filter((x) => !ids.has(comboId(x)));
      return left.length ? { ...p, combos: left } : p; // a card always keeps one version
    });
  };
  const count = entriesOf(picks, tags).length;

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_title(picks.length)}>
      <p className="mb-3 text-xs text-ink-3">{t.bulk_per_card}</p>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_versions_all}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ALL.map((c) => (
          <Chip key={comboId(c)} active={allOn(c)} disabled={!concerned(c).length} onClick={() => switchAll(c)}>
            {c.sex === 'm' ? '♂' : '♀'}
            {c.shiny ? '✨' : ''} {c.sex === 'm' ? t.male : t.female}
            {c.shiny ? ` ${t.shiny}` : ''}
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
