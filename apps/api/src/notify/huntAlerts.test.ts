import { describe, expect, it } from 'vitest';
import { keyOfPicture, matchHunt, type Found, type MissingEntry } from './huntAlerts.js';

const known = (k: string) => ['546.cSPRING_2024', '74.fALOLA', '37.fALOLA', '196.fGOFEST_2024_SSCARF'].includes(k);

describe('event and quest alerts', () => {
  it("reads Leek Duck's pictures as our forms", () => {
    expect(keyOfPicture('https://cdn/pokemon_icons_crop/pm546.cSPRING_2024.icon.png', 'Cottonee wearing a flower crown', known)).toBe('546.cSPRING_2024');
    expect(keyOfPicture('https://cdn/pm196.fGOFEST_2024_SSCARF.icon.png', 'Espeon', known)).toBe('196.fGOFEST_2024_SSCARF');
    expect(keyOfPicture('https://cdn/pm74.fALOLA.icon.png', 'Alolan Geodude', known)).toBe('74.fALOLA');
    expect(keyOfPicture('https://cdn/pokemon_icon_037_61.png', 'Alolan Vulpix', known)).toBe('37.fALOLA');
    expect(keyOfPicture('https://cdn/pokemon_icon_035_00.png', 'Clefairy', known)).toBe('35');
    expect(keyOfPicture('https://cdn/pm94.fMEGA.icon.png', 'Mega Gengar', known)).toBe('94');
    expect(keyOfPicture('https://cdn/pm999.fUNKNOWN.icon.png', 'X', known)).toBe('999');
    expect(keyOfPicture('https://cdn/item.png', 'Poké Ball', known)).toBeNull();
  });

  it('matches plain missing entries, shiny ones only when it can be shiny, once per Pokémon and kind', () => {
    const found: Found[] = [{ key: '35', canBeShiny: false, where: 'Twilight Wishes' }, { key: '546.cSPRING_2024', canBeShiny: true, where: 'Catch 10 Pokémon' }];
    const missing: MissingEntry[] = [
      { userId: 'a', listId: 'l1', variantKey: '35', shiny: false, tag: '' },
      { userId: 'a', listId: 'l2', variantKey: '35', shiny: true, tag: '' }, // no shiny in this event
      { userId: 'a', listId: 'l1', variantKey: '546.cSPRING_2024', shiny: true, tag: '' },
      { userId: 'b', listId: 'l3', variantKey: '35', shiny: false, tag: 'lucky' }, // a lucky one is not found in the wild
      { userId: 'c', listId: 'l4', variantKey: '35', shiny: false, tag: '' },
    ];
    const out = matchHunt(found, missing, new Set(['c|spawn|35']), 'spawn');
    expect([...out.keys()]).toEqual(['a']);
    expect(out.get('a')!.map((h) => [h.mon.key, h.listIds])).toEqual([['35', ['l1']], ['546.cSPRING_2024', ['l1']]]);
  });
});
