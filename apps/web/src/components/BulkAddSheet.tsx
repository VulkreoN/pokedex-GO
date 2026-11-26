import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag } from '@mydexpogo/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadLastAddLists, saveLastAddLists, type VariantGroup } from './AddToList.js';
import type { GenderFilter } from './VariantCard.js';
import type { DatasetIndex } from '../lib/dataset.js';
import { errorMessage } from '../lib/errors.js';
import { useT } from '../lib/i18n.js';
import { useCreateList, useLists, useUpsertEntries } from '../lib/lists.js';
import { selection } from '../lib/selection.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet, TextField } from './ui.js';

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

function entriesOf(picks: DexPick[], tags: EntryTag[]) {
  const out: { variantKey: string; gender: EntryGender; shiny: boolean; tag: EntryTag }[] = [];
  for (const p of picks) {
    // Only what exists: a female-only costume gets no male entry, a Pokémon without a shiny no shiny one.
    const exists = new Set(possibleCombos(p.group).map(comboId));
    for (const c of p.combos.filter((x) => exists.has(comboId(x))))
      for (const tag of tags) out.push({ variantKey: neutralKey(baseOf(p.group).key), gender: c.sex, shiny: c.shiny, tag });
  }
  return out;
}

/** Adds every ticked card directly into one or more collections, or puts them into the selection basket. */
export function BulkAddSheet({
  idx,
  open,
  picks,
  targetListId,
  defaultTag,
  onApplyAll,
  onClose,
  onDone,
}: {
  idx?: DatasetIndex;
  open: boolean;
  picks: DexPick[];
  targetListId?: string;
  defaultTag?: EntryTag;
  onApplyAll: (change: (p: DexPick) => DexPick) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const [tags, setTags] = useState<Set<EntryTag>>(new Set(['']));
  const [bgs, setBgs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTags(new Set([defaultTag || '']));
    setBgs(new Set());
    if (targetListId) {
      setSelected(new Set([targetListId]));
    } else {
      const existing = new Set((lists.data ?? []).map((l) => l.id));
      setSelected(new Set(loadLastAddLists().filter((id) => existing.has(id))));
    }
  }, [open, targetListId, defaultTag]);

  const toggleTag = (tg: EntryTag) =>
    setTags((prev) => {
      if (tg === '') return new Set(['']);
      const n = new Set(prev);
      n.delete('');
      n.has(tg) ? n.delete(tg) : n.add(tg);
      return n.size ? n : new Set(['']);
    });

  const availableBgs = idx
    ? [...new Set(picks.flatMap((p) => p.group.variants.flatMap((v) => v.backgrounds ?? [])))]
        .map((id) => idx.ds.backgrounds?.[id])
        .filter((b): b is NonNullable<typeof b> => !!b)
    : [];
  const effectiveTags: EntryTag[] = [...tags].flatMap((tg) => (tg === 'background' && bgs.size ? [...bgs].map((id) => `bg:${id}` as EntryTag) : [tg]));

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
  const entries = entriesOf(picks, effectiveTags);
  const count = entries.length;

  const submitDirect = async () => {
    if (!count) return;
    setBusy(true);
    try {
      const ids = [...selected];
      if (newName.trim()) {
        const r = await create.mutateAsync({ name: newName.trim() });
        ids.push(r.list.id);
      }
      const payload = entries.map((e) => ({ ...e, done: false }));
      for (const id of ids) {
        for (let k = 0; k < payload.length; k += 1000) {
          await upsert.mutateAsync({ id, entries: payload.slice(k, k + 1000) });
        }
      }
      saveLastAddLists(ids);
      toast(t.added_to(ids.length));
      setNewName('');
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_title(picks.length)}>
      {open && (
        <>
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
          {tags.has('background') && availableBgs.length > 0 && (
            <>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.which_backgrounds}</p>
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
                <button type="button" onClick={() => setBgs(new Set())} className={`flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border-2 text-xs font-semibold ${bgs.size === 0 ? 'border-go bg-go-soft' : 'border-line'}`}>{t.background_any}</button>
                {availableBgs.map((b) => {
                  const on = bgs.has(b.id);
                  return (
                    <button key={b.id} type="button" title={b.label} aria-pressed={on} onClick={() => setBgs((p) => { const n = new Set(p); on ? n.delete(b.id) : n.add(b.id); return n; })} className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 ${on ? 'border-go' : 'border-line'}`}>
                      <img src={b.image} alt={b.label} loading="lazy" className="h-full w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-[10px] text-white">{b.label}</span>
                      {on && <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-go text-[10px] text-white">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <p className="mb-3 text-xs text-ink-3">{t.bulk_gender_hint}</p>

          <Button
            tone="quiet"
            className="mb-4 w-full border border-line bg-card"
            disabled={count === 0 || busy}
            onClick={() => {
              selection.add(entries);
              toast(t.added_to_selection(entries.length));
              onDone();
              onClose();
            }}
          >
            {t.bulk_add(count)}
          </Button>

          <p className="mb-1.5 text-xs font-medium text-ink-3">{t.or_directly}</p>
          {lists.data?.length === 0 && !newName && <p className="mb-2 text-sm text-ink-2">{t.no_lists_yet}</p>}
          {lists.data && lists.data.length > 0 && (
            <ul className="mb-3 max-h-[28vh] space-y-1 overflow-y-auto">
              {lists.data.map((l) => {
                const on = selected.has(l.id);
                return (
                  <li key={l.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-paper-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setSelected((s) => { const n = new Set(s); on ? n.delete(l.id) : n.add(l.id); return n; })}
                        className="h-5 w-5 accent-go"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                      <span className="tnum shrink-0 text-sm text-ink-3">{l.entryCount}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <TextField placeholder={t.new_list} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
          <Button tone="primary" className="mt-3 w-full" disabled={count === 0 || (selected.size === 0 && !newName.trim()) || busy} onClick={submitDirect}>
            {t.bulk_direct_add(count)}
          </Button>
          {lists.isError && (
            <p className="mt-3 text-center text-sm">
              <Link to="/login" className="font-semibold text-sky">{t.login_required}</Link>
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
