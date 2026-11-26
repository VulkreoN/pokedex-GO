import { describe, expect, it } from 'vitest';
import type { Dataset } from '@mydexpogo/shared';
import { buildIndex } from './dataset.js';
import { liveAppearancesOf, matchesDexToken, suggestListTag } from './dexSearch.js';
import { candidateSearch } from './hyperTraining.js';

const miniDataset: Dataset = {
  schema: 1,
  version: 'test',
  generatedAt: '2026-01-01T00:00:00Z',
  assetBase: '',
  sources: {},
  species: [
    { dex: 1, id: 'BULBASAUR', name: { en: 'Bulbasaur', fr: 'Bulbizarre' }, gen: 1, types: ['grass', 'poison'], rarity: 'normal', family: 'FAMILY_BULBASAUR', genderDiff: false, shinyReleased: true, released: true },
    { dex: 2, id: 'IVYSAUR', name: { en: 'Ivysaur', fr: 'Herbizarre' }, gen: 1, types: ['grass', 'poison'], rarity: 'normal', family: 'FAMILY_BULBASAUR', parent: 1, genderDiff: false, shinyReleased: true, released: true },
    { dex: 25, id: 'PIKACHU', name: { en: 'Pikachu', fr: 'Pikachu' }, gen: 1, types: ['electric'], rarity: 'normal', family: 'FAMILY_PIKACHU', parent: 172, genderDiff: true, shinyReleased: true, released: true },
    { dex: 26, id: 'RAICHU', name: { en: 'Raichu', fr: 'Raichu' }, gen: 1, types: ['electric'], rarity: 'normal', family: 'FAMILY_PIKACHU', parent: 25, genderDiff: true, shinyReleased: true, released: true },
    { dex: 172, id: 'PICHU', name: { en: 'Pichu', fr: 'Pichu' }, gen: 2, types: ['electric'], rarity: 'normal', family: 'FAMILY_PIKACHU', genderDiff: false, shinyReleased: true, released: true },
  ],
  variants: [
    { key: '1', dex: 1, form: null, costume: null, gender: null, kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '2', dex: 2, form: null, costume: null, gender: null, kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '25', dex: 25, form: null, costume: null, gender: 'm', kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '25.g2', dex: 25, form: null, costume: null, gender: 'f', kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '26', dex: 26, form: null, costume: null, gender: null, kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '172', dex: 172, form: null, costume: null, gender: null, kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
  ],
};

describe('matchesDexToken', () => {
  const idx = buildIndex(miniDataset);

  it('matches evolution families with +name and +dex syntax', () => {
    const cache = new Map<string, Set<string>>();
    expect(matchesDexToken(idx, 172, '+pikachu', undefined, cache)).toBe(true);
    expect(matchesDexToken(idx, 25, '+pikachu', undefined, cache)).toBe(true);
    expect(matchesDexToken(idx, 26, '+pikachu', undefined, cache)).toBe(true);
    expect(matchesDexToken(idx, 1, '+pikachu', undefined, cache)).toBe(false);
    expect(matchesDexToken(idx, 172, '+25', undefined, cache)).toBe(true);
  });

  it('matches inclusive dex ranges in either direction', () => {
    expect(matchesDexToken(idx, 1, '1-2')).toBe(true);
    expect(matchesDexToken(idx, 2, '1-2')).toBe(true);
    expect(matchesDexToken(idx, 25, '1-2')).toBe(false);
    expect(matchesDexToken(idx, 25, '26-25')).toBe(true);
  });
});

describe('suggestListTag', () => {
  it('infers a dominant non-background tag when at least 70% of entries share it', () => {
    expect(suggestListTag([{ tag: 'lucky' }, { tag: 'lucky' }, { tag: 'lucky' }, { tag: '' }])).toBe('lucky');
    expect(suggestListTag([{ tag: 'shadow' }, { tag: '' }])).toBe('');
    expect(suggestListTag([{ tag: 'bg:paris' }, { tag: 'bg:paris' }])).toBe('');
    expect(suggestListTag([])).toBe('');
  });
});

describe('liveAppearancesOf', () => {
  it('collects current raids, eggs, research, rocket encounters, and active events without past ones', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    const list = liveAppearancesOf(
      25,
      {
        raids: [{ name: 'Pikachu', image: 'https://cdn/pm25.icon.png', tier: '1-Star Raids', types: [], combatPower: { normal: { min: 1, max: 2 }, boosted: { min: 3, max: 4 } }, boostedWeather: [] }],
        eggs: [{ name: 'Pikachu', image: 'https://cdn/pm25.icon.png', eggType: '2 km', isAdventureSync: false, isRegional: false, isGiftExchange: false, rarity: 1 }],
        research: [{ title: 'Event', event: true, end: null, tasks: [{ text: 'Catch 5', rewards: [{ kind: 'encounter', name: 'Pikachu', image: 'https://cdn/pm25.icon.png' }] }] }],
        rockets: [
          {
            name: 'Sparky',
            title: 'Grunt',
            type: 'electric',
            firstPokemon: [{ name: 'Pikachu', image: 'https://cdn/pm25.icon.png', types: ['electric'], isEncounter: true }],
            secondPokemon: [],
            thirdPokemon: [{ name: 'Raichu', image: 'https://cdn/pm26.icon.png', types: ['electric'], isEncounter: false }],
          },
        ],
        eventSpawns: [
          { eventID: 'cur', name: 'Summer Fest', eventType: 'event', link: '', image: '', start: '2026-06-14T00:00:00Z', end: '2026-06-20T00:00:00Z', featured: [{ name: 'Pikachu', image: 'https://cdn/pm25.icon.png' }], spawns: [], raids: [], eggs: [], research: [], rocket: [] },
          { eventID: 'old', name: 'Old Fest', eventType: 'event', link: '', image: '', start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', featured: [{ name: 'Pikachu', image: 'https://cdn/pm25.icon.png' }], spawns: [], raids: [], eggs: [], research: [], rocket: [] },
        ],
      },
      now,
    );
    expect(list.map((a) => `${a.kind}:${a.detail}`)).toEqual([
      'raid:1',
      'egg:2 km',
      'research:Event',
      'rocket:Sparky',
      'event:Summer Fest',
    ]);
    // Non-encounter Rocket slot (Raichu) is excluded.
    expect(liveAppearancesOf(26, { rockets: [{ name: 'Sparky', title: 'Grunt', type: 'electric', firstPokemon: [], secondPokemon: [], thirdPokemon: [{ name: 'Raichu', image: 'https://cdn/pm26.icon.png', types: ['electric'], isEncounter: false }] }] }, now)).toEqual([]);
  });
});

describe('candidateSearch (Bottle Caps)', () => {
  it('supports both English and French game keywords', () => {
    expect(candidateSearch(true, 'en')).toBe('4attack,4defense&4attack,4hp&4defense,4hp&!4*&!shadow&shiny');
    expect(candidateSearch(true, 'fr')).toBe('4attaque,4défense&4attaque,4pv&4défense,4pv&!4*&!obscur&chromatique');
    expect(candidateSearch(false, 'fr')).toBe('4attaque,4défense&4attaque,4pv&4défense,4pv&!4*&!obscur');
  });
});
