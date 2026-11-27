/**
 * Remembered add preferences (missing vs already caught, shiny version, gender, default trait, 1-tap mode)
 * shared across the in-collection Quick Add drawer, the Pokédex target banner, and the add sheets.
 */
import { useSyncExternalStore } from 'react';
import { ENTRY_TAGS, neutralKey, type EntryGender, type EntryTag } from '@mydexpogo/shared';
import type { VariantGroup } from '../components/AddToList.js';
import { entryGenders, type DatasetIndex } from './dataset.js';

export type AddVersionPref = 'normal' | 'shiny' | 'both';
export type AddGenderPref = 'both' | 'm' | 'f';

export interface AddPrefs {
  /** Whether newly added entries start as already caught (`done: true`) or missing (`done: false`). */
  done: boolean;
  /** Default normal / shiny look when adding from Quick Add or 1-tap mode. */
  version: AddVersionPref;
  /** Default gender filter when adding from Quick Add or 1-tap mode. */
  gender: AddGenderPref;
  /** Default trait (e.g. '' | 'lucky' | 'shadow' ...). */
  tag: EntryTag;
  /** When browsing `/dex?to=<listId>`, tapping a card adds immediately using these presets instead of opening a sheet. */
  oneTap: boolean;
}

const KEY = 'addPrefs:v1';
const DEFAULT_PREFS: AddPrefs = { done: false, version: 'normal', gender: 'both', tag: '', oneTap: false };
const VALID_TAGS = new Set<string>(ENTRY_TAGS);

function load(): AddPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AddPrefs> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    const version: AddVersionPref = raw.version === 'shiny' || raw.version === 'both' ? raw.version : 'normal';
    const gender: AddGenderPref = raw.gender === 'm' || raw.gender === 'f' ? raw.gender : 'both';
    const tag: EntryTag = typeof raw.tag === 'string' && VALID_TAGS.has(raw.tag) ? (raw.tag as EntryTag) : '';
    return { done: raw.done === true, version, gender, tag, oneTap: raw.oneTap === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

let state: AddPrefs = load();
const listeners = new Set<() => void>();

function commit(next: AddPrefs) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

export const addPrefs = {
  get: (): AddPrefs => state,
  set(patch: Partial<AddPrefs>) {
    commit({ ...state, ...patch });
  },
  reset() {
    commit(DEFAULT_PREFS);
  },
};

export function useAddPrefs(): [AddPrefs, (patch: Partial<AddPrefs>) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => DEFAULT_PREFS,
  );
  return [value, addPrefs.set];
}

export interface BuiltAddEntry {
  variantKey: string;
  gender: EntryGender;
  shiny: boolean;
  tag: EntryTag;
  done: boolean;
}

/**
 * Expands a variant group into exact valid API entries following the game master's allowed genders and shiny availability.
 * Falls back gracefully when a Pokémon is genderless, single-gender, or has no shiny sprite yet.
 */
export function buildQuickEntries(
  idx: DatasetIndex,
  group: VariantGroup,
  opts: { version: AddVersionPref; gender: AddGenderPref; tags: EntryTag[]; done: boolean },
): BuiltAddEntry[] {
  const base = group.variants.find((v) => v.gender !== 'f') ?? group.variants[0]!;
  const key = neutralKey(base.key);
  const allowedGenders = entryGenders(idx, key);
  const sexes: EntryGender[] =
    opts.gender === 'both'
      ? allowedGenders
      : allowedGenders.includes(opts.gender)
        ? [opts.gender]
        : allowedGenders;

  const shinies: boolean[] =
    opts.version === 'both'
      ? (base.hasShiny ? [false, true] : [false])
      : opts.version === 'shiny'
        ? (base.hasShiny ? [true] : [false])
        : [false];

  const tags: EntryTag[] = opts.tags.length ? opts.tags : [''];
  const out: BuiltAddEntry[] = [];
  for (const gender of sexes) {
    for (const shiny of shinies) {
      for (const tag of tags) {
        out.push({ variantKey: key, gender, shiny, tag, done: opts.done });
      }
    }
  }
  return out;
}
