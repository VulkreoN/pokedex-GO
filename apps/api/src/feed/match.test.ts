import { describe, expect, it } from 'vitest';
import type { Species } from '@mydexpogo/shared';
import { candidatesFor, extractAssetKeys, extractGmForms, matchSpeciesNames } from './match.js';

const species: Species[] = [
  { dex: 25, id: 'PIKACHU', name: { en: 'Pikachu' }, gen: 1, types: ['electric'], rarity: 'normal', family: 'F', genderDiff: true, shinyReleased: true, released: true },
  { dex: 41, id: 'ZUBAT', name: { en: 'Zubat', fr: 'Nosferapti' }, gen: 1, types: ['poison'], rarity: 'normal', family: 'F', genderDiff: true, shinyReleased: true, released: true },
  { dex: 122, id: 'MR_MIME', name: { en: 'Mr. Mime', fr: 'M. Mime' }, gen: 1, types: ['psychic'], rarity: 'normal', family: 'F', genderDiff: false, shinyReleased: true, released: true },
];
const byId = new Map(species.map((s) => [s.id, s]));
const variants = [
  { key: '25.fHALLOWEEN_2026', dex: 25, form: 'HALLOWEEN_2026', costume: null, gender: 'm' as const, kind: 'costume' as const, label: { en: 'Halloween 2026' }, img: 'x', hasShiny: true, datamined: true, inGameMaster: false },
  { key: '25.fHALLOWEEN_2026.g2', dex: 25, form: 'HALLOWEEN_2026', costume: null, gender: 'f' as const, kind: 'costume' as const, label: { en: 'Halloween 2026' }, img: 'x', hasShiny: true, datamined: true, inGameMaster: false },
  { key: '41.fHALLOWEEN_2026_01', dex: 41, form: 'HALLOWEEN_2026_01', costume: null, gender: null, kind: 'costume' as const, label: { en: 'Halloween 2026' }, img: 'x', hasShiny: true, datamined: true, inGameMaster: false },
];

describe('asset names', () => {
  it('reads PokeMiners picture names, shiny and gender included', () => {
    expect(extractAssetKeys('New assets: pm25.fHALLOWEEN_2026.g2.s.icon.png, pm25.fHALLOWEEN_2026.icon.png and pm1.icon.png').map((c) => c.variantKey)).toEqual(['25.fHALLOWEEN_2026.g2', '25.fHALLOWEEN_2026']);
  });
  it('uppercases legacy costume tokens', () => {
    expect(extractAssetKeys('pm133.cMay_2023.icon.png')[0]!.variantKey).toBe('133.cMAY_2023');
  });
});

describe('game master text', () => {
  it('finds form tokens from templates and form entries', () => {
    const txt = `template_id: "V0025_POKEMON_PIKACHU_HALLOWEEN_2026"\n form_settings { pokemon: PIKACHU forms { form: "ZUBAT_HALLOWEEN_2026_01" is_costume: true } }`;
    expect(extractGmForms(txt, byId).map((f) => `${f.dex}:${f.token}`).sort()).toEqual(['25:HALLOWEEN_2026', '41:HALLOWEEN_2026_01']);
  });
  it('ignores NORMAL and species with underscores in their id', () => {
    expect(extractGmForms('V0122_POKEMON_MR_MIME_NORMAL V0122_POKEMON_MR_MIME', byId)).toEqual([]);
  });
});

describe('news', () => {
  it('matches species names without accents and suggests their unreleased variants', () => {
    const c = candidatesFor('Nosferapti portant un haut-de-forme fait ses débuts', { species, variants }, byId);
    expect(c.map((x) => x.variantKey)).toEqual(['41.fHALLOWEEN_2026_01']);
    expect(c[0]!.reason).toContain('haut-de-forme');
    expect(matchSpeciesNames('Un Mr. Mime chapeauté', species).map((s) => s.dex)).toEqual([122]);
  });
  it('ignores a species named far from any costume word', () => {
    const far = 'Bonus : Poussières ×2 avec Pikachu. ' + 'x'.repeat(200) + ' Un chapeau est en vente dans la boutique.';
    expect(candidatesFor(far, { species, variants }, byId)).toEqual([]);
  });
  it('prefers explicit asset or template mentions', () => {
    const c = candidatesFor('pm41.fHALLOWEEN_2026_01.icon.png added. Pikachu too.', { species, variants }, byId);
    expect(c.map((x) => x.variantKey)).toEqual(['41.fHALLOWEEN_2026_01']);
  });
});
