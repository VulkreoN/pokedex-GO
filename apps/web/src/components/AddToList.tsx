import { useEffect, useState } from 'react';
import type { Variant } from '@mydexpogo/shared';
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

/** Picks gender + shiny, then one or more of the user's lists, and adds the entry to each. */
export function AddToListSheet({ idx, group, initialShiny, onClose }: { idx: DatasetIndex; group: VariantGroup | null; initialShiny: boolean; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [variant, setVariant] = useState<Variant | null>(null);
  const [shiny, setShiny] = useState(initialShiny);

  useEffect(() => {
    setVariant(group?.variants[0] ?? null);
    setShiny(initialShiny);
  }, [group, initialShiny]);

  const species = variant ? idx.speciesByDex.get(variant.dex) : null;
  const canShiny = !!variant?.hasShiny;

  const submit = async () => {
    if (!variant) return;
    const ids = [...selected];
    if (newName.trim()) {
      const r = await create.mutateAsync({ name: newName.trim() });
      ids.push(r.list.id);
    }
    await Promise.all(ids.map((id) => upsert.mutateAsync({ id, entries: [{ variantKey: variant.key, shiny: shiny && canShiny, done: false }] })));
    toast(t.added_to(ids.length));
    setSelected(new Set());
    setNewName('');
    onClose();
  };

  return (
    <Sheet open={!!group} onClose={onClose} title={t.add_to_list}>
      {group && variant && species && (
        <div className="mb-4 flex items-center gap-3">
          <Sprite idx={idx} variant={variant} shiny={shiny && canShiny} size={72} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{localized(species.name, lang)}</div>
            <div className="text-sm text-[var(--ink-2)]">{localized(group.label, lang) || t.normal}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.variants.length > 1 &&
                group.variants.map((v) => (
                  <Chip key={v.key} active={variant.key === v.key} onClick={() => setVariant(v)} className="min-h-8 px-2.5 text-xs">
                    {v.gender === 'f' ? `♀ ${t.female}` : `♂ ${t.male}`}
                  </Chip>
                ))}
              <Chip active={shiny && canShiny} disabled={!canShiny} onClick={() => setShiny((s) => !s)} className="min-h-8 px-2.5 text-xs disabled:opacity-40">
                <Sparkle className={shiny && canShiny ? 'text-shiny' : ''} /> {canShiny ? t.shiny : t.no_shiny}
              </Chip>
            </div>
          </div>
        </div>
      )}
      {lists.data?.length === 0 && !newName && <p className="mb-3 text-sm text-[var(--ink-2)]">{t.no_lists_yet}</p>}
      <ul className="mb-3 space-y-1">
        {lists.data?.map((l) => {
          const on = selected.has(l.id);
          return (
            <li key={l.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-[var(--paper-2)]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setSelected((s) => { const n = new Set(s); on ? n.delete(l.id) : n.add(l.id); return n; })}
                  className="h-5 w-5 accent-sky"
                />
                <span className="flex-1 font-medium">{l.name}</span>
                <span className="tnum text-sm text-[var(--ink-3)]">{l.entryCount}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <TextField placeholder={t.new_list} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
      <Button tone="primary" className="mt-3 w-full" disabled={(selected.size === 0 && !newName.trim()) || upsert.isPending || create.isPending} onClick={submit}>
        {t.add}
      </Button>
      {lists.isError && (
        <p className="mt-3 text-center text-sm">
          <Link to="/login" className="font-semibold text-sky">{t.login_required}</Link>
        </p>
      )}
    </Sheet>
  );
}
