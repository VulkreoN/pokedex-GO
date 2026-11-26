/**
 * Raid alerts: when a raid boss is a Pokémon still missing from one of a player's lists (or a safe pre-evolution when
 * enabled on that list), tell them. Not a nag: each boss once while it is in raids (two weeks), and at most one alert
 * a day, which lists every boss found that time.
 * Bosses come from Leek Duck (ScrapedDuck's raids.json), checked every few hours.
 */
import { and, eq, gt, inArray } from 'drizzle-orm';
import {
  candidateTargetKeys,
  entryMatchesLive,
  inferHuntSource,
  resolveLiveKey,
  type HuntIndex,
  type HuntSource,
  type LiveKnown,
  type LocalizedText,
  type Variant,
} from '@mydexpogo/shared';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { notify } from './service.js';
import { tracked } from '../lib/health.js';
import { runHuntAlerts } from './huntAlerts.js';

const RAIDS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json';
const EVERY_MS = 3 * 3600_000;
const SAME_BOSS_MS = 14 * 86_400_000;
const ONE_A_DAY_MS = 20 * 3600_000;

export interface Boss {
  /** Exact resolved variant key of the boss ("105.fALOLA", "6.fMEGA_X", "25.cPARTY_HAT"). */
  key: string;
  shadow: boolean;
  canBeShiny: boolean;
  /** 'raid' | 'megaRaid' | 'shadowRaid'; inferred automatically when omitted. */
  source?: HuntSource;
}

export const bossSource = (b: Boss): HuntSource =>
  b.source ?? (b.shadow ? 'shadowRaid' : inferHuntSource('raid', b.key));

export const bossId = (b: { key: string; shadow: boolean }) => `${b.key}${b.shadow ? '|shadow' : ''}`;

/** "pm105.fALOLA.icon.png" -> 105.fALOLA; Mega/Primal keeps its Mega key (matching both Mega & plain); costumes & clones stay strict. */
export function bossOf(
  raid: { name: string; image: string; canBeShiny?: boolean },
  known: ((key: string) => boolean) | LiveKnown,
): Boss | null {
  const liveKnown: LiveKnown = typeof known === 'function' ? { has: known } : known;
  const key = resolveLiveKey(raid.image, raid.name, liveKnown);
  if (!key) return null;
  const shadow = /^shadow /i.test(raid.name);
  const source = shadow ? 'shadowRaid' : inferHuntSource('raid', key, raid.name);
  return { key, shadow, canBeShiny: !!raid.canBeShiny, source };
}

export interface MissingEntry {
  userId: string;
  listId: string;
  variantKey: string;
  shiny: boolean;
  tag: string;
  alertPreEvolutions?: boolean;
}

/**
 * Per player, the bosses that would fill one of their missing entries:
 * - Normal raids match plain entries; Mega raids match both the Mega variant AND its plain catch form;
 *   Shadow raids match Shadow (and Purified) entries.
 * - Shinies only when the boss can be shiny.
 * - Safe pre-evolutions only when `alertPreEvolutions` is enabled on the collection (and never for Mega/Gmax/noEvolve).
 */
export function matchAlerts(
  bosses: Boss[],
  missing: MissingEntry[],
  alreadyAlerted: Set<string>,
  huntIndex: HuntIndex | null = null,
): Map<string, { boss: Boss; listIds: string[] }[]> {
  const out = new Map<string, { boss: Boss; listIds: string[] }[]>();
  for (const boss of bosses) {
    const source = bossSource(boss);
    for (const e of missing) {
      if (!entryMatchesLive(huntIndex, e, { key: boss.key, source, canBeShiny: boss.canBeShiny })) continue;
      if (alreadyAlerted.has(`${e.userId}|${bossId(boss)}`)) continue;
      const mine = out.get(e.userId) ?? out.set(e.userId, []).get(e.userId)!;
      const found = mine.find((x) => bossId(x.boss) === bossId(boss));
      if (!found) mine.push({ boss, listIds: [e.listId] });
      else if (!found.listIds.includes(e.listId)) found.listIds.push(e.listId);
    }
  }
  return out;
}

/** "Ossatueur d'Alola obscur", "Dracaufeu Méga X": the game's French names, as in the app. */
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
  const huntIndex = await dataService.huntIndex();
  const names = dataService.speciesNames();
  if (!names) return 0;
  const known: LiveKnown = huntIndex ?? { has: (k) => variants?.has(k) ?? false };
  const bosses = raids.flatMap((r) => bossOf(r, known) ?? []);
  if (!bosses.length) return 0;

  const targetKeys = candidateTargetKeys(
    huntIndex,
    bosses.map((b) => ({ key: b.key, source: bossSource(b) })),
  );
  if (!targetKeys.length) return 0;

  const missing = await db
    .select({
      userId: schema.lists.ownerId,
      listId: schema.lists.id,
      variantKey: schema.listEntries.variantKey,
      shiny: schema.listEntries.shiny,
      tag: schema.listEntries.tag,
      alertPreEvolutions: schema.lists.alertPreEvolutions,
    })
    .from(schema.listEntries)
    .innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId))
    .where(and(eq(schema.listEntries.done, false), inArray(schema.listEntries.variantKey, targetKeys)));
  if (!missing.length) return 0;

  const users = [...new Set(missing.map((m) => m.userId))];
  const recent = await db
    .select()
    .from(schema.raidAlerts)
    .where(and(inArray(schema.raidAlerts.userId, users), gt(schema.raidAlerts.alertedAt, new Date(Date.now() - SAME_BOSS_MS))));
  // Event and quest alerts share the table ("spawn|…", "quest|…"): they have their own daily limit.
  const raidRows = recent.filter((r) => !/^(spawn|quest|remind)\|/.test(r.bossId));
  const alerted = new Set(raidRows.map((r) => `${r.userId}|${r.bossId}`));
  const lastAlert = new Map<string, number>();
  for (const r of raidRows) lastAlert.set(r.userId, Math.max(lastAlert.get(r.userId) ?? 0, r.alertedAt.getTime()));

  let sent = 0;
  for (const [userId, found] of matchAlerts(bosses, missing, alerted, huntIndex)) {
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
/** First check a few minutes after start (the dataset is loaded by then), then every three hours; events and quests too. */
export function startRaidAlerts() {
  if (timer) return;
  const tick = () => {
    void runRaidAlerts().then((n) => n && console.log(`raid alerts: ${n} sent`)).catch((e) => console.error('raid alerts', e));
    void runHuntAlerts().then((n) => n && console.log(`event / quest alerts: ${n} sent`)).catch((e) => console.error('hunt alerts', e));
  };
  timer = setTimeout(function loop() {
    tick();
    timer = setTimeout(loop, EVERY_MS);
    timer.unref();
  }, 5 * 60_000);
  timer.unref();
}
