/**
 * Raid alerts: when a raid boss is a Pokémon still missing from one of a player's lists, tell them. Not a nag: each
 * boss once while it is in raids (two weeks), and at most one alert a day, which lists every boss found that time.
 * Bosses come from Leek Duck (ScrapedDuck's raids.json), checked every few hours.
 */
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { LocalizedText, Variant } from '@mydexpogo/shared';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { notify } from './service.js';
import { tracked } from '../lib/health.js';

const RAIDS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json';
const EVERY_MS = 3 * 3600_000;
const SAME_BOSS_MS = 14 * 86_400_000;
const ONE_A_DAY_MS = 20 * 3600_000;

export interface Boss {
  /** Our variant key of what a catch gives: a Mega raid gives the normal form. */
  key: string;
  shadow: boolean;
  canBeShiny: boolean;
}
export const bossId = (b: { key: string; shadow: boolean }) => `${b.key}${b.shadow ? '|shadow' : ''}`;

/** "pm105.fALOLA.icon.png" + "Alolan Marowak" -> 105.fALOLA; Megas and Primals to their normal form; Shadow apart. */
export function bossOf(raid: { name: string; image: string; canBeShiny?: boolean }, known: (key: string) => boolean): Boss | null {
  const m = /\/pm(\d+)(?:\.f([A-Z0-9_]+))?\.icon\.png$/.exec(raid.image);
  if (!m) return null;
  const form = m[2] && !/^(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/.test(m[2]) ? m[2] : null;
  const withForm = form ? `${m[1]}.f${form}` : m[1]!;
  return { key: known(withForm) ? withForm : m[1]!, shadow: /^shadow /i.test(raid.name), canBeShiny: !!raid.canBeShiny };
}

export interface MissingEntry {
  userId: string;
  listId: string;
  variantKey: string;
  shiny: boolean;
  tag: string;
}

/**
 * Per player, the bosses that would fill one of their missing entries: same variant, a Shadow raid for a Shadow entry
 * and a normal raid for a plain one, shiny entries only when the boss can be shiny. Bosses already announced are left out.
 */
export function matchAlerts(bosses: Boss[], missing: MissingEntry[], alreadyAlerted: Set<string>): Map<string, { boss: Boss; listIds: string[] }[]> {
  const out = new Map<string, { boss: Boss; listIds: string[] }[]>();
  for (const boss of bosses) {
    for (const e of missing) {
      if (e.variantKey !== boss.key) continue;
      if (boss.shadow ? e.tag !== 'shadow' : e.tag !== '') continue;
      if (e.shiny && !boss.canBeShiny) continue;
      if (alreadyAlerted.has(`${e.userId}|${bossId(boss)}`)) continue;
      const mine = out.get(e.userId) ?? out.set(e.userId, []).get(e.userId)!;
      const found = mine.find((x) => bossId(x.boss) === bossId(boss));
      if (!found) mine.push({ boss, listIds: [e.listId] });
      else if (!found.listIds.includes(e.listId)) found.listIds.push(e.listId);
    }
  }
  return out;
}

/** "Ossatueur d'Alola obscur": the game's French names, as in the app. */
function nameOf(b: Boss, names: Map<number, LocalizedText>, variants: Map<string, Variant> | null): string {
  const dex = Number(b.key.split('.')[0]);
  const sp = names.get(dex);
  const label = variants?.get(b.key)?.label;
  const base = sp?.fr ?? sp?.en ?? `#${dex}`;
  return `${base}${b.key.includes('.') && label ? ` ${label.fr ?? label.en}` : ''}${b.shadow ? ' obscur' : ''}`;
}

export const runRaidAlerts = (): Promise<number> => tracked('raids', alertOnce);

async function alertOnce(): Promise<number> {
  const res = await fetch(RAIDS_URL);
  if (!res.ok) throw new Error(`raids: HTTP ${res.status}`);
  const raids = (await res.json()) as { name: string; image: string; canBeShiny?: boolean }[];
  const variants = await dataService.variants();
  const names = dataService.speciesNames();
  if (!names) return 0;
  const bosses = raids.flatMap((r) => bossOf(r, (k) => variants?.has(k) ?? false) ?? []);
  if (!bosses.length) return 0;

  const missing = await db
    .select({ userId: schema.lists.ownerId, listId: schema.lists.id, variantKey: schema.listEntries.variantKey, shiny: schema.listEntries.shiny, tag: schema.listEntries.tag })
    .from(schema.listEntries)
    .innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId))
    .where(and(eq(schema.listEntries.done, false), inArray(schema.listEntries.variantKey, [...new Set(bosses.map((b) => b.key))])));
  if (!missing.length) return 0;

  const users = [...new Set(missing.map((m) => m.userId))];
  const recent = await db
    .select()
    .from(schema.raidAlerts)
    .where(and(inArray(schema.raidAlerts.userId, users), gt(schema.raidAlerts.alertedAt, new Date(Date.now() - SAME_BOSS_MS))));
  const alerted = new Set(recent.map((r) => `${r.userId}|${r.bossId}`));
  const lastAlert = new Map<string, number>();
  for (const r of recent) lastAlert.set(r.userId, Math.max(lastAlert.get(r.userId) ?? 0, r.alertedAt.getTime()));

  let sent = 0;
  for (const [userId, found] of matchAlerts(bosses, missing, alerted)) {
    if (Date.now() - (lastAlert.get(userId) ?? 0) < ONE_A_DAY_MS) continue; // tomorrow, with whatever is still in raids
    const bossNames = found.map((f) => nameOf(f.boss, names, variants));
    const listIds = [...new Set(found.flatMap((f) => f.listIds))];
    await notify({
      userId,
      type: 'raid',
      actorId: null,
      listId: listIds.length === 1 ? listIds[0]! : null,
      data: { bosses: found.map((f) => ({ key: f.boss.key, shadow: f.boss.shadow })), names: bossNames },
      push: () => ({
        title: bossNames.length > 1 ? `${bossNames.length} Pokémon de tes collections sont en raid` : `${bossNames[0]} est en raid`,
        body: bossNames.length > 1 ? bossNames.join(', ') : 'Il manque dans une de tes collections.',
        url: '/game',
        tag: 'raid',
      }),
    });
    await db
      .insert(schema.raidAlerts)
      .values(found.map((f) => ({ userId, bossId: bossId(f.boss) })))
      .onConflictDoUpdate({ target: [schema.raidAlerts.userId, schema.raidAlerts.bossId], set: { alertedAt: new Date() } });
    sent++;
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;
/** First check a few minutes after start (the dataset is loaded by then), then every three hours. */
export function startRaidAlerts() {
  if (timer) return;
  const tick = () => void runRaidAlerts().then((n) => n && console.log(`raid alerts: ${n} sent`)).catch((e) => console.error('raid alerts', e));
  timer = setTimeout(function loop() {
    tick();
    timer = setTimeout(loop, EVERY_MS);
    timer.unref();
  }, 5 * 60_000);
  timer.unref();
}
