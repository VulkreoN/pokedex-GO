/** In-memory fan-out of live events to the app tabs each user has open (single API instance). */
import type { LiveEvent } from '@mydexpogo/shared';

type Listener = (e: LiveEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export const hub = {
  subscribe(userId: string, fn: Listener): () => void {
    let set = listeners.get(userId);
    if (!set) listeners.set(userId, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      // Called again after a newer tab subscribed into a fresh set: only the emptied set may go, never that one.
      if (!set!.size && listeners.get(userId) === set) listeners.delete(userId);
    };
  },
  emit(userIds: Iterable<string>, e: LiveEvent) {
    for (const id of new Set(userIds)) for (const fn of listeners.get(id) ?? []) fn(e);
  },
  /** Broadcasts an event to every currently connected user tab without a DB lookup. */
  emitAll(e: LiveEvent) {
    for (const set of listeners.values()) for (const fn of set) fn(e);
  },
  connections: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  countFor: (userId: string) => listeners.get(userId)?.size ?? 0,
};
