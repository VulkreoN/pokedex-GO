/**
 * Comprehensive French translation dictionary for Leek Duck / ScrapedDuck Pokémon GO live data:
 * event titles, bonuses, items, promo codes, weather, GO Battle League cups, field research tasks,
 * ticket & GO Pass rewards, section labels, highlight descriptions, summaries, forms, moves and dates.
 * Shared across the web UI, exported PNG/PDF infographics, and push notifications.
 */

export type SpeciesNames = Map<number, { name: { en: string; fr?: string } }>;
export type MoveNamesMap = Record<string, { en: string; fr?: string }>;

const TYPES_EN_FR: Record<string, string> = {
  normal: 'Normal',
  fire: 'Feu',
  water: 'Eau',
  grass: 'Plante',
  electric: 'Électrik',
  ice: 'Glace',
  fighting: 'Combat',
  poison: 'Poison',
  ground: 'Sol',
  flying: 'Vol',
  psychic: 'Psy',
  bug: 'Insecte',
  rock: 'Roche',
  ghost: 'Spectre',
  dragon: 'Dragon',
  dark: 'Ténèbres',
  steel: 'Acier',
  fairy: 'Fée',
};

const WEATHER_EN_FR: Record<string, string> = {
  sunny: 'Ensoleillé',
  clear: 'Dégagé',
  'partly cloudy': 'Partiellement nuageux',
  cloudy: 'Couvert',
  rainy: 'Pluvieux',
  rain: 'Pluvieux',
  snow: 'Neige',
  snowy: 'Neige',
  fog: 'Brouillard',
  foggy: 'Brouillard',
  windy: 'Vent',
  wind: 'Vent',
  extreme: 'Extrême',
};

/** Translates Pokémon GO weather names ("Partly Cloudy" -> "Partiellement nuageux"). */
export function weatherFr(name: string, lang = 'fr'): string {
  if (lang !== 'fr' || !name) return name;
  return WEATHER_EN_FR[name.trim().toLowerCase()] ?? name;
}

const moveCache = new WeakMap<MoveNamesMap, { exact: Map<string, string>; re: RegExp | null }>();

function getMoveMatcher(moveNames: MoveNamesMap) {
  let cached = moveCache.get(moveNames);
  if (!cached) {
    const exact = new Map<string, string>();
    for (const m of Object.values(moveNames)) {
      if (m.en && m.fr && m.fr !== m.en) exact.set(m.en.toLowerCase(), m.fr);
    }
    const keys = [...exact.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = keys.length ? new RegExp(`(?<![\\p{L}])(${keys.join('|')})(\\+{1,2})?(?![\\p{L}])`, 'giu') : null;
    cached = { exact, re };
    moveCache.set(moveNames, cached);
  }
  return cached;
}

/**
 * Translates an exact move name (including "+" / "++" apex/Super Max suffixes, e.g. "Moonblast+" -> "Pouvoir Lunaire +")
 * or every English Pokémon GO move mentioned inside a sentence.
 */
export function moveFr(raw: string, moveNames?: MoveNamesMap, lang = 'fr'): string {
  if (lang !== 'fr' || !moveNames || !raw) return raw;
  const { exact, re } = getMoveMatcher(moveNames);
  const trimmed = raw.trim();
  const plus = /^(.+?)(\+{1,2})$/.exec(trimmed);
  const base = (plus ? plus[1]! : trimmed).trim().toLowerCase();
  const hit = exact.get(base);
  if (hit) return plus ? `${hit} ${plus[2]}` : hit;
  if (!re) return raw;
  return raw.replace(re, (full, name: string, suffix?: string) => {
    const fr = exact.get(name.toLowerCase());
    if (!fr) return full;
    return suffix ? `${fr} ${suffix}` : fr;
  });
}

const REGION_FR: Record<string, string> = {
  Alolan: "d'Alola",
  Galarian: 'de Galar',
  Hisuian: 'de Hisui',
  Paldean: 'de Paldea',
};

/** Multi-word official Pokémon form translations (checked before single-word lookup). */
const MULTI_FORM_FR: [RegExp, string][] = [
  [/\bSingle Strike(?: Style)?\b/gi, 'Poing Final'],
  [/\bRapid Strike(?: Style)?\b/gi, 'Mille Poings'],
  [/\bIce Rider\b/gi, 'Cavalier du Froid'],
  [/\bShadow Rider\b/gi, 'Cavalier d’Effroi'],
  [/\bDusk Mane\b/gi, 'Crinière du Couchant'],
  [/\bDawn Wings\b/gi, 'Ailes de l’Aurore'],
  [/\bCrowned Sword\b/gi, 'Épée Suprême'],
  [/\bCrowned Shield\b/gi, 'Bouclier Suprême'],
  [/\bHero of Many Battles\b/gi, 'Héros Aguerri'],
  [/\bCombat Breed\b/gi, 'Race Combative'],
  [/\bBlaze Breed\b/gi, 'Race Flamboyante'],
  [/\bAqua Breed\b/gi, 'Race Aquatique'],
  [/\bWest Sea\b/gi, 'Mer Occident'],
  [/\bEast Sea\b/gi, 'Mer Orient'],
  [/\bRed Flower\b/gi, 'Fleur Rouge'],
  [/\bBlue Flower\b/gi, 'Fleur Bleue'],
  [/\bYellow Flower\b/gi, 'Fleur Jaune'],
  [/\bWhite Flower\b/gi, 'Fleur Blanche'],
  [/\bOrange Flower\b/gi, 'Fleur Orange'],
  [/\bRed-Striped\b/gi, 'Motif Rouge'],
  [/\bBlue-Striped\b/gi, 'Motif Bleu'],
  [/\bWhite-Striped\b/gi, 'Motif Blanc'],
  [/\bBaile Style\b/gi, 'Style Flamenco'],
  [/\bPom-Pom Style\b/gi, 'Style Pom-Pom'],
  [/\bPa['’]u Style\b/gi, 'Style Hula'],
  [/\bSensu Style\b/gi, 'Style Buyō'],
  [/\bLow Key\b/gi, 'Grave'],
  [/\bFull Belly\b/gi, 'Mode Rassasié'],
  [/\bLa Reine\b/gi, 'Reine'],
  [/\b10%\s*(?:Forme?)?\b/gi, '10 %'],
  [/\b50%\s*(?:Forme?)?\b/gi, '50 %'],
];

/** Official Pokémon GO French single-word form translations (exported for reuse in liveName). */
export const FORM_FR: Record<string, string> = {
  Normal: 'Normale',
  Attack: 'Attaque',
  Defense: 'Défense',
  Speed: 'Vitesse',
  Incarnate: 'Avatar',
  Therian: 'Totémique',
  Origin: 'Originelle',
  Altered: 'Alternative',
  Hero: 'Héros',
  Crowned: 'Suprême',
  Forme: '',
  Form: '',
  Formes: '',
  Forms: '',
  Style: '',
  Trim: '',
  Cloak: '',
  Size: '',
  Male: 'Mâle',
  Female: 'Femelle',
  Standard: 'Standard',
  Zen: 'Transe',
  Solo: 'Solitaire',
  School: 'Banc',
  Midday: 'Diurne',
  Midnight: 'Nocturne',
  Dusk: 'Crépusculaire',
  Dawn: 'Aurore',
  Single: 'Poing Final',
  Rapid: 'Mille Poings',
  Ice: 'Froid',
  Shadow: 'Effroi',
  Plant: 'Plante',
  Sandy: 'Sable',
  Trash: 'Déchet',
  Sunny: 'Solaire',
  Rainy: 'Eau de Pluie',
  Snowy: 'Blizzard',
  Overcast: 'Temps Couvert',
  Sunshine: 'Ensoleillé',
  West: 'Occident',
  East: 'Orient',
  Red: 'Rouge',
  Blue: 'Bleu',
  Yellow: 'Jaune',
  White: 'Blanc',
  Black: 'Noir',
  Orange: 'Orange',
  Green: 'Vert',
  Baile: 'Flamenco',
  Pom: 'Pom-Pom',
  Sensu: 'Buyō',
  Pa: 'Hula',
  Amped: 'Aigüe',
  Phony: 'Contrefaçon',
  Antique: 'Authentique',
  Hangry: 'Mode Affamé',
  Roaming: 'Marche',
  Chest: 'Coffre',
  Small: 'Mini',
  Average: 'Normale',
  Large: 'Maxi',
  Super: 'Ultra',
  Spring: 'Printemps',
  Summer: 'Été',
  Autumn: 'Automne',
  Winter: 'Hiver',
  Natural: 'Naturelle',
  Heart: 'Cœur',
  Star: 'Étoile',
  Diamond: 'Diamant',
  Debutante: 'Demoiselle',
  Matron: 'Madame',
  Dandy: 'Monsieur',
  Kabuki: 'Kabuki',
  Pharaoh: 'Pharaon',
  Confined: 'Enchaîné',
  Unbound: 'Déchaîné',
  Ordinary: 'Normal',
  Resolute: 'Décidé',
  Aria: 'Chant',
  Pirouette: 'Danse',
  Complete: 'Parfaite',
  Heat: 'Chaleur',
  Wash: 'Lavage',
  Frost: 'Froid',
  Fan: 'Hélice',
  Mow: 'Tonte',
  Curly: 'Courbée',
  Droopy: 'Affalée',
  Stretchy: 'Raide',
  Meteor: 'Météore',
  Core: 'Noyau',
};

/** Translates parenthetical Pokémon form labels ("Incarnate Forme" -> "Avatar", "Dusk Mane" -> "Crinière du Couchant"). */
export function formInnerFr(inner: string): string {
  let out = inner;
  for (const [re, fr] of MULTI_FORM_FR) out = out.replace(re, fr);
  return out
    .split(/(\s+|,)/)
    .map((w) => FORM_FR[w] ?? w)
    .join('')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,? and /g, ' et ')
    .trim();
}

const MONTHS_FR: Record<string, string> = {
  January: 'janvier',
  February: 'février',
  March: 'mars',
  April: 'avril',
  May: 'mai',
  June: 'juin',
  July: 'juillet',
  August: 'août',
  September: 'septembre',
  October: 'octobre',
  November: 'novembre',
  December: 'décembre',
  Jan: 'janv.',
  Feb: 'févr.',
  Mar: 'mars',
  Apr: 'avr.',
  Jun: 'juin',
  Jul: 'juil.',
  Aug: 'août',
  Sep: 'sept.',
  Sept: 'sept.',
  Oct: 'oct.',
  Nov: 'nov.',
  Dec: 'déc.',
};

const WEEKDAYS_FR: Record<string, string> = {
  Monday: 'lundi',
  Tuesday: 'mardi',
  Wednesday: 'mercredi',
  Thursday: 'jeudi',
  Friday: 'vendredi',
  Saturday: 'samedi',
  Sunday: 'dimanche',
};

/** Official Pokémon GO French dictionary for items, resources, mechanics and event vocabulary. */
export const EVENT_ITEMS_FR: Record<string, string> = {
  'poké ball': 'Poké Ball',
  'poké balls': 'Poké Balls',
  'poke ball': 'Poké Ball',
  'poke balls': 'Poké Balls',
  'great ball': 'Super Ball',
  'great balls': 'Super Balls',
  'ultra ball': 'Hyper Ball',
  'ultra balls': 'Hyper Balls',
  'premier ball': 'Honor Ball',
  'premier balls': 'Honor Balls',
  'master ball': 'Master Ball',
  'razz berry': 'Baie Framby',
  'razz berries': 'Baies Framby',
  'golden razz berry': 'Baie Framby dorée',
  'golden razz berries': 'Baies Framby dorées',
  'nanab berry': 'Baie Nanab',
  'nanab berries': 'Baies Nanab',
  'pinap berry': 'Baie Nanana',
  'pinap berries': 'Baies Nanana',
  'silver pinap berry': 'Baie Nanana argentée',
  'silver pinap berries': 'Baies Nanana argentées',
  'stardust': 'Poussières Étoile',
  'xp': 'PX',
  'candy': 'Bonbons',
  'candy xl': 'Bonbons L',
  'xl candy': 'Bonbons L',
  'rare candy': 'Super Bonbon',
  'rare candies': 'Super Bonbons',
  'rare candy xl': 'Super Bonbon L',
  'lucky egg': 'Œuf Chance',
  'lucky eggs': 'Œufs Chance',
  'star piece': 'Morceau d’Étoile',
  'star pieces': 'Morceaux d’Étoile',
  'incense': 'Encens',
  'daily adventure incense': 'Encens d’aventure quotidienne',
  'lure module': 'Module Leurre',
  'lure modules': 'Modules Leurre',
  'glacial lure module': 'Module Leurre Glacial',
  'mossy lure module': 'Module Leurre Moussu',
  'magnetic lure module': 'Module Leurre Magnétique',
  'rainy lure module': 'Module Leurre Pluvieux',
  'golden lure module': 'Module Leurre Doré',
  'egg incubator': 'Incubateur',
  'egg incubators': 'Incubateurs',
  'incubator': 'Incubateur',
  'incubators': 'Incubateurs',
  'super incubator': 'Super-Incubateur',
  'super incubators': 'Super-Incubateurs',
  'raid pass': 'Passe de Raid',
  'raid passes': 'Passes de Raid',
  'premium battle pass': 'Passe de combat premium',
  'premium battle passes': 'Passes de combat premium',
  'remote raid pass': 'Passe de Raid à distance',
  'remote raid passes': 'Passes de Raid à distance',
  'rocket radar': 'Radar Rocket',
  'rocket radars': 'Radars Rocket',
  'super rocket radar': 'Super Radar Rocket',
  'mysterious component': 'Élément mystérieux',
  'mysterious components': 'Éléments mystérieux',
  'fast tm': 'CT Attaque Immédiate',
  'fast tms': 'CT Attaque Immédiate',
  'charged tm': 'CT Attaque Chargée',
  'charged tms': 'CT Attaque Chargée',
  'elite fast tm': 'CT Attaque Immédiate d’élite',
  'elite fast tms': 'CT Attaque Immédiate d’élite',
  'elite charged tm': 'CT Attaque Chargée d’élite',
  'elite charged tms': 'CT Attaque Chargée d’élite',
  'poffin': 'Poffin',
  'poffins': 'Poffins',
  'sinnoh stone': 'Pierre Sinnoh',
  'sinnoh stones': 'Pierres Sinnoh',
  'unova stone': 'Pierre Unys',
  'unova stones': 'Pierres Unys',
  'sun stone': 'Pierre Soleil',
  'king’s rock': 'Roche Royale',
  "king's rock": 'Roche Royale',
  'metal coat': 'Peau Métal',
  'dragon scale': 'Écaille Draco',
  'up-grade': 'Améliorator',
  'max particles': 'Particules Max',
  'max particle pack': 'Lot de Particules Max',
  'max particle packs': 'Lots de Particules Max',
  'max mushroom': 'Champi Max',
  'max mushrooms': 'Champis Max',
  'golden bottle cap': 'Capsule d’Or',
  'silver bottle cap': 'Capsule d’Argent',
  'lucky trinket': 'Babiole Chance',
  'pokécoins': 'PokéPièces',
  'pokecoins': 'PokéPièces',
  'potion': 'Potion',
  'super potion': 'Super Potion',
  'hyper potion': 'Hyper Potion',
  'max potion': 'Potion Max',
  'max potions': 'Potions Max',
  'revive': 'Rappel',
  'revives': 'Rappels',
  'max revive': 'Rappel Max',
  'max revives': 'Rappels Max',
  'meteorite': 'Météorite',
  'event-themed stickers': 'Stickers de l’événement',
  'stickers': 'Stickers',
  'avatar item': 'Objet d’avatar',
  'avatar items': 'Objets d’avatar',
  'avatar pose': 'Pose d’avatar',
  'timed research': 'Étude ponctuelle',
  'special research': 'Étude spéciale',
  'field research': 'Étude de terrain',
  'collection challenge': 'Défi de collection',
  'collection challenges': 'Défis de collection',
};

const enToFr = new WeakMap<SpeciesNames, [RegExp, Map<string, string>]>();

/** Every Pokémon named in a phrase, in French: "Shadow Tornadus (Incarnate Forme)" -> "Boréas (Avatar) obscur". */
export function monsFr(text: string, species: SpeciesNames | undefined): string {
  if (!species) return text;
  let cached = enToFr.get(species);
  if (!cached) {
    const map = new Map<string, string>();
    for (const s of species.values()) if (s.name.fr && s.name.fr !== s.name.en) map.set(s.name.en, s.name.fr);
    const names = [...map.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    cached = [new RegExp(`(?<![\\p{L}])(${names.join('|')})(?![\\p{L}])`, 'gu'), map];
    enToFr.set(species, cached);
  }
  const [re, map] = cached;
  return text
    .replace(re, (n) => map.get(n) ?? n)
    .replace(/\(([^)]*)\)/g, (_, inner: string) => {
      const mapped = formInnerFr(inner);
      return mapped ? `(${mapped})` : '';
    })
    .replace(/\bMega (\p{L}[\p{L}-]*)/gu, 'Méga-$1')
    .replace(/\bPrimal (\p{L}[\p{L}-]*)/gu, 'Primo-$1')
    .replace(/\bGigantamax (\p{L}[\p{L}-]*)/gu, '$1 Gigamax')
    .replace(/\bDynamax (\p{L}[\p{L}-]*)/gu, '$1 Dynamax')
    .replace(/\b(Alolan|Galarian|Hisuian|Paldean) (\p{L}[\p{L}-]*)/gu, (_, r: string, n: string) => `${n} ${REGION_FR[r]}`)
    .replace(
      /\bShadow (?!Raids?\b|Ball\b|Claw\b|Punch\b|Sneak\b|Force\b|Bone\b|Shard\b|Storm\b|Rush\b|End\b|Blitz\b|Rider\b|Pok[eé]mon\b)((?:M\.\s+\p{L}+|\p{L}[\p{L}.'-]*(?:\s+Jr\.)?)(?: (?:d['’]Alola|de Galar|de Hisui|de Paldea))?(?: \([^)]*\))?)/gu,
      '$1 obscur',
    )
    .replace(/,? and /g, ' et ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const CUP_THEME_FR: Record<string, string> = {
  little: 'Jeune',
  holiday: 'Fêtes',
  sunshine: 'Soleil',
  retro: 'Rétro',
  fantasy: 'Fantaisie',
  catch: 'Attrape',
  summer: 'Été',
  spring: 'Printemps',
  autumn: 'Automne',
  winter: 'Hiver',
  love: 'Amour',
  color: 'Couleurs',
  colour: 'Couleurs',
  element: 'Élément',
  weather: 'Météo',
  evolution: 'Évolution',
  fighting: 'Combat',
  flying: 'Vol',
  psychic: 'Psy',
  electric: 'Électrik',
  fossil: 'Fossile',
  willpower: 'Volonté',
  scroll: 'Parchemin',
  mountain: 'Montagne',
  'single-type': 'Type unique',
  'single type': 'Type unique',
  unova: 'Unys',
  halloween: 'Halloween',
  jungle: 'Jungle',
  kanto: 'Kanto',
  johto: 'Johto',
  hoenn: 'Hoenn',
  sinnoh: 'Sinnoh',
  hisui: 'Hisui',
  galar: 'Galar',
  alola: 'Alola',
  paldea: 'Paldea',
};

/**
 * Translates GO Battle League league & cup names into natural French:
 * - "Holiday Cup: Great League Edition" -> "Coupe Fêtes : édition Ligue Super"
 * - "Little Catch Cup" -> "Coupe Attrape Jeune"
 * - "Master Premier" -> "Ligue Master Premier"
 * - "Great League: Mega Edition" -> "Ligue Super : édition Méga"
 */
export function cupNameFr(cup: string, lang = 'fr'): string {
  if (lang !== 'fr' || !cup) return cup;
  const league = (s: string) =>
    s
      .replace(/\bMega Master League\b/gi, 'Ligue Master Méga')
      .replace(/\bMega Great League\b/gi, 'Ligue Super Méga')
      .replace(/\bMega Ultra League\b/gi, 'Ligue Hyper Méga')
      .replace(/\bGreat League\b/gi, 'Ligue Super')
      .replace(/\bUltra League\b/gi, 'Ligue Hyper')
      .replace(/\bMaster League\b/gi, 'Ligue Master')
      .replace(/\bMaster Premier\b/gi, 'Ligue Master Premier')
      .replace(/\bUltra Premier\b/gi, 'Ligue Hyper Premier')
      .replace(/\bGreat Premier\b/gi, 'Ligue Super Premier');

  const [rawHead, rawEdition] = cup.split(/:\s*/);
  let head = league(rawHead!.trim());
  const cupMatch = /^(.+?)\s+Cup(?:\s+(Remix|Classic|Premier))?$/i.exec(head);
  if (cupMatch) {
    const themeRaw = cupMatch[1]!.trim();
    const suffix = cupMatch[2] ? ` ${cupMatch[2]}` : '';
    const direct = CUP_THEME_FR[themeRaw.toLowerCase()];
    if (direct) {
      head = `Coupe ${direct}${suffix}`;
    } else if (/^Little\s+(.+)$/i.test(themeRaw)) {
      const inner = themeRaw.replace(/^Little\s+/i, '').trim();
      const mapped = CUP_THEME_FR[inner.toLowerCase()] ?? inner;
      head = `Coupe ${mapped} Jeune${suffix}`;
    } else {
      head = `Coupe ${themeRaw}${suffix}`;
    }
  }
  if (!rawEdition) return head;
  const ed = league(rawEdition.trim().replace(/\s+Edition$/i, ''))
    .replace(/^Mega$/i, 'Méga')
    .replace(/^Little$/i, 'Jeune');
  return `${head} : édition ${ed}`;
}

/** Translates PvPoke / GBL season preview titles ("Season 26 Update" -> "Mise à jour Saison 26"). */
export function gblSeasonFr(title: string, lang = 'fr'): string {
  if (lang !== 'fr' || !title) return title;
  const s = title.trim();
  const upd = /^Season (\d+)\s+Update$/i.exec(s);
  if (upd) return `Mise à jour Saison ${upd[1]}`;
  const prev = /^Season (\d+)\s+Preview$/i.exec(s);
  if (prev) return `Aperçu Saison ${prev[1]}`;
  return s
    .replace(/\bSeason (\d+)\b/gi, 'Saison $1')
    .replace(/\bNext Season\b/gi, 'Prochaine saison')
    .replace(/\bPreview\b/gi, 'Aperçu')
    .replace(/\bUpdate\b/gi, 'Mise à jour');
}

const EVENT_FR: [RegExp, (m: RegExpExecArray, mons: (s: string) => string) => string][] = [
  // The game's own names (its French texts): « Heure du Pokémon vedette », « Journée Combat Dynamax »…
  [/^(.+) Spotlight Hour$/, (m, f) => `Heure du Pokémon vedette : ${f(m[1]!)}`],
  [/^Unannounced Raid Hour$/, () => 'Heure de Raids : à annoncer'],
  [/^(.+) Raid Hour$/, (m, f) => `Heure de Raids : ${f(m[1]!)}`],
  [/^Unannounced Pokémon in (\d)-star Raid Battles$/, (m) => `Pokémon à annoncer dans les Raids ${m[1]} étoiles`],
  [/^(.+) in (\d)-star Raid Battles$/, (m, f) => `${f(m[1]!)} dans les Raids ${m[2]} étoiles`],
  [/^(.+) in Mega Raids$/, (m, f) => `${f(m[1]!)} dans les Méga-Raids`],
  [/^(.+) in Shadow Raids$/, (m, f) => `${f(m[1]!)} dans les Raids obscurs`],
  [/^Dynamax (.+) during Max Monday$/, (m, f) => `Lundi Max : ${f(m[1]!)} Dynamax`],
  [/^Super Mega Raid Day$/, () => 'Super Journée de Méga-Raids'],
  [/^(.+) Super Mega Raid Day$/, (m, f) => `Super Journée de Méga-Raids : ${f(m[1]!)}`],
  [/^Shadow Raid Day$/, () => 'Journée de Raids obscurs'],
  [/^(.+) Shadow Raid Day$/, (m, f) => `Journée de Raids obscurs : ${f(m[1]!)}`],
  [/^Shadow Raid Weekend$/, () => 'Week-end de Raids obscurs'],
  [/^(.+) Shadow Raid Weekend$/, (m, f) => `Week-end de Raids obscurs : ${f(m[1]!)}`],
  [/^Mega Raid Day$/, () => 'Journée de Méga-Raids'],
  [/^(.+) Mega Raid Day$/, (m, f) => `Journée de Méga-Raids : ${f(m[1]!)}`],
  [/^Raid Day$/, () => 'Journée de Raids'],
  [/^(.+) Raid Day$/, (m, f) => `Journée de Raids : ${f(m[1]!)}`],
  [/^Raid Weekend$/, () => 'Week-end de Raids'],
  [/^(.+) Raid Weekend$/, (m, f) => `Week-end de Raids : ${f(m[1]!)}`],
  [/^(\w+) Community Day Classic( \d{4})?$/, (m) => `Classiques de la Journée Communauté de ${MONTHS_FR[m[1]!] ?? m[1]}${m[2] ?? ''}`],
  [/^(\w+) Community Day( \d{4})?$/, (m) => `Journée Communauté de ${MONTHS_FR[m[1]!] ?? m[1]}${m[2] ?? ''}`],
  [/^(.+) Community Day Classic( \d{4})?$/, (m, f) => `Journée Communauté classique : ${f(m[1]!)}${m[2] ?? ''}`],
  [/^(.+) Community Day( \d{4})?$/, (m, f) => `Journée Communauté : ${f(m[1]!)}${m[2] ?? ''}`],
  [/^Max Battle Day$/, () => 'Journée Combat Dynamax'],
  [/^Max Battle Weekend$/, () => 'Week-end Combat Dynamax'],
  [/^Gigantamax (.+) Max Battle (Day|Weekend)$/, (m, f) => (m[2] === 'Weekend' ? `Week-end Combat Gigamax : ${f(m[1]!)}` : `Journée Combat Gigamax : ${f(m[1]!)}`)],
  [/^Dynamax (.+) Max Battle (Day|Weekend)$/, (m, f) => (m[2] === 'Weekend' ? `Week-end Combat Dynamax : ${f(m[1]!)}` : `Journée Combat Dynamax : ${f(m[1]!)}`)],
  [/^(.+) Max Battle (Day|Weekend)$/, (m, f) => (m[2] === 'Weekend' ? `Week-end Combat Dynamax : ${f(m[1]!)}` : `Journée Combat Dynamax : ${f(m[1]!)}`)],
  [/^GO Pass: (\w+)( \d{4})?$/, (m) => `GO Pass : ${MONTHS_FR[m[1]!] ?? m[1]}${m[2] ?? ''}`],
  [/^GO Pass Deluxe: (\w+)( \d{4})?$/, (m) => `GO Pass Deluxe : ${MONTHS_FR[m[1]!] ?? m[1]}${m[2] ?? ''}`],
  [/^Choose Your Path: (.+) \((\w+) (\d+), (\d{4})\)$/, (m) => `Choisis ta voie : ${m[1]} (${m[3]} ${MONTHS_FR[m[2]!] ?? m[2]} ${m[4]})`],
  [/^Minior Showers: (.+)$/, (m) => `Pluie de Météno : ${m[1]}`],
  [/^Hatch Day$/, () => 'Journée Éclosion'],
  [/^(.+) Hatch Day$/, (m, f) => `Journée Éclosion : ${f(m[1]!)}`],
  [/^Research Day$/, () => 'Journée Étude'],
  [/^(.+) Research Day$/, (m, f) => `Journée Étude : ${f(m[1]!)}`],
  [/^Incense Day(?:: (.+))?$/, (m, f) => (m[1] ? `Journée Encens : ${f(m[1])}` : 'Journée Encens')],
  [/^Catch Mastery(?:: (.+))?$/, (m, f) => (m[1] ? `Maîtrise de capture : ${f(m[1])}` : 'Maîtrise de capture')],
  [/^Team GO Rocket Takeover$/, () => 'Offensive de la Team GO Rocket'],
  [/^GO Battle (Day|Weekend)(?:: (.+))?$/, (m, f) => `${m[1] === 'Weekend' ? 'Week-end' : 'Journée'} Combat GO${m[2] ? ` : ${f(m[2])}` : ''}`],
  [/^Pok[eé]Stop Showcase(?:: (.+))?$/, (m, f) => (m[1] ? `Concours PokéStop : ${f(m[1])}` : 'Concours PokéStop')],
  [/^New Year's (\d{4})$/, (m) => `Nouvel An ${m[1]}`],
  [/^Winter Holiday (\d{4})(?: Part (\d))?$/, (m) => `Fêtes de fin d’année ${m[1]}${m[2] ? ` (partie ${m[2]})` : ''}`],
  [/^Halloween (\d{4})(?: Part (\d))?$/, (m) => `Halloween ${m[1]}${m[2] ? ` (partie ${m[2]})` : ''}`],
  [/^Unannounced Event$/, () => 'Événement à annoncer'],
  [/^(.+) Timed Research$/, (m, f) => `Étude ponctuelle : ${f(m[1]!)}`],
  [/^(.+) Special Research$/, (m, f) => `Étude spéciale : ${f(m[1]!)}`],
];

/** Leek Duck's event names, in French for the kinds that come back every week; others as they are. */
export function eventTitle(name: string, species: SpeciesNames | undefined, lang: string): string {
  if (lang !== 'fr') return name;
  for (const [re, fr] of EVENT_FR) {
    const m = re.exec(name);
    if (m) return fr(m, (s) => monsFr(s, species));
  }
  // GO Battle League schedule entries ("Great League, Holiday Cup: Great League Edition | Season")
  if (/\b(?:Great League|Ultra League|Master League|Master Premier|Ultra Premier|Cup)\b/.test(name)) {
    const [cupsPart] = name.split(' | ');
    const cups = cupsPart!
      .split(/,\s*(?:and\s+)?|\s+and\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((c) => cupNameFr(c, 'fr'));
    if (cups.length) return cups.join(' · ');
  }
  return name;
}

const NUM_WORD: Record<string, string> = {
  a: '1',
  an: '1',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  twenty: '20',
};
const numWord = (w: string) => NUM_WORD[w.toLowerCase()] ?? w;
const isOne = (n: string) => numWord(n) === '1';

/** Converts English 12h clock ("2:00 p.m.", "12:00 a.m.") to French 24h ("14h00", "00h00"). */
function time12To24Fr(s: string): string {
  return s.replace(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.m\.?|p\.m\.?|am\b|pm\b)/gi, (_, hRaw: string, minRaw: string | undefined, mer: string) => {
    let h = Number(hRaw);
    const pm = mer.toLowerCase().startsWith('p');
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    const min = minRaw ?? '00';
    return `${String(h).padStart(2, '0')}h${min}`;
  });
}

/** Converts English month/day date fragments into natural French ("December 5, 2026" -> "5 décembre 2026"). */
function datesToFr(s: string): string {
  return time12To24Fr(s)
    .replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?/g,
      (_, mo: string, day: string, yr?: string) => `${day} ${MONTHS_FR[mo] ?? mo}${yr ? ` ${yr}` : ''}`,
    )
    .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, (wd) => WEEKDAYS_FR[wd] ?? wd)
    .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche),\s*(\d)/gi, '$1 $2')
    .replace(/\blocal time\b/gi, 'heure locale');
}

/** Translates a standalone item or quantity + item ("3 Premium Battle Passes" -> "3 Passes de combat premium"). */
function itemQuantityFr(clean: string, species?: SpeciesNames): string | null {
  const exact = EVENT_ITEMS_FR[clean.toLowerCase()];
  if (exact) return exact;

  // Handle "10× Poké Ball" or "2x Incubator" (items only, never bonus multipliers like "2× Catch Candy")
  const mulMatch = /^([\d,]+)\s*[×x]\s+(.+)$/i.exec(clean);
  if (mulMatch) {
    const qty = mulMatch[1]!.replace(/,/g, ' ');
    const rest = mulMatch[2]!.trim();
    const mapped = EVENT_ITEMS_FR[rest.toLowerCase()];
    if (mapped) return `${qty}× ${mapped}`;
    const mega = /^(.+?)\s+Mega Energy$/i.exec(rest);
    if (mega) return `${qty}× Méga-Énergie ${monsFr(mega[1]!, species)}`;
    const candy = /^(.+?)\s+Candy XL$/i.exec(rest);
    if (candy) return `${qty}× Bonbons L ${monsFr(candy[1]!, species)}`;
    const candyBase = /^(.+?)\s+Candy$/i.exec(rest);
    if (candyBase) return `${qty}× Bonbons ${monsFr(candyBase[1]!, species)}`;
    return null;
  }

  const qtyMatch = /^([\d,]+)\s+(.+)$/i.exec(clean);
  if (qtyMatch) {
    const qty = qtyMatch[1]!.replace(/,/g, ' ');
    const rest = qtyMatch[2]!.trim();
    const mapped = EVENT_ITEMS_FR[rest.toLowerCase()];
    if (mapped) return `${qty} ${mapped}`;
    const mega = /^(.+?)\s+Mega Energy$/i.exec(rest);
    if (mega) return `${qty} Méga-Énergie ${monsFr(mega[1]!, species)}`;
    const candy = /^(.+?)\s+Candy XL$/i.exec(rest);
    if (candy) return `${qty} Bonbons L ${monsFr(candy[1]!, species)}`;
    const candyBase = /^(.+?)\s+Candy$/i.exec(rest);
    if (candyBase) return `${qty} Bonbons ${monsFr(candyBase[1]!, species)}`;
  }
  return null;
}

/**
 * Translates Pokémon GO Field Research and GO Pass tasks into natural French when the game master
 * text templates do not have an exact match (or when falling back to ScrapedDuck).
 */
export function researchTaskFr(raw: string, species?: SpeciesNames, lang = 'fr'): string {
  if (lang !== 'fr' || !raw) return raw;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  let prefix = '';
  let body = trimmed;
  const pref = /^(Event|AR Mapping|Sponsored|Bonus):\s*(.+)$/i.exec(body);
  if (pref) {
    const p = pref[1]!.toLowerCase();
    prefix = p === 'event' ? 'Événement : ' : p === 'ar mapping' ? 'Scan RA : ' : p === 'sponsored' ? 'Sponsorisé : ' : 'Bonus : ';
    body = pref[2]!.trim();
  }

  const typeFr = (t: string) => TYPES_EN_FR[t.toLowerCase()] ?? t;
  const mons = (x: string) => monsFr(x, species);
  const throwAdj = (kind: string, plural: boolean) => {
    const k = kind.toLowerCase();
    if (k === 'nice') return plural ? 'Jolis' : 'Joli';
    if (k === 'great') return 'Super';
    return plural ? 'Excellents' : 'Excellent';
  };
  const rocketWho = (w: string, plural: boolean) => {
    const k = w.toLowerCase();
    if (k.startsWith('leader')) return plural ? 'chefs de la Team GO Rocket' : 'chef de la Team GO Rocket';
    if (k.startsWith('member')) return plural ? 'membres de la Team GO Rocket' : 'membre de la Team GO Rocket';
    return plural ? 'sbires de la Team GO Rocket' : 'sbire de la Team GO Rocket';
  };
  const berryFr = (rawBerry: string | undefined, plural: boolean) => {
    const b = (rawBerry ?? '').trim().toLowerCase();
    if (!b) return plural ? 'Baies' : 'Baie';
    if (b.includes('golden razz')) return plural ? 'Baies Framby dorées' : 'Baie Framby dorée';
    if (b.includes('silver pinap')) return plural ? 'Baies Nanana argentées' : 'Baie Nanana argentée';
    if (b.includes('razz')) return plural ? 'Baies Framby' : 'Baie Framby';
    if (b.includes('nanab')) return plural ? 'Baies Nanab' : 'Baie Nanab';
    if (b.includes('pinap')) return plural ? 'Baies Nanana' : 'Baie Nanana';
    return plural ? 'Baies' : 'Baie';
  };

  const rules: [RegExp, (m: RegExpExecArray) => string][] = [
    // Catching
    [/^Catch (\d+|a|an|one) ([A-Za-z]+)-?\s+or\s+([A-Za-z]+)-type Pok[eé]mon$/i, (m) => `Attrape ${numWord(m[1]!)} Pokémon de type ${typeFr(m[2]!)} ou ${typeFr(m[3]!)}`],
    [/^Catch (\d+|a|an|one) ([A-Za-z]+)-type Pok[eé]mon$/i, (m) => `Attrape ${numWord(m[1]!)} Pokémon de type ${typeFr(m[2]!)}`],
    [/^Catch (\d+|a|an|one) Weather Boosted Pok[eé]mon$/i, (m) => `Attrape ${numWord(m[1]!)} Pokémon boosté${isOne(m[1]!) ? '' : 's'} par la météo`],
    [/^Catch (\d+|a|an|one) Pok[eé]mon with Weather Boost$/i, (m) => `Attrape ${numWord(m[1]!)} Pokémon boosté${isOne(m[1]!) ? '' : 's'} par la météo`],
    [/^Catch (\d+|a|an|one) different species of Pok[eé]mon$/i, (m) => `Attrape ${numWord(m[1]!)} espèces différentes de Pokémon`],
    [/^Catch (\d+|a|an|one) Pok[eé]mon in a single day$/i, (m) => `Attrape ${numWord(m[1]!)} Pokémon en une journée`],
    [/^Catch (\d+|a|an|one) Pok[eé]mon$/i, (m) => `Attrape ${numWord(m[1]!)} Pokémon`],
    [/^Catch (?:a|an) (.+)$/i, (m) => `Attrape ${mons(m[1]!)}`],
    [/^Use (\d+|a|an|one) (.+?\s)?Berr(?:y|ies) to help catch Pok[eé]mon$/i, (m) => `Utilise ${numWord(m[1]!)} ${berryFr(m[2], !isOne(m[1]!))} pour attraper des Pokémon`],
    // Throwing
    [/^Make (\d+|a|an|one) (Nice|Great|Excellent)( Curveball)? Throws?( in a row)?$/i, (m) => {
      const n = numWord(m[1]!);
      const pl = n !== '1';
      return `Fais ${n} ${throwAdj(m[2]!, pl)} lancer${pl ? 's' : ''}${m[3] ? ' à effet' : ''}${m[4] ? ' à la suite' : ''}`;
    }],
    [/^Make (\d+|a|an|one) Curveball Throws?( in a row)?$/i, (m) => {
      const n = numWord(m[1]!);
      const pl = n !== '1';
      return `Fais ${n} lancer${pl ? 's' : ''} à effet${m[2] ? ' à la suite' : ''}`;
    }],
    [/^Make (\d+|a|an|one) Throws?( in a row)?$/i, (m) => {
      const n = numWord(m[1]!);
      const pl = n !== '1';
      return `Fais ${n} lancer${pl ? 's' : ''}${m[2] ? ' à la suite' : ''}`;
    }],
    // Power up / evolve / purify / transfer / trade / mega
    [/^Power up (?:a|an) ([A-Za-z]+)-type Pok[eé]mon (\d+) times?$/i, (m) => `Recharge un Pokémon de type ${typeFr(m[1]!)} ${m[2]} fois`],
    [/^Power up Pok[eé]mon (\d+) times?$/i, (m) => `Recharge un Pokémon ${m[1]} fois`],
    [/^Evolve (\d+|a|an|one) ([A-Za-z]+)-type Pok[eé]mon$/i, (m) => `Fais évoluer ${numWord(m[1]!)} Pokémon de type ${typeFr(m[2]!)}`],
    [/^Evolve (\d+|a|an|one) Pok[eé]mon$/i, (m) => `Fais évoluer ${numWord(m[1]!)} Pokémon`],
    [/^Evolve (?:a|an) (.+)$/i, (m) => `Fais évoluer ${mons(m[1]!)}`],
    [/^Purify (\d+|a|an|one) Shadow Pok[eé]mon$/i, (m) => `Purifie ${numWord(m[1]!)} Pokémon obscur${isOne(m[1]!) ? '' : 's'}`],
    [/^Transfer (\d+) Pok[eé]mon$/i, (m) => `Transfère ${m[1]} Pokémon`],
    [/^Trade (\d+|a|an|one) Pok[eé]mon$/i, (m) => `Échange ${numWord(m[1]!)} Pokémon`],
    [/^Mega Evolve (?:a|an) Pok[eé]mon(?: (\d+) times?)?$/i, (m) => `Fais Méga-Évoluer un Pokémon${m[1] ? ` ${m[1]} fois` : ''}`],
    // Explore / Spin / Hatch / Gifts / Routes
    [/^Spin (\d+|a|an|one) Pok[eé]Stops? or Gyms?$/i, (m) => `Fais tourner ${numWord(m[1]!)} ${isOne(m[1]!) ? 'PokéStop ou Arène' : 'PokéStops ou Arènes'}`],
    [/^Spin (\d+|a|an|one) Pok[eé]Stops? you haven['’]t visited before$/i, (m) => `Fais tourner ${numWord(m[1]!)} nouveau${isOne(m[1]!) ? '' : 'x'} PokéStop${isOne(m[1]!) ? '' : 's'}`],
    [/^Spin (\d+|a|an|one) Pok[eé]Stops?$/i, (m) => `Fais tourner ${numWord(m[1]!)} PokéStop${isOne(m[1]!) ? '' : 's'}`],
    [/^Hatch (\d+|a|an|one) Eggs?$/i, (m) => `Fais éclore ${numWord(m[1]!)} Œuf${isOne(m[1]!) ? '' : 's'}`],
    [/^Explore (\d+(?:\.\d+)?)\s*km$/i, (m) => `Explore ${m[1]} km`],
    [/^Walk (\d+(?:\.\d+)?)\s*km$/i, (m) => `Marche ${m[1]} km`],
    [/^Send (\d+|a|an|one) Gifts?(?: to friends)? and add a sticker to each$/i, (m) => `Envoie ${numWord(m[1]!)} cadeau${isOne(m[1]!) ? '' : 'x'} avec un sticker`],
    [/^Send (\d+|a|an|one) Gifts?(?: to friends)?$/i, (m) => `Envoie ${numWord(m[1]!)} cadeau${isOne(m[1]!) ? '' : 'x'}`],
    [/^Open (\d+|a|an|one) Gifts?$/i, (m) => `Ouvre ${numWord(m[1]!)} cadeau${isOne(m[1]!) ? '' : 'x'}`],
    [/^Make (\d+|a|an|one) new friends?$/i, (m) => `Fais-toi ${numWord(m[1]!)} ${isOne(m[1]!) ? 'nouvel ami' : 'nouveaux amis'}`],
    [/^(?:Follow|Complete) (\d+|a|an|one) Routes?$/i, (m) => `Termine ${numWord(m[1]!)} Route${isOne(m[1]!) ? '' : 's'}`],
    [/^Complete (\d+|a|an|one) Field Research tasks?$/i, (m) => `Termine ${numWord(m[1]!)} Étude${isOne(m[1]!) ? '' : 's'} de terrain`],
    [/^Complete (\d+|a|an|one) Party Challenges?$/i, (m) => `Termine ${numWord(m[1]!)} Défi${isOne(m[1]!) ? '' : 's'} de jeu en équipe`],
    // Buddy & Snapshots
    [/^Earn (\d+|a|an|one) Cand(?:y|ies) (?:walking|exploring) with your buddy$/i, (m) => `Gagne ${numWord(m[1]!)} Bonbon${isOne(m[1]!) ? '' : 's'} en marchant avec ton copain`],
    [/^Earn (\d+|a|an|one) hearts? with your buddy$/i, (m) => `Gagne ${numWord(m[1]!)} cœur${isOne(m[1]!) ? '' : 's'} avec ton copain`],
    [/^Give your buddy (\d+|a|an|one) treats?$/i, (m) => `Donne ${numWord(m[1]!)} friandise${isOne(m[1]!) ? '' : 's'} à ton copain`],
    [/^Play with your buddy(?: (\d+) times?)?$/i, (m) => `Joue avec ton copain${m[1] ? ` ${m[1]} fois` : ''}`],
    [/^Take snapshots? of (\d+) different wild ([A-Za-z]+)-type Pok[eé]mon$/i, (m) => `Prends des clichés GO de ${m[1]} Pokémon sauvages de type ${typeFr(m[2]!)} différents`],
    [/^Take snapshots? of (\d+) different wild Pok[eé]mon$/i, (m) => `Prends des clichés GO de ${m[1]} Pokémon sauvages différents`],
    [/^Take (\d+|a|an|one) snapshots? of (?:a )?wild ([A-Za-z]+)-type Pok[eé]mon$/i, (m) => `Prends ${numWord(m[1]!)} cliché${isOne(m[1]!) ? '' : 's'} GO d’un Pokémon sauvage de type ${typeFr(m[2]!)}`],
    [/^Take (\d+|a|an|one) snapshots? of (?:a )?wild Pok[eé]mon$/i, (m) => `Prends ${numWord(m[1]!)} cliché${isOne(m[1]!) ? '' : 's'} GO d’un Pokémon sauvage`],
    [/^Take (\d+|a|an|one) snapshots? of your buddy$/i, (m) => `Prends ${numWord(m[1]!)} cliché${isOne(m[1]!) ? '' : 's'} GO de ton copain`],
    [/^Take (\d+|a|an|one) snapshots? of (.+)$/i, (m) => `Prends ${numWord(m[1]!)} cliché${isOne(m[1]!) ? '' : 's'} GO de ${mons(m[2]!)}`],
    // Battles, Raids, Rocket, Max
    [/^Win (\d+|a|an|one) (\w+)-star raids?( or higher)?$/i, (m) => `Gagne ${numWord(m[1]!)} Raid${isOne(m[1]!) ? '' : 's'} ${numWord(m[2]!)}★${m[3] ? ' ou plus' : ''}`],
    [/^Win (\d+|a|an|one) raids? in under (\d+) seconds$/i, (m) => `Gagne ${numWord(m[1]!)} Raid${isOne(m[1]!) ? '' : 's'} en moins de ${m[2]} s`],
    [/^Win (\d+|a|an|one) raids?$/i, (m) => `Gagne ${numWord(m[1]!)} Raid${isOne(m[1]!) ? '' : 's'}`],
    [/^Battle in (\d+|a|an|one) raids?$/i, (m) => `Participe à ${numWord(m[1]!)} Raid${isOne(m[1]!) ? '' : 's'}`],
    [/^Win (\d+|a|an|one) Gym battles?$/i, (m) => `Gagne ${numWord(m[1]!)} combat${isOne(m[1]!) ? '' : 's'} d’Arène`],
    [/^Battle in a Gym(?: (\d+) times?)?$/i, (m) => `Combats dans une Arène${m[1] ? ` ${m[1]} fois` : ''}`],
    [/^Use a supereffective Charged Attack in (\d+) Gym battles?$/i, (m) => `Utilise une Attaque Chargée super efficace dans ${m[1]} combat${m[1] === '1' ? '' : 's'} d’Arène`],
    [/^Use a supereffective Charged Attack$/i, () => 'Utilise une Attaque Chargée super efficace'],
    [/^Defeat (\d+|a|an|one) Team GO Rocket (Grunts?|Leaders?|members?)$/i, (m) => `Bats ${numWord(m[1]!)} ${rocketWho(m[2]!, !isOne(m[1]!))}`],
    [/^Battle (\d+|a|an|one) Team GO Rocket (Grunts?|Leaders?|members?)$/i, (m) => `Affronte ${numWord(m[1]!)} ${rocketWho(m[2]!, !isOne(m[1]!))}`],
    [/^Win (\d+|a|an|one) Trainer Battles? in the GO Battle League$/i, (m) => `Gagne ${numWord(m[1]!)} combat${isOne(m[1]!) ? '' : 's'} dans la Ligue Combat GO`],
    [/^Battle in the GO Battle League(?: (\d+) times?)?$/i, (m) => `Combats dans la Ligue Combat GO${m[1] ? ` ${m[1]} fois` : ''}`],
    [/^Win (\d+|a|an|one) Max Battles?$/i, (m) => `Gagne ${numWord(m[1]!)} Combat${isOne(m[1]!) ? '' : 's'} Max`],
    [/^Battle in (\d+|a|an|one) Max Battles?$/i, (m) => `Participe à ${numWord(m[1]!)} Combat${isOne(m[1]!) ? '' : 's'} Max`],
    [/^Collect ([\d,]+) Max Particles$/i, (m) => `Récupère ${m[1]!.replace(/,/g, ' ')} Particules Max`],
    [/^Collect Max Particles from (\d+|a|an|one) Power Spots?$/i, (m) => `Récupère des Particules Max à ${numWord(m[1]!)} Source${isOne(m[1]!) ? '' : 's'} d’Énergie`],
    [/^Power up a Max Move (\d+) times?$/i, (m) => `Améliore une Capacité Max ${m[1]} fois`],
    [/^Unlock (\d+|a|an|one) Max Moves?$/i, (m) => `Débloque ${numWord(m[1]!)} Capacité${isOne(m[1]!) ? '' : 's'} Max`],
    [/^Earn ([\d,]+) Stardust$/i, (m) => `Gagne ${m[1]!.replace(/,/g, ' ')} Poussières Étoile`],
    [/^Earn ([\d,]+) XP$/i, (m) => `Gagne ${m[1]!.replace(/,/g, ' ')} PX`],
  ];

  for (const [re, fn] of rules) {
    const m = re.exec(body);
    if (m) return `${prefix}${fn(m)}`;
  }
  return prefix ? `${prefix}${mons(body)}` : trimmed;
}

/**
 * Translates Leek Duck promo code titles and reward labels into natural French while leaving promo codes untouched.
 * Examples:
 * - "adidas Shoes Avatar Item" -> "Objet d’avatar : Chaussures adidas"
 * - "Pokémon Gengar Classic Clog Avatar Item" -> "Objet d’avatar : Sabots Classic Ectoplasma"
 * - "10× Poké Ball" -> "10× Poké Ball"
 */
export function promoTextFr(raw: string, species?: SpeciesNames, lang = 'fr'): string {
  if (lang !== 'fr' || !raw) return raw;
  const s = raw.replace(/\s+/g, ' ').trim();
  const item = itemQuantityFr(s, species);
  if (item) return item;

  const translateItemBody = (part: string) => {
    let out = part.trim();
    // "adidas Shoes" -> "Chaussures adidas", "Pokémon Gengar Classic Clog" -> "Sabots Classic Ectoplasma"
    const clogPlatform = /^(?:Pok[eé]mon\s+)?(.+?)\s+Classic Platform Clogs?$/i.exec(out);
    if (clogPlatform) return `Sabots compensés Classic ${monsFr(clogPlatform[1]!, species)}`;
    const clogClassic = /^(?:Pok[eé]mon\s+)?(.+?)\s+Classic Clogs?$/i.exec(out);
    if (clogClassic) return `Sabots Classic ${monsFr(clogClassic[1]!, species)}`;
    const clogSimple = /^(?:Pok[eé]mon\s+)?(.+?)\s+Clogs?$/i.exec(out);
    if (clogSimple) return `Sabots ${monsFr(clogSimple[1]!, species)}`;
    const shoes = /^(.+?)\s+Shoes$/i.exec(out);
    if (shoes) return `Chaussures ${monsFr(shoes[1]!, species)}`;
    const tee = /^(.+?)\s+(?:T-?Shirt|Tee)$/i.exec(out);
    if (tee) return `T-shirt ${monsFr(tee[1]!, species)}`;
    const hat = /^(.+?)\s+Hat$/i.exec(out);
    if (hat) return `Chapeau ${monsFr(hat[1]!, species)}`;
    const cap = /^(.+?)\s+Cap$/i.exec(out);
    if (cap) return `Casquette ${monsFr(cap[1]!, species)}`;
    const hoodie = /^(.+?)\s+Hoodie$/i.exec(out);
    if (hoodie) return `Sweat à capuche ${monsFr(hoodie[1]!, species)}`;
    const jacket = /^(.+?)\s+Jacket$/i.exec(out);
    if (jacket) return `Veste ${monsFr(jacket[1]!, species)}`;
    const bag = /^(.+?)\s+(?:Backpack|Bag)$/i.exec(out);
    if (bag) return `Sac à dos ${monsFr(bag[1]!, species)}`;
    const jersey = /^(.+?)\s+Jersey$/i.exec(out);
    if (jersey) return `Maillot ${monsFr(jersey[1]!, species)}`;
    const sweater = /^(.+?)\s+Sweater$/i.exec(out);
    if (sweater) return `Pull ${monsFr(sweater[1]!, species)}`;
    const outfit = /^(.+?)\s+(?:Outfit|Set)$/i.exec(out);
    if (outfit) return `Tenue ${monsFr(outfit[1]!, species)}`;
    const glasses = /^(.+?)\s+Glasses$/i.exec(out);
    if (glasses) return `Lunettes ${monsFr(glasses[1]!, species)}`;
    const mask = /^(.+?)\s+Mask$/i.exec(out);
    if (mask) return `Masque ${monsFr(mask[1]!, species)}`;
    const visor = /^(.+?)\s+Visor$/i.exec(out);
    if (visor) return `Visière ${monsFr(visor[1]!, species)}`;
    const pose = /^(.+?)\s+Pose$/i.exec(out);
    if (pose) return `Pose ${monsFr(pose[1]!, species)}`;

    out = out
      .replace(/\bTimed Research\b/gi, 'Étude ponctuelle')
      .replace(/\bSpecial Research\b/gi, 'Étude spéciale')
      .replace(/\bAvatar Items?\b/gi, 'Objet d’avatar')
      .replace(/\bAvatar Pose\b/gi, 'Pose d’avatar')
      .replace(/\bClassic Platform Clogs?\b/gi, 'Sabots compensés Classic')
      .replace(/\bClassic Clogs?\b/gi, 'Sabots Classic')
      .replace(/\bShoes\b/gi, 'Chaussures');
    return monsFr(out, species);
  };

  const avatarItem = /^(.+?)\s+Avatar Items?$/i.exec(s);
  if (avatarItem) return `Objet d’avatar : ${translateItemBody(avatarItem[1]!)}`;
  const avatarPose = /^(.+?)\s+Avatar Pose$/i.exec(s);
  if (avatarPose) return `Pose d’avatar : ${translateItemBody(avatarPose[1]!)}`;
  const timedRes = /^(.+?)\s+Timed Research$/i.exec(s);
  if (timedRes) return `Étude ponctuelle : ${monsFr(timedRes[1]!, species)}`;

  return translateItemBody(s);
}

/** Translates recurring Leek Duck event bonuses, rewards & ticket items into concise French. */
export function bonusFr(raw: string, species?: SpeciesNames, lang = 'fr'): string {
  if (lang !== 'fr') return raw;
  const s = raw.replace(/\s+/g, ' ').trim();
  const clean = s.replace(/\*+$/, '').trim();
  const star = s.length > clean.length ? s.slice(clean.length) : '';
  const mons = (x: string) => monsFr(x, species);

  // GO Pass task lines with point values ("Deluxe Catch 10 Pokémon 100 PTS", "Spin 5 PokéStops or Gyms 50 PTS")
  const ptsMatch = /^(Deluxe\s+)?(.+?)\s+(\d+)\s*PTS$/i.exec(clean);
  if (ptsMatch) {
    const deluxePref = ptsMatch[1] ? 'Deluxe : ' : '';
    const taskFr = researchTaskFr(ptsMatch[2]!.trim(), species, 'fr');
    return `${deluxePref}${taskFr} · ${ptsMatch[3]} PTS${star}`;
  }

  const rules: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^GO Pass Deluxe:\s*(.+)$/i, (m) => `GO Pass Deluxe : ${bonusFr(m[1]!, species, 'fr')}`],
    [/^Increased Spawns$/i, () => 'Apparitions augmentées'],
    [/^(\d+)[x×]\s*Catch Candy$/i, (m) => `${m[1]}× Bonbons de capture`],
    [/^(\d+)[x×]\s*Candy for catching Pok[eé]mon$/i, (m) => `${m[1]}× Bonbons de capture`],
    [/^(\d+)[x×]\s*Candy (?:for|from) hatching Pok[eé]mon$/i, (m) => `${m[1]}× Bonbons à l’éclosion`],
    [/^(\d+)[x×]\s*Hatch Candy$/i, (m) => `${m[1]}× Bonbons à l’éclosion`],
    [/^(\d+)[x×]\s*Catch XP$/i, (m) => `${m[1]}× PX de capture`],
    [/^(\d+)[x×]\s*XP for catching Pok[eé]mon$/i, (m) => `${m[1]}× PX de capture`],
    [/^(\d+)[x×]\s*XP for catching Pok[eé]mon with Nice Throws or better$/i, (m) => `${m[1]}× PX sur les Jolis lancers ou mieux`],
    [/^(\d+)[x×]\s*Hatch XP$/i, (m) => `${m[1]}× PX d’éclosion`],
    [/^(\d+)[x×]\s*XP (?:for|from) hatching Pok[eé]mon$/i, (m) => `${m[1]}× PX d’éclosion`],
    [/^(\d+)[x×]\s*Catch Stardust$/i, (m) => `${m[1]}× Poussières Étoile de capture`],
    [/^(\d+)[x×]\s*Stardust for catching Pok[eé]mon$/i, (m) => `${m[1]}× Poussières Étoile de capture`],
    [/^(\d+)[x×]\s*Hatch Stardust$/i, (m) => `${m[1]}× Poussières Étoile d’éclosion`],
    [/^(\d+)[x×]\s*Stardust (?:for|from) hatching Pok[eé]mon$/i, (m) => `${m[1]}× Poussières Étoile d’éclosion`],
    [/^(\d+)[x×]\s*Transfer Candy$/i, (m) => `${m[1]}× Bonbons de transfert`],
    [/^(\d+)[x×]\s*Candy for transferring Pok[eé]mon$/i, (m) => `${m[1]}× Bonbons de transfert`],
    [/^(\d+)[x×]\s*Evolution XP$/i, (m) => `${m[1]}× PX d’évolution`],
    [/^(\d+)[x×]\s*XP for evolving Pok[eé]mon$/i, (m) => `${m[1]}× PX d’évolution`],
    [/^(\d+)[x×]\s*Raid XP$/i, (m) => `${m[1]}× PX en Raids`],
    [/^(\d+)[x×]\s*XP from Raid Battles$/i, (m) => `${m[1]}× PX en Raids`],
    [/^(\d+)[x×]\s*XP from Max Battles$/i, (m) => `${m[1]}× PX en Combats Max`],
    [/^(\d+)[x×]\s*Stardust from Raid Battles$/i, (m) => `${m[1]}× Poussières Étoile en Raids`],
    [/^(\d+)[x×]\s*Stardust from Max Battles$/i, (m) => `${m[1]}× Poussières Étoile en Combats Max`],
    [/^(\d+)[x×]\s*Stardust from win rewards$/i, (m) => `${m[1]}× Poussières Étoile en récompenses de victoire`],
    [/^(\d+)[x×]\s*Chance for Trainers level 31 and up to receive Candy XL from catching Pok[eé]mon$/i, (m) => `${m[1]}× chances de Bonbons L à la capture (niv. 31+)`],
    [/^Increased chance for Trainers level 31 and up to receive Candy XL (?:when|from) catching Pok[eé]mon$/i, () => 'Chances accrues de Bonbons L à la capture (niv. 31+)'],
    [/^Increased chance to receive Candy XL from catching Pok[eé]mon with Nice Throws or better$/i, () => 'Chances accrues de Bonbons L sur les Jolis lancers ou mieux'],
    [/^(?:1\/(\d+)|½)\s*(?:Egg\s*)?Hatch Distance.*$/i, (m) => `Distance d’éclosion divisée par ${m[1] ?? '2'}`],
    [/^(\d+)-hour Incense$/i, (m) => `Encens ${m[1]} h`],
    [/^Incense (?:\(excluding Daily Adventure Incense\) )?activated during the event will last for (\w+) hours?$/i, (m) => `Encens activé dure ${numWord(m[1]!)} h`],
    [/^(\d+)-hour Lures?(?: Modules?)?$/i, (m) => `Leurres ${m[1]} h`],
    [/^Lure Modules activated during the event will last for (\w+) hours?$/i, (m) => `Modules Leurre actifs durent ${numWord(m[1]!)} h`],
    [/^Daily Adventure Incense (?:activated during the event )?will last (?:twice as long|for (\d+) minutes)$/i, (m) => (m[1] ? `Encens d’aventure quotidienne : ${m[1]} min` : 'Durée de l’Encens d’aventure quotidienne doublée')],
    [/^Max Particle collection limit increased to ([\d,]+)$/i, (m) => `Limite de Particules Max portée à ${m[1]!.replace(/,/g, ' ')}`],
    [/^All Power Spots will host Gigantamax Battles$/i, () => 'Toutes les Sources d’Énergie accueillent des Combats Gigamax'],
    [/^All Power Spots will host Dynamax Battles$/i, () => 'Toutes les Sources d’Énergie accueillent des Combats Dynamax'],
    [/^Power Spots will refresh more frequently$/i, () => 'Sources d’Énergie renouvelées plus souvent'],
    [/^Additional Power Spots will be active$/i, () => 'Sources d’Énergie supplémentaires actives'],
    [/^(\d+)[x×]\s*Max Particles from Power Spots$/i, (m) => `${m[1]}× Particules Max aux Sources d’Énergie`],
    [/^(\d+)[x×]\s*Max Particles from exploring$/i, (m) => `${m[1]}× Particules Max en explorant`],
    [/^(\d+)[x×]\s*Max Particles from collecting at Power Spots$/i, (m) => `${m[1]}× Particules Max aux Sources d’Énergie`],
    [/^1\/(\d+)\s*Adventuring distance to receive Max Particles$/i, (m) => `Distance divisée par ${m[1]} pour recevoir des Particules Max`],
    [/^Up to (\w+) Special Trades (?:for the day|can be made per day)$/i, (m) => `Jusqu’à ${numWord(m[1]!)} échanges spéciaux par jour`],
    [/^One additional Special Trade can be made for a maximum of (\w+) for the day$/i, (m) => `1 échange spécial supplémentaire (${numWord(m[1]!)} max/jour)`],
    [/^Trades(?: made)? will require 50% less Stardust$/i, () => '−50 % de Poussières Étoile sur les échanges'],
    [/^50% less Stardust for trades$/i, () => '−50 % de Poussières Étoile sur les échanges'],
    [/^Guaranteed (\w+) Candy XL when trading Pok[eé]mon$/i, (m) => `${numWord(m[1]!)} Bonbon L garanti par échange`],
    [/^(\d+) guaranteed Candy XL per trade$/i, (m) => `${m[1]} Bonbons L garantis par échange`],
    [/^Increased chance to become Lucky Friends$/i, () => 'Chances accrues de devenir Amis Chanceux'],
    [/^Increased chance (?:for Pok[eé]mon )?to get Lucky Pok[eé]mon in trades$/i, () => 'Chances accrues d’obtenir des Pokémon Chanceux en échange'],
    [/Remote Raid limit (?:will )?increase(?:d)? (?:from \d+ )?to (\d+)/i, (m) => `Limite de Raids à distance portée à ${m[1]}`],
    [/^No Remote Raid limit/i, () => 'Aucune limite de Raids à distance'],
    [/^Receive up to (\w+) (?:free |additional free |additional )?Raid Passes(?: per day)? from spinning Gym Photo Discs$/i, (m) => `Jusqu’à ${numWord(m[1]!)} passes de Raid gratuits${/per day/i.test(clean) ? '/jour' : ''} aux Arènes`],
    [/^Up to (\w+) additional free Raid Passes from spinning Gym Photo Discs.*$/i, (m) => `Jusqu’à ${numWord(m[1]!)} passes de Raid gratuits en plus aux Arènes`],
    [/^Increased chance to encounter Kecleon at Pok[eé]Stops$/i, () => 'Chances accrues de rencontrer Kecleon aux PokéStops'],
    [/^Increased chance of encountering Shiny (.+?) from (.+)$/i, (m) => `Chances accrues de ${mons(m[1]!.replace(/\bShiny\s+/gi, ''))} shiny (${eventLabelFr(m[2]!, 'fr', species)})`],
    [/^Increased chance (?:to encounter|of encountering) Shiny (.+)$/i, (m) => `Chances accrues de ${mons(m[1]!.replace(/\bShiny\s+/gi, ''))} shiny`],
    [/^Increased chance to get Rare Candy XL from (?:in-person )?Raid Battles$/i, () => 'Chances accrues de Super Bonbon L en Raids'],
    [/^(?:One|1) Rare Candy XL for completing in-person (Raid|Max) Battles$/i, (m) => `1 Super Bonbon L garanti en ${m[1]!.toLowerCase() === 'max' ? 'Combats Max' : 'Raids'} locaux`],
    [/^An additional ([\d,]+) XP from (.+)$/i, (m) => `+${m[1]!.replace(/,/g, ' ')} PX (${eventLabelFr(m[2]!, 'fr')})`],
    [/^([\d,]+) additional XP from completing Raid Battles$/i, (m) => `+${m[1]!.replace(/,/g, ' ')} PX par Raid`],
    [/^An additional ([\d,]+) Stardust from (.+)$/i, (m) => `+${m[1]!.replace(/,/g, ' ')} Poussières Étoile (${eventLabelFr(m[2]!, 'fr')})`],
    [/^(\d+)[x×]\s*GO Transporter Energy gained per hour.*$/i, (m) => `${m[1]}× Énergie Transporteur GO par heure (Pokémon HOME)`],
    [/^(\d+)[x×]\s*Mega Energy for exploring with (.+?) as your buddy.*$/i, (m) => `${m[1]}× Méga-Énergie en explorant avec ${mons(m[2]!)} en copain`],
    [/^(.+?) caught from Super Mega Raids will have Mega Level 1 unlocked$/i, (m) => `${mons(m[1]!)} attrapé en Super Méga-Raid arrive au Méga-Niveau 1`],
    [/^Take a few snapshots(?: during .+)? for a surprise!?$/i, () => 'Prends des clichés GO pendant l’événement pour une surprise !'],
    [/^Team GO Rocket will appear more frequently at Pok[eé]Stops and in balloons$/i, () => 'Team GO Rocket plus fréquente aux PokéStops et en montgolfière'],
    [/^You can use a Charged TM to help a Shadow Pok[eé]mon forget the Charged Attack Frustration$/i, () => 'Utilise une CT Chargée pour faire oublier Frustration aux Pokémon obscurs'],
    [/^Open up to (\d+) Gifts per day$/i, (m) => `Ouvre jusqu’à ${m[1]} cadeaux par jour`],
    [/^Hold up to (\d+) Gifts in your Item Bag$/i, (m) => `Stocke jusqu’à ${m[1]} cadeaux dans ton sac`],
    [/^Send up to (\d+) Gifts per day$/i, (m) => `Envoie jusqu’à ${m[1]} cadeaux par jour`],
    [/^Friendship levels will increase faster.*$/i, () => 'Les niveaux d’amitié augmentent plus vite'],
    [/^(\d+)[x×]\s*Buddy hearts.*$/i, (m) => `${m[1]}× Cœurs de Copain`],
    [/^1\/(\d+)\s*Buddy Candy distance.*$/i, (m) => `Distance divisée par ${m[1]} pour les bonbons de Copain`],
    [/^Increased chance to receive (\d+)[- ]km Eggs from spinning Pok[eé]Stops$/i, (m) => `Chances accrues d’Œufs ${m[1]} km aux PokéStops`],
    [/^(.+?) Mega Energy$/i, (m) => `Méga-Énergie ${mons(m[1]!)}`],
    [/^Mega[- ]Energy for (.+)$/i, (m) => `Méga-Énergie pour ${mons(m[1]!)}`],
    [/^An? event-themed avatar pose$/i, () => 'Pose d’avatar de l’événement'],
    [/^An? event-themed avatar item$/i, () => 'Objet d’avatar de l’événement'],
    [/^Encounters with event-themed Pok[eé]mon$/i, () => 'Rencontres Pokémon de l’événement'],
    [/^Encounters with (.+)$/i, (m) => `Rencontres avec ${mons(m[1]!)}`],
    [/^Additional encounters with (?:event-themed|even more) Pok[eé]mon!?$/i, () => 'Rencontres Pokémon supplémentaires'],
    [/^Event-themed Field Research tasks will be available\.?$/i, () => 'Études de terrain thématiques disponibles.'],
    [/^Complete Field Research tasks to earn encounters with (.+)\.?$/i, (m) => `Termine des Études de terrain pour rencontrer ${mons(m[1]!)}.`],
    [/^Complete Timed Research to earn (.+)\.?$/i, (m) => `Termine l’Étude ponctuelle pour gagner ${bonusFr(m[1]!, species, 'fr')}.`],
  ];

  for (const [re, fn] of rules) {
    const m = re.exec(clean);
    if (m) return fn(m) + star;
  }
  const directItem = itemQuantityFr(clean, species);
  if (directItem) return directItem + star;
  return eventTextFr(s, species, 'fr');
}

/**
 * Translates free-form event descriptions, summaries, highlight paragraphs and research notes into French
 * using Pokémon GO sentence patterns, the item/mechanic dictionary, dates/times, species names and move names.
 */
export function eventTextFr(raw: string, species?: SpeciesNames, lang = 'fr', moveNames?: MoveNamesMap): string {
  if (lang !== 'fr' || !raw) return raw;
  let out = raw.replace(/\s+/g, ' ').trim();
  const mons = (x: string) => monsFr(x, species);
  const typeFr = (t: string) => TYPES_EN_FR[t.toLowerCase()] ?? t;
  const withMoves = (x: string) => (moveNames ? moveFr(x, moveNames, 'fr') : x);

  const sentenceRules: [RegExp, (m: RegExpExecArray) => string][] = [
    // "Mega Clefable makes its Pokémon GO debut during Clefable Super Mega Raid Day on Saturday, November 28, 2026, from 2:00 p.m. to 5:00 p.m. local time!"
    [
      /^(.+?)\s+makes (?:its|their) Pok[eé]mon GO debut during (.+?) on (.+?) from (.+?)(?:\s+local time)?[!\.]?$/i,
      (m) => {
        const who = mons(m[1]!);
        const ev = eventTitle(m[2]!.trim(), species, 'fr');
        const day = datesToFr(m[3]!.replace(/,\s*$/, ''));
        const window = time12To24Fr(m[4]!.trim()).replace(/\s+to\s+/gi, ' à ');
        return `${who} fait ses débuts dans Pokémon GO lors de « ${ev} » le ${day}, de ${window} (heure locale) !`;
      },
    ],
    // "Mega Clefable, a Fairy- and Flying-type Pokémon, makes its Pokémon GO debut in Super Mega Raids!"
    [
      /^(.+?),\s*a\s+([A-Za-z]+)-?\s+and\s+([A-Za-z]+)-type\s+Pok[eé]mon,\s*(?:will )?makes? (?:its|their) Pok[eé]mon GO debut(?: in (.+?))?[!\.]?$/i,
      (m) => `${mons(m[1]!)}, un Pokémon de type ${typeFr(m[2]!)} et ${typeFr(m[3]!)}, fait ses débuts dans Pokémon GO${m[4] ? ` (${eventLabelFr(m[4], 'fr', species, moveNames)})` : ''} !`,
    ],
    // "Pyukumuku, a Water-type Pokémon, makes its Pokémon GO debut in three-star raids!"
    [
      /^(.+?),\s*an?\s+([A-Za-z]+)-type\s+Pok[eé]mon,\s*(?:will )?makes? (?:its|their) Pok[eé]mon GO debut(?: in (.+?))?[!\.]?$/i,
      (m) => `${mons(m[1]!)}, un Pokémon de type ${typeFr(m[2]!)}, fait ses débuts dans Pokémon GO${m[3] ? ` (${eventLabelFr(m[3], 'fr', species, moveNames)})` : ''} !`,
    ],
    // Super Max recurring Niantic explanation
    [
      /^(.+?)\s+can reach Super Max Level for the first time\.\s*Raise its Mega[- ]Level to Max first,\s*then use (.+?)\s+Mega[- ]Energy to reach Super Max\..*$/i,
      (m) => `${mons(m[1]!)} peut atteindre le Super Niveau Max pour la première fois. Monte d’abord son Méga-Niveau au max, puis utilise de la Méga-Énergie ${mons(m[2]!)} pour atteindre le Super Niveau Max (les Méga-Raids donnent la Méga-Énergie nécessaire).`,
    ],
    [
      /^(.+?)\s+makes (?:its|their) Pok[eé]mon GO debut(?: in (.+?))?[!\.]?$/i,
      (m) => `${mons(m[1]!)} fait ses débuts dans Pokémon GO${m[2] ? ` (${eventLabelFr(m[2], 'fr', species, moveNames)})` : ''} !`,
    ],
    [
      /^(.+?)\s+will make (?:its|their) Pok[eé]mon GO debut(?: in (.+?))?[!\.]?$/i,
      (m) => `${mons(m[1]!)} fait ses débuts dans Pokémon GO${m[2] ? ` (${eventLabelFr(m[2], 'fr', species, moveNames)})` : ''} !`,
    ],
    [
      /^(.+?)\s+debuts in (.+?)\.?$/i,
      (m) => `${mons(m[1]!)} fait ses débuts dans ${eventLabelFr(m[2]!, 'fr', species, moveNames)}.`,
    ],
    [
      /^Pok[eé]mon (?:encountered )?from (.+?) (?:during the event )?may have a Special Background\.?$/i,
      (m) => `Les Pokémon obtenus en ${eventLabelFr(m[1]!, 'fr', species, moveNames).toLowerCase()} peuvent avoir un Fond spécial.`,
    ],
    [
      /^Pok[eé]mon caught (?:during the event )?may have a Special Background\.?$/i,
      () => 'Les Pokémon attrapés pendant l’événement peuvent avoir un Fond spécial.',
    ],
    [
      /^Shiny (.+?)\s+will be released(?: for the first time)?(?: with the start of the event)?\.?$/i,
      (m) => `${mons(m[1]!)} shiny sort pour la première fois !`,
    ],
    [
      /^(.+?)\s+arrives(?: on (.+?))?(?: from (.+?))?[!\.]?$/i,
      (m) => `${mons(m[1]!)} arrive${m[2] ? ` le ${datesToFr(m[2])}` : ''}${m[3] ? ` de ${datesToFr(m[3]).replace(/\s+to\s+/gi, ' à ')}` : ''} !`,
    ],
    [
      /^Complete (?:event-themed )?Field Research(?: tasks)? to earn (.+?) and encounters with event-themed Pok[eé]mon(?:,\s*including (.+?)(?:,?\s*and more)?)?[!\.]?$/i,
      (m) => `Termine des Études de terrain thématiques pour gagner ${eventTextFr(m[1]!, species, 'fr', moveNames)} et des rencontres de l’événement${m[2] ? ` (dont ${mons(m[2].replace(/,?\s*and more$/i, ''))} et plus)` : ''} !`,
    ],
    [
      /^Evolve (.+?) during the event.*?to get (?:a|an) (.+?) that knows the (Fast|Charged) Attack (.+?)\.?$/i,
      (m) => `Fais évoluer ${mons(m[1]!)} pendant l’événement pour obtenir ${mons(m[2]!)} avec l’Attaque ${m[3]!.toLowerCase() === 'fast' ? 'Immédiate' : 'Chargée'} ${withMoves(m[4]!.trim())}.`,
    ],
    [/^The following Pok[eé]mon will appear more frequently in the wild\.?$/i, () => 'Ces Pokémon apparaîtront plus souvent dans la nature.'],
    [/^Event-themed Pok[eé]mon will appear in raids\.?$/i, () => 'Des Pokémon de l’événement apparaîtront en Raids.'],
    [/^More details coming soon\.?!*$/i, () => 'Plus de détails à venir.'],
    [/^Coming soon\.?!*$/i, () => 'Bientôt disponible.'],
  ];

  for (const [re, fn] of sentenceRules) {
    const m = re.exec(out);
    if (m) return withMoves(fn(m));
  }

  // Phrase-level dictionary replacements for rich paragraphs (attack stats, research notes, summaries)
  out = out
    .replace(/\bCelebrate\s+(.+?)\s+with\b/gi, 'Fête $1 avec')
    .replace(/\bEnjoy increased chances? to encounter\b/gi, 'Profite de chances accrues de rencontrer')
    .replace(/\bIncreased chances? to encounter\b/gi, 'Chances accrues de rencontrer')
    .replace(/\bIf you['’]re lucky,?\s*you (?:may|might) encounter a Shiny one!?\b/gi, 'Avec un peu de chance, tu pourras en rencontrer un shiny !')
    .replace(/\bIf you['’]re lucky,?\s*you (?:may|might) encounter one!?\b/gi, 'Avec un peu de chance, tu pourras le rencontrer !')
    .replace(/\bSome Trainers might even encounter the following!?\b/gi, 'Les plus chanceux pourront même rencontrer :')
    .replace(/\bwill appear more frequently in the wild\b/gi, 'apparaîtront plus souvent dans la nature')
    .replace(/\bwill appear more frequently\b/gi, 'apparaîtront plus souvent')
    .replace(/\bwill be available\b/gi, 'sera disponible')
    .replace(/\bwill be featured\b/gi, 'sera à l’honneur')
    .replace(/\bwearing a sun scarf\b/gi, 'à écharpe Soleil')
    .replace(/\bwearing a moon scarf\b/gi, 'à écharpe Lune')
    .replace(/\bwearing a sun crown\b/gi, 'à couronne Soleil')
    .replace(/\bwearing a moon crown\b/gi, 'à couronne Lune')
    .replace(/\bwearing a flower crown\b/gi, 'à couronne de fleurs')
    .replace(/\bwearing a party hat\b/gi, 'avec chapeau de fête')
    .replace(/\bwearing a witch hat\b/gi, 'avec chapeau de sorcière')
    .replace(/\bwearing a holiday hat\b/gi, 'avec chapeau des fêtes')
    .replace(/\bevent-themed raids\b/gi, 'Raids thématiques')
    .replace(/\bevent-themed Field Research\b/gi, 'Études de terrain thématiques')
    .replace(/\brewards and bonuses from\b/gi, 'des récompenses et des bonus via')
    .replace(/\brewards and bonuses\b/gi, 'des récompenses et des bonus')
    .replace(/\bfrom GO Pass\b/gi, 'via le GO Pass')
    .replace(/\bfrom Field Research\b/gi, 'en Études de terrain')
    .replace(/\bfor the duration of the event\b/gi, 'pendant toute la durée de l’événement')
    .replace(/\bComplete Pass Tasks to rank up\b/gi, 'Termine des tâches du Pass pour monter de rang')
    .replace(/\band more!/gi, 'et plus encore !')
    .replace(/\bShiny (\p{L}[\p{L}-]*)/gu, '$1 shiny')
    .replace(/\ba\s+([A-Za-z]+)-?\s+and\s+([A-Za-z]+)-type\s+Pok[eé]mon\b/gi, (_, a: string, b: string) => `un Pokémon de type ${typeFr(a)} et ${typeFr(b)}`)
    .replace(/\ban?\s+([A-Za-z]+)-type\s+Pok[eé]mon\b/gi, (_, a: string) => `un Pokémon de type ${typeFr(a)}`)
    .replace(/\bTrainer Battles:\s*(\d+)\s*power\b/gi, 'Combats de Dresseurs : $1 puissance')
    .replace(/\bGyms and Raids:\s*(\d+)\s*power\b/gi, 'Arènes et Raids : $1 puissance')
    .replace(/\bRaid Battles:\s*(\d+)\s*power\b/gi, 'Raids : $1 puissance')
    .replace(/\bwill know the (Fast|Charged) Attack\b/gi, (_, k: string) => `connaîtra l’Attaque ${k.toLowerCase() === 'fast' ? 'Immédiate' : 'Chargée'}`)
    .replace(/\bwill be able to learn the (Fast|Charged) Attack\b/gi, (_, k: string) => `pourra apprendre l’Attaque ${k.toLowerCase() === 'fast' ? 'Immédiate' : 'Chargée'}`)
    .replace(/\bCharged Attack\b/gi, 'Attaque Chargée')
    .replace(/\bFast Attack\b/gi, 'Attaque Immédiate')
    .replace(/\bSuper Mega Raid Day\b/gi, 'Super Journée de Méga-Raids')
    .replace(/\bSuper Max Level\b/gi, 'Super Niveau Max')
    .replace(/\bSuper Max\b/gi, 'Super Niveau Max')
    .replace(/\bMega[- ]Level\b/gi, 'Méga-Niveau')
    .replace(/\bMega[- ]Energy\b/gi, 'Méga-Énergie')
    .replace(/\bMega[- ]Evolving\b/gi, 'Méga-Évoluer')
    .replace(/\bSpecial Backgrounds?\b/gi, 'Fonds spéciaux')
    .replace(/\bFree Timed Research\b/gi, 'Étude ponctuelle gratuite')
    .replace(/\bPaid Timed Research\b/gi, 'Étude ponctuelle payante')
    .replace(/\bBranching Timed Research\b/gi, 'Étude ponctuelle à choix')
    .replace(/\bField Research(?:\s+tasks?)?\b/gi, 'Études de terrain')
    .replace(/\bTimed Research\b/gi, 'Étude ponctuelle')
    .replace(/\bSpecial Research(?: story)?\b/gi, 'Étude spéciale')
    .replace(/\bCollection Challenges?\b/gi, 'Défis de collection')
    .replace(/\bPok[eé]Stop Showcases?\b/gi, 'Épreuves PokéStop')
    .replace(/\bMax Battles?\b/gi, 'Combats Max')
    .replace(/\bPower Spots?\b/gi, 'Sources d’Énergie')
    .replace(/\bSuper Mega Raids?\b/gi, 'Super Méga-Raids')
    .replace(/\bMega Raids?\b/gi, 'Méga-Raids')
    .replace(/\bShadow Raids?\b/gi, 'Raids obscurs')
    .replace(/\bShadow Pok[eé]mon\b/gi, 'Pokémon obscur')
    .replace(/\bRaid Battles?\b/gi, 'Raids')
    .replace(/\bOne-Star Raids?\b/gi, 'Raids 1★')
    .replace(/\bThree-Star Raids?\b/gi, 'Raids 3★')
    .replace(/\bFive-Star Raids?\b/gi, 'Raids 5★')
    .replace(/\bWild Encounters\b/gi, 'Dans la nature')
    .replace(/\bin the wild\b/gi, 'dans la nature')
    .replace(/\bduring the event\b/gi, 'pendant l’événement')
    .replace(/\bfor the first time in Pok[eé]mon GO\b/gi, 'pour la première fois dans Pokémon GO')
    .replace(/\bfor the first time\b/gi, 'pour la première fois')
    .replace(/\bwith increased Shiny odds\b/gi, 'avec des chances de shiny augmentées')
    .replace(/\bfrom\s+(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\s+to\s+(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/gi, (_, a: string, b: string) => `de ${time12To24Fr(a)} à ${time12To24Fr(b)}`)
    .replace(/\bStardust\b/g, 'Poussières Étoile')
    .replace(/\bRare Candy XL\b/g, 'Super Bonbon L')
    .replace(/\bRare Candy\b/g, 'Super Bonbon')
    .replace(/\bCandy XL\b/g, 'Bonbons L')
    .replace(/\bMax Particles\b/g, 'Particules Max')
    .replace(/\bXP\b/g, 'PX');

  out = datesToFr(out);
  return mons(withMoves(out));
}

/** Translates sub-section headings (Raid tiers, GO Pass ranks, Eggs, Days, Debuts, Moves) into short French labels. */
export function eventLabelFr(raw: string, lang = 'fr', species?: SpeciesNames, moveNames?: MoveNamesMap): string {
  if (lang !== 'fr') return raw;
  const s = raw.replace(/\s+/g, ' ').replace(/\*+$/, '').trim();
  const mons = (x: string) => monsFr(x, species);
  const mv = (x: string) => moveFr(x, moveNames, 'fr');

  const map: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^One-Star Raids$/i, () => 'Raids 1★'],
    [/^Three-Star Raids$/i, () => 'Raids 3★'],
    [/^Five-Star Raids$/i, () => 'Raids 5★'],
    [/^Mega Raids$/i, () => 'Méga-Raids'],
    [/^Super Mega Raids?$/i, () => 'Super Méga-Raids'],
    [/^Super Mega Raid Battles$/i, () => 'Super Méga-Raids'],
    [/^Shadow Raids$/i, () => 'Raids obscurs'],
    [/^Elite Raids$/i, () => 'Raids d’élite'],
    [/^Raids$/i, () => 'Raids'],
    [/^Max Battles$/i, () => 'Combats Max'],
    [/^Wild Encounters|Spawns$/i, () => 'Dans la nature'],
    [/^Additional Spawns$/i, () => 'Apparitions supplémentaires'],
    [/^Event-Exclusive Spawns$/i, () => 'Apparitions de l’événement'],
    [/^Incense Encounters$/i, () => 'Avec Encens'],
    [/^Lure (?:Module )?Encounters$/i, () => 'Avec Module Leurre'],
    [/^Featured Pok[eé]mon$/i, () => 'Pokémon vedettes'],
    [/^Field Research(?: Task Rewards| Tasks)?$/i, () => 'Études de terrain'],
    [/^Free Timed Research$/i, () => 'Étude ponctuelle gratuite'],
    [/^Branching Timed Research$/i, () => 'Étude ponctuelle à choix'],
    [/^Timed Research$/i, () => 'Étude ponctuelle'],
    [/^Special Research$/i, () => 'Étude spéciale'],
    [/^Paid Timed Research(?:: (.+))?$/i, (m) => (m[1] ? `Étude ponctuelle payante : ${mons(m[1])}` : 'Étude ponctuelle payante')],
    [/^Paid Special Research(?:: (.+))?$/i, (m) => (m[1] ? `Étude spéciale payante : ${mons(m[1])}` : 'Étude spéciale payante')],
    [/^Community Day Special Research$/i, () => 'Étude spéciale Journée Communauté'],
    [/^Collection Challenges?$/i, () => 'Défis de collection'],
    [/^Pok[eé]Stop Showcases?$/i, () => 'Épreuves PokéStop'],
    [/^Event Bonuses$/i, () => 'Bonus de l’événement'],
    [/^Daily Tasks$/i, () => 'Tâches quotidiennes'],
    [/^Weekly Tasks$/i, () => 'Tâches hebdomadaires'],
    [/^Pass Tasks$/i, () => 'Tâches du Pass'],
    [/^Major Milestones?$/i, () => 'Paliers majeurs'],
    [/^Tier (\d+)(?: Bonus)?\s*[–-]\s*(?:Starting at )?Rank (\d+)$/i, (m) => `Palier ${m[1]} · Rang ${m[2]}`],
    [/^Rank (\d+)$/i, (m) => `Rang ${m[1]}`],
    [/^In (\d+)[- ]km Eggs$/i, (m) => `Œufs ${m[1]} km`],
    [/^(\d+)[- ]km Eggs$/i, (m) => `Œufs ${m[1]} km`],
    [/^Event Ticket$/i, () => 'Ticket d’événement'],
    [/^Special Backgrounds?$/i, () => 'Fonds spéciaux'],
    [/^Pok[eé]mon Debut$/i, () => 'Nouveau Pokémon'],
    [/^(.+?)\s+Debut$/i, (m) => `Début de ${mons(m[1]!)}`],
    [/^New Mega Level:\s*(.+)$/i, (m) => `Nouveau Méga-Niveau : ${/^Super Max(?: Level)?$/i.test(m[1]!.trim()) ? 'Super Niveau Max' : m[1]}`],
    [/^Super Max(?: Level)?$/i, () => 'Super Niveau Max'],
    [/^New Attack:\s*(.+)$/i, (m) => `Nouvelle attaque : ${mv(m[1]!)}`],
    [/^Attack Availability Update$/i, () => 'Nouvelle attaque'],
    [/^Featured Attack$/i, () => 'Attaque exclusive'],
    [/^Limited-time Evolution Requirement$/i, () => 'Condition d’évolution spéciale'],
    [/^Global Challenge$/i, () => 'Défi mondial'],
    [/^Day (\d+)$/i, (m) => `Jour ${m[1]}`],
    [/^(.+?)\s+to\s+(.+)$/i, (m) => `${datesToFr(m[1]!)} – ${datesToFr(m[2]!)}`],
  ];
  for (const [re, fn] of map) {
    const m = re.exec(s);
    if (m) return fn(m);
  }
  const translatedMove = mv(s);
  if (translatedMove !== s) return translatedMove;
  return mons(datesToFr(s));
}
