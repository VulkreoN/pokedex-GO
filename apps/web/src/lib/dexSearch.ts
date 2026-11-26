/**
 * Pokédex search helpers (+family, dex ranges like 1-151), list tag inference, and live appearance lookup.
 */
import type { EntryTag, ListEntry } from '@mydexpogo/shared';
import { matchesQuery, normalize, type DatasetIndex } from './dataset.js';
import { currentRaidBosses, dexFromImage, eventStatus, type EggPokemon, type GameEvent, type RaidBoss, type ResearchCategory } from './live.js';
import type { EventSpawns } from '../components/GameTools.js';
import type { RocketLineup } from './tools.js';

/**
 * Matches a Pokédex search token against a species:
 * - `+pikachu` or `+25` matches the whole evolution family (like in Pokémon GO!)
 * - `1-151` matches a dex range (inclusive)
 * - plain name/number/costume label falls back to standard matching
 */
export function matchesDexToken(
  idx: DatasetIndex,
  dex: number,
  rawToken: string,
  labelText?: Map<number, string>,
  familyCache?: Map<string, Set<string>>,
): boolean {
  const token = normalize(rawToken);
  if (!token) return true;

  // Dex range: "1-151" or "152-251"
  const range = /^(\d+)-(\d+)$/.exec(token);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    return dex >= lo && dex <= hi;
  }

  // Family search: "+pikachu" or "+25"
  if (token.startsWith('+') && token.length > 1) {
    const inner = token.slice(1);
    let families = familyCache?.get(inner);
    if (!families) {
      families = new Set<string>();
      for (const s of idx.ds.species) {
        if (matchesQuery(idx, s.dex, inner)) families.add(s.family);
      }
      familyCache?.set(inner, families);
    }
    const sp = idx.speciesByDex.get(dex);
    return !!sp && families.has(sp.family);
  }

  if (matchesQuery(idx, dex, token)) return true;
  if (!/^\d+$/.test(token) && labelText && (labelText.get(dex) ?? '').includes(token)) return true;
  return false;
}

/** Suggests a default tag when adding into a target list whose entries share one dominant tag (>= 70%). */
export function suggestListTag(entries: Pick<ListEntry, 'tag'>[]): EntryTag {
  if (!entries.length) return '';
  const counts = new Map<EntryTag, number>();
  for (const e of entries) counts.set(e.tag, (counts.get(e.tag) ?? 0) + 1);
  let best: EntryTag = '';
  let max = 0;
  for (const [tag, n] of counts) {
    if (n > max) {
      best = tag;
      max = n;
    }
  }
  return best && !best.startsWith('bg:') && max / entries.length >= 0.7 ? best : '';
}

export interface LiveAppearance {
  kind: 'raid' | 'egg' | 'research' | 'rocket' | 'event';
  detail: string;
  to: string;
}

/** Finds where a species is currently obtainable in Pokémon GO (raids, eggs, research, Team GO Rocket, current events). */
export function liveAppearancesOf(
  dex: number,
  data: {
    raids?: RaidBoss[];
    events?: GameEvent[];
    eggs?: EggPokemon[];
    research?: ResearchCategory[];
    rockets?: RocketLineup[];
    eventSpawns?: EventSpawns[];
  },
  now = Date.now(),
): LiveAppearance[] {
  const out: LiveAppearance[] = [];
  const seen = new Set<string>();
  const push = (a: LiveAppearance) => {
    const k = `${a.kind}|${a.detail}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  };

  if (data.raids || data.events) {
    for (const b of currentRaidBosses(data.raids ?? [], data.events ?? [], now)) {
      if (dexFromImage(b.image) === dex) push({ kind: 'raid', detail: b.tier, to: '/game?tab=raids' });
    }
  }
  if (data.eggs) {
    for (const e of data.eggs) {
      if (dexFromImage(e.image) === dex) push({ kind: 'egg', detail: e.eggType, to: '/game?tab=eggs' });
    }
  }
  if (data.research) {
    for (const cat of data.research) {
      for (const task of cat.tasks) {
        if (task.rewards.some((r) => r.kind === 'encounter' && dexFromImage(r.image) === dex)) {
          push({ kind: 'research', detail: cat.title, to: '/game?tab=research' });
          break;
        }
      }
    }
  }
  if (data.rockets) {
    for (const r of data.rockets) {
      const encounters = [...r.firstPokemon, ...r.secondPokemon, ...r.thirdPokemon].filter((p) => p.isEncounter);
      if (encounters.some((p) => dexFromImage(p.image) === dex)) {
        push({ kind: 'rocket', detail: r.name, to: '/game?tab=rocket' });
      }
    }
  }
  if (data.eventSpawns) {
    for (const ev of data.eventSpawns) {
      if (eventStatus({ start: ev.start, end: ev.end }, now) !== 'current') continue;
      const mons = [...ev.featured, ...ev.spawns];
      if (mons.some((m) => dexFromImage(m.image) === dex)) {
        push({ kind: 'event', detail: ev.name, to: '/game?tab=spawns' });
      }
    }
  }
  return out;
}
