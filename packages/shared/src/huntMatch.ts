/**
 * Strict hunt matching & guaranteed pre-evolution resolution shared by the API (raid/spawn/quest alerts)
 * and the web app ("My hunts" highlights across Raids, Spawns, Eggs, Research, Rocket and Max Battles).
 *
 * Design rules:
 * 1. Never degrade an explicit costume/form/clone/Gigantamax URL token to the plain species when unknown.
 * 2. Exact match respects variant key, shiny availability, and source <-> tag compatibility
 *    (plain collections match all non-Gigantamax sources: wild, egg, research, raid, megaRaid plain catch, max,
 *    rocket and shadowRaid — Shadow catches can be purified; shadow/purified collections match rocket & shadowRaid;
 *    dynamax matches max; gmax matches Gigantamax form only).
 * 3. Pre-evolution matching is opt-in per collection and strictly safe:
 *    - Never matches pre-evolutions for Gigantamax.
 *    - For Mega/Primal variants, matches the Mega-capable plain base form and its guaranteed base pre-evolutions
 *      across all non-Gigantamax sources (including Rocket & Shadow Raids, since purified Pokémon can Mega Evolve).
 *    - Never matches a variant with `noEvolve: true` or `noMega: true`.
 *    - Costumes only come from the exact same evolvable costume (and never cross with plain variants).
 *    - Regional and special forms only come from their exact valid lineage in the game master
 *      (e.g. Galarian Meowth -> Perrserker, never Kanto Meowth; Alolan Raichu has no pre-evo in GO).
 */
import { neutralKey } from './keys.js';
import { regionOfForm } from './search.js';
import type { Dataset, Species, Variant } from './types.js';

export type HuntSource = 'wild' | 'egg' | 'research' | 'raid' | 'megaRaid' | 'shadowRaid' | 'rocket' | 'max' | 'gmax';

export interface LiveKnown {
  has: (key: string) => boolean;
  dexOf?: (englishName: string) => number | undefined;
  aliases?: Record<string, string>;
}

export interface HuntIndex extends LiveKnown {
  speciesByDex: Map<number, Species>;
  variantByKey: Map<string, Variant>;
  variantsByDex: Map<number, Variant[]>;
  dexByEnName: Map<string, number>;
  aliases: Record<string, string>;
  /** True when dataset carries game-master pvp evolution edges. */
  hasPvpEvos: boolean;
  /** targetKey -> exact pvp parent keys that evolve into targetKey. */
  pvpParentsByTarget: Map<string, string[]>;
  /** parentDex -> set of child dex numbers confirmed in pvp.evolutions. */
  pvpChildDexesByParent: Map<number, Set<number>>;
  /** parentKey -> set of child dex numbers confirmed in pvp.evolutions. */
  pvpChildDexesByKey: Map<string, Set<number>>;
  /** Cached safe pre-evolution keys per target neutral key. */
  preEvoCache: Map<string, string[]>;
  /** Reverse cache: candidate pre-evo key -> all target neutral keys it can safely evolve into. */
  descendantsByPreEvo: Map<string, string[]> | null;
}

export interface LiveMonRef {
  key: string;
  source: HuntSource;
  /** undefined = unknown (e.g. Max Battle event without shiny flag); false = shiny-locked. */
  canBeShiny?: boolean;
}

export interface HuntEntry {
  variantKey: string;
  shiny: boolean;
  tag: string;
  done?: boolean;
  alertPreEvolutions?: boolean;
}

const REGION_NAME_TO_FORM: Record<string, string> = {
  Alolan: 'ALOLA',
  Galarian: 'GALARIAN',
  Hisuian: 'HISUIAN',
  Paldean: 'PALDEA',
};

const REGION_TOKEN_ALIASES: Record<string, string> = {
  ALOLAN: 'ALOLA',
  GALAR: 'GALARIAN',
  HISUI: 'HISUIAN',
  PALDEAN: 'PALDEA',
};

/** Exact game-master evolutions where the evolved form token differs from its pre-evolution's form token. */
const EXTRA_PRE_EVOS: Record<string, string[]> = {
  '555.fSTANDARD': ['554'],
  '555.fGALARIAN_STANDARD': ['554.fGALARIAN'],
  '80.f2021': ['79.f2020'],
  '199.f2022': ['79.f2020'],
  '1013.fMASTERPIECE': ['1012.fARTISAN'],
  '1013.fUNREMARKABLE': ['1012.fCOUNTERFEIT'],
};

/** Forms that cannot be evolved into from standard pre-evolutions (event-exclusive or internal placeholders). */
const NO_PRE_EVO_KEYS = new Set(['666.fPOKEBALL', '666.fFANCY']);

/** Name hints that indicate a costumed / clone / armored encounter even when an image URL lacks a `.c`/`.f` suffix. */
const COSTUME_NAME_RE = /\b(wearing|costume|clone|armored|libre|with a |hat|crown|scarf|visor|glasses|bow|cap|ribbon|jacket|shirt|holiday|festive|party|flower)\b/i;

/** Builds a reusable hunt & evolution index from a Dataset. */
export function buildHuntIndex(ds: Pick<Dataset, 'species' | 'variants' | 'pvp' | 'aliases'>): HuntIndex {
  const speciesByDex = new Map<number, Species>();
  const dexByEnName = new Map<string, number>();
  for (const s of ds.species) {
    speciesByDex.set(s.dex, s);
    dexByEnName.set(s.name.en.toLowerCase(), s.dex);
  }
  const variantByKey = new Map<string, Variant>();
  const variantsByDex = new Map<number, Variant[]>();
  for (const v of ds.variants) {
    const k = neutralKey(v.key);
    if (!variantByKey.has(k)) variantByKey.set(k, v);
    if (!v.key.endsWith('.g2')) {
      (variantsByDex.get(v.dex) ?? variantsByDex.set(v.dex, []).get(v.dex)!).push(v);
    }
  }
  const pvpParentsByTarget = new Map<string, string[]>();
  const pvpChildDexesByParent = new Map<number, Set<number>>();
  const pvpChildDexesByKey = new Map<string, Set<number>>();
  const pvpMons = ds.pvp?.pokemon ?? [];
  const hasPvpEvos = pvpMons.some((p) => (p.evolutions?.length ?? 0) > 0);
  for (const p of pvpMons) {
    for (const to of p.evolutions ?? []) {
      const toKey = neutralKey(to);
      const fromKey = neutralKey(p.key);
      const toDex = Number(toKey.split('.')[0]);
      const list = pvpParentsByTarget.get(toKey) ?? pvpParentsByTarget.set(toKey, []).get(toKey)!;
      if (!list.includes(fromKey)) list.push(fromKey);
      (pvpChildDexesByParent.get(p.dex) ?? pvpChildDexesByParent.set(p.dex, new Set()).get(p.dex)!).add(toDex);
      (pvpChildDexesByKey.get(fromKey) ?? pvpChildDexesByKey.set(fromKey, new Set()).get(fromKey)!).add(toDex);
    }
  }
  const aliases = ds.aliases ?? {};
  return {
    speciesByDex,
    variantByKey,
    variantsByDex,
    dexByEnName,
    aliases,
    hasPvpEvos,
    pvpParentsByTarget,
    pvpChildDexesByParent,
    pvpChildDexesByKey,
    preEvoCache: new Map(),
    descendantsByPreEvo: null,
    has: (k) => variantByKey.has(neutralKey(k)),
    dexOf: (en) => dexByEnName.get(en.toLowerCase()),
  };
}

function canonicalAlias(key: string, known?: LiveKnown): string {
  const aliased = known?.aliases?.[key];
  return aliased ?? key;
}

/** Normalizes regional token variants like `.fGALAR` -> `.fGALARIAN` when the dataset uses the canonical token. */
function normalizeKnownToken(dex: number, tokens: string, known?: LiveKnown): string {
  const raw = canonicalAlias(`${dex}${tokens}`, known);
  if (!known || known.has(raw)) return raw;
  const normalized = tokens.replace(/\.f([A-Z0-9_]+)/g, (m, f: string) => (REGION_TOKEN_ALIASES[f] ? `.f${REGION_TOKEN_ALIASES[f]}` : m));
  const candidate = canonicalAlias(`${dex}${normalized}`, known);
  if (known.has(candidate)) return candidate;
  return raw;
}

/**
 * Strictly resolves a Leek Duck / ScrapedDuck picture + English name to our neutral variant key.
 * Unlike `liveKey` (used for raid counter stats), this NEVER strips an explicit costume/form/clone/gmax token
 * back to the base species when unrecognized, preventing false-positive hunt alerts.
 */
export function resolveLiveKey(image: string, name = '', known?: LiveKnown): string | null {
  const plainName = name.replace(/^Shadow /i, '').trim();

  // 1. PokeMiners naming: .../pm25.cPARTY_HAT.icon.png, .../pm6.fMEGA_X.icon.png, .../pm710.fAVERAGE.cFALL_2022.icon.png
  const pm = /\/pm(\d+)((?:\.[fc][A-Z0-9_]+)*)\.(?:s\.)?icon\.png(?:$|[?#])/.exec(image);
  if (pm) {
    const dex = Number(pm[1]);
    // Strip only `.fNORMAL` (PokeMiners' marker for the plain species form).
    const tokens = (pm[2] ?? '').replace(/\.fNORMAL(?=$|\.)/g, '');
    if (tokens) return normalizeKnownToken(dex, tokens, known);
    return resolveFromDexAndName(dex, plainName, known);
  }

  // 2. Legacy numbered format: .../pokemon_icon_037_61.png or .../pokemon_icon_025_00_05.png
  const old = /pokemon_icon_(\d{3,4})_(\d{2,})(?:_(\d{2,}))?/.exec(image);
  if (old) {
    const dex = Number(old[1]);
    const costumeId = old[3];
    if (costumeId && costumeId !== '00') {
      // Unresolved legacy costume asset: never pretend it is the plain species.
      return `${dex}.cLEGACY_${costumeId}`;
    }
    return resolveFromDexAndName(dex, plainName, known);
  }

  // 3. Name-only image (e.g. "Mega%20Skarmory.png"): fall back to English species lookup.
  if (!plainName || !known?.dexOf) return null;
  const speciesText = plainName
    .replace(/^(Gigantamax|Dynamax|Mega|Primal) /i, '')
    .replace(/^(Alolan|Galarian|Hisuian|Paldean) /i, '')
    .replace(/ [XY]$/, '')
    .replace(/\s*\(.*\)$/, '')
    .trim();
  const dex = known.dexOf(speciesText);
  if (!dex) return null;
  return resolveFromDexAndName(dex, plainName, known);
}

function resolveFromDexAndName(dex: number, plainName: string, known?: LiveKnown): string {
  if (/^Gigantamax /i.test(plainName)) return canonicalAlias(`${dex}.fGIGANTAMAX`, known);
  const mega = /^Mega (.+?)( [XY])?$/i.exec(plainName);
  if (mega) return canonicalAlias(`${dex}.fMEGA${mega[2] ? `_${mega[2].trim().toUpperCase()}` : ''}`, known);
  if (/^Primal /i.test(plainName)) return canonicalAlias(`${dex}.fPRIMAL`, known);

  const firstWord = plainName.split(/\s+/)[0] ?? '';
  const region = REGION_NAME_TO_FORM[firstWord];
  if (region) {
    const key = canonicalAlias(`${dex}.f${region}`, known);
    // Never degrade a regional prefix (e.g. "Galarian Meowth") to plain base species.
    return key;
  }

  // Parenthetical forms: "Deoxys (Defense)", "Tornadus (Incarnate Forme)", "Shellos (East Sea)"
  const paren = /\(([^)]+)\)/.exec(plainName)?.[1]?.trim();
  if (paren) {
    const cleaned = paren.replace(/\bFormes?\b|\bForms?\b/gi, '').trim();
    const fullWord = cleaned.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const firstTok = cleaned.split(/\s+/)[0]?.toUpperCase() ?? '';
    for (const cand of [fullWord, firstTok]) {
      if (!cand || cand === 'NORMAL') continue;
      const k = canonicalAlias(`${dex}.f${cand}`, known);
      if (!known || known.has(k)) return k;
    }
  }

  // Guard against costumed/clone encounters whose URL had no costume token.
  if (COSTUME_NAME_RE.test(plainName)) return `${dex}.cUNRESOLVED`;

  return canonicalAlias(String(dex), known);
}

const MEGA_SUFFIX_RE = /\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/;

/** Refines a generic raid/max source using the resolved key & name (Mega Raid, Shadow Raid, Gigantamax). */
export function inferHuntSource(base: HuntSource, key: string, name = ''): HuntSource {
  if (base === 'raid') {
    if (/^Shadow /i.test(name)) return 'shadowRaid';
    if (MEGA_SUFFIX_RE.test(key) || /^(Mega|Primal) /i.test(name)) return 'megaRaid';
  }
  if (base === 'max') {
    if (key.endsWith('.fGIGANTAMAX') || /^Gigantamax /i.test(name)) return 'gmax';
  }
  return base;
}

/** Strips a species prefix from a form token ("WORMADAM_SANDY" -> "SANDY", "BURMY_SANDY" -> "SANDY"). */
function normalizedFormName(species: Species | undefined, form: string | null): string | null {
  if (!form) return null;
  const prefix = species ? `${species.id}_` : '';
  return prefix && form.startsWith(prefix) ? form.slice(prefix.length) : form;
}

/** Direct (1-step) guaranteed pre-evolutions for a target variant. */
function directPreEvolutions(index: HuntIndex, target: Variant): Variant[] {
  const tKey = neutralKey(target.key);
  if (target.kind === 'gmax') return [];
  if (target.kind === 'mega') {
    // Only the plain Mega-capable base form (never noMega clones/armored or non-Mega regional forms).
    const base = (index.variantsByDex.get(target.dex) ?? []).find(
      (v) => v.kind === 'base' && !v.key.endsWith('.g2') && !v.noMega,
    );
    return base ? [base] : [];
  }
  if (NO_PRE_EVO_KEYS.has(tKey)) return [];
  if (target.form && /^BREAD_DOUGH_MODE/i.test(target.form)) return [];

  const explicit = EXTRA_PRE_EVOS[tKey];
  if (explicit) {
    return explicit
      .map((k) => index.variantByKey.get(k))
      .filter((v): v is Variant => !!v && !v.noEvolve && v.kind !== 'mega' && v.kind !== 'gmax');
  }

  const sp = index.speciesByDex.get(target.dex);
  const parentDex = sp?.parent;
  if (!parentDex) return [];

  const parentSp = index.speciesByDex.get(parentDex);
  const parentVariants = (index.variantsByDex.get(parentDex) ?? []).filter(
    (p) => !p.key.endsWith('.g2') && !p.noEvolve && p.kind !== 'mega' && p.kind !== 'gmax',
  );
  if (!parentVariants.length) return [];

  // 1. Costumes: strictly the exact same evolvable costume (and form if combined, e.g. Pumpkaboo size + Fall 2022).
  if (target.kind === 'costume') {
    if (index.hasPvpEvos && !index.pvpChildDexesByParent.get(parentDex)?.has(target.dex)) return [];
    return parentVariants.filter(
      (p) => p.kind === 'costume' && p.costume === target.costume && p.form === target.form,
    );
  }

  // 2. Regional forms: only exact game-master regional lineages (never plain Pikachu -> Alolan Raichu).
  if (target.kind === 'regional') {
    if (index.hasPvpEvos) {
      const fromKeys = index.pvpParentsByTarget.get(tKey) ?? [];
      return fromKeys
        .map((k) => index.variantByKey.get(k))
        .filter((p): p is Variant => !!p && !p.noEvolve && p.kind !== 'costume' && p.kind !== 'mega' && p.kind !== 'gmax');
    }
    const reg = regionOfForm(target.form);
    return reg ? parentVariants.filter((p) => p.kind === 'regional' && regionOfForm(p.form) === reg) : [];
  }

  // 3. Base species: follow exact game-master edges so e.g. Perrserker <- Galarian Meowth (not Kanto Meowth),
  //    and raid-only evolutions like Kleavor / Wyrdeer have no pre-evolution.
  if (target.kind === 'base') {
    if (index.hasPvpEvos) {
      const fromKeys = index.pvpParentsByTarget.get(tKey) ?? [];
      const out: Variant[] = [];
      for (const fk of fromKeys) {
        const direct = index.variantByKey.get(fk);
        if (direct) {
          if (!direct.noEvolve && direct.kind !== 'costume' && direct.kind !== 'mega' && direct.kind !== 'gmax') out.push(direct);
        } else if (fk === String(parentDex)) {
          // Folded stat-identical cosmetic forms (e.g. Burmy -> Mothim): all non-costume forms of parent evolve into it.
          for (const p of parentVariants) if (p.kind === 'form') out.push(p);
        }
      }
      return out;
    }
    return parentVariants.filter((p) => p.kind === 'base');
  }

  // 4. Visual / non-regional forms (`kind === 'form'`): match exact form token first (Flabébé colour, Burmy cloak,
  //    Pumpkaboo size, Shellos sea, Sinistea authenticity, Deerling season, Rockruff Dusk), otherwise fall back to
  //    the parent's plain base variant only when confirmed by game-master evolutions (e.g. Rockruff -> Midday/Midnight).
  if (index.hasPvpEvos && !index.pvpChildDexesByParent.get(parentDex)?.has(target.dex)) return [];
  const tNorm = normalizedFormName(sp, target.form);
  if (tNorm) {
    const exactForm = parentVariants.filter(
      (p) => p.kind !== 'costume' && p.kind !== 'regional' && normalizedFormName(parentSp, p.form) === tNorm,
    );
    if (exactForm.length) return exactForm;
  }
  const baseParent = parentVariants.find((p) => p.kind === 'base');
  if (!baseParent) return [];
  if (index.hasPvpEvos && !index.pvpChildDexesByKey.get(neutralKey(baseParent.key))?.has(target.dex)) return [];
  return [baseParent];
}

/**
 * Returns every neutral variant key that can legitimately evolve (in 1 to 4 steps) into `targetKey`.
 * For Mega/Primal variants, returns the Mega-capable base species and its guaranteed base pre-evolutions
 * (e.g. Mega Charizard X -> Charizard, Charmeleon, Charmander; never Clone Charizard or non-Mega regional forms).
 * Empty for Gigantamax, raid-only regional evolutions, non-evolvable costumes, etc.
 */
export function safePreEvolutions(index: HuntIndex, targetKey: string): string[] {
  const key = neutralKey(targetKey);
  const cached = index.preEvoCache.get(key);
  if (cached) return cached;

  const target = index.variantByKey.get(key);
  if (!target) {
    index.preEvoCache.set(key, []);
    return [];
  }

  const found: string[] = [];
  const visited = new Set<string>([key]);
  let frontier: Variant[] = [target];
  for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
    const next: Variant[] = [];
    for (const cur of frontier) {
      for (const p of directPreEvolutions(index, cur)) {
        const pk = neutralKey(p.key);
        if (visited.has(pk)) continue;
        visited.add(pk);
        found.push(pk);
        next.push(p);
      }
    }
    frontier = next;
  }
  index.preEvoCache.set(key, found);
  return found;
}

/** Builds (lazily) the reverse map: pre-evolution key -> all target keys it can safely evolve into. */
function descendantsMap(index: HuntIndex): Map<string, string[]> {
  if (index.descendantsByPreEvo) return index.descendantsByPreEvo;
  const rev = new Map<string, string[]>();
  for (const k of index.variantByKey.keys()) {
    for (const pre of safePreEvolutions(index, k)) {
      const list = rev.get(pre) ?? rev.set(pre, []).get(pre)!;
      if (!list.includes(k)) list.push(k);
    }
  }
  index.descendantsByPreEvo = rev;
  return rev;
}

/** Keys obtained directly from a live encounter (`megaRaid` gives both the Mega entry and its plain catch form). */
export function obtainableKeysFor(live: Pick<LiveMonRef, 'key' | 'source'>): { exact: string[]; catchableForPreEvo: string[] } {
  const k = neutralKey(live.key);
  if (live.source === 'gmax') {
    const gmaxKey = k.endsWith('.fGIGANTAMAX') ? k : `${k.split('.')[0]}.fGIGANTAMAX`;
    return { exact: [gmaxKey], catchableForPreEvo: [] };
  }
  if (live.source === 'megaRaid') {
    const catchKey = k.replace(MEGA_SUFFIX_RE, '');
    return catchKey !== k ? { exact: [k, catchKey], catchableForPreEvo: [catchKey] } : { exact: [k], catchableForPreEvo: [k] };
  }
  return { exact: [k], catchableForPreEvo: MEGA_SUFFIX_RE.test(k) || k.endsWith('.fGIGANTAMAX') ? [] : [k] };
}

/**
 * All collection entry `variantKey`s that could possibly match a list of live encounters (for fast SQL filtering).
 * Includes exact targets, Mega Raid plain catches, and all safe evolution descendants of those encounters.
 */
export function candidateTargetKeys(index: HuntIndex | null, lives: Pick<LiveMonRef, 'key' | 'source'>[]): string[] {
  const keys = new Set<string>();
  const rev = index ? descendantsMap(index) : null;
  for (const live of lives) {
    const { exact, catchableForPreEvo } = obtainableKeysFor(live);
    for (const k of exact) keys.add(k);
    if (rev) {
      for (const k of catchableForPreEvo) {
        for (const desc of rev.get(k) ?? []) keys.add(desc);
      }
    }
  }
  return [...keys];
}

/** True when a collection entry's tag can be obtained from the given live source. */
export function sourceMatchesTag(source: HuntSource, tag: string, isMegaKey = false): boolean {
  if (source === 'rocket' || source === 'shadowRaid') return !isMegaKey && (tag === '' || tag === 'shadow' || tag === 'purified');
  if (source === 'gmax') return tag === '' || tag === 'dynamax';
  if (source === 'max') return !isMegaKey && (tag === '' || tag === 'dynamax');
  if (source === 'megaRaid') return tag === '';
  // wild, egg, research, raid: plain catches only (never shadow, purified, lucky, dynamax, background, xxl/xxs)
  return !isMegaKey && tag === '';
}

function canLiveBeShiny(index: HuntIndex | null, live: LiveMonRef): boolean {
  if (live.canBeShiny === true) return true;
  if (live.canBeShiny === false) return false;
  // Unknown shiny status (e.g. Max Battle event card): verify against dataset when available.
  if (!index) return true;
  const k = neutralKey(live.key);
  const v = index.variantByKey.get(k) ?? index.variantByKey.get(k.replace(MEGA_SUFFIX_RE, ''));
  if (!v) return true;
  return v.hasShiny && v.shinyReleased !== false;
}

/** Checks whether a single missing collection entry matches a live encounter. */
export function entryMatchesLive(index: HuntIndex | null, entry: HuntEntry, live: LiveMonRef): boolean {
  if (entry.done) return false;
  if (entry.shiny && !canLiveBeShiny(index, live)) return false;

  const targetKey = neutralKey(entry.variantKey);
  const { exact, catchableForPreEvo } = obtainableKeysFor(live);
  const targetIsMega = MEGA_SUFFIX_RE.test(targetKey);
  const targetIsGmax = targetKey.endsWith('.fGIGANTAMAX');

  // Gigantamax entries only ever come from Gigantamax battles.
  if (targetIsGmax) {
    return live.source === 'gmax' && sourceMatchesTag(live.source, entry.tag, false) && exact.includes(targetKey);
  }
  // Mega/Primal entries come directly from Mega/Primal raids, OR (when pre-evolutions are enabled on the list)
  // from any Mega-capable pre-evolution across all non-Gigantamax sources (including Rocket & Shadow Raids,
  // since Shadow Pokémon can be purified and Mega Evolved).
  if (targetIsMega) {
    if (entry.tag !== '') return false;
    if (live.source === 'megaRaid' && exact.includes(targetKey)) return true;
    if (
      entry.alertPreEvolutions &&
      index &&
      live.source !== 'gmax' &&
      catchableForPreEvo.length > 0
    ) {
      const pres = safePreEvolutions(index, targetKey);
      if (catchableForPreEvo.some((k) => pres.includes(k))) return true;
    }
    return false;
  }

  if (!sourceMatchesTag(live.source, entry.tag, false)) return false;

  if (exact.includes(targetKey)) return true;

  if (entry.alertPreEvolutions && index && catchableForPreEvo.length > 0) {
    const pres = safePreEvolutions(index, targetKey);
    if (catchableForPreEvo.some((k) => pres.includes(k))) return true;
  }
  return false;
}

type SourceBucket = 'plain' | 'shadowRaid' | 'rocket' | 'max' | 'gmax' | 'mega';

const ALL_PLAIN_BUCKETS: SourceBucket[] = ['plain', 'max', 'rocket', 'shadowRaid'];

function bucketsForEntry(entry: HuntEntry, isMegaTarget: boolean, isGmaxTarget: boolean): SourceBucket[] {
  if (isGmaxTarget) return entry.tag === '' || entry.tag === 'dynamax' ? ['gmax'] : [];
  if (isMegaTarget) return entry.tag === '' ? ['mega'] : [];
  if (entry.tag === '') return ALL_PLAIN_BUCKETS;
  if (entry.tag === 'dynamax') return ['max'];
  if (entry.tag === 'shadow' || entry.tag === 'purified') return ['shadowRaid', 'rocket'];
  return [];
}

function sourceToBucket(source: HuntSource, isMegaKey: boolean): SourceBucket {
  if (source === 'gmax') return 'gmax';
  if (source === 'max') return 'max';
  if (source === 'rocket') return 'rocket';
  if (source === 'shadowRaid') return 'shadowRaid';
  if (source === 'megaRaid' && isMegaKey) return 'mega';
  return 'plain';
}

export interface HuntMatcher {
  hasMissing: boolean;
  /** Checks a live Pokémon from its Leek Duck image, English name, source type and shiny flag. */
  isWanted: (image: string, name: string, source: HuntSource, canBeShiny?: boolean) => boolean;
  /** Checks a pre-resolved variant key directly (useful for Max Battles where no Leek Duck icon URL exists). */
  isWantedKey: (key: string, source: HuntSource, canBeShiny?: boolean) => boolean;
}

/**
 * Pre-indexes a player's missing collection entries for O(1) live matching on the Game page.
 */
export function buildHuntMatcher(index: HuntIndex | null, entries: HuntEntry[]): HuntMatcher {
  const normal = new Map<string, Set<SourceBucket>>();
  const shiny = new Map<string, Set<SourceBucket>>();
  let hasMissing = false;

  const add = (map: Map<string, Set<SourceBucket>>, key: string, buckets: SourceBucket[]) => {
    if (!buckets.length) return;
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    for (const b of buckets) set.add(b);
  };

  for (const e of entries) {
    if (e.done) continue;
    const targetKey = neutralKey(e.variantKey);
    const isMega = MEGA_SUFFIX_RE.test(targetKey);
    const isGmax = targetKey.endsWith('.fGIGANTAMAX');
    const buckets = bucketsForEntry(e, isMega, isGmax);
    if (!buckets.length) continue;
    hasMissing = true;
    const map = e.shiny ? shiny : normal;
    add(map, targetKey, buckets);
    if (e.alertPreEvolutions && index && !isGmax) {
      // Unified across all non-Gigantamax sources (wild, egg, research, raid, max, rocket, shadowRaid).
      const preBuckets: SourceBucket[] = isMega ? ALL_PLAIN_BUCKETS : buckets;
      for (const pre of safePreEvolutions(index, targetKey)) {
        add(map, pre, preBuckets);
      }
    }
  }

  const isWantedKey = (rawKey: string, rawSource: HuntSource, canBeShiny?: boolean): boolean => {
    const key = neutralKey(rawKey);
    const source = inferHuntSource(rawSource, key);
    const { exact } = obtainableKeysFor({ key, source });
    const shinyOk = canLiveBeShiny(index, { key, source, canBeShiny });
    for (const k of exact) {
      const bucket = sourceToBucket(source, MEGA_SUFFIX_RE.test(k));
      if (normal.get(k)?.has(bucket)) return true;
      if (shinyOk && shiny.get(k)?.has(bucket)) return true;
    }
    return false;
  };

  const isWanted = (image: string, name: string, rawSource: HuntSource, canBeShiny?: boolean): boolean => {
    const key = resolveLiveKey(image, name, index ?? undefined);
    if (!key) return false;
    const source = inferHuntSource(rawSource, key, name);
    return isWantedKey(key, source, canBeShiny);
  };

  return { hasMissing, isWanted, isWantedKey };
}
