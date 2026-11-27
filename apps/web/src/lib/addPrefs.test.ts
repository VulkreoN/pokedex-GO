import { describe, expect, it } from 'vitest';
import type { Dataset, Variant } from '@mydexpogo/shared';
import { buildIndex } from './dataset.js';
import { buildQuickEntries } from './addPrefs.js';

function makeIdx() {
  const variants: Variant[] = [
    { key: '25', dex: 25, form: null, costume: null, gender: 'm', kind: 'base', label: null, img: 'pm25.icon.png', hasShiny: true, datamined: false, inGameMaster: true, genders: ['m', 'f'] },
    { key: '25.g2', dex: 25, form: null, costume: null, gender: 'f', kind: 'base', label: null, img: 'pm25.g2.icon.png', hasShiny: true, datamined: false, inGameMaster: true, genders: ['m', 'f'] },
    { key: '29', dex: 29, form: null, costume: null, gender: null, kind: 'base', label: null, img: 'pm29.icon.png', hasShiny: true, datamined: false, inGameMaster: true, genders: ['f'] },
    { key: '81', dex: 81, form: null, costume: null, gender: null, kind: 'base', label: null, img: 'pm81.icon.png', hasShiny: false, datamined: false, inGameMaster: true, genders: [] },
  ];
  const ds: Dataset = {
    schema: 1,
    version: '1',
    generatedAt: '2026-11-27T00:00:00.000Z',
    assetBase: 'https://example.com/',
    sources: {},
    species: [
      { dex: 25, id: 'PIKACHU', name: { en: 'Pikachu' }, gen: 1, types: ['electric'], rarity: 'normal', family: 'FAMILY_PIKACHU', genderDiff: true, shinyReleased: true, released: true },
      { dex: 29, id: 'NIDORAN_FEMALE', name: { en: 'Nidoran♀' }, gen: 1, types: ['poison'], rarity: 'normal', family: 'FAMILY_NIDORAN_F', genderDiff: false, shinyReleased: true, released: true },
      { dex: 81, id: 'MAGNEMITE', name: { en: 'Magnemite', fr: 'Magnéti' }, gen: 1, types: ['electric', 'steel'], rarity: 'normal', family: 'FAMILY_MAGNEMITE', genderDiff: false, shinyReleased: false, released: true },
    ],
    variants,
  };
  return buildIndex(ds);
}

describe('buildQuickEntries', () => {
  it('expands two-gender Pokémon across normal + shiny and carries initial caught status', () => {
    const idx = makeIdx();
    const pikachu = { id: '|', label: null, variants: idx.variantsByDex.get(25)! };
    const entries = buildQuickEntries(idx, pikachu, { version: 'both', gender: 'both', tags: ['lucky'], done: true });
    expect(entries).toEqual([
      { variantKey: '25', gender: 'm', shiny: false, tag: 'lucky', done: true },
      { variantKey: '25', gender: 'm', shiny: true, tag: 'lucky', done: true },
      { variantKey: '25', gender: 'f', shiny: false, tag: 'lucky', done: true },
      { variantKey: '25', gender: 'f', shiny: true, tag: 'lucky', done: true },
    ]);
  });

  it('respects single-gender species and falls back when requested gender is unavailable', () => {
    const idx = makeIdx();
    const nidoranF = { id: '|', label: null, variants: idx.variantsByDex.get(29)! };
    const entries = buildQuickEntries(idx, nidoranF, { version: 'shiny', gender: 'm', tags: [''], done: false });
    expect(entries).toEqual([
      { variantKey: '29', gender: 'f', shiny: true, tag: '', done: false },
    ]);
  });

  it('handles genderless Pokémon without shiny sprites cleanly', () => {
    const idx = makeIdx();
    const magnemite = { id: '|', label: null, variants: idx.variantsByDex.get(81)! };
    const entries = buildQuickEntries(idx, magnemite, { version: 'shiny', gender: 'f', tags: ['shadow'], done: true });
    expect(entries).toEqual([
      { variantKey: '81', gender: '', shiny: false, tag: 'shadow', done: true },
    ]);
  });
});
