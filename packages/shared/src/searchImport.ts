/**
 * Reads an in-game search string back into collection entries: the string is run, as the game would, against every
 * Pokémon the dataset knows. "&" / "|" join clauses that must all hold, "," / ";" / ":" separate alternatives,
 * "!" negates (a whole block when it starts one), each line is a search of its own.
 * Terms: dex numbers and ranges, species names, "+name" for a family, and the trait keywords in English or French.
 * Anything else (CP, types, age...) cannot be read from a collection: it is set aside and reported.
 */
import { regionOfVariant } from './search.js';
import type { EntryGender, EntryTag, Gender, LocalizedText, PokemonType, Species, Variant } from './types.js';

type Term =
  | { kind: 'dex'; from: number; to: number }
  | { kind: 'dexes'; dex: Set<number> }
  | { kind: 'key'; id: string }
  | { kind: 'type'; type: PokemonType };

interface Mon {
  v: Variant;
  sp?: Species;
  gender: Gender | null;
  shiny: boolean;
  tag: EntryTag;
}

const KEYWORDS: Record<string, string> = {
  shiny: 'shiny', chromatique: 'shiny',
  costume: 'costume',
  male: 'male', 'mâle': 'male', female: 'female', femelle: 'female',
  lucky: 'lucky', chanceux: 'lucky',
  shadow: 'shadow', obscur: 'shadow',
  purified: 'purified', 'purifié': 'purified', purifie: 'purified',
  dynamax: 'dynamax', gigantamax: 'gigantamax', gigamax: 'gigantamax', gmax: 'gigantamax',
  xxl: 'xxl', xxs: 'xxs',
  background: 'background', fond: 'background', fondspecial: 'background',
  alola: 'alola', galar: 'galar', hisui: 'hisui', paldea: 'paldea',
  mega: 'mega', 'méga': 'mega', megaevolve: 'mega', mega1: 'mega', mega2: 'mega', mega3: 'mega', 'mega1-3': 'mega', 'mega0-3': 'mega',
  legendary: 'legendary', legendaire: 'legendary',
  mythical: 'mythic', fabuleux: 'mythic',
  ultrabeasts: 'ultra_beast', ultrabeast: 'ultra_beast', 'ultra-chimere': 'ultra_beast', 'ultra-chimeres': 'ultra_beast', ultrachimere: 'ultra_beast',
};

/** Type names as the search bar takes them, English and French (accents folded). */
const TYPES: Record<string, PokemonType> = {
  normal: 'normal', fire: 'fire', feu: 'fire', water: 'water', eau: 'water', grass: 'grass', plante: 'grass',
  electric: 'electric', electrik: 'electric', ice: 'ice', glace: 'ice', fighting: 'fighting', combat: 'fighting',
  poison: 'poison', ground: 'ground', sol: 'ground', flying: 'flying', vol: 'flying', psychic: 'psychic', psy: 'psychic',
  bug: 'bug', insecte: 'bug', rock: 'rock', roche: 'rock', ghost: 'ghost', spectre: 'ghost', dragon: 'dragon',
  dark: 'dark', tenebres: 'dark', steel: 'steel', acier: 'steel', fairy: 'fairy', fee: 'fairy',
};

const TAG_TRIES: EntryTag[] = ['', 'lucky', 'shadow', 'purified', 'dynamax', 'xxl', 'xxs', 'background'];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function termMatches(t: Term, p: Mon): boolean {
  switch (t.kind) {
    case 'dex': return p.v.dex >= t.from && p.v.dex <= t.to;
    case 'dexes': return t.dex.has(p.v.dex);
    case 'type': return (p.v.types ?? p.sp?.types ?? []).includes(t.type);
    case 'key':
      switch (t.id) {
        case 'shiny': return p.shiny;
        case 'costume': return p.v.kind === 'costume';
        case 'male': return p.gender === 'm';
        case 'female': return p.gender === 'f';
        case 'gigantamax': return p.v.kind === 'gmax';
        case 'mega': return p.v.kind === 'mega';
        case 'legendary': case 'mythic': case 'ultra_beast': return p.sp?.rarity === t.id;
        case 'alola': case 'galar': case 'hisui': case 'paldea': return p.v.kind === 'regional' && regionOfVariant(p.v) === t.id;
        default: return p.tag === t.id;
      }
  }
}

interface Clause { neg: boolean; terms: Term[] }

export interface ParsedSearch {
  /** One search per line; a Pokémon matching any of them is kept. */
  searches: Clause[][];
  /** Terms that cannot be read from a collection, left out. */
  ignored: string[];
  /** Keywords the string asks for, so callers can tell "costume" from a plain range. */
  wants: Set<string>;
  species: Map<number, Species>;
}

export function parseGameSearch(text: string, species: Species[]): ParsedSearch {
  const byName = new Map<string, number[]>();
  const families = new Map<string, number[]>();
  for (const s of species) {
    for (const n of Object.values(s.name as LocalizedText)) if (typeof n === 'string') byName.set(fold(n), [...(byName.get(fold(n)) ?? []), s.dex]);
    families.set(s.family, [...(families.get(s.family) ?? []), s.dex]);
  }
  const familyOf = new Map(species.map((s) => [s.dex, s.family]));
  const ignored = new Set<string>();
  const wants = new Set<string>();

  const readTerm = (raw: string, positive: boolean): Term | null => {
    const r = fold(raw);
    if (!r) return null;
    const range = /^(\d*)-(\d*)$/.exec(r);
    if (range && (range[1] || range[2])) return { kind: 'dex', from: Number(range[1] || 1), to: Number(range[2] || 9999) };
    if (/^\d+$/.test(r)) return { kind: 'dex', from: Number(r), to: Number(r) };
    const kw = KEYWORDS[r] ?? KEYWORDS[raw.trim().toLowerCase()];
    if (kw) {
      if (positive) wants.add(kw);
      return { kind: 'key', id: kw };
    }
    if (TYPES[r]) return { kind: 'type', type: TYPES[r] };
    if (r.startsWith('+')) {
      const dexes = byName.get(r.slice(1));
      if (dexes) return { kind: 'dexes', dex: new Set(dexes.flatMap((d) => families.get(familyOf.get(d)!) ?? [d])) };
    }
    const dexes = byName.get(r);
    if (dexes) return { kind: 'dexes', dex: new Set(dexes) };
    ignored.add(raw.trim());
    return null;
  };

  const searches = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split(/[&|]/)
        .map((block): Clause | null => {
          const b = block.trim();
          // "!a,b" negates the whole block in game.
          const blockNeg = b.startsWith('!') && /[,;:]/.test(b);
          const parts = (blockNeg ? b.slice(1) : b).split(/[,;:]/);
          if (blockNeg) {
            const terms = parts.map((p) => readTerm(p, false)).filter((t): t is Term => !!t);
            return terms.length ? { neg: true, terms } : null;
          }
          // A single "!term" is a negated one-term block; mixed "a,!b" is rare: "!b" there is read as "not b" alone.
          if (parts.length === 1 && parts[0]!.trim().startsWith('!')) {
            const t = readTerm(parts[0]!.trim().slice(1), false);
            return t ? { neg: true, terms: [t] } : null;
          }
          const terms = parts.filter((p) => !p.trim().startsWith('!')).map((p) => readTerm(p, true)).filter((t): t is Term => !!t);
          // A block made only of terms we cannot read says nothing we can check: it is left out.
          return terms.length ? { neg: false, terms } : null;
        })
        .filter((c): c is Clause => !!c),
    )
    .filter((s) => s.length > 0);
  return { searches, ignored: [...ignored], wants, species: new Map(species.map((s) => [s.dex, s])) };
}

const matches = (search: Clause[], p: Mon) => search.every((c) => (c.neg ? !c.terms.some((t) => termMatches(t, p)) : c.terms.some((t) => termMatches(t, p))));

export interface ImportedEntry {
  variantKey: string;
  gender: EntryGender;
  shiny: boolean;
  tag: EntryTag;
  kind: Variant['kind'];
}

/**
 * Every Pokémon the search shows, one entry per variant and gender, in its simplest version that still matches
 * (not shiny and no tag unless the search asks for it). Female-asset duplicates (".g2") are folded into their variant.
 */
export function importFromSearch(parsed: ParsedSearch, variants: Variant[]): ImportedEntry[] {
  if (!parsed.searches.length) return [];
  const out: ImportedEntry[] = [];
  for (const v of variants) {
    if (v.key.endsWith('.g2')) continue;
    const genders: (Gender | null)[] = v.genders?.length ? v.genders : v.genders ? [null] : ['m', 'f'];
    for (const gender of genders) {
      let hit: Mon | null = null;
      search: for (const shiny of [false, true]) {
        if (shiny && !v.hasShiny) continue;
        for (const tag of TAG_TRIES) {
          if (tag === 'background' && !v.backgrounds?.length) continue;
          const p: Mon = { v, sp: parsed.species.get(v.dex), gender, shiny, tag };
          if (parsed.searches.some((s) => matches(s, p))) {
            hit = p;
            break search;
          }
        }
      }
      if (hit) out.push({ variantKey: v.key, gender: gender ?? '', shiny: hit.shiny, tag: hit.tag, kind: v.kind });
    }
  }
  return out;
}
