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
  /** Evolving is blocked for this costume. */
  noEvolve?: boolean;
  /** Ids of special backgrounds this picture can carry (see Dataset.backgrounds). */
  backgrounds?: string[];
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

export interface ListEntry {
  variantKey: string;
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
}

export interface ListDetail extends ListSummary {
  entries: ListEntry[];
}

export type Role = 'user' | 'manager' | 'admin';

export interface PublicUser {
  id: string;
  username: string;
  friendCode: string;
  role: Role;
  createdAt: string;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  from: PublicUser;
  to: PublicUser;
  status: FriendRequestStatus;
  createdAt: string;
}
