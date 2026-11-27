import { describe, expect, it } from 'vitest';
import type { Dataset } from '@mydexpogo/shared';
import { applyManualOverrides } from './build.js';
import overrides from './overrides.json' with { type: 'json' };

function sampleDataset(): Dataset {
  return {
    schema: 1,
    version: '31',
    generatedAt: '2026-11-27T00:00:00.000Z',
    assetBase: 'https://example.com/',
    sources: {},
    species: [
      { dex: 52, id: 'MEOWTH', gen: 1, name: { en: 'Meowth', fr: 'Miaouss' }, types: ['normal'], rarity: 'normal', family: 'FAMILY_MEOWTH', genderDiff: false, released: true, shinyReleased: true },
    ],
    variants: [
      { key: '52', dex: 52, form: null, costume: null, gender: null, kind: 'base', label: null, img: 'pm52.icon.png', hasShiny: true, datamined: false, inGameMaster: true },
      { key: '52.fCUSTOM', dex: 52, form: 'CUSTOM', costume: null, gender: null, kind: 'mega', label: { en: 'Mega', fr: 'Méga' }, img: 'pm52.fCUSTOM.icon.png', hasShiny: true, datamined: false, inGameMaster: true },
      { key: '52.fCUSTOM.g2', dex: 52, form: 'CUSTOM', costume: null, gender: 'f', kind: 'mega', label: { en: 'Mega', fr: 'Méga' }, img: 'pm52.fCUSTOM.g2.icon.png', hasShiny: true, datamined: false, inGameMaster: true },
    ],
  };
}

describe('applyManualOverrides', () => {
  it('supports French-only display names and applies neutral-key overrides to gendered siblings', () => {
    const out = applyManualOverrides(sampleDataset(), {
      '52.fCUSTOM': { released: null, label: { en: '', fr: 'Costume spécial' } },
    });
    const neutral = out.variants.find((v) => v.key === '52.fCUSTOM');
    const female = out.variants.find((v) => v.key === '52.fCUSTOM.g2');
    expect(neutral?.label).toEqual({ en: 'Mega', fr: 'Costume spécial' });
    expect(female?.label).toEqual({ en: 'Mega', fr: 'Costume spécial' });
  });

  it('reclassifies a misdetected Mega form to regional and re-sorts variants by kind', () => {
    const out = applyManualOverrides(sampleDataset(), {
      '52.fCUSTOM': { released: null, kind: 'regional', label: { en: 'Galarian', fr: 'de Galar' } },
    });
    const v = out.variants.find((x) => x.key === '52.fCUSTOM');
    expect(v?.kind).toBe('regional');
    expect(v?.label).toEqual({ en: 'Galarian', fr: 'de Galar' });
    expect(out.variants.map((x) => x.kind)).toEqual(['base', 'regional', 'regional']);
  });

  it('keeps species shinyReleased in sync and hides gendered siblings together', () => {
    const ds = sampleDataset();
    const outNoShiny = applyManualOverrides(ds, {
      '52': { released: null, shinyReleased: false },
      '52.fCUSTOM': { released: null, shinyReleased: false },
    });
    expect(outNoShiny.species[0]?.shinyReleased).toBe(false);

    const outHidden = applyManualOverrides(ds, {
      '52.fCUSTOM': { released: null, hidden: true },
    });
    expect(outHidden.variants.map((v) => v.key)).toEqual(['52']);
  });
});

describe('overrides.json data integrity', () => {
  it('defines all three Mega Tatsugiri forms and keeps the legacy alias', () => {
    expect(overrides.upcoming.megas).toEqual(
      expect.arrayContaining(['978.fMEGA_CURLY', '978.fMEGA_DROOPY', '978.fMEGA_STRETCHY']),
    );
    expect(overrides.upcoming.megas).not.toContain('978.fMEGA');
    expect((overrides.aliases as Record<string, string>)['978.fMEGA']).toBe('978.fMEGA_CURLY');
    expect((overrides.labels as Record<string, { en: string; fr?: string }>)['978.fMEGA_CURLY']?.fr).toContain('Courbée');
    expect((overrides.labels as Record<string, { en: string; fr?: string }>)['978.fMEGA_DROOPY']?.fr).toContain('Affalée');
    expect((overrides.labels as Record<string, { en: string; fr?: string }>)['978.fMEGA_STRETCHY']?.fr).toContain('Raide');
  });

  it('provides French names for every late Gen 9 species (#1009-#1025)', () => {
    const names = overrides.speciesNames as Record<string, { en?: string; fr?: string }>;
    for (let dex = 1009; dex <= 1025; dex++) {
      expect(names[String(dex)]?.fr, `Missing FR name for #${dex}`).toBeTruthy();
    }
    expect(names['1009']?.fr).toBe('Serpente-Eau');
    expect(names['1025']?.fr).toBe('Pêchaminus');
  });
});
