import { useEffect, useState } from 'react';
import { syncThemeColor } from './team.js';

export type Theme = 'auto' | 'light' | 'dark';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {}
  return 'auto';
}

export function isDark(theme = getTheme()): boolean {
  return theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

const listeners = new Set<() => void>();

export function applyTheme(theme: Theme) {
  const dark = isDark(theme);
  document.documentElement.classList.toggle('dark', dark);
  syncThemeColor();
  try {
    if (theme === 'auto') localStorage.removeItem('theme');
    else localStorage.setItem('theme', theme);
  } catch {}
  listeners.forEach((l) => l());
}

/** Current theme preference and whether the page is dark right now. */
export function useTheme() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { theme: getTheme(), dark: typeof document !== 'undefined' && document.documentElement.classList.contains('dark'), setTheme: applyTheme };
}
