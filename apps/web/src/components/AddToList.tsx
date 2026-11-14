import { useEffect, useState } from 'react';
import { ENTRY_TAGS, type EntryTag, type Variant } from '@mydexpogo/shared';
import { Link } from 'react-router';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useLists, useUpsertEntries } from '../lib/lists.js';
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
  variant: Variant;
  shiny: boolean;
}

/** Every version collectors count separately: male / female x normal / shiny. */
function optionsOf(group: VariantGroup): Option[] {
  return group.variants.flatMap((variant) => [
    { id: `${variant.key}:0`, variant, shiny: false },
    ...(variant.hasShiny ? [{ id: `${variant.key}:1`, variant, shiny: true }] : []),
  ]);
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
  const [tag, setTag] = useState<EntryTag>('');
  const options = group ? optionsOf(group) : [];

  useEffect(() => {
    if (!group) return;
    const opts = optionsOf(group);
    const first = opts.find((o) => o.shiny === initialShiny) ?? opts[0];
    setPicked(new Set(first ? [first.id] : []));
    setTag('');
  }, [group, initialShiny]);

  const species = group ? idx.speciesByDex.get(group.variants[0]!.dex) : null;
  const chosen = options.filter((o) => picked.has(o.id));

  const submit = async () => {
    if (!group || chosen.length === 0) return;
    const ids = [...selected];
    if (newName.trim()) {
      const r = await create.mutateAsync({ name: newName.trim() });
      ids.push(r.list.id);
    }
    const entries = chosen.map((o) => ({ variantKey: o.variant.key, shiny: o.shiny, tag, done: false }));
    await Promise.all(ids.map((id) => upsert.mutateAsync({ id, entries })));
    toast(t.added_to(ids.length));
    setSelected(new Set());
    setNewName('');
    onClose();
  };

  const optionLabel = (o: Option) => [o.variant.gender === 'f' ? '♀' : o.variant.gender === 'm' ? '♂' : null, o.shiny ? t.shiny : t.normal].filter(Boolean).join(' ');

  return (
    <Sheet open={!!group} onClose={onClose} title={t.add_to_list}>
      {group && species && (
        <div className="mb-4">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-bold">{localized(species.name, lang)}</span>
            <span className="text-sm text-ink-2">{localized(group.label, lang) || t.normal}</span>
          </div>
          <p className="mb-1.5 text-xs font-medium text-ink-3">{t.which_versions}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {options.map((o) => {
              const on = picked.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
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
              <Chip key={tg} active={tag === tg} onClick={() => setTag(tg)} className="min-h-8 px-2.5 text-xs">
                {t[`tag_${tg}`]}
              </Chip>
            ))}
          </div>
        </div>
      )}
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
        {t.add} · {t.selected_count(chosen.length)}
      </Button>
      {lists.isError && (
        <p className="mt-3 text-center text-sm">
          <Link to="/login" className="font-semibold text-sky">{t.login_required}</Link>
        </p>
      )}
    </Sheet>
  );
}
