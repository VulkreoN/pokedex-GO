/** Instance settings an admin changes from the app, cached a few seconds. */
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export interface SignupSettings {
  /** open: anyone; invite: with an invitation code; closed: nobody (admin usernames always can). */
  mode: 'open' | 'invite' | 'closed';
  /** Most new accounts a day, against bots; null: no limit. */
  dailyCap: number | null;
}
const DEFAULTS = { signups: { mode: 'open', dailyCap: null } as SignupSettings };
type Settings = typeof DEFAULTS;

const cache = new Map<string, { at: number; value: unknown }>();

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10_000) return hit.value as Settings[K];
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1);
  const value = { ...DEFAULTS[key], ...(row?.value as object | undefined) } as Settings[K];
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K], by: string) {
  await db.insert(schema.appSettings).values({ key, value, updatedBy: by }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  cache.delete(key);
}
