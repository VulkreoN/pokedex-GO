import { describe, expect, it } from 'vitest';
import { currentRaidBosses, raidSchedule, type GameEvent, type RaidBoss } from './live.js';

const boss = (tier: string, name: string, dex: string): RaidBoss => ({
  tier, name, image: `https://cdn/pm${dex}.icon.png`, canBeShiny: true,
  combatPower: { normal: { min: 1, max: 2 }, boosted: { min: 3, max: 4 } }, types: [], boostedWeather: [],
});
const event = (name: string, start: string | null, end: string | null, bosses: [string, string][], type = 'raid-battles'): GameEvent => ({
  eventID: name, name, eventType: type, heading: '', link: '', image: '', start, end,
  extraData: { raidbattles: { bosses: bosses.map(([n, d]) => ({ name: n, image: `https://cdn/pm${d}.icon.png`, canBeShiny: true })) } },
});
const now = Date.parse('2026-11-25T12:00:00');

describe('raids on a change day', () => {
  // Leek Duck's list still has last week's 5-star and Mega bosses; the announcements are this week's.
  const raids = [boss('5-Star Raids', 'Cresselia', '488'), boss('5-Star Raids', 'Darkrai', '491'), boss('Mega Raids', 'Mega Beedrill', '15.fMEGA'), boss('Mega Raids', 'Mega Banette', '354.fMEGA'), boss('3-Star Raids', 'Espeon', '196'), boss('5-Star Raids', 'Shadow Tornadus (Incarnate)', '641.fINCARNATE')];
  const events = [
    event('Cresselia and Darkrai in 5-star Raid Battles', null, null, []), // over: Leek Duck cleared its dates
    event('Mega Banette in Mega Raids', null, null, [['Mega Banette', '354.fMEGA']]),
    event('Deoxys in 5-star Raid Battles', '2026-11-25T06:00:00', '2026-12-01T22:00:00', [['Deoxys', '410']]),
    event('Mega Metagross in Mega Raids', '2026-11-25T06:00:00', '2026-12-01T22:00:00', [['Mega Metagross', '376.fMEGA']]),
    event('Shadow Tornadus (Incarnate Forme) in Shadow Raids', '2026-11-16T06:00:00', '2026-12-01T22:00:00', [['Tornadus (Incarnate)', '641.fINCARNATE']]),
    event('Deoxys Raid Hour', '2026-11-25T18:00:00', '2026-11-25T19:00:00', [], 'raid-hour'),
    event('Regidrago in 5-star Raid Battles', '2026-12-02T06:00:00', '2026-12-08T22:00:00', [['Regidrago', '895']]),
  ];

  it("this week's bosses only, the list's CP kept where it has them", () => {
    const bosses = currentRaidBosses(raids, events, now);
    expect(bosses.map((b) => `${b.tier} ${b.name}`)).toEqual(['5 Deoxys', 'shadow5 Shadow Tornadus (Incarnate)', 'mega Mega Metagross', 'mega Mega Beedrill', '3 Espeon']);
    expect(bosses.find((b) => b.tier === 'shadow5')!.combatPower).toBeTruthy(); // from the list
    expect(bosses.find((b) => b.tier === '5')!.combatPower).toBeUndefined(); // the page works it out
    expect(bosses.find((b) => b.tier === '5')!.end).toBe('2026-12-01T22:00:00');
  });

  it('Raid Hours apart, and the next weeks', () => {
    const s = raidSchedule(events, now);
    expect(s.moments.map((e) => e.name)).toEqual(['Deoxys Raid Hour']);
    expect(s.next.map((e) => e.name)).toEqual(['Regidrago in 5-star Raid Battles']);
  });
});
