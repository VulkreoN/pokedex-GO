import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { neutralKey } from '@mydexpogo/shared';
import { InitialStatusField, groupVariants, loadLastAddLists, saveLastAddLists, type VariantGroup } from './AddToList.js';
import { BulkAddSheet, comboId, possibleCombos, type DexPick, type PickCombo } from './BulkAddSheet.js';
import { BulkManageSheet } from './BulkManageSheet.js';
import { useAddPrefs } from '../lib/addPrefs.js';
import { useMe } from '../lib/auth.js';
import { entryVariant, genderSymbol, tagLabel, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { suggestListTag } from '../lib/dexSearch.js';
import { errorMessage } from '../lib/errors.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCreateList, useList, useLists, useUpsertEntries } from '../lib/lists.js';
import { selection, useSelection, useSelectionBarSuppressed, type SelectionItem } from '../lib/selection.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, IconButton, Sheet, TextField } from './ui.js';

/** Resolves a neutral variant key back to its VariantGroup in the Pokédex dataset. */
export function groupForKey(idx: DatasetIndex, rawKey: string): VariantGroup | undefined {
  const nk = neutralKey(rawKey);
  const v = idx.variantByKey.get(nk);
  if (!v) return undefined;
  const groups = groupVariants(idx.variantsByDex.get(v.dex) ?? []);
  return groups.find((g) => g.variants.some((x) => neutralKey(x.key) === nk));
}

/** Converts unified SelectionItems back to per-card DexPicks (used by PokedexPage, SpeciesPage and SelectionBar). */
export function picksFromSelection(idx: DatasetIndex, items: SelectionItem[]): Map<string, DexPick> {
  const byKey = new Map<string, { group: VariantGroup; combos: Map<string, PickCombo> }>();
  for (const item of items) {
    const nk = neutralKey(item.variantKey);
    let slot = byKey.get(nk);
    if (!slot) {
      const group = groupForKey(idx, nk);
      if (!group) continue;
      slot = { group, combos: new Map() };
      byKey.set(nk, slot);
    }
    const poss = possibleCombos(slot.group);
    if (item.gender === undefined) {
      for (const c of poss.filter((x) => x.shiny === item.shiny)) slot.combos.set(comboId(c), c);
    } else {
      const c: PickCombo = { sex: item.gender, shiny: item.shiny };
      if (poss.some((x) => comboId(x) === comboId(c))) slot.combos.set(comboId(c), c);
    }
  }
  const out = new Map<string, DexPick>();
  for (const [k, slot] of byKey) {
    const combos = [...slot.combos.values()];
    if (combos.length) out.set(k, { group: slot.group, combos });
  }
  return out;
}

/**
 * Unified floating Selection bar (persists across Pokédex, Species pages and Collections).
 * - Plain selections (from Pokédex / Species multi-select) open BulkAddSheet directly (versions, traits, status, lists).
 * - Tagged selections (copied from a collection via "Panier") open the exact-items sheet preserving each entry's trait.
 * - Managers & admins also get direct access to BulkManageSheet right from the bar.
 */
export function SelectionBar() {
  const t = useT();
  const { lang } = useLang();
  const items = useSelection();
  const suppressed = useSelectionBarSuppressed();
  const dataset = useDataset();
  const me = useMe();
  const isManager = me.data?.role === 'manager' || me.data?.role === 'admin';
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const targetListId = searchParams.get('to') || undefined;
  const targetQuery = useList(targetListId ?? '', !!targetListId && !!me.data && items.length > 0);
  const targetList = targetQuery.data?.access === 'owner' ? targetQuery.data.list : undefined;
  const targetDefaultTag = useMemo(() => (targetList ? suggestListTag(targetList.entries) : ''), [targetList]);

  const [open, setOpen] = useState(false);
  const [bulkManaging, setBulkManaging] = useState(false);
  const lists = useLists();
  const upsert = useUpsertEntries();
  const create = useCreateList();
  const toast = useToast();
  const [prefs, setPrefs] = useAddPrefs();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const idx = dataset.data;
    if (idx) selection.tidy((k) => idx.variantByKey.has(k), idx.ds.aliases);
  }, [dataset.data]);

  const hasPresetTags = useMemo(() => items.some((i) => i.tag !== ''), [items]);
  const picksMap = useMemo(
    () => (dataset.data ? picksFromSelection(dataset.data, items) : new Map<string, DexPick>()),
    [dataset.data, items],
  );
  const picks = useMemo(() => [...picksMap.values()], [picksMap]);

  useEffect(() => {
    if (!open || !hasPresetTags || !lists.data?.length) return;
    setSelected((prev) => {
      if (prev.size > 0) return prev;
      const existing = new Set(lists.data!.map((l) => l.id));
      return new Set(loadLastAddLists().filter((id) => existing.has(id)));
    });
  }, [open, hasPresetTags, lists.data]);

  if (items.length === 0 || suppressed || pathname === '/login' || pathname === '/welcome') return null;
  const idx = dataset.data;
  const cardCount = picks.length || items.length;

  const applyAllCombos = (change: (p: DexPick) => DexPick) => {
    const nextEntries: Omit<SelectionItem, 'id'>[] = [];
    for (const p of picks) {
      const updated = change(p);
      const baseKey = neutralKey((updated.group.variants.find((x) => x.gender !== 'f') ?? updated.group.variants[0]!).key);
      for (const c of updated.combos) {
        nextEntries.push({ variantKey: baseKey, gender: c.sex, shiny: c.shiny, tag: '' });
      }
    }
    selection.replaceAll(nextEntries);
  };

  const submitTagged = async () => {
    setError(null);
    try {
      const ids = [...selected];
      if (newName.trim()) {
        const r = await create.mutateAsync({ name: newName.trim() });
        ids.push(r.list.id);
      }
      const entries = items.map((i) => ({ variantKey: i.variantKey, ...(i.gender !== undefined ? { gender: i.gender } : {}), shiny: i.shiny, tag: i.tag, done: prefs.done }));
      for (const id of ids) for (let k = 0; k < entries.length; k += 1000) await upsert.mutateAsync({ id, entries: entries.slice(k, k + 1000) });
      saveLastAddLists(ids);
      toast(t.added_to(ids.length));
    } catch (e) {
      setError(errorMessage(t, e));
      return;
    }
    selection.clear();
    setSelected(new Set());
    setNewName('');
    setOpen(false);
  };

  const taggedFooter = (
    <div className="space-y-2">
      <Button tone="primary" className="w-full" disabled={(selected.size === 0 && !newName.trim()) || upsert.isPending || create.isPending} onClick={submitTagged}>
        {t.add} · {t.selected_count(items.length)}
      </Button>
      {error && <p className="text-center text-sm text-berry">{error}</p>}
      {lists.isError && <p className="text-center text-sm text-sky">{t.login_required}</p>}
    </div>
  );

  return (
    <>
      <div className="pb-safe fixed inset-x-0 bottom-[var(--nav-h)] z-20 px-3">
        <div className="mx-auto flex max-w-6xl items-center gap-2 rounded-2xl bg-go px-3 py-2 text-white shadow-lg">
          <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 truncate text-left text-sm">
            <span className="tnum font-bold">{hasPresetTags ? t.selection_count(items.length) : t.bulk_title(cardCount)}</span>
          </button>
          {isManager && picks.length > 0 && (
            <Button tone="ghost" className="min-h-9 shrink-0 bg-white/20 px-3 text-sm text-white hover:bg-white/30" onClick={() => setBulkManaging(true)}>
              {t.manage_short}
            </Button>
          )}
          <Button tone="ghost" className="min-h-9 shrink-0 bg-white px-3 text-sm text-go-ink hover:bg-white" onClick={() => setOpen(true)}>
            {t.add}
          </Button>
          <IconButton label={t.selection_clear} onClick={() => selection.clear()} className="h-9 w-9 shrink-0 text-white hover:bg-white/15">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </IconButton>
        </div>
      </div>

      {!hasPresetTags ? (
        <BulkAddSheet
          idx={idx}
          open={open}
          picks={picks}
          targetListId={targetList?.id}
          defaultTag={targetList && targetDefaultTag ? targetDefaultTag : undefined}
          onApplyAll={applyAllCombos}
          onRemoveKey={(bk) => selection.removeVariant(bk)}
          onClose={() => setOpen(false)}
          onDone={() => selection.clear()}
        />
      ) : (
        <Sheet open={open} onClose={() => setOpen(false)} title={t.selection_title(items.length)} footer={taggedFooter}>
          <div className="space-y-4">
            <ul className="max-h-[28vh] space-y-1 overflow-y-auto">
              {items.map((i) => {
                const v = idx ? entryVariant(idx, i.variantKey, i.gender ?? '') : undefined;
                const sp = v && idx?.speciesByDex.get(v.dex);
                return (
                  <li key={i.id} className="flex items-center gap-2 rounded-xl px-1 py-1">
                    {idx && v ? <Sprite idx={idx} variant={v} shiny={i.shiny} size={40} /> : <span className="h-10 w-10" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{sp ? localized(sp.name, lang) : i.variantKey}{i.gender ? ` ${genderSymbol(i.gender)}` : ''}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-ink-2">
                        {v?.label && <span className="truncate">{localized(v.label, lang)}</span>}
                        {i.shiny && <Badge tone="shiny"><Sparkle className="mr-0.5 inline" />{t.shiny}</Badge>}
                        {i.tag && <Badge tone="muted">{tagLabel(idx ?? undefined, i.tag, t)}</Badge>}
                      </span>
                    </span>
                    <IconButton label={t.remove_entry} onClick={() => selection.remove(i.id)} className="h-9 w-9">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </IconButton>
                  </li>
                );
              })}
            </ul>
            <InitialStatusField done={prefs.done} onChange={(done) => setPrefs({ done })} />
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.choose_lists}</p>
              {lists.data?.length === 0 && !newName && <p className="mb-2 text-sm text-ink-2">{t.no_lists_yet}</p>}
              <ul className="mb-2.5 space-y-1">
                {lists.data?.map((l) => {
                  const on = selected.has(l.id);
                  return (
                    <li key={l.id}>
                      <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 transition ${on ? 'bg-go-soft/55' : 'hover:bg-paper-2'}`}>
                        <input type="checkbox" checked={on} onChange={() => setSelected((s) => { const n = new Set(s); on ? n.delete(l.id) : n.add(l.id); return n; })} className="h-5 w-5 accent-go" />
                        <span className="flex-1 font-medium">{l.name}</span>
                        <span className="tnum text-sm text-ink-3">{l.entryCount}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <TextField placeholder={t.new_list} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
            </div>
          </div>
        </Sheet>
      )}

      {isManager && (
        <BulkManageSheet
          open={bulkManaging}
          groups={picks.map((p) => p.group)}
          onClose={() => setBulkManaging(false)}
          onDone={() => selection.clear()}
        />
      )}
    </>
  );
}
