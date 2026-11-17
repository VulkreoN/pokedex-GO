import { describe, expect, it } from 'vitest';
import { eventStatus, raidEventFor, type GameEvent } from './live.js';

const ev = (name: string, start: string | null, end: string | null, extra: Partial<GameEvent> = {}): GameEvent => ({
  eventID: name, name, eventType: 'raid-battles', heading: '', link: '', image: '', start, end, ...extra,
});
const now = new Date('2026-11-17T18:00:00').getTime();
const events = [
  ev('Cresselia and Darkrai in 5-star Raid Battles', '2026-11-16T06:00:00.000', '2026-11-24T22:00:00.000'),
  ev('Mega Banette in Mega Raids', '2026-11-16T06:00:00.000', '2026-11-24T22:00:00.000'),
  ev('Shadow Tornadus (Incarnate Forme) in Shadow Raids', '2026-11-16T06:00:00.000', '2026-12-01T22:00:00.000'),
  ev('Mega Metagross in Mega Raids', '2026-11-25T06:00:00.000', '2026-12-01T22:00:00.000'),
  ev('Cresselia and Darkrai Raid Hour', '2026-11-18T18:00:00.000', '2026-11-18T19:00:00.000', { eventType: 'raid-hour' }),
];

describe('raidEventFor', () => {
  it('finds the current event of each boss, keeping Shadow and Mega apart', () => {
    expect(raidEventFor('Darkrai', events, now)?.end).toBe('2026-11-24T22:00:00.000');
    expect(raidEventFor('Mega Banette', events, now)?.name).toBe('Mega Banette in Mega Raids');
    expect(raidEventFor('Shadow Tornadus (Incarnate)', events, now)?.end).toBe('2026-12-01T22:00:00.000');
    expect(raidEventFor('Tornadus (Incarnate)', events, now)).toBeUndefined();
    expect(raidEventFor('Metagross', events, now)).toBeUndefined();
    expect(raidEventFor('Liepard', events, now)).toBeUndefined();
  });
});

describe('eventStatus', () => {
  it('treats an undated archived event as past, an undated live one as current', () => {
    expect(eventStatus({ start: null, end: null, archived: true }, now)).toBe('past');
    expect(eventStatus({ start: null, end: null }, now)).toBe('current');
  });
});
