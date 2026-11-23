import { errorMessage } from '../pages/FriendsPage.js';
import { useEffect, useState } from 'react';
import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag, type Variant } from '@mydexpogo/shared';
import { Link } from 'react-router';
import { entryGenders, entryVariant, genderSymbol, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useLists, useUpsertEntries } from '../lib/lists.js';
import { selection } from '../lib/selection.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet, TextField } from './ui.js';

/** A form/costume with its male and female pictures merged (most Pokémon have a single one). */
export interface VariantGroup {
  id: string;
  label: Variant['label'];
  variants: Variant[];
}

export function groupVariants(variants: Variant[]): VariantGroup[] {
  const groups = new Map<string, VariantGroup>();
  for (const v of variants) {
    const id = `${v.form ?? ''}|${v.costume ?? ''}`;
    const g = groups.get(id);
    if (g) g.variants.push(v);
    else groups.set(id, { id, label: v.label, variants: [v] });
  }
  return [...groups.values()];
}

interface Option {
  id: string;
  /** Gender-neutral key: the gender is part of the entry. */
  key: string;
  gender: EntryGender;
  /** Picture to show: the female one when the Pokémon looks different. */
  variant: Variant;
  shiny: boolean;
}

/**
 * Every version collectors count separately: each gender the game master allows (any Pokémon, not only those that
 * look different; a female-only costume only offers ♀) x normal / shiny.
 */
function optionsOf(idx: DatasetIndex, group: VariantGroup): Option[] {
  const base = group.variants.find((v) => v.gender !== 'f') ?? group.variants[0]!;
  const key = neutralKey(base.key);
  return entryGenders(idx, key).flatMap((gender) => {
    const variant = entryVariant(idx, key, gender) ?? base;
    return [
      { id: `${key}:${gender}:0`, key, gender, variant, shiny: false },
      ...(base.hasShiny ? [{ id: `${key}:${gender}:1`, key, gender, variant, shiny: true }] : []),
    ];
  });
}

/** Picks the versions (gender x shiny), an optional trait, then one or more lists, and adds one entry per version to each. */
export function AddToListSheet({ idx, group, initialShiny, onClose }: { idx: DatasetIndex; group: VariantGroup | null; initialShiny: boolean; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Traits are multi-select: picking "lucky" and "none" adds both a plain and a lucky entry per version. */
  const [tags, setTags] = useState<Set<EntryTag>>(new Set(['']));
  /** Specific backgrounds picked under the "special background" trait; empty = any background. */
  const [bgs, setBgs] = useState<Set<string>>(new Set());
  const options = group ? optionsOf(idx, group) : [];
  const twoGenders = new Set(options.map((o) => o.gender)).size > 1;
  const availableBgs = [...new Set((group?.variants ?? []).flatMap((v) => v.backgrounds ?? []))].map((id) => idx.ds.backgrounds?.[id]).filter((b): b is NonNullable<typeof b> => !!b);

  useEffect(() => {
    if (!group) return;
    // Default: every gender, in the normal or shiny look the page was showing.
    const opts = optionsOf(idx, group);
    const look = opts.filter((o) => o.shiny === initialShiny);
    setPicked(new Set((look.length ? look : opts.filter((o) => !o.shiny)).map((o) => o.id)));
    setTags(new Set(['']));
    setBgs(new Set());
  }, [group, initialShiny, idx]);

  /** Effective tags: "background" expands to one tag per picked specific background. */
  const effectiveTags = (): EntryTag[] =>
    [...tags].flatMap((tg) => (tg === 'background' && bgs.size ? [...bgs].map((id) => `bg:${id}` as EntryTag) : [tg]));

  const toggleTag = (tg: EntryTag) =>
    setTags((prev) => {
      if (tg === '') return new Set(['']);
      const n = new Set(prev);
      n.delete('');
      n.has(tg) ? n.delete(tg) : n.add(tg);
      return n.size ? n : new Set(['']);
    });
  const presets: { label: string; ids: string[] }[] = options.length > 1
    ? [
        { label: twoGenders ? `${t.normal} ♂♀` : t.normal, ids: options.filter((o) => !o.shiny).map((o) => o.id) },
        { label: twoGenders ? `${t.shiny} ♂♀` : t.shiny, ids: options.filter((o) => o.shiny).map((o) => o.id) },
        { label: t.filter_all, ids: options.map((o) => o.id) },
      ].filter((p) => p.ids.length > 0)
    : [];

  const species = group ? idx.speciesByDex.get(group.variants[0]!.dex) : null;
  const chosen = options.filter((o) => picked.has(o.id));

  const submit = async () => {
    if (!group || chosen.length === 0) return;
    const ids = [...selected];
    try {
      if (newName.trim()) {
        const r = await create.mutateAsync({ name: newName.trim() });
        ids.push(r.list.id);
      }
      const entries = chosen.flatMap((o) => effectiveTags().map((tag) => ({ variantKey: o.key, gender: o.gender, shiny: o.shiny, tag, done: false })));
      await Promise.all(ids.map((id) => upsert.mutateAsync({ id, entries })));
    } catch (e) {
      toast(errorMessage(t, e));
      return;
    }
    toast(t.added_to(ids.length));
    setSelected(new Set());
    setNewName('');
    onClose();
  };

  const toSelection = () => {
    if (chosen.length === 0) return;
    const entries = chosen.flatMap((o) => effectiveTags().map((tag) => ({ variantKey: o.key, gender: o.gender, shiny: o.shiny, tag })));
    selection.add(entries);
    toast(t.added_to_selection(entries.length));
    onClose();
  };

  const optionLabel = (o: Option) => [genderSymbol(o.gender), o.shiny ? t.shiny : t.normal].filter(Boolean).join(' ');

  return (
    <Sheet open={!!group} onClose={onClose} title={t.add_to_list}>
      {group && species && (
        <div className="mb-4">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-bold">{localized(species.name, lang)}</span>
            <span className="text-sm text-ink-2">{localized(group.label, lang) || t.normal}</span>
          </div>
          <p className="mb-1.5 text-xs font-medium text-ink-3">{t.which_versions}</p>
          {group.variants[0]!.gendersGuessed && twoGenders && <p className="mb-1.5 text-xs text-ink-3">{t.genders_unconfirmed}</p>}
          {options.length > 0 && options.every((o) => o.gender === options[0]!.gender) && options[0]!.gender && (
            <p className="mb-1.5 text-xs text-ink-2">{options[0]!.gender === 'f' ? t.female_only : t.male_only}</p>
          )}
          {presets.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const on = p.ids.every((id) => picked.has(id)) && picked.size === p.ids.length;
                return (
                  <Chip key={p.label} active={on} onClick={() => setPicked(new Set(p.ids))} className="min-h-8 px-2.5 text-xs">
                    {p.label}
                  </Chip>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {options.map((o) => {
              const on = picked.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={optionLabel(o)}
                  onClick={() => setPicked((p) => { const n = new Set(p); on ? n.delete(o.id) : n.add(o.id); return n; })}
                  className={`flex flex-col items-center rounded-card border-2 px-1 pb-1.5 pt-1 text-xs font-semibold transition ${on ? 'border-go bg-go-soft' : 'border-line text-ink-2'}`}
                >
                  <span className="relative">
                    <Sprite idx={idx} variant={o.variant} shiny={o.shiny} size={56} />
                    {o.shiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
                    {on && <span className="absolute -left-1 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-grass text-[10px] text-white">✓</span>}
                  </span>
                  {optionLabel(o)}
                </button>
              );
            })}
          </div>
          <p className="mb-1.5 mt-3 text-xs font-medium text-ink-3">{t.trait}</p>
          <div className="flex flex-wrap gap-1.5">
            {ENTRY_TAGS.map((tg) => (
              <Chip key={tg} active={tags.has(tg)} onClick={() => toggleTag(tg)} className="min-h-8 px-2.5 text-xs">
                {t[`tag_${tg}`]}
              </Chip>
            ))}
          </div>
          {tags.has('background') && availableBgs.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-xs font-medium text-ink-3">{t.which_backgrounds}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
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
        </div>
      )}
      <Button tone="quiet" className="mb-4 w-full border border-line bg-card" disabled={chosen.length === 0} onClick={toSelection}>
        {t.add_to_selection} · {t.selected_count(chosen.length * effectiveTags().length)}
      </Button>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.or_directly}</p>
      {lists.data?.length === 0 && !newName && <p className="mb-3 text-sm text-ink-2">{t.no_lists_yet}</p>}
      <ul className="mb-3 space-y-1">
        {lists.data?.map((l) => {
          const on = selected.has(l.id);
          return (
            <li key={l.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-paper-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setSelected((s) => { const n = new Set(s); on ? n.delete(l.id) : n.add(l.id); return n; })}
                  className="h-5 w-5 accent-go"
                />
                <span className="flex-1 font-medium">{l.name}</span>
                <span className="tnum text-sm text-ink-3">{l.entryCount}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <TextField placeholder={t.new_list} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
      <Button tone="primary" className="mt-3 w-full" disabled={chosen.length === 0 || (selected.size === 0 && !newName.trim()) || upsert.isPending || create.isPending} onClick={submit}>
        {t.add} · {t.selected_count(chosen.length * effectiveTags().length)}
      </Button>
      {lists.isError && (
        <p className="mt-3 text-center text-sm">
          <Link to="/login" className="font-semibold text-sky">{t.login_required}</Link>
        </p>
      )}
    </Sheet>
  );
}
