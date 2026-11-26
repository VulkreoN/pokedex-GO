/** Configurable landing page when launching the app while signed in, saved per device. */
import { useSyncExternalStore } from 'react';

export const START_PAGES = ['/dex', '/lists', '/lists/last', '/game', '/pvp', '/friends'] as const;
export type StartPage = (typeof START_PAGES)[number];

const KEY = 'startPage';
const listeners = new Set<() => void>();

export function getStartPage(): StartPage {
  try {
    const v = localStorage.getItem(KEY) as StartPage | null;
    if (v && (START_PAGES as readonly string[]).includes(v)) return v;
  } catch {}
  return '/dex';
}

export function setStartPage(page: StartPage) {
  try {
    localStorage.setItem(KEY, page);
  } catch {}
  listeners.forEach((l) => l());
}

export const useStartPage = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getStartPage,
    () => '/dex' as StartPage,
  );
