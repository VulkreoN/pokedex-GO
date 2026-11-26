/** Tracks when the PWA service worker has a newer build ready to activate. */
import { useSyncExternalStore } from 'react';

let applyFn: (() => void) | null = null;
const listeners = new Set<() => void>();

export function markSwUpdateAvailable(apply: () => void) {
  applyFn = apply;
  listeners.forEach((l) => l());
}

export function applySwUpdate() {
  if (applyFn) applyFn();
  else window.location.reload();
}

export function dismissSwUpdate() {
  applyFn = null;
  listeners.forEach((l) => l());
}

export const useSwUpdate = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => applyFn !== null,
    () => false,
  );
