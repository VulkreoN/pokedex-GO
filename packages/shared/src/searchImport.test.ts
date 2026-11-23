import { describe, expect, it } from 'vitest';
import { importFromSearch, parseGameSearch } from './searchImport.js';
import type { Species, Variant } from './types.js';

const sp = (dex: number, en: string, fr: string, family: string, types = ['normal']): Species => ({ dex, id: en.toUpperCase(), name: { en, fr }, gen: 1, types, rarity: 'standard', family, genderDiff: false, shinyReleased: true, released: true }) as unknown as Species;
const v = (key: string, dex: number, kind: Variant['kind'], extra: Partial<Variant> = {}): Variant =>
  ({ key, dex, form: null, costume: null, gender: null, kind, label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true, genders: ['m', 'f'], ...extra }) as Variant;

const species = [sp(1, 'Bulbasaur', 'Bulbizarre', 'F1'), sp(3, 'Venusaur', 'Florizarre', 'F1'), sp(2, 'Ivysaur', 'Herbizarre', 'F1'), sp(25, 'Pikachu', 'Pikachu', 'F25', ['electric']), sp(81, 'Magnemite', 'Magnéti', 'F81', ['electric', 'steel'])];
const variants = [
  v('1', 1, 'base'),
  v('2', 2, 'base'),
  v('25', 25, 'base'),
  v('25.cHAT', 25, 'costume', { costume: 'HAT' }),
  v('81', 81, 'base', { genders: [] }),
  v('25.fGIGANTAMAX', 25, 'gmax', { form: 'GIGANTAMAX' }),
  v('1.fGIGANTAMAX', 1, 'gmax', { form: 'GIGANTAMAX' }),
  v('3', 3, 'base'),
  v('3.fMEGA', 3, 'mega', { form: 'MEGA' }),
];
const run = (s: string) => importFromSearch(parseGameSearch(s, species), variants);
// Like the import sheet: Gigantamax and Megas only when the search asks for them.
const keys = (s: string) => {
  const wants = parseGameSearch(s, species).wants;
  return run(s).filter((e) => (e.kind !== 'gmax' || wants.has('gigantamax')) && (e.kind !== 'mega' || wants.has('mega'))).map((e) => `${e.variantKey}${e.gender}${e.shiny ? '*' : ''}${e.tag ? `:${e.tag}` : ''}`);
};

describe('importing a game search', () => {
  it('reads numbers, ranges, names and families, with both genders', () => {
    expect(keys('1,25')).toEqual(['1m', '1f', '25m', '25f', '25.cHATm', '25.cHATf']);
    expect(keys('1-2')).toEqual(['1m', '1f', '2m', '2f']);
    expect(keys('bulbizarre')).toEqual(['1m', '1f']);
    expect(keys('+Bulbasaur')).toEqual(['1m', '1f', '2m', '2f', '3m', '3f']);
    expect(keys('magneti')).toEqual(['81']);
  });
  it('applies keywords and negations, in either language', () => {
    expect(keys('25&!costume&mâle')).toEqual(['25m']);
    expect(keys('1&shiny')).toEqual(['1m*', '1f*']);
    expect(keys('1&chanceux&female')).toEqual(['1f:lucky']);
    expect(keys('!1,2&1-25&!costume')).toEqual(['25m', '25f', '3m', '3f']);
  });
  it('unions lines, and sets aside what a collection cannot answer', () => {
    expect(keys('1\n2&female')).toEqual(['1m', '1f', '2f']);
    const p = parseGameSearch('1,2&cp100-500&age0-7', species);
    expect(p.ignored).toEqual(['cp100-500', 'age0-7']);
    expect(importFromSearch(p, variants).filter((e) => e.kind !== 'gmax')).toHaveLength(4);
  });
  it('keeps only Gigantamax when the search asks for them (French "gigamax")', () => {
    expect(keys('gigamax&chromatique&!échangé&1,25,81').sort()).toEqual(['1.fGIGANTAMAXf*', '1.fGIGANTAMAXm*', '25.fGIGANTAMAXf*', '25.fGIGANTAMAXm*']);
    expect(parseGameSearch('gigamax&!échangé&1', species).ignored).toEqual(['échangé']);
  });
  it('keeps only Megas when the search asks for them', () => {
    for (const q of ['méga&1-3', 'mega&1-3', 'megaevolve&1-3']) expect(keys(q).filter((k) => k.includes('MEGA'))).toEqual(['3.fMEGAm', '3.fMEGAf']);
    expect(parseGameSearch('méga&1-3', species).wants.has('mega')).toBe(true);
  });
  it('files shadow, purified, lucky and Dynamax Pokémon under their trait', () => {
    expect(keys('obscur&1')).toEqual(['1m:shadow', '1f:shadow']);
    expect(keys('purified&1&female')).toEqual(['1f:purified']);
    expect(keys('chanceux&chromatique&25&!costume')).toEqual(['25m*:lucky', '25f*:lucky']);
    expect(keys('dynamax&81')).toEqual(['81:dynamax']);
    expect(keys('!obscur&1&mâle')).toEqual(['1m']);
  });
  it('reads types and legendary keywords', () => {
    expect(keys('electrik&!gigamax&!costume')).toEqual(['25m', '25f', '81']);
  });
  it('reads back the strings this app writes', () => {
    expect(keys('!shiny&!costume&1,25&!female')).toEqual(['1m', '25m']);
  });
});
