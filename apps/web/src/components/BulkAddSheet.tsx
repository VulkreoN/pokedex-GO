import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag } from '@mydexpogo/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { InitialStatusField, loadLastAddLists, saveLastAddLists, type VariantGroup } from './AddToList.js';
import type { GenderFilter } from './VariantCard.js';
import { useAddPrefs } from '../lib/addPrefs.js';
import { normalize, type DatasetIndex } from '../lib/dataset.js';
import { errorMessage } from '../lib/errors.js';
import { feedback } from '../lib/feedback.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useLists, useUpsertEntries } from '../lib/lists.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Button, Chip, IconButton, Sheet, TextField } from './ui.js';

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

/** Adds every ticked card directly into one or more collections (with sticky CTA). */
export function BulkAddSheet({
  idx,
  open,
  picks,
  targetListId,
  defaultTag,
  onApplyAll,
  onRemoveKey,
  onClose,
  onDone,
}: {
  idx?: DatasetIndex;
  open: boolean;
  picks: DexPick[];
  targetListId?: string;
  defaultTag?: EntryTag;
  onApplyAll: (change: (p: DexPick) => DexPick) => void;
  onRemoveKey?: (baseKey: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const [prefs, setPrefs] = useAddPrefs();
  const [tags, setTags] = useState<Set<EntryTag>>(new Set(['']));
  const [bgs, setBgs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listFilter, setListFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTags(new Set([defaultTag !== undefined ? defaultTag : prefs.tag]));
    setBgs(new Set());
    setListFilter('');
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

  const filteredLists = useMemo(() => {
    const all = lists.data ?? [];
    const q = normalize(listFilter);
    if (!q) return all;
    return all.filter((l) => normalize(l.name).includes(q));
  }, [lists.data, listFilter]);

  const submitDirect = async () => {
    if (!count) return;
    setBusy(true);
    try {
      const ids = [...selected];
      if (newName.trim()) {
        const r = await create.mutateAsync({ name: newName.trim() });
        ids.push(r.list.id);
      }
      const payload = entries.map((e) => ({ ...e, done: prefs.done }));
      for (const id of ids) {
        for (let k = 0; k < payload.length; k += 1000) {
          await upsert.mutateAsync({ id, entries: payload.slice(k, k + 1000) });
        }
      }
      feedback('tick');
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

  const footer = open ? (
    <div className="space-y-2">
      <Button tone="primary" className="w-full" disabled={count === 0 || (selected.size === 0 && !newName.trim()) || busy} onClick={submitDirect}>
        {t.bulk_direct_add(count)}
      </Button>
      {lists.isError && (
        <p className="text-center">
          <Link to="/login" className="text-xs font-semibold text-sky">{t.login_required}</Link>
        </p>
      )}
    </div>
  ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_title(picks.length)} footer={footer}>
      {open && (
        <div className="space-y-4">
          {idx && onRemoveKey && picks.length > 0 && (
            <details className="rounded-xl border border-line bg-paper-2/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-ink-2">
                {t.selection_review(picks.length)}
              </summary>
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {picks.map((p) => {
                  const base = baseOf(p.group);
                  const bk = neutralKey(base.key);
                  const sp = idx.speciesByDex.get(base.dex);
                  const hasShiny = p.combos.some((c) => c.shiny);
                  return (
                    <li key={bk} className="flex items-center gap-2 rounded-lg px-1 py-0.5">
                      <span className="relative shrink-0">
                        <Sprite idx={idx} variant={base} shiny={hasShiny && base.hasShiny} size={36} />
                        {hasShiny && base.hasShiny && <Sparkle className="absolute -right-0.5 top-0 h-3 w-3 text-shiny" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{sp ? localized(sp.name, lang) : `#${base.dex}`}</span>
                        {p.group.label && <span className="block truncate text-[11px] text-ink-3">{localized(p.group.label, lang)}</span>}
                      </span>
                      <IconButton label={t.remove_entry} onClick={() => onRemoveKey(bk)} className="h-8 w-8">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_versions_all}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL.map((c) => (
                <Chip key={comboId(c)} active={allOn(c)} disabled={!concerned(c).length} onClick={() => switchAll(c)}>
                  {c.sex === 'm' ? '♂' : '♀'}
                  {c.shiny ? '✨' : ''} {c.sex === 'm' ? t.male : t.female}
                  {c.shiny ? ` ${t.shiny}` : ''}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">{t.bulk_per_card}</p>
          </div>

          <InitialStatusField done={prefs.done} onChange={(done) => setPrefs({ done })} />

          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.trait}</p>
            <div className="flex flex-wrap gap-1.5">
              {ENTRY_TAGS.map((tg) => (
                <Chip key={tg} active={tags.has(tg)} onClick={() => toggleTag(tg)} className="min-h-8 px-2.5 text-xs">{t[`tag_${tg}`]}</Chip>
              ))}
            </div>
            {tags.has('background') && availableBgs.length > 0 && (
              <>
                <p className="mb-1.5 mt-2.5 text-xs font-medium text-ink-3">{t.which_backgrounds}</p>
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
                  <button type="button" onClick={() => setBgs(new Set())} className={`flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border-2 text-xs font-semibold ${bgs.size === 0 ? 'border-go bg-go-soft text-go-ink' : 'border-line'}`}>{t.background_any}</button>
                  {availableBgs.map((b) => {
                    const on = bgs.has(b.id);
                    return (
                      <button key={b.id} type="button" title={b.label} aria-pressed={on} onClick={() => setBgs((p) => { const n = new Set(p); on ? n.delete(b.id) : n.add(b.id); return n; })} className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 ${on ? 'border-go' : 'border-line'}`}>
                        <img src={b.image} alt={b.label} loading="lazy" className="h-full w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[10px] text-white">{b.label}</span>
                        {on && <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-go text-[10px] text-white">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <p className="mt-1.5 text-xs text-ink-3">{t.bulk_gender_hint}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.add_collections_title}</p>
            {(lists.data?.length ?? 0) > 6 && (
              <input
                type="search"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                placeholder={t.add_filter_lists}
                aria-label={t.add_filter_lists}
                className="mb-2 min-h-9 w-full rounded-xl border border-line bg-paper/40 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-sky"
              />
            )}
            {lists.data?.length === 0 && !newName && <p className="mb-2 text-sm text-ink-2">{t.no_lists_yet}</p>}
            {filteredLists.length > 0 && (
              <ul className="mb-2.5 space-y-1">
                {filteredLists.map((l) => {
                  const on = selected.has(l.id);
                  return (
                    <li key={l.id}>
                      <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 transition ${on ? 'bg-go-soft/55' : 'hover:bg-paper-2'}`}>
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
          </div>
        </div>
      )}
    </Sheet>
  );
}
