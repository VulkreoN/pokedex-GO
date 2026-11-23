/**
 * Builds the MyDexPoGo dataset from datamined sources.
 *
 *   pnpm --filter @mydexpogo/data build [--offline] [--max-age=24] [--out=path]
 *
 * Sources: PokeMiners game master + asset tree + text dumps, WatWowMap costume enum, pogoapi shiny list.
 * Output: <out>/pokedex.json and <out>/manifest.json (default: apps/web/public/data).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeVariantKey,
  neutralKey,
  type BackgroundInfo,
  type Dataset,
  type Gender,
  type LocalizedText,
  type PokemonType,
  type Rarity,
  type Species,
  type Variant,
  type VariantKind,
} from '@mydexpogo/shared';
import { ASSET_BASE, BACKGROUND_IMAGE_BASE, MEGA_BASE, POKEAPI_ARTWORK, SOURCES, fetchJson, fetchPictureList, type FetchOptions } from './sources.js';
import { gameFormLabel, humanizeToken, localizeHumanized, looksLikeCostume } from './labels.js';
import { updateEventArchive } from './events.js';
import { extractPvp } from './pvp.js';

export interface BuildOptions {
  fetch: FetchOptions;
  /** Manual overrides stored by the app (managers), applied after the file overrides. */
  manual?: ManualOverrides;
  /** Species seen in the game by other means (Leek Duck raids, eggs, research, events), dex numbers. */
  extraReleased?: Iterable<number>;
  /** First-seen dates recorded by previous runs, by variant key. Keys absent here are new (or estimated on the first run). */
  knownSince?: Record<string, string>;
  /** True on the very first run: unknown keys get an estimate instead of "today". */
  baseline?: boolean;
  log?: (msg: string) => void;
}

/** What a manager can change from the web app, keyed by variant key. */
export type ManualOverrides = Record<string, { released?: boolean | null; label?: LocalizedText | null; genders?: Gender[] | null; shinyReleased?: boolean | null; noEvolve?: boolean | null }>;

export interface BuildResult {
  dataset: Dataset;
  stats: { species: number; released: number; variants: number; datamined: number; byKind: Record<string, number> };
}

/* ---------- Source shapes (only what we read) ---------- */
interface GmTemplate {
  templateId: string;
  data: {
    templateId: string;
    pokemonSettings?: {
      pokemonId: string;
      form?: string;
      type?: string;
      type2?: string;
      familyId?: string;
      pokemonClass?: string;
      parentPokemonId?: string;
      tempEvoOverrides?: { tempEvoId?: string }[];
      evolutionBranch?: { evolution?: string; temporaryEvolution?: string }[];
      /** "_NOEVOLVE" costumes this species may evolve with all the same. */
      allowNoevolveEvolution?: string[];
    };
    formSettings?: { pokemon: string; forms?: { form: string; isCostume?: boolean }[] };
  };
}
interface Texts { data: string[] }
interface CostumeEnum { id: number; name: string; proto: string; noEvolve: boolean }
type ShinyList = Record<string, { found_wild?: boolean; found_egg?: boolean; found_raid?: boolean; found_research?: boolean; found_evolution?: boolean; found_photobomb?: boolean }>;

/* ---------- Helpers ---------- */
const GEN_BOUNDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const genOf = (dex: number) => GEN_BOUNDS.findIndex((max) => dex <= max) + 1 || GEN_BOUNDS.length;
const typeOf = (t?: string): PokemonType | null => (t ? (t.replace('POKEMON_TYPE_', '').toLowerCase() as PokemonType) : null);
const rarityOf = (c?: string): Rarity =>
  c === 'POKEMON_CLASS_LEGENDARY' ? 'legendary' : c === 'POKEMON_CLASS_MYTHIC' ? 'mythic' : c === 'POKEMON_CLASS_ULTRA_BEAST' ? 'ultra_beast' : 'normal';
const GENDER_ORDER: Record<string, number> = { n: 0, m: 1, f: 2 };
const KIND_ORDER: Record<VariantKind, number> = { base: 0, regional: 1, form: 2, costume: 3, mega: 4, gmax: 5 };

/** "COMBAT_V0216_MOVE_MUD_SHOT_FAST" + text "move_name_0216" -> MUD_SHOT: { en: 'Mud Shot', fr: 'Tir de Boue' }. */
export function moveNames(gm: { templateId: string }[], texts: { en: Map<string, string>; fr: Map<string, string> }): Record<string, LocalizedText> {
  const out: Record<string, LocalizedText> = {};
  for (const t of gm) {
    const m = /^COMBAT_V(\d{4})_MOVE_(.+?)(?:_FAST)?$/.exec(t.templateId);
    if (!m) continue;
    const en = texts.en.get(`move_name_${m[1]}`);
    if (!en) continue;
    const fr = texts.fr.get(`move_name_${m[1]}`);
    out[m[2]!] = fr ? { en, fr } : { en };
  }
  return out;
}

function textsToMap(t: Texts): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i + 1 < t.data.length; i += 2) m.set(t.data[i]!, t.data[i + 1]!);
  return m;
}

function kindOf(form: string | null, costume: string | null, isGmCostume: boolean): VariantKind {
  if (costume) return 'costume';
  if (!form) return 'base';
  if (/^(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/.test(form)) return 'mega';
  if (/^(GIGANTAMAX|ETERNAMAX)$/.test(form)) return 'gmax';
  if (/^(ALOLA|GALAR|HISUI|PALDEA)/.test(form)) return 'regional';
  if (isGmCostume || looksLikeCostume(form)) return 'costume';
  return 'form';
}

interface AssetGroup {
  dex: number;
  form: string | null;
  costume: string | null;
  female: boolean;
  normal?: string; // filename in 256 folder, or absolute URL
  shiny?: string;
}

/* ---------- Build ---------- */
export async function buildDataset(options: BuildOptions): Promise<BuildResult> {
  const fetchOpts = options.fetch;
  const log = options.log ?? console.log;
  const manual = options.manual ?? {};
  const [gm, pictures, textsEn, textsFr, costumeEnum, shinyList, releasedList, backgroundMap] = await Promise.all([
    fetchJson<GmTemplate[]>('gameMaster', fetchOpts),
    fetchPictureList(fetchOpts),
    fetchJson<Texts>('textsEn', fetchOpts),
    fetchJson<Texts>('textsFr', fetchOpts),
    fetchJson<CostumeEnum[]>('costumes', fetchOpts),
    fetchJson<ShinyList>('shiny', fetchOpts).catch((e) => {
      log(`shiny list unavailable (${e.message}); shinyReleased will be null`);
      return null;
    }),
    fetchJson<Record<string, { id: number; name: string }>>('released', fetchOpts).catch((e) => {
      log(`released list unavailable (${e.message}); falling back to asset presence`);
      return null;
    }),
    fetchJson<Record<string, string[]>>('backgrounds', fetchOpts).catch((e) => {
      log(`backgrounds unavailable (${e.message})`);
      return null;
    }),
  ]);
  const extraReleased = new Set(options.extraReleased ?? []);

  const texts = { en: textsToMap(textsEn), fr: textsToMap(textsFr) };
  const costumeByProto = new Map(costumeEnum.map((c) => [c.proto, c]));

  /* Game master: species, form lists, per-form types, megas */
  const speciesByDex = new Map<number, Species & { gmForms: Map<string, boolean>; tempEvos: Set<string> }>();
  const formTypes = new Map<string, PokemonType[]>(); // `${dex}:${token}`
  /** What a species or one of its forms can do: evolve, Mega Evolve. `${dex}` for the species, `${dex}:${token}` for a form. */
  const abilities = new Map<string, { evolves: boolean; megas: boolean }>();
  const noevolveAllowed = new Map<number, Set<string>>();
  for (const t of gm) {
    const m = /^V(\d{4})_POKEMON_(.+)$/.exec(t.templateId);
    const ps = t.data.pokemonSettings;
    if (!m || !ps) continue;
    const dex = Number(m[1]);
    const types = [typeOf(ps.type), typeOf(ps.type2)].filter((x): x is PokemonType => !!x);
    const can = { evolves: (ps.evolutionBranch ?? []).some((b) => b.evolution), megas: (ps.evolutionBranch ?? []).some((b) => b.temporaryEvolution) || !!ps.tempEvoOverrides?.length };
    if (!ps.form) {
      abilities.set(`${dex}`, can);
      if (ps.allowNoevolveEvolution?.length) noevolveAllowed.set(dex, new Set(ps.allowNoevolveEvolution));
      const nameKey = `pokemon_name_${String(dex).padStart(4, '0')}`;
      const en = texts.en.get(nameKey) ?? humanizeToken(ps.pokemonId);
      const fr = texts.fr.get(nameKey);
      speciesByDex.set(dex, {
        dex,
        id: ps.pokemonId,
        name: fr && fr !== en ? { en, fr } : { en },
        gen: genOf(dex),
        types,
        rarity: rarityOf(ps.pokemonClass),
        family: ps.familyId ?? `FAMILY_${ps.pokemonId}`,
        genderDiff: false,
        shinyReleased: null,
        released: false,
        gmForms: new Map(),
        tempEvos: new Set((ps.tempEvoOverrides ?? []).map((e) => (e.tempEvoId ?? '').replace('TEMP_EVOLUTION_', ''))),
      });
    } else {
      const token = ps.form.startsWith(`${ps.pokemonId}_`) ? ps.form.slice(ps.pokemonId.length + 1) : ps.form;
      abilities.set(`${dex}:${token}`, can);
      if (types.length) {
        formTypes.set(`${dex}:${token}`, types);
        formTypes.set(`${dex}:${ps.form}`, types);
      }
    }
  }
  const speciesById = new Map([...speciesByDex.values()].map((s) => [s.id, s]));
  // Evolution parents, for the family order in the Pokédex (Pichu, Pikachu, Raichu).
  for (const t of gm) {
    const m = /^V(\d{4})_POKEMON_(.+)$/.exec(t.templateId);
    const ps = t.data.pokemonSettings;
    if (!m || !ps || ps.form || !ps.parentPokemonId) continue;
    const sp = speciesByDex.get(Number(m[1]));
    const parent = speciesById.get(ps.parentPokemonId);
    if (sp && parent && parent.dex !== sp.dex) sp.parent = parent.dex;
  }
  /** Species whose form list has a NORMAL form: their formless picture is that form. */
  const withNormalForm = new Set<number>();
  for (const t of gm) {
    const fs = t.data.formSettings;
    if (!t.templateId.startsWith('FORMS_V') || !fs) continue;
    const sp = speciesById.get(fs.pokemon);
    if (!sp) continue;
    for (const f of fs.forms ?? []) {
      const token = f.form.startsWith(`${fs.pokemon}_`) ? f.form.slice(fs.pokemon.length + 1) : f.form;
      if (token === 'NORMAL') {
        withNormalForm.add(sp.dex);
        continue;
      }
      sp.gmForms.set(token, !!f.isCostume);
      if (token !== f.form) sp.gmForms.set(f.form, !!f.isCostume);
    }
  }
  log(`game master: ${speciesByDex.size} species, ${[...speciesByDex.values()].reduce((n, s) => n + s.gmForms.size, 0)} forms`);

  const overridesFile = JSON.parse(await readFile(new URL('./overrides.json', import.meta.url), 'utf8')) as { megas?: string[] };

  /* Pictures: the mirror's list (PokeMiners file names), Dynamax duplicates skipped (a trait, not a look) */
  const groups = new Map<string, AssetGroup>();
  const addressable = (file: string, absoluteBase: string | null) => {
    const m = /^pm(\d+)((?:\.[A-Za-z0-9_]+)*)\.icon\.png$/.exec(file);
    if (!m) return;
    const dex = Number(m[1]);
    let form: string | null = null;
    let costume: string | null = null;
    let female = false;
    let shiny = false;
    for (const tok of (m[2] ?? '').split('.').filter(Boolean)) {
      if (tok === 's') shiny = true;
      else if (tok === 'g2') female = true;
      else if (tok.startsWith('f')) form = tok.slice(1);
      else if (tok.startsWith('c')) costume = tok.slice(1).toUpperCase(); // one stray lowercase file upstream (cMay_2023)
      else return; // unknown token: skip file
    }
    if (form && /DYNAMAX/.test(form)) return;
    const key = makeVariantKey({ dex, form, costume, gender: female ? 'f' : null });
    const g = groups.get(key) ?? { dex, form, costume, female };
    const ref = absoluteBase ? absoluteBase + file : file;
    if (shiny) g.shiny ??= ref;
    else g.normal ??= ref;
    groups.set(key, g);
  };
  for (const file of pictures) addressable(file.trim(), null);
  // Mega / Primal looks come from the game master's temporary evolutions; PokeMiners has a picture for each.
  let megaCount = 0;
  for (const sp of speciesByDex.values()) {
    for (const evo of sp.tempEvos) {
      const form = evo === 'MEGA' || evo === 'MEGA_X' || evo === 'MEGA_Y' || evo === 'PRIMAL' ? evo : null;
      if (!form) continue;
      addressable(`pm${sp.dex}.f${form}.icon.png`, MEGA_BASE);
      addressable(`pm${sp.dex}.f${form}.s.icon.png`, MEGA_BASE);
      megaCount++;
    }
  }
  // Megas newer than the game master snapshot, listed by hand in overrides.json
  for (const key of overridesFile.megas ?? []) {
    const m = /^(\d+)\.f(MEGA(?:_X|_Y)?|PRIMAL)$/.exec(key);
    if (!m) continue;
    addressable(`pm${m[1]}.f${m[2]}.icon.png`, MEGA_BASE);
    addressable(`pm${m[1]}.f${m[2]}.s.icon.png`, MEGA_BASE);
    megaCount++;
  }
  log(`pictures: ${groups.size} variant pictures (${megaCount} mega/primal from the game master + overrides)`);

  /* Variants */
  const variants: Variant[] = [];
  const femaleKeys = new Set([...groups.values()].filter((g) => g.female).map((g) => makeVariantKey({ dex: g.dex, form: g.form, costume: g.costume, gender: null })));
  // Read at build time (not a static import) so a long-running job picks up edits without restarting.
  const overrides = JSON.parse(await readFile(new URL('./overrides.json', import.meta.url), 'utf8')) as {
    speciesNames?: Record<string, { fr?: string }>;
    /** Battle-only form key -> the form it is caught in. */
    battleForms?: Record<string, string>;
    labels: Record<string, LocalizedText>;
    status: Record<string, 'released' | 'datamined'>;
    megas?: string[];
    /** Checked by hand for forms the game master does not describe yet, by gender-neutral variant key. */
    genders?: Record<string, Gender[]>;
  };
  const labelOverrides = overrides.labels;
  // Species the game texts do not name in French yet.
  for (const [dex, n] of Object.entries(overrides.speciesNames ?? {})) {
    const sp = speciesByDex.get(Number(dex));
    if (sp && n.fr && !sp.name.fr) sp.name = { ...sp.name, fr: n.fr };
  }
  const statusOverrides = overrides.status;

  const labelFor = (sp: Species, form: string | null, costume: string | null): LocalizedText | null => {
    if (costume) {
      if (labelOverrides[costume]) return labelOverrides[costume];
      const e = costumeByProto.get(costume);
      return localizeHumanized(e ? e.name.replace(/\s*Noevolve$/i, '') : humanizeToken(costume));
    }
    if (!form) return null;
    // Spinda's patterns are numbered from 00 in the game files.
    if (sp.id === 'SPINDA' && /^\d+$/.test(form)) return { en: `Pattern ${Number(form) + 1}`, fr: `Motif ${Number(form) + 1}` };
    // A label for this species' form first ("351.fSUNNY": Castform, not Cherrim), then for the form name anywhere.
    return labelOverrides[`${sp.dex}.f${form}`] ?? labelOverrides[form] ?? gameFormLabel(texts, sp.id, form) ?? localizeHumanized(humanizeToken(form));
  };

  const push = (sp: Species & { gmForms: Map<string, boolean>; tempEvos: Set<string> }, g: AssetGroup | null, form: string | null, costume: string | null, gender: 'm' | 'f' | null) => {
    const key = makeVariantKey({ dex: sp.dex, form, costume, gender });
    const gmCostume = form ? sp.gmForms.get(form) : undefined;
    const kind = kindOf(form, costume, gmCostume === true);
    let inGameMaster: boolean;
    if (kind === 'mega') inGameMaster = sp.tempEvos.has(form!) || (form === 'MEGA' && sp.tempEvos.size > 0);
    else if (kind === 'gmax') inGameMaster = true; // not modelled as forms in the game master
    else if (costume) inGameMaster = costumeByProto.has(costume);
    else if (form) inGameMaster = sp.gmForms.has(form);
    else inGameMaster = true;
    let datamined = !inGameMaster || !g?.normal;
    if (statusOverrides[key]) datamined = statusOverrides[key] === 'datamined';
    const m = manual[key];
    if (m && m.released !== null && m.released !== undefined) datamined = !m.released;
    const v: Variant = {
      key,
      dex: sp.dex,
      form,
      costume,
      gender,
      kind,
      label: manual[key]?.label ?? labelFor(sp, form, costume),
      img: g?.normal ?? null,
      hasShiny: !!g?.shiny,
      datamined,
      inGameMaster,
    };
    if (g?.shiny && /^https?:/.test(g.shiny)) v.shinyImg = g.shiny;
    const types = form ? formTypes.get(`${sp.dex}:${form}`) : undefined;
    if (types && types.join() !== sp.types.join()) v.types = types;
    // Only costumes are marked, and only when the plain Pokémon evolves (or Mega Evolves) and this one cannot:
    // a last stage "not evolving" says nothing. A costume form has its own game master entry; a "_NOEVOLVE" costume
    // is blocked unless the species lists it in allowNoevolveEvolution.
    if (kind === 'costume') {
      const plain = abilities.get(`${sp.dex}:NORMAL`) ?? abilities.get(`${sp.dex}`);
      const own = form ? abilities.get(`${sp.dex}:${form}`) : undefined;
      const blockedCostume = !!costume && (costumeByProto.get(costume)?.noEvolve || /NOEVOLVE/.test(costume)) && !noevolveAllowed.get(sp.dex)?.has(costume);
      const evolves = (own ? own.evolves : !!plain?.evolves) && !blockedCostume && !(form && /NOEVOLVE/.test(form));
      if (plain?.evolves && !evolves) v.noEvolve = true;
      // The game master says it only for costume forms (Clone Charizard); a plain costume has nothing to read.
      if (plain?.megas && own && !own.megas) v.noMega = true;
    }
    variants.push(v);
  };

  for (const g of groups.values()) {
    const sp = speciesByDex.get(g.dex);
    if (!sp || !g.normal) continue;
    sp.released = true;
    if (g.female) {
      push(sp, g, g.form, g.costume, 'f');
      continue;
    }
    const baseKey = makeVariantKey({ dex: g.dex, form: g.form, costume: g.costume, gender: null });
    const hasFemale = femaleKeys.has(baseKey);
    if (hasFemale && !g.form && !g.costume) sp.genderDiff = true;
    push(sp, g, g.form, g.costume, hasFemale ? 'm' : null);
  }
  // Species the game only knows as forms (Poltchageist: Counterfeit / Artisan; Dudunsparce: Two / Three-Segment):
  // the formless picture is one of those forms again, not a variant of its own. Entries saved on it go to the first one.
  const aliases: Record<string, string> = {};
  for (const sp of speciesByDex.values()) {
    if (withNormalForm.has(sp.dex)) continue;
    const forms = [...sp.gmForms].filter(([token, costume]) => !costume && !token.startsWith(`${sp.id}_`)).map(([token]) => makeVariantKey({ dex: sp.dex, form: token, costume: null, gender: null }));
    const target = forms.find((k) => variants.some((v) => v.key === k && v.img));
    if (!target) continue;
    for (let i = variants.length - 1; i >= 0; i--) {
      const v = variants[i]!;
      if (v.dex === sp.dex && v.kind === 'base') {
        aliases[v.key] = target;
        variants.splice(i, 1);
      }
    }
  }
  if (Object.keys(aliases).length) log(`forms: ${Object.keys(aliases).length} formless duplicates folded into their first form`);
  // Battle-only forms (Mimikyu Busted, Aegislash Blade...): never caught, so not in the collection.
  const battleForms = Object.entries(overrides.battleForms ?? {}).filter(([k]) => !k.startsWith('$'));
  for (const [key, caughtAs] of battleForms) {
    const before = variants.length;
    for (let i = variants.length - 1; i >= 0; i--) if (variants[i]!.key.replace(/\.g2$/, '') === key) variants.splice(i, 1);
    if (variants.length < before && variants.some((v) => v.key === caughtAs)) aliases[key] = caughtAs;
  }

  // Game-master costume forms that have no picture yet
  for (const sp of speciesByDex.values()) {
    for (const [token, isCostume] of sp.gmForms) {
      if (!isCostume || token.startsWith(`${sp.id}_`)) continue;
      const key = makeVariantKey({ dex: sp.dex, form: token, costume: null, gender: null });
      if (!variants.some((v) => v.key === key)) push(sp, null, token, null, null);
    }
  }
  // Species with no picture at all: official artwork placeholder
  for (const sp of speciesByDex.values()) {
    if (variants.some((v) => v.dex === sp.dex && v.img)) continue;
    const g: AssetGroup = { dex: sp.dex, form: null, costume: null, female: false, normal: `${POKEAPI_ARTWORK}${sp.dex}.png` };
    push(sp, g, null, null, null);
    variants[variants.length - 1]!.datamined = true;
  }
  for (const sp of speciesByDex.values()) {
    const s = shinyList?.[String(sp.dex)];
    sp.shinyReleased = s ? Object.values(s).some((x) => x === true) : null;
  }
  // The shiny list only knows species: when a species' shiny is not out, none of its versions' is.
  for (const v of variants) if (speciesByDex.get(v.dex)?.shinyReleased === false && v.hasShiny) v.shinyReleased = false;
  // Species release: PokeMiners ship pictures long before a Pokémon is in the game (Arceus...), so
  // "has a picture" is only the fallback. Baseline = pogoapi released list, plus species seen live
  // on Leek Duck (raids, eggs, research, events), plus file / manager overrides on the base key.
  const releasedSet = releasedList ? new Set(Object.keys(releasedList).map(Number)) : null;
  for (const sp of speciesByDex.values()) {
    const hasPicture = variants.some((v) => v.dex === sp.dex && v.img && !v.img.startsWith(POKEAPI_ARTWORK));
    let released = releasedSet ? releasedSet.has(sp.dex) || extraReleased.has(sp.dex) : hasPicture;
    const fileStatus = statusOverrides[String(sp.dex)];
    if (fileStatus) released = fileStatus === 'released';
    const m = manual[String(sp.dex)];
    if (m && m.released !== null && m.released !== undefined) released = m.released;
    sp.released = released;
  }
  for (const v of variants) {
    const sp = speciesByDex.get(v.dex)!;
    if (!sp.released) {
      const m = manual[v.key];
      if (!(m && m.released === true) && statusOverrides[v.key] !== 'released') v.datamined = true;
    }
  }
  log(`species released: ${[...speciesByDex.values()].filter((s) => s.released).length} (${releasedSet ? 'pogoapi list' : 'picture fallback'} + ${extraReleased.size} seen live)`);

  variants.sort((a, b) =>
    a.dex - b.dex ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.label?.en ?? '').localeCompare(b.label?.en ?? '') ||
    (GENDER_ORDER[a.gender ?? 'n'] ?? 0) - (GENDER_ORDER[b.gender ?? 'n'] ?? 0),
  );

  // First appearance: recorded dates win; otherwise an estimate from the costume / form name (year + season),
  // or "now" for keys that appear after the baseline run.
  const known = options.knownSince ?? {};
  const today = new Date().toISOString().slice(0, 10);
  for (const v of variants) {
    const rec = known[v.key];
    if (rec !== undefined) {
      if (rec !== FIRST_SEEN_BEFORE_TRACKING) v.firstSeen = rec;
    } else if (options.baseline || !options.knownSince) {
      const est = estimateFirstSeen(v.form ?? v.costume);
      if (est) v.firstSeen = est;
    } else v.firstSeen = today;
  }

  // Special backgrounds (location cards, event backgrounds) per picture, from pokemongopro's trade tool.
  const backgrounds: Record<string, BackgroundInfo> = {};
  if (backgroundMap) {
    const byKey = new Map(variants.map((v) => [v.key, v]));
    for (const [file, pics] of Object.entries(backgroundMap)) {
      const id = file.replace(/\.(webp|png|jpg)$/i, '');
      backgrounds[id] = { id, label: humanizeBackground(id), image: BACKGROUND_IMAGE_BASE + file };
      for (const pic of pics) {
        const m = /^pm(\d+)((?:\.[A-Za-z0-9_]+)*)\.icon\.png$/.exec(pic);
        if (!m) continue;
        let form: string | null = null;
        let costume: string | null = null;
        let female = false;
        for (const tok of (m[2] ?? '').split('.').filter(Boolean)) {
          if (tok === 'g2') female = true;
          else if (tok === 's') continue;
          else if (tok.startsWith('f')) form = tok.slice(1);
          else if (tok.startsWith('c')) costume = tok.slice(1).toUpperCase();
        }
        const v = byKey.get(makeVariantKey({ dex: Number(m[1]), form, costume, gender: female ? 'f' : null }));
        if (v && !(v.backgrounds ?? []).includes(id)) (v.backgrounds ??= []).push(id);
      }
    }
    log(`backgrounds: ${Object.keys(backgrounds).length}, on ${variants.filter((v) => v.backgrounds?.length).length} pictures`);
  }

  // Genders per form / costume from SPAWN_V####_POKEMON_<ID>[_<FORM>] templates. "_NORMAL" describes the base
  // form better than the formless template (Oinkologne: formless 50/50, NORMAL male only, FEMALE form female only).
  const gendersBy = new Map<string, Gender[]>(); // `${dex}|${token}` ('' = formless)
  type SpawnTemplate = { templateId: string; data: { genderSettings?: { pokemon: string; gender?: { malePercent?: number; femalePercent?: number } } } };
  const spawns = (gm as unknown as SpawnTemplate[])
    .map((t) => ({ t, m: /^SPAWN_V(\d{4})_POKEMON_(.+)$/.exec(t.templateId) }))
    .filter((x): x is { t: SpawnTemplate; m: RegExpExecArray } => !!x.m && !!x.t.data.genderSettings);
  // The template name of a species is its shortest one (Nidoran♀: "NIDORAN", while its id is "NIDORAN_FEMALE").
  const baseName = new Map<number, string>();
  for (const { m } of spawns) {
    const dex = Number(m[1]);
    const cur = baseName.get(dex);
    if (!cur || m[2]!.length < cur.length) baseName.set(dex, m[2]!);
  }
  for (const { t, m } of spawns) {
    const gs = t.data.genderSettings!;
    const rest = m[2]!;
    const name = baseName.get(Number(m[1]))!;
    const token = rest === name ? '' : rest.startsWith(`${name}_`) ? rest.slice(name.length + 1) : rest;
    const g: Gender[] = [];
    if ((gs.gender?.malePercent ?? 0) > 0) g.push('m');
    if ((gs.gender?.femalePercent ?? 0) > 0) g.push('f');
    gendersBy.set(`${Number(m[1])}|${token}`, g);
  }
  const keys = new Set(variants.map((v) => v.key));
  for (const v of variants) {
    const base = gendersBy.get(`${v.dex}|NORMAL`) ?? gendersBy.get(`${v.dex}|`);
    const own = (v.form && gendersBy.get(`${v.dex}|${v.form}`)) || (v.costume && gendersBy.get(`${v.dex}|${v.costume}`)) || undefined;
    // Megas and Gigantamax keep the species' genders; unknown species (datamined) may be either.
    const pinned = overrides.genders?.[neutralKey(v.key)];
    v.genders = pinned ?? own ?? base ?? ['m', 'f'];
    // Only costumes defined as forms can be newer than the published game master; old costume-enum costumes and
    // species forms (Unown, Burmy...) follow the species, which is right.
    // Two facts settle it without the game master: a distinct female picture means both genders exist, and a
    // costume on a genderless species is genderless.
    const hasFemalePicture = v.gender === 'f' || keys.has(`${neutralKey(v.key)}.g2`);
    if (!pinned && !own && v.kind === 'costume' && v.form) {
      if (hasFemalePicture) v.genders = ['m', 'f'];
      else if (base && base.length === 0) v.genders = [];
      else v.gendersGuessed = true;
    }
  }

  const species: Species[] = [...speciesByDex.values()]
    .sort((a, b) => a.dex - b.dex)
    .map(({ gmForms: _f, tempEvos: _t, ...s }) => s);

  const speciesFull = new Map(species.map((s) => [s.dex, s]));
  const pvp = extractPvp(gm as Parameters<typeof extractPvp>[0], {
    isCostume: (dex, token) => speciesByDex.get(dex)?.gmForms.get(token) === true || looksLikeCostume(token),
    released: (dex) => speciesFull.get(dex)?.released === true,
    dexOf: (id) => speciesById.get(id)?.dex,
    name: (dex, token) => {
      const sp = speciesFull.get(dex)!;
      const label = token ? labelFor(sp, token, null) : null;
      if (!label) return sp.name;
      const fr = sp.name.fr ?? sp.name.en;
      return { en: `${sp.name.en} (${label.en})`, fr: `${fr} (${label.fr ?? label.en})` };
    },
  });
  if (pvp) {
    pvp.moves = moveNames(gm as { templateId: string }[], texts);
    log(`pvp: ${pvp.pokemon.length} battle forms, ${Object.keys(pvp.moves).length} move names`);
  }

  const body = JSON.stringify({ species, variants });
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 8);
  const now = new Date();
  const dataset: Dataset = {
    schema: 1,
    version: `${now.toISOString().slice(0, 10).replaceAll('-', '')}.${hash}`,
    generatedAt: now.toISOString(),
    assetBase: ASSET_BASE,
    sources: { ...SOURCES },
    species,
    variants,
    ...(Object.keys(backgrounds).length ? { backgrounds } : {}),
    ...(pvp ? { pvp } : {}),
    ...(Object.keys(aliases).length ? { aliases } : {}),
  };
  const byKind = variants.reduce<Record<string, number>>((acc, v) => ((acc[v.kind] = (acc[v.kind] ?? 0) + 1), acc), {});
  const stats = {
    species: species.length,
    released: species.filter((s) => s.released).length,
    variants: variants.length,
    datamined: variants.filter((v) => v.datamined).length,
    byKind,
  };
  log(`dataset v${dataset.version}: ${stats.species} species, ${stats.variants} variants (${stats.datamined} datamined)`);
  return { dataset, stats };
}

/** Recorded for variants that existed before first-seen tracking began and whose name gives no date. */
export const FIRST_SEEN_BEFORE_TRACKING = 'before';

/**
 * Drops recorded dates shared by an implausible number of variants: a game update adds tens of forms, not hundreds,
 * so such a date is a tracking artefact (the baseline once skipped undated variants, which then all looked new).
 * Returns how many keys were dropped; they should be re-estimated with a baseline run.
 */
export function repairFirstSeen(map: Record<string, string>, maxPerDay = 300): number {
  const perDay = new Map<string, number>();
  for (const d of Object.values(map)) if (d !== FIRST_SEEN_BEFORE_TRACKING) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  let dropped = 0;
  for (const [k, d] of Object.entries(map)) {
    if ((perDay.get(d) ?? 0) > maxPerDay) {
      delete map[k];
      dropped++;
    }
  }
  return dropped;
}

const SEASON_MONTH: [RegExp, string][] = [
  [/GOTOUR|FEB|VALENTINE/, '02'], [/SPRING|APRIL|MAR|EASTER/, '04'], [/MAY/, '05'], [/GOFEST|JUNE/, '06'], [/ANNIVERSARY|JULY|SUMMER|WCS/, '07'],
  [/AUG/, '08'], [/FALL|FASHION|SEPT/, '09'], [/HALLOWEEN|OCT/, '10'], [/NOV|WILDAREA|GOWA/, '11'], [/HOLIDAY|WINTER|DEC|XMAS/, '12'], [/JAN|NEW_YEAR/, '01'],
];
/** "HALLOWEEN_2026_01" -> "2026-10-01"; tokens without a year give nothing. */
export function estimateFirstSeen(token: string | null): string | null {
  if (!token) return null;
  const y = /(?:^|_)(20\d\d)(?:_|$)/.exec(token)?.[1];
  if (!y) return null;
  const month = SEASON_MONTH.find(([re]) => re.test(token))?.[1] ?? '06';
  return `${y}-${month}-01`;
}

const BG_WORDS: Record<string, string> = { gf: 'GO Fest', gt: 'GO Tour', wc: 'Worlds', me: 'Mega', rt: 'Route', sr: 'Safari', sz: 'Safari Zone', cs: 'City Safari', mlb: 'MLB', nfl: 'NFL', wa: 'Wild Area', npb: 'NPB' };
/** "gf25_paris" -> "GO Fest 25 Paris". Best effort, the picture is what players recognise. */
function humanizeBackground(id: string): string {
  return id
    .split(/[_-]+/)
    .map((p) => {
      const m = /^([a-z]+)(\d{2,4})$/.exec(p);
      if (m && BG_WORDS[m[1]!]) return `${BG_WORDS[m[1]!]} ${m[2]}`;
      if (BG_WORDS[p]) return BG_WORDS[p]!;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(' ');
}

/** Applies manager overrides to an already built dataset without refetching anything. */
export function applyManualOverrides(dataset: Dataset, manual: ManualOverrides): Dataset {
  if (!Object.keys(manual).length) return dataset;
  const speciesReleased = new Map<number, boolean>();
  const species = dataset.species.map((sp) => {
    const m = manual[String(sp.dex)];
    if (m && m.released !== null && m.released !== undefined && m.released !== sp.released) {
      speciesReleased.set(sp.dex, m.released);
      return { ...sp, released: m.released };
    }
    return sp;
  });
  return {
    ...dataset,
    species,
    variants: dataset.variants.map((v) => {
      const spRel = speciesReleased.get(v.dex);
      if (spRel === false && !manual[v.key]?.released) return { ...v, datamined: true };
      const m = manual[v.key];
      if (!m) return v;
      const out: Variant = {
        ...v,
        datamined: m.released === null || m.released === undefined ? v.datamined : !m.released,
        label: m.label ?? v.label,
      };
      if (m.genders) {
        out.genders = m.genders;
        delete out.gendersGuessed;
      }
      if (m.shinyReleased === true) delete out.shinyReleased;
      else if (m.shinyReleased === false) out.shinyReleased = false;
      if (m.noEvolve === true) out.noEvolve = true;
      else if (m.noEvolve === false) delete out.noEvolve;
      return out;
    }),
  };
}

/* ---------- CLI: pnpm --filter @mydexpogo/data build [--offline] [--max-age=24] [--out=dir] ---------- */
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = new Map(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k!, v ?? 'true'];
  }));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(here, args.get('out') ?? '../dist');
  const fetchOpts: FetchOptions = {
    cacheDir: path.resolve(here, '../.cache'),
    maxAgeHours: Number(args.get('max-age') ?? 24),
    offline: args.get('offline') === 'true',
  };
  buildDataset({ fetch: fetchOpts })
    .then(async ({ dataset, stats }) => {
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, 'pokedex.json'), JSON.stringify(dataset));
      await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ version: dataset.version, generatedAt: dataset.generatedAt, speciesCount: stats.species, variantCount: stats.variants }, null, 2));
      const archive = await updateEventArchive(outDir, fetchOpts.offline).catch((e: Error) => (console.warn(`event archive not updated: ${e.message}`), null));
      if (archive) console.log(`events archive: ${archive.total} events (${archive.added} new)`);
      console.log(`wrote ${outDir}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
