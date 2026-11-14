/** A basket of entries picked while browsing, sent to one or more lists in one go. Survives navigation (sessionStorage). */
import { useSyncExternalStore } from 'react';
import type { EntryTag } from '@mydexpogo/shared';

export interface SelectionItem {
  id: string; // `${variantKey}:${shiny ? 1 : 0}:${tag}`
  variantKey: string;
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

export const selectionId = (variantKey: string, shiny: boolean, tag: EntryTag) => `${variantKey}:${shiny ? 1 : 0}:${tag}`;

export const selection = {
  add(entries: Omit<SelectionItem, 'id'>[]) {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const e of entries) byId.set(selectionId(e.variantKey, e.shiny, e.tag), { ...e, id: selectionId(e.variantKey, e.shiny, e.tag) });
    commit([...byId.values()]);
  },
  remove(id: string) {
    commit(items.filter((i) => i.id !== id));
  },
  clear() {
    commit([]);
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
