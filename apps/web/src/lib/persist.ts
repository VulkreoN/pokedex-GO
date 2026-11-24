/**
 * Keeps the app's data on this device (IndexedDB) between visits, so it opens at once with what it showed last
 * time, then refreshes behind. Nothing admin-only is kept, and logging out wipes it all.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

const KEY = 'app-cache';

export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get<string>(k).then((v) => v ?? null), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: KEY,
  throttleTime: 2000,
});

/** Kept: the player's own things (account, collections, friends, notifications, game tab). Not kept: admin data, and the Pokédex (stored apart). */
const NOT_KEPT = new Set(['dataset', 'admin', 'users', 'audit', 'overrides', 'data-status', 'reports', 'client-errors']);

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 7 * 86400_000,
  // A new version of the app starts from fresh data.
  buster: import.meta.env.VITE_APP_VERSION || 'dev',
  dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && !NOT_KEPT.has(String(q.queryKey[0])) },
};

/** On logout: nothing of the account stays on the device. */
export async function forgetDeviceCache() {
  await Promise.resolve(persister.removeClient()).catch(() => {});
}
