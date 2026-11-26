/**
 * The 18 regional Vivillon (Prismillon) postcard patterns obtainable from Pokémon GO gifts.
 * Excludes event-only patterns (Fancy, Poké Ball) that do not come from regional postcards.
 */
import type { Lang } from './types.js';

export const VIVILLON_PATTERNS = [
  'ARCHIPELAGO',
  'CONTINENTAL',
  'ELEGANT',
  'GARDEN',
  'HIGH_PLAINS',
  'ICY_SNOW',
  'JUNGLE',
  'MARINE',
  'MEADOW',
  'MODERN',
  'MONSOON',
  'OCEAN',
  'POLAR',
  'RIVER',
  'SANDSTORM',
  'SAVANNA',
  'SUN',
  'TUNDRA',
] as const;

export type VivillonPattern = (typeof VIVILLON_PATTERNS)[number];

export const VIVILLON_PATTERN_SET: ReadonlySet<string> = new Set(VIVILLON_PATTERNS);

export function isVivillonPattern(v: string): v is VivillonPattern {
  return VIVILLON_PATTERN_SET.has(v);
}

/** Extracts a regional Vivillon pattern from a collection variantKey ("666.fOCEAN" -> "OCEAN"). */
export function vivillonPatternFromKey(variantKey: string): VivillonPattern | null {
  const m = /^666\.f([A-Z_]+)(?:\.g2)?$/.exec(variantKey);
  if (!m) return null;
  return isVivillonPattern(m[1]!) ? m[1]! : null;
}

export interface VivillonPatternMeta {
  fr: string;
  en: string;
  regionFr: string;
  regionEn: string;
  variantKey: string;
}

export const VIVILLON_META: Record<VivillonPattern, VivillonPatternMeta> = {
  ARCHIPELAGO: { fr: 'Archipel', en: 'Archipelago', regionFr: 'Caraïbes, Floride, Afrique du Sud', regionEn: 'Caribbean, Florida, South Africa', variantKey: '666.fARCHIPELAGO' },
  CONTINENTAL: { fr: 'Continent', en: 'Continental', regionFr: 'Nord France, Belgique, Allemagne, Corée', regionEn: 'Central Europe, Belgium, Germany, Korea', variantKey: '666.fCONTINENTAL' },
  ELEGANT: { fr: 'Monarchie', en: 'Elegant', regionFr: 'Japon', regionEn: 'Japan', variantKey: '666.fELEGANT' },
  GARDEN: { fr: 'Verdure', en: 'Garden', regionFr: 'Royaume-Uni, Irlande, Nouvelle-Zélande', regionEn: 'UK, Ireland, New Zealand', variantKey: '666.fGARDEN' },
  HIGH_PLAINS: { fr: 'Sécheresse', en: 'High Plains', regionFr: 'Ouest USA, Mexique Nord, Turquie', regionEn: 'Western US, Northern Mexico, Turkey', variantKey: '666.fHIGH_PLAINS' },
  ICY_SNOW: { fr: 'Blizzard', en: 'Icy Snow', regionFr: 'Finlande, Nord Canada, Alaska, Groenland', regionEn: 'Finland, Northern Canada, Alaska, Greenland', variantKey: '666.fICY_SNOW' },
  JUNGLE: { fr: 'Jungle', en: 'Jungle', regionFr: 'Colombie, Indonésie, Singapour, Afrique centrale', regionEn: 'Colombia, Indonesia, Singapore, Central Africa', variantKey: '666.fJUNGLE' },
  MARINE: { fr: 'Rivage', en: 'Marine', regionFr: 'Sud France, Espagne, Italie Sud, Chili, Grèce', regionEn: 'Spain, Southern Europe, Chile, Greece', variantKey: '666.fMARINE' },
  MEADOW: { fr: 'Floraison', en: 'Meadow', regionFr: 'France, Suisse, Nord Italie, Luxembourg', regionEn: 'France, Switzerland, Northern Italy', variantKey: '666.fMEADOW' },
  MODERN: { fr: 'Métropole', en: 'Modern', regionFr: 'Est & Sud-Est USA', regionEn: 'Eastern & Southeastern US', variantKey: '666.fMODERN' },
  MONSOON: { fr: 'Cyclone', en: 'Monsoon', regionFr: 'Taïwan, Hong Kong, Thaïlande, Inde', regionEn: 'Taiwan, Hong Kong, Thailand, India', variantKey: '666.fMONSOON' },
  OCEAN: { fr: 'Soleil Levant', en: 'Ocean', regionFr: 'Hawaï, La Réunion, Île Maurice, Galápagos', regionEn: 'Hawaii, Réunion, Mauritius, Galápagos', variantKey: '666.fOCEAN' },
  POLAR: { fr: 'Banquise', en: 'Polar', regionFr: 'Québec, Est Canada, Nord-Est USA, Norvège', regionEn: 'Eastern Canada, NE US, Norway, Sweden', variantKey: '666.fPOLAR' },
  RIVER: { fr: 'Delta', en: 'River', regionFr: 'Australie, Afrique du Nord, Afrique du Sud', regionEn: 'Australia, North Africa, South Africa', variantKey: '666.fRIVER' },
  SANDSTORM: { fr: 'Sable', en: 'Sandstorm', regionFr: 'Moyen-Orient, Émirats, Arabie saoudite', regionEn: 'Middle East, UAE, Saudi Arabia', variantKey: '666.fSANDSTORM' },
  SAVANNA: { fr: 'Mangrove', en: 'Savanna', regionFr: 'Brésil, Pérou', regionEn: 'Brazil, Peru', variantKey: '666.fSAVANNA' },
  SUN: { fr: 'Zénith', en: 'Sun', regionFr: 'Mexique, Madagascar, Nord Australie', regionEn: 'Mexico, Madagascar, Northern Australia', variantKey: '666.fSUN' },
  TUNDRA: { fr: 'Glace', en: 'Tundra', regionFr: 'Islande, Hokkaido (Japon), Ouest Norvège', regionEn: 'Iceland, Hokkaido (Japan), Western Norway', variantKey: '666.fTUNDRA' },
};

export function vivillonName(pattern: VivillonPattern, lang: Lang): string {
  return lang === 'fr' ? VIVILLON_META[pattern].fr : VIVILLON_META[pattern].en;
}

export function vivillonRegion(pattern: VivillonPattern, lang: Lang): string {
  return lang === 'fr' ? VIVILLON_META[pattern].regionFr : VIVILLON_META[pattern].regionEn;
}
