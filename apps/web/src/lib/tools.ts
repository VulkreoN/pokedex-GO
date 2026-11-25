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

/** Variant key from a Leek Duck picture ("…/pm354.fMEGA.icon.png" -> "354.fMEGA"). */
export function keyFromImage(url: string): string | null {
  const m = /\/pm(\d+)((?:\.[fc][A-Z0-9_]+)?)\.(?:s\.)?icon\.png/.exec(url);
  return m ? `${Number(m[1])}${m[2] ?? ''}` : null;
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
