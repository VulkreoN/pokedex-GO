import { errorMessage } from '../lib/errors.js';
import { useEffect, useMemo, useState } from 'react';
import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag, type Variant } from '@mydexpogo/shared';
import { Link } from 'react-router';
import { useAddPrefs } from '../lib/addPrefs.js';
import { entryGenders, entryVariant, genderSymbol, normalize, type DatasetIndex } from '../lib/dataset.js';
import { feedback } from '../lib/feedback.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useLists, useMembership, useUpsertEntries } from '../lib/lists.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, Chip, Sheet, TextField } from './ui.js';

const LAST_LISTS_KEY = 'lastAddLists';

export function loadLastAddLists(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_LISTS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveLastAddLists(ids: string[]) {
  try {
    localStorage.setItem(LAST_LISTS_KEY, JSON.stringify(ids));
  } catch {}
}

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

/** Shared segmented toggle for "Missing" vs "Already caught" right at add time. */
export function InitialStatusField({ done, onChange }: { done: boolean; onChange: (done: boolean) => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-ink-3">{t.add_status_title}</span>
      <div className="inline-flex rounded-full bg-paper-2 p-0.5" role="group" aria-label={t.add_status_title}>
        <button
          type="button"
          aria-pressed={!done}
          onClick={() => onChange(false)}
          className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold transition ${!done ? 'bg-card text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
        >
          {t.add_status_missing}
        </button>
        <button
          type="button"
          aria-pressed={done}
          onClick={() => onChange(true)}
          className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition ${done ? 'bg-go text-white shadow-sm' : 'text-ink-3 hover:text-ink'}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
          {t.add_status_caught}
        </button>
      </div>
    </div>
  );
}

/** Picks versions (gender x shiny), initial status (missing/caught), optional trait, and target collection(s) with a sticky CTA. */
export function AddToListSheet({
  idx,
  group,
  initialShiny,
  targetListId,
  defaultTag,
  onAdded,
  onClose,
}: {
  idx: DatasetIndex;
  group: VariantGroup | null;
  initialShiny: boolean;
  targetListId?: string;
  defaultTag?: EntryTag;
  onAdded?: (count: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const lists = useLists();
  const membership = useMembership(!!group);
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const [prefs, setPrefs] = useAddPrefs();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listFilter, setListFilter] = useState('');
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
    setTags(new Set([defaultTag !== undefined ? defaultTag : prefs.tag]));
    setBgs(new Set());
    setListFilter('');
    if (targetListId) {
      setSelected(new Set([targetListId]));
    } else {
      const existing = new Set((lists.data ?? []).map((l) => l.id));
      const remembered = loadLastAddLists().filter((id) => existing.has(id));
      setSelected(new Set(remembered));
    }
  }, [group, initialShiny, idx, targetListId, defaultTag]);

  // If lists finished loading right after opening, hydrate remembered selection once.
  useEffect(() => {
    if (!group || targetListId || !lists.data?.length) return;
    setSelected((prev) => {
      if (prev.size > 0) return prev;
      const existing = new Set(lists.data!.map((l) => l.id));
      const remembered = loadLastAddLists().filter((id) => existing.has(id));
      return remembered.length ? new Set(remembered) : prev;
    });
  }, [group, targetListId, lists.data]);

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
  const effTags = effectiveTags();
  const totalCount = chosen.length * effTags.length;

  /** For each collection, checks whether the currently selected variant+shiny+tag is already present / caught. */
  const listStatus = useMemo(() => {
    const out = new Map<string, 'caught' | 'present'>();
    if (!group || !membership.data?.length || !chosen.length) return out;
    const key = chosen[0]!.key;
    const byList = new Map<string, typeof membership.data>();
    for (const e of membership.data) {
      if (e.variantKey !== key) continue;
      const arr = byList.get(e.listId);
      if (arr) arr.push(e);
      else byList.set(e.listId, [e]);
    }
    const wantKeys = chosen.flatMap((o) => effTags.map((tg) => `${o.gender}|${o.shiny ? 1 : 0}|${tg}`));
    for (const [listId, entries] of byList) {
      const map = new Map(entries.map((e) => [`${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`, e.done]));
      const matched = wantKeys.filter((k) => map.has(k));
      if (!matched.length) continue;
      if (matched.length === wantKeys.length && matched.every((k) => map.get(k))) out.set(listId, 'caught');
      else out.set(listId, 'present');
    }
    return out;
  }, [group, membership.data, chosen, effTags]);

  const filteredLists = useMemo(() => {
    const all = lists.data ?? [];
    const q = normalize(listFilter);
    if (!q) return all;
    return all.filter((l) => normalize(l.name).includes(q));
  }, [lists.data, listFilter]);

  const submit = async () => {
    if (!group || chosen.length === 0) return;
    const ids = [...selected];
    try {
      if (newName.trim()) {
        const r = await create.mutateAsync({ name: newName.trim() });
        ids.push(r.list.id);
      }
      const entries = chosen.flatMap((o) => effTags.map((tag) => ({ variantKey: o.key, gender: o.gender, shiny: o.shiny, tag, done: prefs.done })));
      await Promise.all(ids.map((id) => upsert.mutateAsync({ id, entries })));
      feedback('tick');
      onAdded?.(entries.length);
    } catch (e) {
      toast(errorMessage(t, e));
      return;
    }
    saveLastAddLists(ids);
    toast(t.added_to(ids.length));
    setNewName('');
    onClose();
  };

  const optionLabel = (o: Option) => [genderSymbol(o.gender), o.shiny ? t.shiny : t.normal].filter(Boolean).join(' ');

  const footer = group && species ? (
    <div className="space-y-2">
      <Button
        tone="primary"
        className="w-full"
        disabled={chosen.length === 0 || (selected.size === 0 && !newName.trim()) || upsert.isPending || create.isPending}
        onClick={submit}
      >
        {t.add} · {t.selected_count(totalCount)}
      </Button>
      {lists.isError && (
        <p className="text-center">
          <Link to="/login" className="text-xs font-semibold text-sky">{t.login_required}</Link>
        </p>
      )}
    </div>
  ) : undefined;

  return (
    <Sheet open={!!group} onClose={onClose} title={group && species ? `${localized(species.name, lang)}${group.label ? ` · ${localized(group.label, lang)}` : ''}` : t.add_to_list} footer={footer}>
      {group && species && (
        <div className="space-y-4">
          {/* 1. Versions (gender x normal/shiny) */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-ink-3">{t.which_versions}</p>
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {presets.map((p) => {
                    const on = p.ids.every((id) => picked.has(id)) && picked.size === p.ids.length;
                    return (
                      <Chip key={p.label} active={on} onClick={() => setPicked(new Set(p.ids))} className="min-h-7 px-2.5 text-xs">
                        {p.label}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>
            {group.variants[0]!.gendersGuessed && twoGenders && <p className="mb-1.5 text-xs text-ink-3">{t.genders_unconfirmed}</p>}
            {options.length > 0 && options.every((o) => o.gender === options[0]!.gender) && options[0]!.gender && (
              <p className="mb-1.5 text-xs text-ink-2">{options[0]!.gender === 'f' ? t.female_only : t.male_only}</p>
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
                    className={`flex flex-col items-center rounded-card border-2 px-1 pb-1.5 pt-1 text-xs font-semibold transition active:scale-[0.97] ${on ? 'border-go bg-go-soft text-go-ink' : 'border-line text-ink-2 hover:border-ink-3'}`}
                  >
                    <span className="relative">
                      <Sprite idx={idx} variant={o.variant} shiny={o.shiny} size={52} />
                      {o.shiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
                      {on && <span className="absolute -left-1 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-go text-[10px] text-white">✓</span>}
                    </span>
                    {optionLabel(o)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Initial status: Missing vs Already caught */}
          <InitialStatusField done={prefs.done} onChange={(done) => setPrefs({ done })} />

          {/* 3. Trait + optional specific backgrounds */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.trait}</p>
            <div className="flex flex-wrap gap-1.5">
              {ENTRY_TAGS.map((tg) => (
                <Chip key={tg} active={tags.has(tg)} onClick={() => toggleTag(tg)} className="min-h-8 px-2.5 text-xs">
                  {t[`tag_${tg}`]}
                </Chip>
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
          </div>

          {/* 4. Target collections (prioritized directly in flow) */}
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
                  const status = listStatus.get(l.id);
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
                        {status === 'caught' && <Badge tone="grass">{t.already_caught_short} ✓</Badge>}
                        {status === 'present' && <Badge tone="muted">{t.already_in_list}</Badge>}
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
