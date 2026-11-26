import type { LocalizedText } from '@mydexpogo/shared';

const WORDS: Record<string, string> = {
  GOFEST: 'GO Fest',
  GOTOUR: 'GO Tour',
  GOWA: 'GO Wild Area',
  WILDAREA: 'Wild Area',
  WCS: 'WCS',
  PXP: 'PXP',
  TSHIRT: 'T-shirt',
  ANNIV: 'Anniversary',
  NOEVOLVE: '',
  TCG: 'TCG',
  BB: 'BB',
  GLASS: 'Glass',
  '5TH': '5th',
};

const FR_WORDS: Record<string, string> = {
  Fall: 'Automne',
  Winter: 'Hiver',
  Spring: 'Printemps',
  Summer: 'Été',
  Halloween: 'Halloween',
  Holiday: 'Fêtes',
  Anniversary: 'Anniversaire',
  Fashion: 'Mode',
  Cap: 'Casquette',
  Hat: 'Chapeau',
  Goggles: 'Lunettes',
  Monocle: 'Monocle',
  Visor: 'Visière',
  Scarf: 'Écharpe',
  Tiara: 'Tiare',
  Flying: 'Volant',
  Doctor: 'Docteur',
  Helmet: 'Casque',
  Fossil: 'Fossile',
  Red: 'Rouge',
  Blue: 'Bleu',
  Yellow: 'Jaune',
  Train: 'Train',
  Conductor: 'Conducteur',
  Coin: 'Pièce',
  Royal: 'Royal',
  Party: 'Fête',
  Witch: 'Sorcière',
  Santa: 'Noël',
  Sscarf: 'Écharpe Soleil',
  Mscarf: 'Écharpe Lune',
  Stiara: 'Couronne Soleil',
  Mtiara: 'Couronne Lune',
  Crown: 'Couronne',
  Flower: 'Fleur',
  Explorer: 'Explorateur',
  Detective: 'Détective',
  Safari: 'Safari',
  Birthday: 'Anniversaire',
  Ribbon: 'Ruban',
  Bow: 'Nœud',
  Nightcap: 'Bonnet de nuit',
  Sunglasses: 'Lunettes de soleil',
  Beanie: 'Bonnet',
  Costume: 'Costumé',
};

/** "GOFEST_2026_CAP_RED" -> "GO Fest 2026 Cap Red". Strips numeric variant suffixes like "_01". */
export function humanizeToken(token: string): string {
  const parts = token
    .split('_')
    .filter((p) => p !== '' && !/^0\d$/.test(p));
  const words = parts.map((p) => {
    if (p in WORDS) return WORDS[p]!;
    if (/^\d{4}$/.test(p)) return p;
    if (/^[A-Z]$/.test(p)) return p; // single letters: "A", "B" variants
    return p.charAt(0) + p.slice(1).toLowerCase();
  });
  return words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Translates only when every word is known (seasons, years, colours...), so we never ship half-French labels. */
export function localizeHumanized(en: string): LocalizedText {
  const words = en.split(' ');
  const translatable = words.every((w) => w in FR_WORDS || /^\d+$/.test(w) || /^[A-Z]$/.test(w) || w === 'GO' || w === 'Fest' || w === 'Tour');
  if (!translatable) return { en };
  const fr = words.map((w) => FR_WORDS[w] ?? w).join(' ');
  return fr === en ? { en } : { en, fr };
}

/** Looks up an in-game form label in the text dumps: form_{species}_{token} first, then form_{token}. */
export function gameFormLabel(
  texts: { en: Map<string, string>; fr: Map<string, string> },
  speciesId: string,
  form: string,
): LocalizedText | null {
  const candidates = [`form_${speciesId}_${form}`.toLowerCase(), `form_${form}`.toLowerCase()];
  for (const key of candidates) {
    // Some game texts carry line breaks ("Coupe\nMonsieur").
    const en = texts.en.get(key)?.replace(/\s+/g, ' ').trim();
    if (en) {
      const fr = texts.fr.get(key)?.replace(/\s+/g, ' ').trim();
      return fr && fr !== en ? { en, fr } : { en };
    }
  }
  return null;
}

const COSTUME_HINT =
  /(^|_)(20\d\d|GOFEST|GOTOUR|GOWA|WILDAREA|HALLOWEEN|FALL|WINTER|SPRING|SUMMER|HOLIDAY|ANNIVERSARY|ANNIV|FASHION|HAT|CAP|TSHIRT|FLYING|COSTUME|DOCTOR|KARIYUSHI|POP_STAR|ROCK_STAR|HORIZONS|JEJU|KURTA|DIWALI|WCS|PXP|BB|VISOR|FOSSIL|GOGGLES|MONOCLE|TIARA|SCARF|HELMET|ROYAL|NIGHTCAP|PI|SAFARI|TCG|COPY|ADVENTURE|OKINAWA|TRAIN_CONDUCTOR|GLASS)(_|$)/;

export function looksLikeCostume(form: string): boolean {
  return COSTUME_HINT.test(form);
}
