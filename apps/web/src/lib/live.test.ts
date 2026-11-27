import { describe, expect, it } from 'vitest';
import {
  DAILY_DISCOVERIES,
  countdownOf,
  eventStatus,
  formatLocationBadge,
  isLocalEvent,
  liveName,
  raidEventFor,
  shortDuration,
  type GameEvent,
} from './live.js';
import { rocketName } from './tools.js';

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

describe('liveName', () => {
  const species = new Map([
    [105, { name: { en: 'Marowak', fr: 'Ossatueur' } }],
    [6, { name: { en: 'Charizard', fr: 'Dracaufeu' } }],
    [641, { name: { en: 'Tornadus', fr: 'Boréas' } }],
    [386, { name: { en: 'Deoxys', fr: 'Deoxys' } }],
    [25, { name: { en: 'Pikachu', fr: 'Pikachu' } }],
  ]);
  const img = (dex: number) => `https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm${dex}.icon.png`;
  it('puts regional, Mega, Shadow and form names in French', () => {
    expect(liveName('Alolan Marowak', img(105), species, 'fr')).toBe("Ossatueur d'Alola");
    expect(liveName('Shadow Alolan Marowak', img(105), species, 'fr')).toBe("Ossatueur d'Alola obscur");
    expect(liveName('Mega Charizard X', img(6), species, 'fr')).toBe('Méga-Dracaufeu X');
    expect(liveName('Shadow Tornadus (Incarnate Forme)', img(641), species, 'fr')).toBe('Boréas (Avatar) obscur');
    expect(liveName('Deoxys (Attack)', img(386), species, 'fr')).toBe('Deoxys (Attaque)');
    expect(liveName('Deoxys (Defense)', img(386), new Map([[386, { name: { en: 'Deoxys' } }]]), 'fr')).toBe('Deoxys (Défense)');
    expect(liveName('Sun Crown Pikachu', img(25), species, 'fr')).toBe('Pikachu (Couronne Soleil)');
    expect(liveName('Pikachu wearing a Sun Crown', img(25), species, 'fr')).toBe('Pikachu (Couronne Soleil)');
    expect(liveName('Day Scarf Espeon', 'https://cdn/pm196.fGOFEST_2024_SSCARF.icon.png', new Map([[196, { name: { en: 'Espeon', fr: 'Mentali' } }]]), 'fr')).toBe('Mentali (Écharpe Soleil)');
    expect(liveName('Rockruff (Dusk Form)', 'https://cdn/pm744.fDUSK.icon.png', new Map([[744, { name: { en: 'Rockruff', fr: 'Rocabot' } }]]), 'fr')).toBe('Rocabot (Crépusculaire)');
    expect(liveName('Necrozma (Dusk Mane)', 'https://cdn/pm800.fDUSK_MANE.icon.png', new Map([[800, { name: { en: 'Necrozma', fr: 'Necrozma' } }]]), 'fr')).toBe('Necrozma (Crinière du Couchant)');
    expect(liveName('Gigantamax Charizard', img(6), species, 'fr')).toBe('Dracaufeu Gigamax');
  });
  it('translates all Rocket trainer variants in French', () => {
    const ty = (t: string) => ({ grass: 'Plante', fire: 'Feu' }[t] ?? t);
    expect(rocketName('Grass-type Male Grunt', 'fr', ty)).toBe('Sbire ♂ · Plante');
    expect(rocketName('Grass Grunt', 'fr', ty)).toBe('Sbire · Plante');
    expect(rocketName('Female Fire Grunt', 'fr', ty)).toBe('Sbire ♀ · Feu');
    expect(rocketName('Leader Arlo', 'fr', ty)).toBe('Chef Arlo');
    expect(rocketName('Decoy Grunt', 'fr', ty)).toBe('Faux sbire ♀');
  });
  it('leaves English and unknown shapes alone', () => {
    expect(liveName('Alolan Marowak', img(105), species, 'en')).toBe('Alolan Marowak');
    expect(liveName('Pikachu Libre', img(105), species, 'fr')).toBe('Pikachu Libre');
    expect(liveName('Something', 'https://example.com/x.png', species, 'fr')).toBe('Something');
  });
});

describe('countdownOf & shortDuration', () => {
  it('formats minutes, hours and days cleanly in French and English', () => {
    expect(shortDuration(45 * 60_000, 'fr')).toBe('45 min');
    expect(shortDuration(85 * 60_000, 'fr')).toBe('1 h 25');
    expect(shortDuration((2 * 24 + 3) * 3600_000, 'fr')).toBe('2 j 3 h');
    expect(shortDuration((2 * 24 + 3) * 3600_000, 'en')).toBe('2 d 3 h');
  });

  it('returns starts/ends countdowns within window and null outside window', () => {
    const base = new Date('2026-11-20T12:00:00Z').getTime();
    expect(countdownOf({ start: '2026-11-20T13:30:00Z', end: '2026-11-20T16:00:00Z' }, 'fr', base)).toEqual({ kind: 'starts', text: '1 h 30' });
    expect(countdownOf({ start: '2026-11-20T10:00:00Z', end: '2026-11-20T12:40:00Z' }, 'fr', base)).toEqual({ kind: 'ends', text: '40 min' });
    expect(countdownOf({ start: '2026-11-25T10:00:00Z', end: '2026-11-26T10:00:00Z' }, 'fr', base)).toBeNull();
    expect(countdownOf({ start: '2026-11-18T10:00:00Z', end: '2026-11-19T10:00:00Z' }, 'fr', base)).toBeNull();
  });
});

describe('isLocalEvent & DAILY_DISCOVERIES', () => {
  it('distinguishes local/in-person/exclusive events from global events accurately', () => {
    expect(isLocalEvent({ eventType: 'pokemon-go-tour', heading: 'Pokémon GO Tour', name: 'Pokémon GO Tour: Alola - Los Angeles 2027' })).toBe(true);
    expect(isLocalEvent({ eventType: 'pokemon-go-tour', heading: 'Pokémon GO Tour', name: 'Pokémon GO Tour: Alola - Kaohsiung 2027' })).toBe(true);
    expect(isLocalEvent({ eventType: 'pokemon-go-tour', heading: 'Pokémon GO Tour', name: 'Pokémon GO Tour: Alola - Global 2027' })).toBe(false);
    expect(isLocalEvent({ eventType: 'city-safari', heading: 'City Safari', name: 'City Safari: Milan' })).toBe(true);
    expect(isLocalEvent({ eventType: 'event', heading: 'Event', name: 'Apple Stores Collab Japan' })).toBe(true);
    expect(isLocalEvent({ eventType: 'event', heading: 'Event', name: 'APAC Cross-Region Stamp Rally' })).toBe(true);
    expect(isLocalEvent({ eventType: 'event', heading: 'Event', name: 'PokéPark Kanto' })).toBe(true);
    expect(isLocalEvent({ eventType: 'event', heading: 'Event', name: 'UK National Trust Sites' })).toBe(true);
    expect(isLocalEvent({ eventType: 'local-event', heading: 'Local Event', name: 'Pokémon 30th Anniversary Mall Exploration', location: 'Malaysia, Philippines' })).toBe(true);
    expect(isLocalEvent({ eventType: 'event', heading: 'Event', name: 'European Space Agency partnership' })).toBe(true);
    expect(isLocalEvent({ eventType: 'event', heading: 'Event', name: 'Twilight Wishes' })).toBe(false);
    expect(isLocalEvent({ eventType: 'max-mondays', heading: 'Max Mondays', name: 'Dynamax Alolan Sandshrew during Max Monday' })).toBe(false);
    expect(isLocalEvent({ eventType: 'timed-research', heading: 'Timed Research', name: 'Pokémon GO and Duolingo Timed Research' })).toBe(false);
    expect(isLocalEvent({ eventType: 'go-pass', heading: 'GO Pass', name: 'GO Pass: November' })).toBe(false);
  });

  it('defines all 7 weekday slots (Mon–Sun with Saturday open) and uses Mardi Concours', () => {
    expect(DAILY_DISCOVERIES).toHaveLength(7);
    expect(DAILY_DISCOVERIES[0]?.fr.title).toBe('Lundi Max');
    expect(DAILY_DISCOVERIES[1]?.fr.title).toBe('Mardi Concours');
    expect(DAILY_DISCOVERIES[1]?.fr.lines[0]).toContain('Concours PokéStop');
    expect(DAILY_DISCOVERIES[4]?.fr.title).toBe('Vendredi Amitié');
    expect(DAILY_DISCOVERIES[5]).toBeNull();
    expect(DAILY_DISCOVERIES[6]?.fr.title).toBe('Dimanche Balade');
  });

  it('formats regional location badges with flags and French names', () => {
    expect(formatLocationBadge('Select malls in Malaysia, Philippines, Singapore, Hong Kong, Thailand', 'fr')).toContain('🇵🇭');
    expect(formatLocationBadge('Select malls in Malaysia, Philippines, Singapore, Hong Kong, Thailand', 'fr')).toContain('Malaisie');
    expect(formatLocationBadge('Pokémon Center locations around Japan', 'fr')).toBe('🇯🇵 Pokémon Centers au Japon');
    expect(formatLocationBadge('Participating science and space museums across Europe', 'fr')).toBe('🇪🇺 6 musées scientifiques en Europe');
    expect(formatLocationBadge(null, 'fr')).toBeNull();
  });
});
