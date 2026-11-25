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

export type CardSort = 'added' | 'recent' | 'dex' | 'name' | 'changed';
export const CARD_SORTS: CardSort[] = ['recent', 'added', 'dex', 'name', 'changed'];

/**
 * Cards in the chosen order. Entries come in the order they were added; the Pokédex order follows the dataset's
 * variants (species, then forms and costumes); "changed" puts the last ticked / unticked first.
 */
export function sortCards(cards: EntryCard[], sort: CardSort, order: { rank: (key: string) => number; name: (key: string) => string }): EntryCard[] {
  if (sort === 'added') return cards;
  if (sort === 'recent') return [...cards].reverse();
  const out = [...cards];
  if (sort === 'dex') out.sort((a, b) => order.rank(a.variantKey) - order.rank(b.variantKey) || Number(a.shiny) - Number(b.shiny) || a.tag.localeCompare(b.tag));
  else if (sort === 'name') out.sort((a, b) => order.name(a.variantKey).localeCompare(order.name(b.variantKey)) || order.rank(a.variantKey) - order.rank(b.variantKey) || Number(a.shiny) - Number(b.shiny));
  else {
    const last = (c: EntryCard) => c.members.reduce((m, e) => (e.updatedAt && e.updatedAt > m ? e.updatedAt : m), '');
    out.sort((a, b) => last(b).localeCompare(last(a)));
  }
  return out;
}

/** For exports of what is missing: each card keeps only its genders still to catch (a caught ♂ is not shown at all). */
export const missingCards = (cards: EntryCard[]) => cards.flatMap((c) => {
  const members = c.members.filter((m) => !m.done);
  return members.length ? [{ ...c, members }] : [];
});
