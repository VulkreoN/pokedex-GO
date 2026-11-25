/**
 * Hunt alerts, raid alerts' siblings: a Pokémon still missing from one of a player's collections is part of an event
 * (featured or in the wild, now or within three weeks), or a field research reward right now. Same manners as raid
 * alerts: each Pokémon once per two weeks and per kind, at most one alert a day per kind, listing everything found.
 */
import { and, eq, gt, inArray, like } from 'drizzle-orm';
import type { LocalizedText, Variant } from '@mydexpogo/shared';
import { dataService } from '../data/service.js';
import { db, schema } from '../db/index.js';
import { getEventSpawns } from '../game/eventSpawns.js';
import { getResearch } from '../game/research.js';
import { notify } from './service.js';

const SAME_MON_MS = 14 * 86_400_000;
const ONE_A_DAY_MS = 20 * 3600_000;
const REGIONS: Record<string, string> = { Alolan: 'ALOLA', Galarian: 'GALARIAN', Hisuian: 'HISUIAN', Paldean: 'PALDEA' };

export interface Found {
  /** Variant key of what is caught ("546.cSPRING_2024", "74.fALOLA"). */
  key: string;
  canBeShiny: boolean;
  /** Where: the event's name, or the research task. */
  where: string;
  /** For an event not started yet. */
  from?: string | null;
}

/**
 * Our variant key from a Leek Duck picture: "pm546.cSPRING_2024.icon.png" as is; the older "pokemon_icon_037_61.png"
 * by its number and the region in the name ("Alolan Vulpix"). Megas give their normal form.
 */
export function keyOfPicture(image: string, name: string, known: (key: string) => boolean): string | null {
  const pm = /\/pm(\d+)((?:\.[fc][A-Z0-9_]+)?)\.(?:s\.)?icon\.png/.exec(image);
  if (pm) {
    const full = `${Number(pm[1])}${/\.f(MEGA|MEGA_X|MEGA_Y|PRIMAL)$/.test(pm[2]!) ? '' : pm[2]}`;
    return known(full) ? full : String(Number(pm[1]));
  }
  const old = /pokemon_icon_(\d{3,4})_/.exec(image);
  if (!old) return null;
  const dex = Number(old[1]);
  const region = REGIONS[name.split(' ')[0]!];
  const withRegion = region ? `${dex}.f${region}` : null;
  return withRegion && known(withRegion) ? withRegion : String(dex);
}

export interface MissingEntry {
  userId: string;
  listId: string;
  variantKey: string;
  shiny: boolean;
  tag: string;
}

/** Per player, what they miss among what was found: plain entries only (no Shadow, lucky…), shiny ones when it can be. */
export function matchHunt(found: Found[], missing: MissingEntry[], alreadyAlerted: Set<string>, kind: string): Map<string, { mon: Found; listIds: string[] }[]> {
  const out = new Map<string, { mon: Found; listIds: string[] }[]>();
  for (const mon of found) {
    for (const e of missing) {
      if (e.variantKey !== mon.key || e.tag !== '') continue;
      if (e.shiny && !mon.canBeShiny) continue;
      if (alreadyAlerted.has(`${e.userId}|${kind}|${mon.key}`)) continue;
      const mine = out.get(e.userId) ?? out.set(e.userId, []).get(e.userId)!;
      const hit = mine.find((x) => x.mon.key === mon.key);
      if (!hit) mine.push({ mon, listIds: [e.listId] });
      else if (!hit.listIds.includes(e.listId)) hit.listIds.push(e.listId);
    }
  }
  return out;
}

function nameOf(key: string, names: Map<number, LocalizedText>, variants: Map<string, Variant> | null): string {
  const dex = Number(key.split('.')[0]);
  const sp = names.get(dex);
  const label = variants?.get(key)?.label;
  return `${sp?.fr ?? sp?.en ?? `#${dex}`}${key.includes('.') && label ? ` ${label.fr ?? label.en}` : ''}`;
}

async function alert(kind: 'spawn' | 'quest', found: Found[]): Promise<number> {
  if (!found.length) return 0;
  const variants = await dataService.variants();
  const names = dataService.speciesNames();
  if (!names) return 0;
  const missing = await db
    .select({ userId: schema.lists.ownerId, listId: schema.lists.id, variantKey: schema.listEntries.variantKey, shiny: schema.listEntries.shiny, tag: schema.listEntries.tag })
    .from(schema.listEntries)
    .innerJoin(schema.lists, eq(schema.lists.id, schema.listEntries.listId))
    .where(and(eq(schema.listEntries.done, false), inArray(schema.listEntries.variantKey, [...new Set(found.map((f) => f.key))])));
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
  for (const [userId, hits] of matchHunt(found, missing, alerted, kind)) {
    if (Date.now() - (last.get(userId) ?? 0) < ONE_A_DAY_MS) continue;
    const monNames = hits.map((h) => nameOf(h.mon.key, names, variants));
    const listIds = [...new Set(hits.flatMap((h) => h.listIds))];
    const first = hits[0]!.mon;
    const when = first.from ? ` à partir du ${new Date(first.from).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : '';
    await notify({
      userId,
      type: kind,
      actorId: null,
      listId: listIds.length === 1 ? listIds[0]! : null,
      data: { mons: hits.map((h) => ({ key: h.mon.key, where: h.mon.where, from: h.mon.from ?? null })), names: monNames },
      push: () => ({
        title:
          kind === 'spawn'
            ? monNames.length > 1 ? `${monNames.length} Pokémon de tes collections dans un événement` : `${monNames[0]} dans un événement`
            : monNames.length > 1 ? `${monNames.length} Pokémon de tes collections en récompense de quête` : `${monNames[0]} en récompense de quête`,
        body: monNames.length > 1 ? monNames.join(', ') : kind === 'spawn' ? `${first.where}${when}. Il manque dans une de tes collections.` : `${first.where}. Il manque dans une de tes collections.`,
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

/** Event spawns and research rewards checked against everyone's missing Pokémon. */
export async function runHuntAlerts(): Promise<number> {
  const variants = await dataService.variants();
  const known = (k: string) => variants?.has(k) ?? false;
  let sent = 0;
  const events = await getEventSpawns().catch(() => []);
  const spawns: Found[] = events.flatMap((e) =>
    [...e.featured, ...e.spawns].flatMap((m) => {
      const key = keyOfPicture(m.image, m.name, known);
      const started = !e.start || new Date(e.start).getTime() <= Date.now();
      return key ? [{ key, canBeShiny: m.canBeShiny, where: e.name, from: started ? null : e.start }] : [];
    }),
  );
  sent += await alert('spawn', spawns);
  const research = await getResearch().catch(() => []);
  const quests: Found[] = research.flatMap((c) =>
    c.tasks.flatMap((task) =>
      task.rewards.flatMap((r) => {
        const key = r.kind === 'encounter' ? keyOfPicture(r.image, r.name, known) : null;
        return key ? [{ key, canBeShiny: !!r.canBeShiny, where: task.text }] : [];
      }),
    ),
  );
  sent += await alert('quest', quests);
  return sent;
}
