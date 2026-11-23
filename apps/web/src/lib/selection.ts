/** A basket of entries picked while browsing, sent to one or more lists in one go. Survives navigation (sessionStorage). */
import { useSyncExternalStore } from 'react';
import type { EntryGender, EntryTag } from '@mydexpogo/shared';

export interface SelectionItem {
  id: string; // `${variantKey}:${gender}:${shiny ? 1 : 0}:${tag}`
  variantKey: string;
  /** Missing in baskets saved by older versions: the server then adds every possible gender. */
  gender?: EntryGender;
  shiny: boolean;
  tag: EntryTag;
}

const KEY = 'selection';
let items: SelectionItem[] = load();
const listeners = new Set<() => void>();

function load(): SelectionItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as SelectionItem[];
  } catch {
    return [];
  }
}
function commit(next: SelectionItem[]) {
  items = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  listeners.forEach((l) => l());
}

export const selectionId = (variantKey: string, shiny: boolean, tag: EntryTag, gender: EntryGender = '') => `${variantKey}:${gender}:${shiny ? 1 : 0}:${tag}`;

export const selection = {
  add(entries: Omit<SelectionItem, 'id'>[]) {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const e of entries) {
      const id = selectionId(e.variantKey, e.shiny, e.tag, e.gender);
      byId.set(id, { ...e, id });
    }
    commit([...byId.values()]);
  },
  remove(id: string) {
    commit(items.filter((i) => i.id !== id));
  },
  clear() {
    commit([]);
  },
  /** After a data update: keys of folded forms move to their replacement, keys that are gone leave. */
  tidy(known: (key: string) => boolean, aliases: Record<string, string> = {}) {
    const byId = new Map<string, SelectionItem>();
    for (const i of items) {
      const variantKey = aliases[i.variantKey] ?? i.variantKey;
      if (!known(variantKey)) continue;
      const id = selectionId(variantKey, i.shiny, i.tag, i.gender);
      byId.set(id, { ...i, variantKey, id });
    }
    if (byId.size !== items.length || [...byId.values()].some((x, k) => x.id !== items[k]?.id)) commit([...byId.values()]);
  },
};

export function useSelection(): SelectionItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}
