import { describe, expect, it } from 'vitest';
import type { RichGameEvent } from '@mydexpogo/shared';
import { buildEventIcs } from './eventIcal.js';

const baseEvent = (over: Partial<RichGameEvent> = {}): RichGameEvent => ({
  eventID: 'clefable-super-mega-raid-day-2026',
  name: 'Clefable Super Mega Raid Day',
  eventType: 'raid-day',
  heading: 'Raid Day',
  template: 'raid_day',
  link: 'https://leekduck.com/events/clefable-super-mega-raid-day/',
  image: '',
  start: '2026-11-28T14:00:00',
  end: '2026-11-28T17:00:00',
  summary: 'Mega Clefable debuts in Super Mega Raids!',
  bonuses: [{ text: '2× Catch Candy' }, { text: 'Paid bonus', paid: true }],
  highlights: [],
  featured: [],
  spawnGroups: [],
  raidGroups: [],
  eggGroups: [],
  research: [],
  researchNote: null,
  rocket: [],
  newShinies: [],
  moves: [],
  ...over,
});

describe('eventIcal', () => {
  it('generates a valid RFC 5545 floating-local-time .ics file with French title, bonuses, URL and 15m reminder', () => {
    const res = buildEventIcs(baseEvent(), undefined, 'fr', undefined, new Date('2026-11-27T12:00:00Z'));
    expect(res).not.toBeNull();
    expect(res!.filename).toMatch(/\.ics$/);
    const ics = res!.ics;
    expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(ics).toContain('UID:clefable-super-mega-raid-day-2026@mydexpogo\r\n');
    expect(ics).toContain('DTSTAMP:20261127T120000Z\r\n');
    expect(ics).toContain('DTSTART:20261128T140000\r\n');
    expect(ics).toContain('DTEND:20261128T170000\r\n');
    expect(ics).toContain('SUMMARY:Super Journée de Méga-Raids : Clefable\r\n');
    expect(ics).toContain('2× Bonbons de capture');
    expect(ics).not.toContain('Paid bonus');
    expect(ics).toContain('URL:https://leekduck.com/events/clefable-super-mega-raid-day/\r\n');
    expect(ics).toContain('BEGIN:VALARM\r\nTRIGGER:-PT15M\r\n');
    expect(ics).toContain('END:VEVENT\r\nEND:VCALENDAR\r\n');
  });

  it('includes escaped location and handles ongoing all-day local events without end date', () => {
    const res = buildEventIcs(
      baseEvent({
        eventID: 'regional-pokepark-kanto',
        name: 'PokéPark KANTO',
        eventType: 'local-event',
        start: '2026-02-05T00:00:00',
        end: null,
        location: 'Inagi, Tokyo, Japan',
      }),
      undefined,
      'fr',
    );
    expect(res).not.toBeNull();
    expect(res!.ics).toContain('DTSTART;VALUE=DATE:20260205\r\n');
    expect(res!.ics).toContain('DTEND;VALUE=DATE:20260206\r\n');
    expect(res!.ics).toContain('LOCATION:🇯🇵 Inagi\\, Tokyo\\, Japon\r\n');
    expect(res!.ics).not.toContain('BEGIN:VALARM');
  });

  it('returns null when an event has no start date', () => {
    expect(buildEventIcs(baseEvent({ start: null }), undefined, 'fr')).toBeNull();
  });
});
