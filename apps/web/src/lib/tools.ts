/** The Tools tab's data (raid moves, evolution costs, buddy distances) and Team GO Rocket's line-ups. */
import { useQuery } from '@tanstack/react-query';
import type { LocalizedText, ToolsData } from '@mydexpogo/shared';
import { api } from './api.js';
import type { LivePokemon } from './live.js';

export const useTools = () => useQuery({ queryKey: ['tools'], queryFn: () => api<ToolsData>('/data/tools.json'), staleTime: 6 * 3600_000 });

export interface RocketPokemon extends LivePokemon {
  types: string[];
  /** The one you can catch after the fight. */
  isEncounter: boolean;
}
export interface RocketLineup {
  name: string;
  title: string;
  type: string;
  firstPokemon: RocketPokemon[];
  secondPokemon: RocketPokemon[];
  thirdPokemon: RocketPokemon[];
}

export const useRockets = () =>
  useQuery({
    queryKey: ['live', 'rockets'],
    queryFn: async () => {
      const res = await fetch('https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.json');
      if (!res.ok) throw new Error(`rockets: ${res.status}`);
      return (await res.json()) as RocketLineup[];
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });

const REGION_FORM: Record<string, string> = { Alolan: 'ALOLA', Galarian: 'GALARIAN', Hisuian: 'HISUIAN', Paldean: 'PALDEA' };
type Known = { has: (key: string) => boolean; dexOf?: (englishName: string) => number | undefined };

/**
 * Our variant key for a Pokémon Leek Duck shows, from its picture and name. Their pictures come three ways:
 * "pm376.fMEGA.icon.png" (our own naming), "pokemon_icon_386_13.png" (a number for the form: the name tells which,
 * "Deoxys (Defense)"), or just "Mega Skarmory.png". The name gives the form, the region, Mega / Primal; a key the
 * Pokédex does not know falls back to the plain species.
 */
export function liveKey(image: string, name: string, known?: Known): string | null {
  const pm = /\/pm(\d+)((?:\.[fc][A-Z0-9_]+)?)\.(?:s\.)?icon\.png/.exec(image);
  const plainName = name.replace(/^Shadow /i, '');
  let dex: number | undefined;
  if (pm) {
    dex = Number(pm[1]);
    const full = `${dex}${pm[2]}`;
    if (!known || known.has(full) || /\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/.test(full)) return full;
  } else {
    const old = /pokemon_icon_(\d{3,4})_/.exec(image);
    dex = old ? Number(old[1]) : known?.dexOf?.(plainName.replace(/^(Mega|Primal) /, '').replace(/^(Alolan|Galarian|Hisuian|Paldean) /, '').replace(/ [XY]$/, '').replace(/\s*\(.*\)$/, '').trim());
  }
  if (!dex) return null;
  const mega = /^Mega (.+?)( [XY])?$/.exec(plainName);
  if (mega) return `${dex}.fMEGA${mega[2] ? `_${mega[2].trim()}` : ''}`;
  if (/^Primal /.test(plainName)) return `${dex}.fPRIMAL`;
  const region = REGION_FORM[plainName.split(' ')[0]!];
  // "Deoxys (Defense)", "Tornadus (Incarnate Forme)": the form's first word.
  const word = /\(([A-Za-z]+)/.exec(plainName)?.[1]?.toUpperCase();
  const form = region ?? (word && word !== 'NORMAL' ? word : null);
  const key = form ? `${dex}.f${form}` : String(dex);
  return !known || known.has(key) ? key : String(dex);
}

/** Variant key from a Leek Duck picture alone ("…/pm354.fMEGA.icon.png" -> "354.fMEGA"). */
export function keyFromImage(url: string): string | null {
  return liveKey(url, '');
}

export const local = (t: LocalizedText | undefined, lang: string, fallback = '') => (t ? (lang === 'fr' ? (t.fr ?? t.en) : t.en) : fallback);

/** "Griffe Ombre" for "SHADOW_CLAW_FAST", from the game texts; the id made readable when they do not know it. */
export function moveLabel(tools: Pick<ToolsData, 'moveNames'>, id: string, lang: string): string {
  return local(tools.moveNames[id], lang, id.replace(/_FAST$/, '').toLowerCase().replace(/_/g, ' '));
}

/** Leek Duck's Rocket names in French. */
export function rocketName(name: string, lang: string, typeName: (type: string) => string): string {
  if (lang !== 'fr') return name;
  const m = /^(?:(\w+)-type )?(Male|Female) Grunt$/.exec(name);
  if (m) return `Sbire ${m[2] === 'Male' ? '♂' : '♀'}${m[1] ? ` · ${typeName(m[1].toLowerCase())}` : ''}`;
  if (/^Decoy/.test(name)) return 'Faux sbire ♀';
  return name;
}
