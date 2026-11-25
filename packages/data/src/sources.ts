import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const SOURCES = {
  gameMaster: 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json',
  pictures: 'https://trade.pokemongopro.com/assets/pokemon_images.txt',
  textsEn: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_english.json',
  textsFr: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_french.json',
  costumes: 'https://raw.githubusercontent.com/WatWowMap/pogo-data-api/main/data/v1/costumes.json',
  shiny: 'https://pogoapi.net/api/v1/shiny_pokemon.json',
  released: 'https://pogoapi.net/api/v1/released_pokemon.json',
  backgrounds: 'https://trade.pokemongopro.com/assets/background.json',
} as const;

/** Pokémon pictures: pokemongopro mirrors PokeMiners' addressable icons (same file names) behind Cloudflare. */
export const ASSET_BASE = 'https://trade.pokemongopro.com/assets/pokemons/';
/** Mega / Primal pictures are not mirrored there; PokeMiners' raw files are used for those (no API call needed). */
export const MEGA_BASE = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/';
export const BACKGROUND_IMAGE_BASE = 'https://trade.pokemongopro.com/assets/backgrounds/';
export const POKEAPI_ARTWORK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
/** PokeAPI's Pokémon HOME renders, for the few forms whose official shiny artwork is missing. */
export const POKEAPI_HOME = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/';

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

/** The picture list is a plain text file, one file name per line. */
export async function fetchPictureList(opts: FetchOptions): Promise<string[]> {
  const file = path.join(opts.cacheDir, 'pictures.txt');
  const cached = await stat(file).catch(() => null);
  const fresh = cached && (opts.maxAgeHours === Infinity || Date.now() - cached.mtimeMs < opts.maxAgeHours * 3600_000);
  if (cached && (opts.offline || fresh)) return (await readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean);
  if (opts.offline) throw new Error('offline and no cache for pictures');
  try {
    const res = await fetch(SOURCES.pictures, { headers: { 'user-agent': 'mydexpogo-data-pipeline' } });
    if (!res.ok) throw new Error(`pictures: HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 1000) throw new Error(`pictures: suspiciously short list (${lines.length} lines)`);
    await mkdir(opts.cacheDir, { recursive: true });
    await writeFile(file, text);
    console.log(`fetched pictures (${lines.length} files)`);
    return lines;
  } catch (e) {
    if (cached) {
      console.warn(`pictures: refetch failed (${(e as Error).message}), using cached copy from ${cached.mtime.toISOString()}`);
      return (await readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean);
    }
    throw e;
  }
}

/**
 * Which of these picture URLs exist, asked once per URL (HEAD) and remembered in the cache: an answer does not
 * change. Offline, only what the cache knows.
 */
export async function existingUrls(name: string, urls: string[], opts: FetchOptions): Promise<Set<string>> {
  const file = path.join(opts.cacheDir, `${name}.json`);
  const known: Record<string, boolean> = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
  const ask = opts.offline ? [] : urls.filter((u) => !(u in known));
  for (let i = 0; i < ask.length; i += 8) {
    await Promise.all(
      ask.slice(i, i + 8).map(async (u) => {
        try {
          const res = await fetch(u, { method: 'HEAD', headers: { 'user-agent': 'mydexpogo-data-pipeline' }, signal: AbortSignal.timeout(10_000) });
          // A server error says nothing about the file: asked again next time.
          if (res.ok || res.status === 404) known[u] = res.ok;
        } catch {}
      }),
    );
  }
  if (ask.length) {
    await mkdir(opts.cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(known));
  }
  return new Set(urls.filter((u) => known[u]));
}
