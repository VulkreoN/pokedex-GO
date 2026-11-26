/** Last success and failure of each outside source the API reads, for the admin panel. */
export type SourceName = 'dataset' | 'research' | 'promo' | 'pvpoke' | 'raids' | 'hunts' | 'events' | 'feed';
export interface SourceHealth { okAt: string | null; errorAt: string | null; error: string | null }

const state = new Map<SourceName, SourceHealth>();

export function recordSource(name: SourceName, error?: unknown) {
  const prev = state.get(name) ?? { okAt: null, errorAt: null, error: null };
  const now = new Date().toISOString();
  state.set(name, error === undefined ? { ...prev, okAt: now } : { ...prev, errorAt: now, error: error instanceof Error ? error.message : String(error) });
}

/** Wraps a fetch of a source: records how it went, passes the result or the error on. */
export async function tracked<T>(name: SourceName, run: () => Promise<T>): Promise<T> {
  try {
    const out = await run();
    recordSource(name);
    return out;
  } catch (e) {
    recordSource(name, e);
    throw e;
  }
}

export const sourceHealth = () => Object.fromEntries(state) as Partial<Record<SourceName, SourceHealth>>;
