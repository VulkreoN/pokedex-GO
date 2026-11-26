import { describe, expect, it } from 'vitest';
import type { Dataset } from '@mydexpogo/shared';
import { buildIndex } from './dataset.js';
import { buildTemplateEntries } from './listTemplates.js';

const ds: Dataset = {
  schema: 1,
  version: 'test',
  generatedAt: '2026-01-01T00:00:00Z',
  assetBase: '',
  sources: {},
  species: [
    { dex: 25, id: 'PIKACHU', name: { en: 'Pikachu' }, gen: 1, types: ['electric'], rarity: 'normal', family: 'FAMILY_PIKACHU', genderDiff: true, shinyReleased: true, released: true },
    { dex: 26, id: 'RAICHU', name: { en: 'Raichu' }, gen: 1, types: ['electric'], rarity: 'normal', family: 'FAMILY_PIKACHU', genderDiff: false, shinyReleased: true, released: true },
    { dex: 152, id: 'CHIKORITA', name: { en: 'Chikorita' }, gen: 2, types: ['grass'], rarity: 'normal', family: 'FAMILY_CHIKORITA', genderDiff: false, shinyReleased: false, released: true },
    { dex: 999, id: 'FUTURE', name: { en: 'Future' }, gen: 9, types: ['ghost'], rarity: 'normal', family: 'FAMILY_FUTURE', genderDiff: false, shinyReleased: false, released: false },
  ],
  variants: [
    { key: '25', dex: 25, form: null, costume: null, gender: 'm', kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '25.g2', dex: 25, form: null, costume: null, gender: 'f', kind: 'base', label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '25.cHAT', dex: 25, form: null, costume: 'HAT', gender: null, kind: 'costume', label: { en: 'Hat' }, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '25.cDATA', dex: 25, form: null, costume: 'DATA', gender: null, kind: 'costume', label: { en: 'Datamined' }, img: null, hasShiny: true, datamined: true, inGameMaster: false },
    { key: '26.fALOLA', dex: 26, form: 'ALOLA', costume: null, gender: null, kind: 'regional', label: { en: 'Alolan' }, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '26.fMEGA', dex: 26, form: 'MEGA', costume: null, gender: null, kind: 'mega', label: { en: 'Mega' }, img: null, hasShiny: true, datamined: false, inGameMaster: true },
    { key: '152', dex: 152, form: null, costume: null, gender: null, kind: 'base', label: null, img: null, hasShiny: true, shinyReleased: false, datamined: false, inGameMaster: true },
    { key: '999', dex: 999, form: null, costume: null, gender: null, kind: 'base', label: null, img: null, hasShiny: false, datamined: true, inGameMaster: false },
  ],
};

describe('buildTemplateEntries', () => {
  const idx = buildIndex(ds);

  it('deduplicates male/female art and skips unreleased or datamined variants', () => {
    expect(buildTemplateEntries(idx, 'empty')).toEqual([]);
    expect(buildTemplateEntries(idx, 'living_released').map((e) => e.variantKey)).toEqual(['25', '152']);
    expect(buildTemplateEntries(idx, 'shiny_released')).toEqual([{ variantKey: '25', shiny: true, tag: '', done: false }]);
    expect(buildTemplateEntries(idx, 'lucky_released')).toEqual([
      { variantKey: '25', shiny: false, tag: 'lucky', done: false },
      { variantKey: '152', shiny: false, tag: 'lucky', done: false },
    ]);
    expect(buildTemplateEntries(idx, 'costumes').map((e) => e.variantKey)).toEqual(['25.cHAT']);
    expect(buildTemplateEntries(idx, 'regional').map((e) => e.variantKey)).toEqual(['26.fALOLA']);
    expect(buildTemplateEntries(idx, 'mega_gmax').map((e) => e.variantKey)).toEqual(['26.fMEGA']);
    expect(buildTemplateEntries(idx, 'gen1').map((e) => e.variantKey)).toEqual(['25']);
    expect(buildTemplateEntries(idx, 'gen2').map((e) => e.variantKey)).toEqual(['152']);
  });
});
