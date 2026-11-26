import { describe, expect, it } from 'vitest';
import type { Dataset, ListEntry, Species, Variant } from '@mydexpogo/shared';
import { buildIndex } from './dataset.js';
import { exportSearch, formBlind, listSearch } from './searchString.js';

const sp = (dex: number, en: string, fr = en): Species => ({
  dex,
  id: en.toUpperCase(),
  name: { en, fr },
  gen: 1,
  types: ['normal'],
  rarity: 'normal',
  family: `FAMILY_${dex}`,
  genderDiff: false,
  shinyReleased: true,
  released: true,
});

const variant = (v: Partial<Variant> & Pick<Variant, 'key' | 'dex' | 'kind'>): Variant => ({
  form: null,
  costume: null,
  gender: null,
  label: null,
  img: null,
  hasShiny: true,
  datamined: false,
  inGameMaster: true,
  genders: ['m', 'f'],
  ...v,
});

const entry = (variantKey: string, extra: Partial<ListEntry> = {}): ListEntry => ({
  variantKey,
  gender: 'm',
  shiny: false,
  tag: '',
  done: false,
  note: null,
  ...extra,
});

const ds: Dataset = {
  schema: 1,
  version: 'test',
  generatedAt: '2026-01-01T00:00:00Z',
  assetBase: '',
  sources: {},
  species: [
    sp(1, 'Bulbasaur', 'Bulbizarre'),
    sp(4, 'Charmander', 'Salamèche'),
    sp(6, 'Charizard', 'Dracaufeu'),
    sp(25, 'Pikachu'),
    sp(58, 'Growlithe', 'Caninos'),
    sp(128, 'Tauros'),
    sp(131, 'Lapras', 'Lokhlass'),
    sp(351, 'Castform', 'Morphéo'),
    sp(716, 'Xerneas'),
    sp(774, 'Minior', 'Météno'),
    sp(931, 'Squawkabilly', 'Tapatoès'),
  ],
  variants: [
    variant({ key: '1', dex: 1, kind: 'base' }),
    // Charmander: two costumes, one stored in `form` (costume: null) and one in `costume`
    variant({ key: '4', dex: 4, kind: 'base' }),
    variant({ key: '4.fFALL_2019', dex: 4, kind: 'costume', form: 'FALL_2019', label: { en: 'Witch hat', fr: 'Chapeau de sorcière' } }),
    variant({ key: '4.cPARTY_HAT', dex: 4, kind: 'costume', costume: 'PARTY_HAT', label: { en: 'Party hat', fr: 'Chapeau de fête' } }),
    // Charizard: base + two Megas
    variant({ key: '6', dex: 6, kind: 'base' }),
    variant({ key: '6.fMEGA_X', dex: 6, kind: 'mega', form: 'MEGA_X', label: { en: 'Mega X', fr: 'Méga X' } }),
    variant({ key: '6.fMEGA_Y', dex: 6, kind: 'mega', form: 'MEGA_Y', label: { en: 'Mega Y', fr: 'Méga Y' } }),
    // Pikachu: base + 2 costumes (plus .g2 female sprite duplicate)
    variant({ key: '25', dex: 25, kind: 'base' }),
    variant({ key: '25.cHAT_A', dex: 25, kind: 'costume', costume: 'HAT_A', label: { en: 'Hat A' } }),
    variant({ key: '25.cHAT_A.g2', dex: 25, kind: 'costume', costume: 'HAT_A', gender: 'f', label: { en: 'Hat A' } }),
    variant({ key: '25.cHAT_B', dex: 25, kind: 'costume', costume: 'HAT_B', label: { en: 'Hat B' } }),
    // Growlithe: base + single regional form
    variant({ key: '58', dex: 58, kind: 'base' }),
    variant({ key: '58.fHISUIAN', dex: 58, kind: 'regional', form: 'HISUIAN', label: { en: 'Hisuian', fr: 'de Hisui' } }),
    // Tauros: base + 3 Paldean breeds (same region!)
    variant({ key: '128', dex: 128, kind: 'base', genders: ['m'] }),
    variant({ key: '128.fPALDEA_AQUA', dex: 128, kind: 'regional', form: 'PALDEA_AQUA', genders: ['m'], label: { en: 'Aqua Breed', fr: 'Race Aquatique' } }),
    variant({ key: '128.fPALDEA_BLAZE', dex: 128, kind: 'regional', form: 'PALDEA_BLAZE', genders: ['m'], label: { en: 'Blaze Breed', fr: 'Race Flamboyante' } }),
    variant({ key: '128.fPALDEA_COMBAT', dex: 128, kind: 'regional', form: 'PALDEA_COMBAT', genders: ['m'], label: { en: 'Combat Breed', fr: 'Race Combative' } }),
    // Lapras: base + only 1 costume (plus its .g2 sprite) -> `&costume` uniquely identifies it
    variant({ key: '131', dex: 131, kind: 'base' }),
    variant({ key: '131.cSCARF', dex: 131, kind: 'costume', costume: 'SCARF', label: { en: 'Scarf', fr: 'Écharpe' } }),
    variant({ key: '131.cSCARF.g2', dex: 131, kind: 'costume', costume: 'SCARF', gender: 'f', label: { en: 'Scarf', fr: 'Écharpe' } }),
    // Castform: base + released weather forms
    variant({ key: '351', dex: 351, kind: 'base' }),
    variant({ key: '351.fRAINY', dex: 351, kind: 'form', form: 'RAINY', label: { en: 'Rainy', fr: 'Pluie' } }),
    // Xerneas: base + datamined-only neutral form
    variant({ key: '716', dex: 716, kind: 'base', genders: [] }),
    variant({ key: '716.fNEUTRAL', dex: 716, kind: 'form', form: 'NEUTRAL', datamined: true, inGameMaster: false, genders: [] }),
    // Minior: colours
    variant({ key: '774.fRED', dex: 774, kind: 'form', form: 'RED', genders: [], label: { en: 'Red Core', fr: 'Rouge' } }),
    variant({ key: '774.fBLUE', dex: 774, kind: 'form', form: 'BLUE', genders: [], label: { en: 'Blue Core', fr: 'Bleu' } }),
    // Squawkabilly: plumages
    variant({ key: '931.fBLUE', dex: 931, kind: 'form', form: 'BLUE', label: { en: 'Blue Plumage', fr: 'Plumage Bleu' } }),
    variant({ key: '931.fGREEN', dex: 931, kind: 'form', form: 'GREEN', label: { en: 'Green Plumage', fr: 'Plumage Vert' } }),
  ],
};

const idx = buildIndex(ds);

describe('formBlind and listSearch warnings', () => {
  it('flags multi-form colours like Squawkabilly and Minior, deduped across genders and shinies', () => {
    const blind = formBlind(idx, [
      entry('931.fBLUE', { gender: 'm' }),
      entry('931.fBLUE', { gender: 'f', shiny: true }),
      entry('774.fRED', { gender: '' }),
      entry('1'),
    ]);
    expect(blind.map((v) => v.key)).toEqual(['774.fRED', '931.fBLUE']);
  });

  it('flags base forms only when the species has released alternate forms', () => {
    const blind = formBlind(idx, [entry('351'), entry('716', { gender: '' }), entry('6'), entry('1')]);
    expect(blind.map((v) => v.key)).toEqual(['351']);
    expect(formBlind(idx, [entry('716.fNEUTRAL', { gender: '' })]).map((v) => v.key)).toEqual(['716.fNEUTRAL']);
  });

  it('flags multi-breed regionals (Paldean Tauros) but not single-form regionals (Hisuian Growlithe)', () => {
    const blind = formBlind(idx, [entry('58.fHISUIAN'), entry('128.fPALDEA_AQUA'), entry('128')]);
    expect(blind.map((v) => v.key)).toEqual(['128.fPALDEA_AQUA']);
  });

  it('flags costumes only when the species has more than one distinct costume (form-keyed or costume-keyed)', () => {
    const blind = formBlind(idx, [entry('4.fFALL_2019'), entry('25.cHAT_A'), entry('131.cSCARF')]);
    expect(blind.map((v) => v.key)).toEqual(['4.fFALL_2019', '25.cHAT_A']);
  });

  it('flags Mega forms since the search string has no mega filter', () => {
    expect(formBlind(idx, [entry('6.fMEGA_X')]).map((v) => v.key)).toEqual(['6.fMEGA_X']);
  });

  it('only flags entries actually kept in the generated search string', () => {
    const entries = [
      entry('931.fBLUE', { shiny: true }),
      entry('25.cHAT_A'),
      entry('774.fRED', { gender: '', done: true }),
      entry('1'),
    ];
    const baseOpts = { onlyMissing: true, gameLang: 'fr' as const, exclude: ['traded', 'lucky'] };

    // Both shiny Squawkabilly and costumed Pikachu are in the search; caught Minior is not.
    expect(listSearch(idx, entries, baseOpts).blind.map((v) => v.key)).toEqual(['25.cHAT_A', '931.fBLUE']);

    // Excluding costumes removes Pikachu from both the string and the warning.
    expect(listSearch(idx, entries, { ...baseOpts, exclude: ['traded', 'lucky', 'costume'] }).blind.map((v) => v.key)).toEqual(['931.fBLUE']);

    // Excluding shinies too leaves only plain Bulbasaur -> no warning.
    expect(listSearch(idx, entries, { ...baseOpts, exclude: ['traded', 'lucky', 'costume', 'shiny'] }).blind).toEqual([]);

    // Showing all (not only missing) brings caught Minior back into the warning.
    expect(listSearch(idx, entries, { ...baseOpts, onlyMissing: false }).blind.map((v) => v.key)).toEqual(['25.cHAT_A', '774.fRED', '931.fBLUE']);
  });

  it('exportSearch keeps blind list in sync when falling back on a costume-only or shiny-only collection', () => {
    const res = exportSearch(idx, [entry('931.fBLUE', { shiny: true })], {
      onlyMissing: true,
      gameLang: 'fr',
      exclude: ['traded', 'lucky', 'shiny'],
      preEvolutions: false,
      maxLength: 0,
    });
    expect(res.text).toContain('931');
    expect(res.blind.map((v) => v.key)).toEqual(['931.fBLUE']);
  });
});
