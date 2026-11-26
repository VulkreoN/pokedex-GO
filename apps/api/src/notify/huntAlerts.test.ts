import { describe, expect, it } from 'vitest';
import { buildHuntIndex, type Dataset, type Species, type Variant } from '@mydexpogo/shared';
import { keyOfPicture, matchHunt, type Found, type MissingEntry } from './huntAlerts.js';

const sp = (dex: number, en: string, parent?: number): Species => ({
  dex,
  id: en.toUpperCase(),
  name: { en },
  gen: 1,
  types: ['normal'],
  rarity: 'normal',
  family: `F_${dex}`,
  ...(parent ? { parent } : {}),
  genderDiff: false,
  shinyReleased: true,
  released: true,
});
const vr = (v: Partial<Variant> & Pick<Variant, 'key' | 'dex' | 'kind'>): Variant => ({
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
const ds: Dataset = {
  schema: 1,
  version: 'test',
  generatedAt: '2026-01-01T00:00:00Z',
  assetBase: '',
  sources: {},
  species: [
    sp(4, 'Charmander'),
    sp(5, 'Charmeleon', 4),
    sp(6, 'Charizard', 5),
    sp(25, 'Pikachu'),
    sp(26, 'Raichu', 25),
    sp(35, 'Clefairy'),
    sp(143, 'Snorlax'),
    sp(546, 'Cottonee'),
  ],
  variants: [
    vr({ key: '4', dex: 4, kind: 'base' }),
    vr({ key: '5', dex: 5, kind: 'base' }),
    vr({ key: '6', dex: 6, kind: 'base' }),
    vr({ key: '25', dex: 25, kind: 'base' }),
    vr({ key: '25.cPARTY_HAT', dex: 25, kind: 'costume', costume: 'PARTY_HAT' }),
    vr({ key: '26', dex: 26, kind: 'base' }),
    vr({ key: '26.cPARTY_HAT', dex: 26, kind: 'costume', costume: 'PARTY_HAT' }),
    vr({ key: '35', dex: 35, kind: 'base' }),
    vr({ key: '143', dex: 143, kind: 'base' }),
    vr({ key: '143.fGIGANTAMAX', dex: 143, kind: 'gmax', form: 'GIGANTAMAX' }),
    vr({ key: '546.cSPRING_2024', dex: 546, kind: 'costume', costume: 'SPRING_2024' }),
  ],
};
const huntIndex = buildHuntIndex(ds);

const known = (k: string) => ['546.cSPRING_2024', '74.fALOLA', '37.fALOLA', '196.fGOFEST_2024_SSCARF'].includes(k);

describe('event and quest alerts', () => {
  it("reads Leek Duck's pictures strictly without degrading unknown costumes/forms to plain species", () => {
    expect(keyOfPicture('https://cdn/pokemon_icons_crop/pm546.cSPRING_2024.icon.png', 'Cottonee wearing a flower crown', known)).toBe('546.cSPRING_2024');
    expect(keyOfPicture('https://cdn/pm196.fGOFEST_2024_SSCARF.icon.png', 'Espeon', known)).toBe('196.fGOFEST_2024_SSCARF');
    expect(keyOfPicture('https://cdn/pm74.fALOLA.icon.png', 'Alolan Geodude', known)).toBe('74.fALOLA');
    expect(keyOfPicture('https://cdn/pokemon_icon_037_61.png', 'Alolan Vulpix', known)).toBe('37.fALOLA');
    expect(keyOfPicture('https://cdn/pokemon_icon_035_00.png', 'Clefairy', known)).toBe('35');
    expect(keyOfPicture('https://cdn/pm94.fMEGA.icon.png', 'Mega Gengar', known)).toBe('94.fMEGA');
    expect(keyOfPicture('https://cdn/pm999.fUNKNOWN.icon.png', 'X', known)).toBe('999.fUNKNOWN');
    expect(keyOfPicture('https://cdn/item.png', 'Poké Ball', known)).toBeNull();
  });

  it('matches plain missing entries, shiny ones only when it can be shiny, once per Pokémon and kind', () => {
    const found: Found[] = [
      { key: '35', source: 'wild', canBeShiny: false, where: 'Twilight Wishes' },
      { key: '546.cSPRING_2024', source: 'research', canBeShiny: true, where: 'Catch 10 Pokémon' },
    ];
    const missing: MissingEntry[] = [
      { userId: 'a', listId: 'l1', variantKey: '35', shiny: false, tag: '' },
      { userId: 'a', listId: 'l2', variantKey: '35', shiny: true, tag: '' },
      { userId: 'a', listId: 'l1', variantKey: '546.cSPRING_2024', shiny: true, tag: '' },
      { userId: 'b', listId: 'l3', variantKey: '35', shiny: false, tag: 'lucky' },
      { userId: 'c', listId: 'l4', variantKey: '35', shiny: false, tag: '' },
    ];
    const out = matchHunt(found, missing, new Set(['c|spawn|35']), 'spawn', huntIndex);
    expect([...out.keys()]).toEqual(['a']);
    expect(out.get('a')!.map((h) => [h.mon.key, h.listIds])).toEqual([['35', ['l1']], ['546.cSPRING_2024', ['l1']]]);
  });

  it('respects per-list pre-evolution toggle, keeps Rocket Shadow apart, and blocks Gigantamax / wrong costumes', () => {
    const found: Found[] = [
      { key: '143', source: 'wild', canBeShiny: true, where: 'Tropical Paradise' },
      { key: '4', source: 'wild', canBeShiny: true, where: 'Fire Event' },
      { key: '25', source: 'wild', canBeShiny: true, where: 'Electric Event' },
      { key: '25.cPARTY_HAT', source: 'wild', canBeShiny: true, where: 'Party Event' },
      { key: '4', source: 'rocket', canBeShiny: false, where: 'Rocket Takeover' },
    ];
    const missing: MissingEntry[] = [
      { userId: 'gmax', listId: 'l1', variantKey: '143.fGIGANTAMAX', shiny: false, tag: '', alertPreEvolutions: true },
      { userId: 'charOptIn', listId: 'l2', variantKey: '6', shiny: false, tag: '', alertPreEvolutions: true },
      { userId: 'charOptOut', listId: 'l3', variantKey: '6', shiny: false, tag: '', alertPreEvolutions: false },
      { userId: 'costRaichu', listId: 'l4', variantKey: '26.cPARTY_HAT', shiny: false, tag: '', alertPreEvolutions: true },
      { userId: 'shadowChar', listId: 'l5', variantKey: '6', shiny: false, tag: 'shadow', alertPreEvolutions: true },
    ];
    const out = matchHunt(found, missing, new Set(), 'remind', huntIndex);
    expect(out.has('gmax')).toBe(false);
    expect(out.get('charOptIn')?.map((h) => h.mon.key)).toEqual(['4']);
    expect(out.has('charOptOut')).toBe(false);
    expect(out.get('costRaichu')?.map((h) => h.mon.key)).toEqual(['25.cPARTY_HAT']);
    expect(out.get('shadowChar')?.map((h) => [h.mon.key, h.mon.source])).toEqual([['4', 'rocket']]);
  });
});
