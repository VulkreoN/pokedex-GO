import { useState } from 'react';
import { useLocation } from 'react-router';
import { useDataset } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useLists, useUpsertEntries } from '../lib/lists.js';
import { selection, useSelection } from '../lib/selection.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, IconButton, Sheet, TextField } from './ui.js';

/** Floating bar above the nav while the basket is not empty, with the sheet that sends it to lists. */
export function SelectionBar() {
  const t = useT();
  const { lang } = useLang();
  const items = useSelection();
  const dataset = useDataset();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  if (items.length === 0 || pathname === '/login') return null;
  const idx = dataset.data;

  const submit = async () => {
    const ids = [...selected];
    if (newName.trim()) {
      const r = await create.mutateAsync({ name: newName.trim() });
      ids.push(r.list.id);
    }
    const entries = items.map((i) => ({ variantKey: i.variantKey, shiny: i.shiny, tag: i.tag, done: false }));
    await Promise.all(ids.map((id) => upsert.mutateAsync({ id, entries })));
    toast(t.added_to(ids.length));
    selection.clear();
    setSelected(new Set());
    setNewName('');
    setOpen(false);
  };

  return (
    <>
      <div className="pb-safe fixed inset-x-0 bottom-[64px] z-20 px-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-card shadow-lg">
          <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 truncate text-left text-sm">
            <span className="tnum font-bold">{t.selection_count(items.length)}</span>
            <span className="ml-2 text-xs opacity-70">{t.selection_view}</span>
          </button>
          <Button tone="primary" className="min-h-9 shrink-0 px-3 text-sm" onClick={() => setOpen(true)}>{t.selection_send}</Button>
          <IconButton label={t.selection_clear} onClick={() => selection.clear()} className="h-9 w-9 text-card hover:bg-white/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </IconButton>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.selection_title(items.length)}>
        <ul className="mb-4 max-h-[32vh] space-y-1 overflow-y-auto">
          {items.map((i) => {
            const v = idx?.variantByKey.get(i.variantKey);
            const sp = v && idx?.speciesByDex.get(v.dex);
            return (
              <li key={i.id} className="flex items-center gap-2 rounded-xl px-1 py-1">
                {idx && v ? <Sprite idx={idx} variant={v} shiny={i.shiny} size={40} /> : <span className="h-10 w-10" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{sp ? localized(sp.name, lang) : i.variantKey}{v?.gender ? ` ${v.gender === 'f' ? '♀' : '♂'}` : ''}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-ink-2">
                    {v?.label && <span className="truncate">{localized(v.label, lang)}</span>}
                    {i.shiny && <Badge tone="shiny"><Sparkle className="mr-0.5 inline" />{t.shiny}</Badge>}
                    {i.tag && <Badge tone="muted">{t[`tag_${i.tag}`]}</Badge>}
                  </span>
                </span>
                <IconButton label={t.remove_entry} onClick={() => selection.remove(i.id)} className="h-9 w-9">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </IconButton>
              </li>
            );
          })}
        </ul>
        <p className="mb-1.5 text-xs font-medium text-ink-3">{t.choose_lists}</p>
        {lists.data?.length === 0 && !newName && <p className="mb-2 text-sm text-ink-2">{t.no_lists_yet}</p>}
        <ul className="mb-3 space-y-1">
          {lists.data?.map((l) => {
            const on = selected.has(l.id);
            return (
              <li key={l.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-paper-2">
                  <input type="checkbox" checked={on} onChange={() => setSelected((s) => { const n = new Set(s); on ? n.delete(l.id) : n.add(l.id); return n; })} className="h-5 w-5 accent-go" />
                  <span className="flex-1 font-medium">{l.name}</span>
                  <span className="tnum text-sm text-ink-3">{l.entryCount}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <TextField placeholder={t.new_list} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
        <Button tone="primary" className="mt-3 w-full" disabled={(selected.size === 0 && !newName.trim()) || upsert.isPending || create.isPending} onClick={submit}>
          {t.add} · {t.selected_count(items.length)}
        </Button>
        {lists.isError && <p className="mt-3 text-center text-sm text-sky">{t.login_required}</p>}
      </Sheet>
    </>
  );
}
