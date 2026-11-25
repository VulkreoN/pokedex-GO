import { describe, expect, it } from 'vitest';
import { eventTitle, monsFr } from './eventNames.js';

const species = new Map(
  [
    [714, 'Noibat', 'Sonistrelle'], [488, 'Cresselia', 'Cresselia'], [491, 'Darkrai', 'Darkrai'], [641, 'Tornadus', 'Boréas'], [642, 'Thundurus', 'Fulguris'],
    [645, 'Landorus', 'Démétéros'], [354, 'Banette', 'Branette'], [483, 'Dialga', 'Dialga'], [27, 'Sandshrew', 'Sabelette'], [36, 'Clefable', 'Mélodelfe'], [311, 'Plusle', 'Posipi'], [312, 'Minun', 'Négapi'],
  ].map(([dex, en, fr]) => [dex as number, { name: { en: en as string, fr: fr as string } }]),
);

describe('event names in French', () => {
  it('weekly kinds', () => {
    expect(eventTitle('Noibat Spotlight Hour', species, 'fr')).toBe('Heure de mise en lumière : Sonistrelle');
    expect(eventTitle('Plusle and Minun Spotlight Hour', species, 'fr')).toBe('Heure de mise en lumière : Posipi et Négapi');
    expect(eventTitle('Cresselia and Darkrai in 5-star Raid Battles', species, 'fr')).toBe('Cresselia et Darkrai dans les Raids 5 étoiles');
    expect(eventTitle('Mega Banette in Mega Raids', species, 'fr')).toBe('Méga-Branette dans les Méga-Raids');
    expect(eventTitle('Shadow Dialga in Shadow Raids', species, 'fr')).toBe('Dialga obscur dans les Raids obscurs');
    expect(eventTitle('Shadow Tornadus (Incarnate Forme) in Shadow Raids', species, 'fr')).toBe('Boréas (Avatar) obscur dans les Raids obscurs');
    expect(eventTitle('Tornadus, Thundurus, and Landorus (Therian Formes) in 5-star Raid Battles', species, 'fr')).toBe('Boréas, Fulguris et Démétéros (Totémique) dans les Raids 5 étoiles');
    expect(eventTitle('Dynamax Alolan Sandshrew during Max Monday', species, 'fr')).toBe("Lundi Max : Sabelette d'Alola Dynamax");
    expect(eventTitle('December Community Day 2026', species, 'fr')).toBe('Journée Communauté de décembre 2026');
    expect(eventTitle('January Community Day Classic', species, 'fr')).toBe('Journée Communauté Classique de janvier');
    expect(eventTitle('Clefable Super Mega Raid Day', species, 'fr')).toBe('Super Journée de Méga-Raids : Mélodelfe');
    expect(eventTitle('GO Pass: December', species, 'fr')).toBe('GO Pass : décembre');
  });
  it('others stay as they are, and English stays English', () => {
    expect(eventTitle('Twilight Wishes', species, 'fr')).toBe('Twilight Wishes');
    expect(eventTitle('Noibat Spotlight Hour', species, 'en')).toBe('Noibat Spotlight Hour');
    expect(monsFr('Dialga', undefined)).toBe('Dialga');
  });
});
