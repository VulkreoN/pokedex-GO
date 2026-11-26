import { useSyncExternalStore } from 'react';

export const TOUR_PAGES = ['dex', 'lists', 'list', 'game', 'pvp', 'friends', 'me'] as const;
export type TourPageId = (typeof TOUR_PAGES)[number];

const MODE_KEY = 'pageToursMode';
const SEEN_KEY = 'pageToursSeen';

export type TourMode = 'auto' | 'off';

interface TourSnapshot {
  mode: TourMode;
  seen: TourPageId[];
}

const listeners = new Set<() => void>();

function readSnapshot(): TourSnapshot {
  try {
    const mode: TourMode = localStorage.getItem(MODE_KEY) === 'auto' ? 'auto' : 'off';
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const seen = Array.isArray(parsed)
      ? parsed.filter((x): x is TourPageId => typeof x === 'string' && (TOUR_PAGES as readonly string[]).includes(x))
      : [];
    return { mode, seen };
  } catch {
    return { mode: 'off', seen: [] };
  }
}

let cached: TourSnapshot = typeof window !== 'undefined' ? readSnapshot() : { mode: 'off', seen: [] };

function emit() {
  cached = readSnapshot();
  listeners.forEach((fn) => fn());
}

function write(mode: TourMode, seen: TourPageId[]) {
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(seen)]));
  } catch {}
  emit();
}

/** Turns on the interactive guided tutorial banner across pages not seen yet. */
export function enableGuidedTours(resetSeen = false) {
  const cur = readSnapshot();
  write('auto', resetSeen ? [] : cur.seen);
}

/** Skips all remaining automatic page tutorials (users can still open any page's guide via the "?" button). */
export function disableGuidedTours() {
  const cur = readSnapshot();
  write('off', cur.seen);
}

/** Marks one page's tutorial as completed or skipped. */
export function markTourSeen(page: TourPageId) {
  const cur = readSnapshot();
  if (cur.seen.includes(page)) return;
  const next = [...cur.seen, page];
  // Once every page has been discovered, auto mode finishes cleanly.
  const allDone = TOUR_PAGES.every((p) => next.includes(p));
  write(allDone ? 'off' : cur.mode, next);
}

/** Replays every page tutorial from scratch. */
export function resetAllTours() {
  write('auto', []);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useTourState() {
  const snap = useSyncExternalStore(subscribe, () => cached, () => cached);
  return {
    mode: snap.mode,
    seen: snap.seen,
    seenCount: snap.seen.length,
    totalCount: TOUR_PAGES.length,
    shouldShowBanner: (page: TourPageId) => snap.mode === 'auto' && !snap.seen.includes(page),
  };
}
