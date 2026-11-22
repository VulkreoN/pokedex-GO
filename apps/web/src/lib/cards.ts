/** A list shows one card per target (variant x normal/shiny x trait); its genders are tracked inside the card. */
import type { EntryTag, ListDetailEntry } from '@mydexpogo/shared';

export interface EntryCard {
  id: string;
  variantKey: string;
  shiny: boolean;
  tag: EntryTag;
  /** One entry per gender (♂ then ♀), or a single genderless one. */
  members: ListDetailEntry[];
}

const ORDER = { m: 0, f: 1, '': 2 } as const;

export function cardsOf(entries: ListDetailEntry[]): EntryCard[] {
  const cards = new Map<string, EntryCard>();
  for (const e of entries) {
    const id = `${e.variantKey}|${e.shiny ? 1 : 0}|${e.tag}`;
    const c = cards.get(id);
    if (c) c.members.push(e);
    else cards.set(id, { id, variantKey: e.variantKey, shiny: e.shiny, tag: e.tag, members: [e] });
  }
  for (const c of cards.values()) c.members.sort((a, b) => ORDER[a.gender] - ORDER[b.gender]);
  return [...cards.values()];
}

export const cardDone = (c: EntryCard) => c.members.every((m) => m.done);
export const cardMissing = (c: EntryCard) => c.members.some((m) => !m.done);
