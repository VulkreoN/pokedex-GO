/** The player's Pokémon GO team colours the app's header (Me). Saved on this device. */
import { useSyncExternalStore } from 'react';

export type Team = 'none' | 'mystic' | 'valor' | 'instinct';
export const TEAMS: Team[] = ['none', 'mystic', 'valor', 'instinct'];
const listeners = new Set<() => void>();

export function getTeam(): Team {
  try {
    const t = localStorage.getItem('team') as Team | null;
    if (t && TEAMS.includes(t)) return t;
  } catch {}
  return 'none';
}

export function applyTeam(team: Team = getTeam()) {
  if (team === 'none') delete document.documentElement.dataset.team;
  else document.documentElement.dataset.team = team;
}

export function setTeam(team: Team) {
  try {
    localStorage.setItem('team', team);
  } catch {}
  applyTeam(team);
  listeners.forEach((l) => l());
}

export const useTeam = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getTeam,
    () => 'none' as Team,
  );
