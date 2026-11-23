import { describe, expect, it } from 'vitest';
import { importFromSearch, parseGameSearch } from './searchImport.js';
import type { Species, Variant } from './types.js';

const sp = (dex: number, en: string, fr: string, family: string): Species => ({ dex, id: en.toUpperCase(), name: { en, fr }, gen: 1, types: ['normal'], rarity: 'standard', family, genderDiff: false, shinyReleased: true, released: true }) as unknown as Species;
const v = (key: string, dex: number, kind: Variant['kind'], extra: Partial<Variant> = {}): Variant =>
  ({ key, dex, form: null, costume: null, gender: null, kind, label: null, img: null, hasShiny: true, datamined: false, inGameMaster: true, genders: ['m', 'f'], ...extra }) as Variant;

const species = [sp(1, 'Bulbasaur', 'Bulbizarre', 'F1'), sp(2, 'Ivysaur', 'Herbizarre', 'F1'), sp(25, 'Pikachu', 'Pikachu', 'F25'), sp(81, 'Magnemite', 'Magnéti', 'F81')];
const variants = [
  v('1', 1, 'base'),
  v('2', 2, 'base'),
  v('25', 25, 'base'),
  v('25.cHAT', 25, 'costume', { costume: 'HAT' }),
  v('81', 81, 'base', { genders: [] }),
];
const run = (s: string) => importFromSearch(parseGameSearch(s, species), variants);
const keys = (s: string) => run(s).map((e) => `${e.variantKey}${e.gender}${e.shiny ? '*' : ''}${e.tag ? `:${e.tag}` : ''}`);

describe('importing a game search', () => {
  it('reads numbers, ranges, names and families, with both genders', () => {
    expect(keys('1,25')).toEqual(['1m', '1f', '25m', '25f', '25.cHATm', '25.cHATf']);
    expect(keys('1-2')).toEqual(['1m', '1f', '2m', '2f']);
    expect(keys('bulbizarre')).toEqual(['1m', '1f']);
    expect(keys('+Bulbasaur')).toEqual(['1m', '1f', '2m', '2f']);
    expect(keys('magneti')).toEqual(['81']);
  });
  it('applies keywords and negations, in either language', () => {
    expect(keys('25&!costume&mâle')).toEqual(['25m']);
    expect(keys('1&shiny')).toEqual(['1m*', '1f*']);
    expect(keys('1&chanceux&female')).toEqual(['1f:lucky']);
    expect(keys('!1,2&1-25&!costume')).toEqual(['25m', '25f']);
  });
  it('unions lines, and sets aside what a collection cannot answer', () => {
    expect(keys('1\n2&female')).toEqual(['1m', '1f', '2f']);
    const p = parseGameSearch('1,2&cp100-500&fire', species);
    expect(p.ignored).toEqual(['cp100-500', 'fire']);
    expect(importFromSearch(p, variants)).toHaveLength(4);
  });
  it('reads back the strings this app writes', () => {
    expect(keys('!shiny&!costume&1,25&!female')).toEqual(['1m', '25m']);
  });
});
