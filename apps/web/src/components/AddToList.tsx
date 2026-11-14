import { useState } from 'react';
import type { Variant } from '@mydexpogo/shared';
import { Link } from 'react-router';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useLists, useUpsertEntries } from '../lib/lists.js';
import { Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Button, Sheet, TextField } from './ui.js';

/** Picks one or more of the user's lists and adds the variant (normal or shiny) to each. */
export function AddToListSheet({ idx, variant, shiny, onClose }: { idx: DatasetIndex; variant: Variant | null; shiny: boolean; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const species = variant ? idx.speciesByDex.get(variant.dex) : null;

  const submit = async () => {
    if (!variant) return;
    const ids = [...selected];
    if (newName.trim()) {
      const r = await create.mutateAsync({ name: newName.trim() });
      ids.push(r.list.id);
    }
    await Promise.all(ids.map((id) => upsert.mutateAsync({ id, entries: [{ variantKey: variant.key, shiny, done: false }] })));
    toast(t.added_to(ids.length));
    setSelected(new Set());
    setNewName('');
    onClose();
  };

  return (
    <Sheet open={!!variant} onClose={onClose} title={t.add_to_list}>
      {variant && species && (
        <div className="mb-4 flex items-center gap-3">
          <Sprite idx={idx} variant={variant} shiny={shiny} size={56} />
          <div>
            <div className="font-bold">{localized(species.name, lang)}</div>
            <div className="text-sm text-[var(--ink-2)]">
              {[localized(variant.label, lang), shiny ? t.shiny : null, variant.gender === 'f' ? t.female : null].filter(Boolean).join(' · ') || t.normal}
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
