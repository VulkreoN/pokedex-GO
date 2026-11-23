/** Languages the dataset and UI carry. English is always present. */
export type Lang = 'en' | 'fr';
export type LocalizedText = { en: string; fr?: string };

export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'grass' | 'electric' | 'ice' | 'fighting' | 'poison'
  | 'ground' | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type Rarity = 'normal' | 'legendary' | 'mythic' | 'ultra_beast';

export type VariantKind =
  | 'base'      // the plain species
  | 'regional'  // Alolan, Galarian, Hisuian, Paldean
  | 'form'      // any other visual form (Unown letters, Vivillon patterns, Rotom...)
  | 'costume'   // event costume (hat, scarf, ...)
  | 'mega'      // Mega / Primal
  | 'gmax';     // Gigantamax / Eternamax

export type Gender = 'm' | 'f';

export interface Species {
  dex: number;
  /** Game master id, e.g. "PIKACHU" */
  id: string;
  name: LocalizedText;
  gen: number;
  types: PokemonType[];
  rarity: Rarity;
  /** Game master family id, e.g. "FAMILY_PIKACHU" */
  family: string;
  /** Dex number of the species it evolves from (Pikachu: 172, Pichu). */
  parent?: number;
  /** True when male and female look different in game. */
  genderDiff: boolean;
  /** Species-level shiny availability (null = unknown for this source). */
  shinyReleased: boolean | null;
  /** False when the species has no asset in the game yet. */
  released: boolean;
}

export interface Variant {
  /** Stable key, mirrors PokeMiners file naming: "25", "25.fALOLA", "25.cHALLOWEEN_2025", "25.fX.g2" */
  key: string;
  dex: number;
  form: string | null;
  costume: string | null;
  /** 'f' for a female-specific asset, 'm' when a female one exists and this is the male, null otherwise. */
  gender: Gender | null;
  kind: VariantKind;
  /** Human label for the form/costume part only (null for the base variant). */
  label: LocalizedText | null;
  /** Filename inside dataset.assetBase, or an absolute URL when it comes from a fallback source. Null = no picture yet. */
  img: string | null;
  /** Absolute shiny URL for fallback sources; omitted when derivable from img. */
  shinyImg?: string;
  hasShiny: boolean;
  /** Found in datamined assets but not in the game master or costume list yet. */
  datamined: boolean;
  inGameMaster: boolean;
  /** Type override for this form, when the game master gives one. */
  types?: PokemonType[];
  /** Evolving is blocked for this costume (only set when the plain Pokémon evolves). */
  noEvolve?: boolean;
  /** This costume cannot Mega Evolve though the plain Pokémon can. */
  noMega?: boolean;
  /** Ids of special backgrounds this picture can carry (see Dataset.backgrounds). */
  backgrounds?: string[];
  /** When this variant first appeared (ISO date). Estimated from the costume name for the initial baseline, exact afterwards. */
  firstSeen?: string;
  /** Genders this variant exists in, from the game master (per form and costume). Empty = genderless. */
  genders?: Gender[];
  /** The game master has no gender data for this form yet (newer than the published file): genders are the species'. */
  gendersGuessed?: boolean;
}

export interface BackgroundInfo {
  id: string;
  label: string;
  image: string;
}

export interface Dataset {
  schema: 1;
  version: string;
  generatedAt: string;
  assetBase: string;
  sources: Record<string, string>;
  species: Species[];
  variants: Variant[];
  /** Special backgrounds catalog (location cards, event backgrounds), keyed by id. */
  backgrounds?: Record<string, BackgroundInfo>;
  /** Base stats, level multipliers and power-up costs for the PvP rank checker. */
  pvp?: PvpData;
  /** Variant keys that are gone, and the one that replaces each (a formless duplicate of a form). */
  aliases?: Record<string, string>;
}

export type PvpTop = [atk: number, def: number, sta: number, level: number, cp: number];

/** One battle-relevant form: costumes and copies with identical stats are folded into it. */
export interface PvpPokemon {
  /** Variant key of the form ("26", "26.fALOLA"); also used for the picture. */
  key: string;
  dex: number;
  name: LocalizedText;
  types: PokemonType[];
  atk: number;
  def: number;
  sta: number;
  /** Keys of the forms this one evolves into (Mega evolutions excluded). */
  evolutions?: string[];
  /** Rank 1 IVs per league at level 50 (no best buddy): [attack, defense, HP, level, CP]. */
  top?: { great: PvpTop; ultra: PvpTop };
}
export interface PvpData {
  /** CP multiplier per whole level: cpm[0] is level 1. */
  cpm: number[];
  /** Cost of each power-up from a level, indexed by whole level - 1 (both half steps of a level cost the same). */
  stardust: number[];
  candy: number[];
  /** XL Candy per power-up, indexed by whole level - xlFrom. */
  xlCandy: number[];
  xlFrom: number;
  /** Highest level reachable by powering up (best buddy adds one on top). */
  maxLevel: number;
  pokemon: PvpPokemon[];
  /** Move names by the game's move id ("MUD_SHOT"), the same ids PvPoke uses. */
  moves?: Record<string, LocalizedText>;
}

export interface DatasetManifest {
  version: string;
  generatedAt: string;
  speciesCount: number;
  variantCount: number;
}

/* ---------- Lists (API <-> web) ---------- */

export type ListVisibility = 'private' | 'friends' | 'link';

/** Optional extra trait of a hunted Pokémon. Empty string = none. */
export const ENTRY_TAGS = ['', 'lucky', 'background', 'shadow', 'purified', 'dynamax', 'xxl', 'xxs'] as const;
/** One of ENTRY_TAGS, or "bg:<background id>" for one specific special background. */
export type EntryTag = (typeof ENTRY_TAGS)[number] | `bg:${string}`;
export const isEntryTag = (s: string): s is EntryTag => (ENTRY_TAGS as readonly string[]).includes(s) || /^bg:[A-Za-z0-9_.-]{1,80}$/.test(s);
export const backgroundIdOf = (tag: EntryTag): string | null => (tag.startsWith('bg:') ? tag.slice(3) : null);

/** '' for genderless Pokémon, otherwise the gender this entry tracks. */
export type EntryGender = '' | Gender;

export interface ListEntry {
  /** Gender-neutral variant key (never ends with ".g2": the gender lives in `gender`). */
  variantKey: string;
  gender: EntryGender;
  /** The target is the shiny version of the variant. */
  shiny: boolean;
  tag: EntryTag;
  /** Caught / owned. */
  done: boolean;
  note: string | null;
}

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: ListVisibility;
  ownerId: string;
  ownerName: string;
  entryCount: number;
  doneCount: number;
  createdAt: string;
  updatedAt: string;
  shareToken: string | null;
  /** Friend's list only: shown in my "Friends' lists" (followed by default). */
  following?: boolean;
}

/** A friend saying "I have this one" on a list entry. */
export interface ListOffer {
  userId: string;
  username: string;
}

export interface ListDetailEntry extends ListEntry {
  /** Last change (added, ticked, unticked), for sorting. */
  updatedAt?: string;
  /** Owner view: every friend who has it. Friend view: absent. */
  offers?: ListOffer[];
  /** Friend view: whether I said I have it. */
  offeredByMe?: boolean;
}

export type ListEventKind = 'created' | 'added' | 'removed' | 'caught' | 'uncaught' | 'renamed' | 'visibility' | 'offer';
export interface ListEventItem {
  variantKey: string;
  gender: EntryGender;
  shiny: boolean;
  tag: string;
}
export interface ListEvent {
  id: number;
  kind: ListEventKind;
  actorName: string | null;
  count: number;
  items: ListEventItem[];
  data?: Record<string, unknown> | null;
  at: string;
}

export interface ListDetail extends ListSummary {
  entries: ListDetailEntry[];
}

/** 'account': changes made to your account by an admin; always sent, cannot be switched off. */
export type NotificationType = 'friend_request' | 'friend_accepted' | 'offer' | 'offer_caught' | 'raid' | 'announcement' | 'account';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: { id: string; username: string } | null;
  list: { id: string; name: string } | null;
  /** offer / offer_caught: { count, variants } (grouped per friend and list) */
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/** Live events pushed to the open app (Server-Sent Events). */
export type LiveEvent =
  | { type: 'list'; listId: string; ownerId: string; deleted?: boolean }
  | { type: 'friends' }
  | { type: 'notification' }
  /** The banner everyone sees changed. */
  | { type: 'announcement' };

export type Role = 'user' | 'manager' | 'admin';

export interface PublicUser {
  id: string;
  username: string;
  friendCode: string;
  role: Role;
  createdAt: string;
  /** Finished or skipped the welcome tour. */
  onboarded?: boolean;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  from: PublicUser;
  to: PublicUser;
  status: FriendRequestStatus;
  createdAt: string;
}
