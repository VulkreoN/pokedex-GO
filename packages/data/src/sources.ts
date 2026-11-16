import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const SOURCES = {
  gameMaster: 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json',
  assetsTree: 'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master (walked per folder)',
  textsEn: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_english.json',
  textsFr: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_french.json',
  costumes: 'https://raw.githubusercontent.com/WatWowMap/pogo-data-api/main/data/v1/costumes.json',
  shiny: 'https://pogoapi.net/api/v1/shiny_pokemon.json',
  released: 'https://pogoapi.net/api/v1/released_pokemon.json',
  backgrounds: 'https://trade.pokemongopro.com/assets/background.json',
} as const;

export const ASSET_BASE =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/';
export const ASSET_BASE_FULL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/';
export const ASSET_BASE_LEGACY = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/';
export const BACKGROUND_IMAGE_BASE = 'https://trade.pokemongopro.com/assets/backgrounds/';
export const POKEAPI_ARTWORK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

export interface FetchOptions {
  cacheDir: string;
  /** Reuse cached files younger than this many hours. 0 = always refetch. */
  maxAgeHours: number;
  offline: boolean;
}

export async function fetchJson<T>(name: keyof typeof SOURCES, opts: FetchOptions, url: string = SOURCES[name]): Promise<T> {
  const file = path.join(opts.cacheDir, `${name}.json`);
  await mkdir(opts.cacheDir, { recursive: true });
  const cached = await stat(file).catch(() => null);
  const fresh = cached && (opts.maxAgeHours === Infinity || Date.now() - cached.mtimeMs < opts.maxAgeHours * 3600_000);
  if (cached && (opts.offline || fresh)) {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  }
  if (opts.offline) throw new Error(`offline and no cache for ${name}`);
  const headers: Record<string, string> = { 'user-agent': 'mydexpogo-data-pipeline' };
  if (url.startsWith('https://api.github.com/') && process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let text = '';
  try {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers });
      if (res.ok) {
        text = await res.text();
        break;
      }
      if (attempt >= 3 || res.status < 500) throw new Error(`${name}: HTTP ${res.status} for ${url}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  } catch (e) {
    if (cached) {
      console.warn(`${name}: refetch failed (${(e as Error).message}), using cached copy from ${cached.mtime.toISOString()}`);
      return JSON.parse(await readFile(file, 'utf8')) as T;
    }
    throw e;
  }
  await writeFile(file, text);
  console.log(`fetched ${name} (${(text.length / 1e6).toFixed(1)} MB)`);
  return JSON.parse(text) as T;
}

const ASSET_FOLDERS = ['Images/Pokemon - 256x256/Addressable Assets', 'Images/Pokemon/Addressable Assets', 'Images/Pokemon'];

interface GhTree { sha: string; truncated: boolean; tree: { path: string; type: string; sha: string }[] }

/**
 * Lists the asset files we need. The recursive tree of pogo_assets (40k+ files) often fails with
 * HTTP 500, so this walks only the three Pokémon folders with small non-recursive calls.
 * The result is cached under the usual "assetsTree" name and has the same shape as a recursive tree.
 */
export async function fetchAssetsTree<T>(opts: FetchOptions): Promise<T> {
  const file = path.join(opts.cacheDir, 'assetsTree.json');
  const cached = await stat(file).catch(() => null);
  const fresh = cached && (opts.maxAgeHours === Infinity || Date.now() - cached.mtimeMs < opts.maxAgeHours * 3600_000);
  if (cached && (opts.offline || fresh)) return JSON.parse(await readFile(file, 'utf8')) as T;
  if (opts.offline) throw new Error('offline and no cache for assetsTree');
  const headers: Record<string, string> = { 'user-agent': 'mydexpogo-data-pipeline', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = async (url: string): Promise<GhTree> => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers });
      if (res.ok) return (await res.json()) as GhTree;
      if (attempt >= 3 || res.status < 500) throw new Error(`assetsTree: HTTP ${res.status} for ${url}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  };
  try {
    const base = 'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/';
    const treeCache = new Map<string, GhTree>();
    const treeOf = async (sha: string) => treeCache.get(sha) ?? (treeCache.set(sha, await api(base + sha)), treeCache.get(sha)!);
    const root = await api(base + 'master');
    const blobs: { path: string; type: string }[] = [];
    for (const folder of ASSET_FOLDERS) {
      let node = root;
      let ok = true;
      for (const part of folder.split('/')) {
        const entry = node.tree.find((e) => e.path === part && e.type === 'tree');
        if (!entry) { ok = false; break; }
        node = await treeOf(entry.sha);
      }
      if (!ok) { console.warn(`assetsTree: folder not found: ${folder}`); continue; }
      for (const e of node.tree) if (e.type === 'blob') blobs.push({ path: `${folder}/${e.path}`, type: 'blob' });
    }
    const result = { sha: root.sha, truncated: false, tree: blobs };
    await mkdir(opts.cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(result));
    console.log(`fetched assetsTree (${blobs.length} files in ${ASSET_FOLDERS.length} folders)`);
    return result as T;
  } catch (e) {
    if (cached) {
      console.warn(`assetsTree: refetch failed (${(e as Error).message}), using cached copy from ${cached.mtime.toISOString()}`);
      return JSON.parse(await readFile(file, 'utf8')) as T;
    }
    throw e;
  }
}
