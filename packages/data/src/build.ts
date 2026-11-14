/**
 * Builds the MyDexPoGo dataset from datamined sources.
 *
 *   pnpm --filter @mydexpogo/data build [--offline] [--max-age=24] [--out=path]
 *
 * Sources: PokeMiners game master + asset tree + text dumps, WatWowMap costume enum, pogoapi shiny list.
 * Output: <out>/pokedex.json and <out>/manifest.json (default: apps/web/public/data).
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeVariantKey,
  type Dataset,
  type LocalizedText,
  type PokemonType,
  type Rarity,
  type Species,
  type Variant,
  type VariantKind,
} from '@mydexpogo/shared';
import { ASSET_BASE, ASSET_BASE_FULL, ASSET_BASE_LEGACY, POKEAPI_ARTWORK, SOURCES, fetchAssetsTree, fetchJson, type FetchOptions } from './sources.js';
import { gameFormLabel, humanizeToken, localizeHumanized, looksLikeCostume } from './labels.js';
import overrides from './overrides.json' with { type: 'json' };
import { updateEventArchive } from './events.js';

/* ---------- CLI ---------- */
const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k!, v ?? 'true'];
}));
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, args.get('out') ?? '../../../apps/web/public/data');
const fetchOpts: FetchOptions = {
  cacheDir: path.resolve(here, '../.cache'),
  maxAgeHours: Number(args.get('max-age') ?? 24),
  offline: args.get('offline') === 'true',
};

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
      tempEvoOverrides?: { tempEvoId?: string }[];
    };
    formSettings?: { pokemon: string; forms?: { form: string; isCostume?: boolean }[] };
  };
}
interface Tree { tree: { path: string; type: string }[]; truncated: boolean }
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

/* ---------- Main ---------- */
async function main() {
  const [gm, tree, textsEn, textsFr, costumeEnum, shinyList] = await Promise.all([
    fetchJson<GmTemplate[]>('gameMaster', fetchOpts),
    fetchAssetsTree<Tree>(fetchOpts),
    fetchJson<Texts>('textsEn', fetchOpts),
    fetchJson<Texts>('textsFr', fetchOpts),
    fetchJson<CostumeEnum[]>('costumes', fetchOpts),
    fetchJson<ShinyList>('shiny', fetchOpts).catch((e) => {
      console.warn(`shiny list unavailable (${e.message}); shinyReleased will be null`);
      return null;
    }),
  ]);
  if (tree.truncated) throw new Error('GitHub tree listing was truncated; set GITHUB_TOKEN or fetch per folder');

  const texts = { en: textsToMap(textsEn), fr: textsToMap(textsFr) };
  const costumeByProto = new Map(costumeEnum.map((c) => [c.proto, c]));

  /* Game master: species, form lists, per-form types, megas */
  const speciesByDex = new Map<number, Species & { gmForms: Map<string, boolean>; tempEvos: Set<string> }>();
  const formTypes = new Map<string, PokemonType[]>(); // `${dex}:${token}`
  for (const t of gm) {
    const m = /^V(\d{4})_POKEMON_(.+)$/.exec(t.templateId);
    const ps = t.data.pokemonSettings;
    if (!m || !ps) continue;
    const dex = Number(m[1]);
    const types = [typeOf(ps.type), typeOf(ps.type2)].filter((x): x is PokemonType => !!x);
    if (!ps.form) {
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
      if (types.length) {
        formTypes.set(`${dex}:${token}`, types);
        formTypes.set(`${dex}:${ps.form}`, types);
      }
    }
  }
  const speciesById = new Map([...speciesByDex.values()].map((s) => [s.id, s]));
  for (const t of gm) {
    const fs = t.data.formSettings;
    if (!t.templateId.startsWith('FORMS_V') || !fs) continue;
    const sp = speciesById.get(fs.pokemon);
    if (!sp) continue;
    for (const f of fs.forms ?? []) {
      const token = f.form.startsWith(`${fs.pokemon}_`) ? f.form.slice(fs.pokemon.length + 1) : f.form;
      if (token === 'NORMAL') continue;
      sp.gmForms.set(token, !!f.isCostume);
      if (token !== f.form) sp.gmForms.set(f.form, !!f.isCostume);
    }
  }
  console.log(`game master: ${speciesByDex.size} species, ${[...speciesByDex.values()].reduce((n, s) => n + s.gmForms.size, 0)} forms`);

  /* Assets: parse addressable filenames from the 256px folder, then the full-size folder, then legacy icons */
  const groups = new Map<string, AssetGroup>();
  const legacy = new Map<number, { normal: string; shiny?: string }>();
  const FOLDER_256 = 'Images/Pokemon - 256x256/Addressable Assets/';
  const FOLDER_FULL = 'Images/Pokemon/Addressable Assets/';
  const FOLDER_LEGACY = 'Images/Pokemon/';
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
      else if (tok.startsWith('c')) costume = tok.slice(1);
      else return; // unknown token: skip file
    }
    const key = makeVariantKey({ dex, form, costume, gender: female ? 'f' : null });
    const g = groups.get(key) ?? { dex, form, costume, female };
    const ref = absoluteBase ? absoluteBase + file : file;
    if (shiny) g.shiny ??= ref;
    else g.normal ??= ref;
    groups.set(key, g);
  };
  const blobs = tree.tree.filter((e) => e.type === 'blob');
  for (const e of blobs) if (e.path.startsWith(FOLDER_256)) addressable(e.path.slice(FOLDER_256.length), null);
  for (const e of blobs) if (e.path.startsWith(FOLDER_FULL)) addressable(e.path.slice(FOLDER_FULL.length), ASSET_BASE_FULL);
  for (const e of blobs) {
    const m = /^pokemon_icon_(\d{3})_00(_shiny)?\.png$/.exec(e.path.startsWith(FOLDER_LEGACY) ? e.path.slice(FOLDER_LEGACY.length) : '');
    if (!m) continue;
    const dex = Number(m[1]);
    const cur = legacy.get(dex) ?? { normal: '' };
    if (m[2]) cur.shiny = ASSET_BASE_LEGACY + e.path.slice(FOLDER_LEGACY.length);
    else cur.normal = ASSET_BASE_LEGACY + e.path.slice(FOLDER_LEGACY.length);
    legacy.set(dex, cur);
  }
  console.log(`assets: ${groups.size} variant pictures, ${legacy.size} legacy icons`);

  /* Variants */
  const variants: Variant[] = [];
  const femaleKeys = new Set([...groups.values()].filter((g) => g.female).map((g) => makeVariantKey({ dex: g.dex, form: g.form, costume: g.costume, gender: null })));
  const labelOverrides = overrides.labels as Record<string, LocalizedText>;
  const statusOverrides = overrides.status as Record<string, 'released' | 'datamined'>;

  const labelFor = (sp: Species, form: string | null, costume: string | null): LocalizedText | null => {
    if (costume) {
      if (labelOverrides[costume]) return labelOverrides[costume];
      const e = costumeByProto.get(costume);
      return localizeHumanized(e ? e.name.replace(/\s*Noevolve$/i, '') : humanizeToken(costume));
    }
    if (!form) return null;
    return labelOverrides[form] ?? gameFormLabel(texts, sp.id, form) ?? localizeHumanized(humanizeToken(form));
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
    const v: Variant = {
      key,
      dex: sp.dex,
      form,
      costume,
      gender,
      kind,
      label: labelFor(sp, form, costume),
      img: g?.normal ?? null,
      hasShiny: !!g?.shiny,
      datamined,
      inGameMaster,
    };
    if (g?.shiny && /^https?:/.test(g.shiny)) v.shinyImg = g.shiny;
    const types = form ? formTypes.get(`${sp.dex}:${form}`) : undefined;
    if (types && types.join() !== sp.types.join()) v.types = types;
    if ((costume && (costumeByProto.get(costume)?.noEvolve || /NOEVOLVE/.test(costume))) || (form && /NOEVOLVE/.test(form))) v.noEvolve = true;
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
  // Game-master costume forms that have no picture yet
  for (const sp of speciesByDex.values()) {
    for (const [token, isCostume] of sp.gmForms) {
      if (!isCostume || token.startsWith(`${sp.id}_`)) continue;
      const key = makeVariantKey({ dex: sp.dex, form: token, costume: null, gender: null });
      if (!variants.some((v) => v.key === key)) push(sp, null, token, null, null);
    }
  }
  // Species with no picture at all: legacy icon, else official artwork
  for (const sp of speciesByDex.values()) {
    if (variants.some((v) => v.dex === sp.dex && v.img)) continue;
    const leg = legacy.get(sp.dex);
    if (leg?.normal) sp.released = true;
    const g: AssetGroup = { dex: sp.dex, form: null, costume: null, female: false, normal: leg?.normal ?? `${POKEAPI_ARTWORK}${sp.dex}.png`, shiny: leg?.shiny };
    push(sp, g, null, null, null);
    const v = variants[variants.length - 1]!;
    v.datamined = !leg?.normal;
  }
  for (const sp of speciesByDex.values()) {
    const s = shinyList?.[String(sp.dex)];
    sp.shinyReleased = s ? Object.values(s).some((x) => x === true) : null;
  }

  variants.sort((a, b) =>
    a.dex - b.dex ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.label?.en ?? '').localeCompare(b.label?.en ?? '') ||
    (GENDER_ORDER[a.gender ?? 'n'] ?? 0) - (GENDER_ORDER[b.gender ?? 'n'] ?? 0),
  );

  const species: Species[] = [...speciesByDex.values()]
    .sort((a, b) => a.dex - b.dex)
    .map(({ gmForms: _f, tempEvos: _t, ...s }) => s);

  const body = JSON.stringify({ species, variants });
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 8);
  const now = new Date();
  const dataset: Dataset = {
    schema: 1,
    version: `${now.toISOString().slice(0, 10).replaceAll('-', '')}.${hash}`,
    generatedAt: now.toISOString(),
    assetBase: ASSET_BASE,
    sources: Object.fromEntries(Object.entries(SOURCES).filter(([k]) => k !== 'assetsBranch')),
    species,
    variants,
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'pokedex.json'), JSON.stringify(dataset));
  await writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ version: dataset.version, generatedAt: dataset.generatedAt, speciesCount: species.length, variantCount: variants.length }, null, 2),
  );

  const archive = await updateEventArchive(outDir, fetchOpts.offline).catch((e) => {
    console.warn(`event archive not updated: ${(e as Error).message}`);
    return null;
  });
  if (archive) console.log(`events archive: ${archive.total} events (${archive.added} new)`);

  const byKind = variants.reduce<Record<string, number>>((acc, v) => ((acc[v.kind] = (acc[v.kind] ?? 0) + 1), acc), {});
  console.log(`wrote ${path.join(outDir, 'pokedex.json')} v${dataset.version}`);
  console.log(`species ${species.length} (released ${species.filter((s) => s.released).length}, genderDiff ${species.filter((s) => s.genderDiff).length})`);
  console.log(`variants ${variants.length}`, byKind, `datamined ${variants.filter((v) => v.datamined).length}, no picture ${variants.filter((v) => !v.img).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
