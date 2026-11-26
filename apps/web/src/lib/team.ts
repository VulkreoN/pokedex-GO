/** Full-app colour themes (teams & Pokémon GO worlds), saved on this device. */
import { useSyncExternalStore } from 'react';

export type Team = 'none' | 'mystic' | 'valor' | 'instinct' | 'rocket' | 'sakura' | 'forest' | 'oled';
export const TEAMS: Team[] = ['none', 'mystic', 'valor', 'instinct', 'rocket', 'sakura', 'forest', 'oled'];

/** Preview swatches (header top/bottom, paper, accent) and browser status-bar theme-color per mode. */
export const TEAM_META: Record<Team, { lightBar: string; darkBar: string; preview: { top: string; bottom: string; paper: string; accent: string; darkPaper: string; darkAccent: string } }> = {
  none: { lightBar: '#158296', darkBar: '#1f6d7c', preview: { top: '#158296', bottom: '#246ec4', paper: '#e9f4ea', accent: '#1f7d47', darkPaper: '#1f2e3a', darkAccent: '#21854d' } },
  mystic: { lightBar: '#1d63c4', darkBar: '#1b4f9c', preview: { top: '#1d63c4', bottom: '#163d8f', paper: '#eaf1fb', accent: '#1c5ec2', darkPaper: '#131d2c', darkAccent: '#2a74dc' } },
  valor: { lightBar: '#cc2f3b', darkBar: '#a82435', preview: { top: '#cc2f3b', bottom: '#991b2e', paper: '#fbf0ef', accent: '#be2634', darkPaper: '#1f171b', darkAccent: '#d43848' } },
  instinct: { lightBar: '#c98300', darkBar: '#9a6508', preview: { top: '#c98300', bottom: '#9c5200', paper: '#faf4e4', accent: '#a86800', darkPaper: '#1e1b14', darkAccent: '#c9860d' } },
  rocket: { lightBar: '#31224a', darkBar: '#4d1f7a', preview: { top: '#31224a', bottom: '#1b1429', paper: '#f1eef7', accent: '#6d31b8', darkPaper: '#14111c', darkAccent: '#8844db' } },
  sakura: { lightBar: '#c43b78', darkBar: '#9c2b63', preview: { top: '#c43b78', bottom: '#8c2463', paper: '#fbf0f5', accent: '#b62d6c', darkPaper: '#1e151d', darkAccent: '#cf4284' } },
  forest: { lightBar: '#176b49', darkBar: '#1a5c41', preview: { top: '#176b49', bottom: '#104d3b', paper: '#e8f3eb', accent: '#187049', darkPaper: '#131e19', darkAccent: '#279460' } },
  oled: { lightBar: '#262c36', darkBar: '#0c111d', preview: { top: '#262c36', bottom: '#161a22', paper: '#f2f3f5', accent: '#2c3545', darkPaper: '#07090d', darkAccent: '#2a7de1' } },
};

const listeners = new Set<() => void>();

export function getTeam(): Team {
  try {
    const t = localStorage.getItem('team') as Team | null;
    if (t && TEAMS.includes(t)) return t;
  } catch {}
  return 'none';
}

export function syncThemeColor(team: Team = getTeam()) {
  if (typeof document === 'undefined') return;
  const dark = document.documentElement.classList.contains('dark');
  const m = TEAM_META[team] ?? TEAM_META.none;
  const meta = document.querySelector('meta[name="theme-color"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  meta.setAttribute('content', dark ? m.darkBar : m.lightBar);
}

export function applyTeam(team: Team = getTeam()) {
  if (team === 'none') delete document.documentElement.dataset.team;
  else document.documentElement.dataset.team = team;
  syncThemeColor(team);
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
