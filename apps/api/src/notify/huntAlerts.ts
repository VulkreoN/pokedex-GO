/**
 * Hunt alerts, raid alerts' siblings: a Pokémon still missing from one of a player's collections (or a safe
 * pre-evolution when enabled on that list) is part of an event (featured or in the wild, now or within three weeks),
 * or a field research reward right now. Same manners as raid alerts: each Pokémon once per two weeks and per kind, at
 * most one alert a day per kind, listing everything found.
 * And a reminder the day before an event in which a Pokémon a player misses appears (wild, raids, eggs, research,
 * Rocket), once per event, with strict source/tag matching.
 */
import { and, eq, gt, inArray, like } from 'drizzle-orm';
import {
  candidateTargetKeys,
  entryMatchesLive,
  eventTitle,
  inferHuntSource,
  resolveLiveKey,
  type HuntIndex,
  type HuntSource,
  type LiveKnown,
  type LocalizedText,
  type Variant,
} from '@mydexpogo/shared';
import { questFr } from '../lib/gameTexts.js';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { getEventSpawns, type EventSpawns } from '../game/eventSpawns.js';
import { getResearch } from '../game/research.js';
import { notify } from './service.js';

const SAME_MON_MS = 14 * 86_400_000;
const ONE_A_DAY_MS = 20 * 3600_000;
/** Alerts run every three hours: a reminder comes 21 to 24 hours before the event. */
const REMIND_BEFORE_MS = 24 * 3600_000;

export interface Found {
  /** Variant key of what is caught ("546.cSPRING_2024", "74.fALOLA", "6.fMEGA_X"). */
  key: string;
  canBeShiny: boolean;
  /** Where: the event's name, or the research task (as Leek Duck writes it), and in French. */
  where: string;
  whereFr?: string;
  /** For an event not started yet. */
  from?: string | null;
  /** Live source kind; defaults to 'wild'. */
  source?: HuntSource;
}

/**
 * Strict variant key from a Leek Duck picture + English name: never degrades an explicit costume/form/clone/gmax
 * token back to the plain species when unknown.
 */
export function keyOfPicture(image: string, name: string, known: ((key: string) => boolean) | LiveKnown): string | null {
  const liveKnown: LiveKnown = typeof known === 'function' ? { has: known } : known;
  return resolveLiveKey(image, name, liveKnown);
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
 * Per player, what they miss among what was found: strict variant & source/tag matching, shiny only when obtainable,
 * and safe pre-evolutions only for collections with `alertPreEvolutions` enabled.
 */
export function matchHunt(
  found: Found[],
  missing: MissingEntry[],
  alreadyAlerted: Set<string>,
  kind: string,
  huntIndex: HuntIndex | null = null,
): Map<string, { mon: Found; listIds: string[] }[]> {
  const out = new Map<string, { mon: Found; listIds: string[] }[]>();
  for (const mon of found) {
    const source = mon.source ?? 'wild';
    const isShadow = source === 'rocket' || source === 'shadowRaid';
    const dedupKey = `${mon.key}${isShadow ? '|shadow' : ''}`;
    for (const e of missing) {
      if (!entryMatchesLive(huntIndex, e, { key: mon.key, source, canBeShiny: mon.canBeShiny })) continue;
      if (alreadyAlerted.has(`${e.userId}|${kind}|${mon.key}`)) continue;
      const mine = out.get(e.userId) ?? out.set(e.userId, []).get(e.userId)!;
      const hit = mine.find((x) => `${x.mon.key}${(x.mon.source === 'rocket' || x.mon.source === 'shadowRaid') ? '|shadow' : ''}` === dedupKey);
      if (!hit) mine.push({ mon, listIds: [e.listId] });
      else if (!hit.listIds.includes(e.listId)) hit.listIds.push(e.listId);
    }
  }
  return out;
}

function nameOf(mon: Pick<Found, 'key' | 'source'>, names: Map<number, LocalizedText>, variants: Map<string, Variant> | null): string {
  const dex = Number(mon.key.split('.')[0]);
  const sp = names.get(dex);
  const label = variants?.get(mon.key)?.label;
  const shadow = mon.source === 'rocket' || mon.source === 'shadowRaid';
  return `${sp?.fr ?? sp?.en ?? `#${dex}`}${mon.key.includes('.') && label ? ` ${label.fr ?? label.en}` : ''}${shadow ? ' obscur' : ''}`;
}

async function alert(kind: 'spawn' | 'quest', found: Found[], huntIndex: HuntIndex | null): Promise<number> {
  if (!found.length) return 0;
  const variants = await dataService.variants();
  const names = dataService.speciesNames();
  if (!names) return 0;
  const targetKeys = candidateTargetKeys(
    huntIndex,
    found.map((f) => ({ key: f.key, source: f.source ?? (kind === 'quest' ? 'research' : 'wild') })),
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
  // The raid alerts' table keeps these too, as "spawn|<key>" / "quest|<key>".
  const recent = await db
    .select()
    .from(schema.raidAlerts)
    .where(and(inArray(schema.raidAlerts.userId, users), like(schema.raidAlerts.bossId, `${kind}|%`), gt(schema.raidAlerts.alertedAt, new Date(Date.now() - SAME_MON_MS))));
  const alerted = new Set(recent.map((r) => `${r.userId}|${r.bossId}`));
  const last = new Map<string, number>();
  for (const r of recent) last.set(r.userId, Math.max(last.get(r.userId) ?? 0, r.alertedAt.getTime()));

  let sent = 0;
  for (const [userId, hits] of matchHunt(found, missing, alerted, kind, huntIndex)) {
    if (Date.now() - (last.get(userId) ?? 0) < ONE_A_DAY_MS) continue;
    const monNames = hits.map((h) => nameOf(h.mon, names, variants));
    const listIds = [...new Set(hits.flatMap((h) => h.listIds))];
    const first = hits[0]!.mon;
    const when = first.from ? ` à partir du ${new Date(first.from).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : '';
    await notify({
      userId,
      type: kind,
      actorId: null,
      listId: listIds.length === 1 ? listIds[0]! : null,
      data: { mons: hits.map((h) => ({ key: h.mon.key, where: h.mon.where, whereFr: h.mon.whereFr ?? null, from: h.mon.from ?? null })), names: monNames },
      push: () => ({
        title:
          kind === 'spawn'
            ? monNames.length > 1 ? `${monNames.length} Pokémon de tes collections dans un événement` : `${monNames[0]} dans un événement`
            : monNames.length > 1 ? `${monNames.length} Pokémon de tes collections en récompense de quête` : `${monNames[0]} en récompense de quête`,
        body: monNames.length > 1 ? monNames.join(', ') : `${first.whereFr ?? first.where}${kind === 'spawn' ? when : ''}. Il manque dans une de tes collections.`,
        url: kind === 'spawn' ? '/game?tab=spawns' : '/game?tab=research',
        tag: kind,
      }),
    });
    await db
      .insert(schema.raidAlerts)
      .values(hits.map((h) => ({ userId, bossId: `${kind}|${h.mon.key}` })))
      .onConflictDoUpdate({ target: [schema.raidAlerts.userId, schema.raidAlerts.bossId], set: { alertedAt: new Date() } });
    sent++;
  }
  return sent;
}

/** The day before an event: players missing one of its Pokémon, once per event, respecting each section's true source. */
export async function remindUpcoming(
  events: EventSpawns[],
  known: ((k: string) => boolean) | LiveKnown,
  now = Date.now(),
  huntIndex: HuntIndex | null = null,
): Promise<number> {
  const names = dataService.speciesNames();
  if (!names) return 0;
  const variants = await dataService.variants();
  const idx = huntIndex ?? (await dataService.huntIndex());
  const species = new Map([...names].map(([dex, name]) => [dex, { name }]));
  let sent = 0;
  for (const e of events) {
    const start = e.start ? new Date(e.start).getTime() : NaN;
    if (!(start > now && start - now <= REMIND_BEFORE_MS) || e.eventType === 'season') continue;
    const found = new Map<string, Found>();
    const whereFr = eventTitle(e.name, species, 'fr');
    const addSection = (mons: EventSpawns['spawns'], baseSource: HuntSource) => {
      for (const m of mons) {
        const key = keyOfPicture(m.image, m.name, known);
        if (!key) continue;
        const source = inferHuntSource(baseSource, key, m.name);
        const slot = `${source}|${key}`;
        const hit = found.get(slot);
        if (hit) hit.canBeShiny ||= m.canBeShiny;
        else found.set(slot, { key, source, canBeShiny: m.canBeShiny, where: e.name, whereFr, from: e.start });
      }
    };
    addSection(e.featured, 'wild');
    addSection(e.spawns, 'wild');
    addSection(e.eggs, 'egg');
    addSection(e.research, 'research');
    addSection(e.raids, 'raid');
    addSection(e.rocket, 'rocket');
    if (!found.size) continue;
    const foundList = [...found.values()];
    const targetKeys = candidateTargetKeys(idx, foundList.map((f) => ({ key: f.key, source: f.source ?? 'wild' })));
    if (!targetKeys.length) continue;
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
    if (!missing.length) continue;
    const bossId = `remind|${e.eventID}`;
    const done = new Set((await db.select({ userId: schema.raidAlerts.userId }).from(schema.raidAlerts).where(eq(schema.raidAlerts.bossId, bossId))).map((r) => r.userId));
    for (const [userId, hits] of matchHunt(foundList, missing, new Set(), 'remind', idx)) {
      if (done.has(userId)) continue;
      const monNames = hits.map((h) => nameOf(h.mon, names, variants));
      const listIds = [...new Set(hits.flatMap((h) => h.listIds))];
      const title = eventTitle(e.name, species, 'fr');
      // Leek Duck's times are local ("10:00" wherever you play), without a zone: as written.
      const at = e.start!.slice(11, 16).replace(':', 'h');
      await notify({
        userId,
        type: 'spawn',
        actorId: null,
        listId: listIds.length === 1 ? listIds[0]! : null,
        data: { remind: true, event: e.name, eventFr: title, start: e.start, mons: hits.map((h) => ({ key: h.mon.key, where: e.name, whereFr: title, from: e.start })), names: monNames },
        push: () => ({
          title: `Demain : ${title}`,
          body: `${monNames.length > 1 ? `${monNames.length} Pokémon de tes collections y seront : ${monNames.join(', ')}` : `${monNames[0]} y sera, il manque dans une de tes collections`}. Début à ${at}.`,
          url: '/game?tab=spawns',
          tag: `remind-${e.eventID}`,
        }),
      });
      await db.insert(schema.raidAlerts).values({ userId, bossId }).onConflictDoUpdate({ target: [schema.raidAlerts.userId, schema.raidAlerts.bossId], set: { alertedAt: new Date() } });
      sent++;
    }
  }
  return sent;
}

/** Event spawns and research rewards checked against everyone's missing Pokémon; the day-before reminders. */
export async function runHuntAlerts(): Promise<number> {
  const variants = await dataService.variants();
  const huntIndex = await dataService.huntIndex();
  const known: LiveKnown = huntIndex ?? { has: (k) => variants?.has(k) ?? false };
  const species = new Map([...(dataService.speciesNames() ?? new Map<number, LocalizedText>())].map(([dex, name]) => [dex, { name }]));
  let sent = 0;
  const events = await getEventSpawns().catch(() => []);
  const spawns: Found[] = events.flatMap((e) =>
    [...e.featured, ...e.spawns].flatMap((m) => {
      const key = keyOfPicture(m.image, m.name, known);
      const started = !e.start || new Date(e.start).getTime() <= Date.now();
      return key ? [{ key, source: 'wild' as const, canBeShiny: m.canBeShiny, where: e.name, whereFr: eventTitle(e.name, species, 'fr'), from: started ? null : e.start }] : [];
    }),
  );
  sent += await alert('spawn', spawns, huntIndex);
  sent += await remindUpcoming(events, known, Date.now(), huntIndex);
  const research = await getResearch().catch(() => []);
  const quests: Found[] = [];
  for (const c of research) {
    for (const task of c.tasks) {
      const whereFr = (await questFr(task.text)) ?? undefined;
      for (const r of task.rewards) {
        const key = r.kind === 'encounter' ? keyOfPicture(r.image, r.name, known) : null;
        if (key) quests.push({ key, source: 'research', canBeShiny: !!r.canBeShiny, where: task.text, whereFr });
      }
    }
  }
  sent += await alert('quest', quests, huntIndex);
  return sent;
}
