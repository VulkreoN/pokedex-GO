import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const SOURCES = {
  gameMaster: 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json',
  assetsBranch: 'https://api.github.com/repos/PokeMiners/pogo_assets/branches/master',
  assetsTree: 'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/{sha}?recursive=1',
  textsEn: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_english.json',
  textsFr: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_french.json',
  costumes: 'https://raw.githubusercontent.com/WatWowMap/pogo-data-api/main/data/v1/costumes.json',
  shiny: 'https://pogoapi.net/api/v1/shiny_pokemon.json',
} as const;

export const ASSET_BASE =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/';
export const ASSET_BASE_FULL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/';
export const ASSET_BASE_LEGACY = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/';
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
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) {
      text = await res.text();
      break;
    }
    if (attempt >= 3 || res.status < 500) throw new Error(`${name}: HTTP ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  await writeFile(file, text);
  console.log(`fetched ${name} (${(text.length / 1e6).toFixed(1)} MB)`);
  return JSON.parse(text) as T;
}

/** The recursive tree endpoint is flaky when addressed by branch name, so resolve the commit first. */
export async function fetchAssetsTree<T>(opts: FetchOptions): Promise<T> {
  if (opts.offline) return fetchJson<T>('assetsTree', opts);
  const branch = await fetchJson<{ commit: { sha: string } }>('assetsBranch', { ...opts, maxAgeHours: 0 });
  return fetchJson<T>('assetsTree', opts, SOURCES.assetsTree.replace('{sha}', branch.commit.sha));
}
