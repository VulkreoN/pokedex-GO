import { describe, expect, it } from 'vitest';
import { computeCollectionStats, computeMedals, scaledThresholds, tierFor } from './medals.js';
import type { Dataset, Rarity, Species, Variant } from './types.js';

const sp = (dex: number, gen: number, opts?: { released?: boolean; rarity?: Rarity; shinyReleased?: boolean }): Species => ({
  dex,
  id: `P${dex}`,
  name: { en: `P${dex}` },
  gen,
  types: ['normal'],
  rarity: opts?.rarity ?? 'normal',
  family: `F${dex}`,
  genderDiff: false,
  shinyReleased: opts?.shinyReleased ?? true,
  released: opts?.released ?? true,
});

const vr = (key: string, dex: number, kind: Variant['kind'], opts?: { form?: string | null; datamined?: boolean; hasShiny?: boolean }): Variant => ({
  key,
  dex,
  form: opts?.form ?? null,
  costume: kind === 'costume' ? 'HAT' : null,
  gender: null,
  label: null,
  img: null,
  hasShiny: opts?.hasShiny ?? true,
  datamined: opts?.datamined ?? false,
  inGameMaster: true,
  kind,
});

const ds: Pick<Dataset, 'species' | 'variants'> = {
  species: [
    sp(1, 1),
    sp(4, 1),
    sp(6, 1),
    sp(25, 1),
    sp(52, 1),
    sp(150, 1, { rarity: 'legendary' }),
    sp(152, 2),
    sp(155, 2),
    sp(201, 2),
    sp(666, 6),
    sp(999, 9, { released: false }),
  ],
  variants: [
    vr('1', 1, 'base'),
    vr('4', 4, 'base'),
    vr('6', 6, 'base'),
    vr('6.fMEGA_X', 6, 'mega', { form: 'MEGA_X' }),
    vr('25', 25, 'base'),
    vr('25.cHAT', 25, 'costume'),
    vr('52', 52, 'base'),
    vr('52.fGALARIAN', 52, 'regional', { form: 'GALARIAN' }),
    vr('150', 150, 'base'),
    vr('152', 152, 'base'),
    vr('155', 155, 'base'),
    vr('201.fA', 201, 'form', { form: 'A' }),
    vr('201.fB', 201, 'form', { form: 'B' }),
    vr('201.fC', 201, 'form', { form: 'C' }),
    vr('666.fMEADOW', 666, 'form', { form: 'MEADOW' }),
    vr('666.fOCEAN', 666, 'form', { form: 'OCEAN' }),
    vr('999', 999, 'base', { datamined: true }),
  ],
};

describe('medals & collection stats', () => {
  it('computes Bronze / Silver / Gold / Platinum tiers and dynamic thresholds accurately', () => {
    expect(tierFor(0, [5, 25, 100, 300])).toEqual({ tier: 0, next: 5, progress: 0 });
    expect(tierFor(5, [5, 25, 100, 300])).toEqual({ tier: 1, next: 25, progress: 0 });
    expect(tierFor(15, [5, 25, 100, 300])).toEqual({ tier: 1, next: 25, progress: 0.5 });
    expect(tierFor(300, [5, 25, 100, 300])).toEqual({ tier: 4, next: null, progress: 1 });

    // Large realistic shiny pool (e.g. 820 species): 300 shinies is only Bronze, Platinum demands 95 % (779)
    const shinyTh = scaledThresholds(820, [0.15, 0.4, 0.75, 0.95]);
    expect(shinyTh).toEqual([123, 328, 615, 779]);
    expect(tierFor(300, shinyTh).tier).toBe(1);
    expect(tierFor(779, shinyTh).tier).toBe(4);
  });

  it('deduplicates entries by Pokédex rules and separates Shadow, Purified, Lucky, Unown, Vivillon and Legendaries', () => {
    const entries = [
      { variantKey: '1', shiny: false, tag: '' as const, done: true },
      { variantKey: '1', shiny: true, tag: '' as const, done: true }, // same species: counts once for National Dex
      { variantKey: '1', shiny: false, tag: 'lucky' as const, done: true },
      { variantKey: '4', shiny: true, tag: 'xxl' as const, done: true },
      { variantKey: '6.fMEGA_X', shiny: false, tag: '' as const, done: true },
      { variantKey: '25.cHAT', shiny: true, tag: 'bg:PARIS_2026' as const, done: true },
      { variantKey: '52.fGALARIAN', shiny: false, tag: '' as const, done: true },
      { variantKey: '150', shiny: true, tag: 'shadow' as const, done: true },
      { variantKey: '152', shiny: false, tag: 'purified' as const, done: true },
      { variantKey: '155', shiny: false, tag: 'dynamax' as const, done: false }, // not caught
      { variantKey: '201.fA', shiny: false, tag: '' as const, done: true },
      { variantKey: '201.fA', shiny: true, tag: '' as const, done: true }, // duplicate Unown letter A
      { variantKey: '201.fB', shiny: false, tag: '' as const, done: true },
      { variantKey: '201.fC', shiny: false, tag: '' as const, done: true },
      { variantKey: '666.fMEADOW', shiny: false, tag: '' as const, done: true },
      { variantKey: '999', shiny: true, tag: '' as const, done: true }, // unreleased species: must not inflate released Dex
    ];
    const { pokedex, challenges, regions } = computeMedals(ds, { entries, completedLists: 3 });

    // National Dex counts 9 unique released species (1, 4, 6, 25, 52, 150, 152, 201, 666) — NOT unreleased 999
    expect(pokedex.find((m) => m.id === 'national_dex')?.value).toBe(9);
    expect(pokedex.find((m) => m.id === 'shiny_dex')?.value).toBe(5); // 1, 4, 25, 150, 201
    expect(pokedex.find((m) => m.id === 'lucky_dex')?.value).toBe(1);
    expect(pokedex.find((m) => m.id === 'shadow_dex')?.value).toBe(1); // separate from purified!
    expect(pokedex.find((m) => m.id === 'purified_dex')?.value).toBe(1);
    expect(pokedex.find((m) => m.id === 'mega_dex')?.value).toBe(1);
    expect(pokedex.find((m) => m.id === 'costume_dex')?.value).toBe(1);

    // Exact PoGO Unown (3 -> Bronze) & Vivillon (1 -> Bronze)
    expect(challenges.find((m) => m.id === 'unown')).toMatchObject({ value: 3, tier: 1, thresholds: [3, 10, 26, 28] });
    expect(challenges.find((m) => m.id === 'vivillon')).toMatchObject({ value: 1, tier: 1, thresholds: [1, 9, 15, 18] });
    expect(challenges.find((m) => m.id === 'regional_dex')?.value).toBe(1);
    expect(challenges.find((m) => m.id === 'legendary')?.value).toBe(1);
    expect(challenges.find((m) => m.id === 'shiny_legendary')?.value).toBe(1);
    expect(challenges.find((m) => m.id === 'shiny_costume')?.value).toBe(1);
    expect(challenges.find((m) => m.id === 'size_dex')?.value).toBe(1);
    expect(challenges.find((m) => m.id === 'completed_lists')?.tier).toBe(2); // silver (3)

    // Gen 1: all 6 released species caught -> Platinum; Gen 9 unreleased 999 does NOT count
    expect(regions.find((m) => m.id === 'gen_1')?.tier).toBe(4);
    expect(regions.find((m) => m.id === 'gen_9')?.value).toBe(0);
  });

  it('prevents Living Dex + partial Shiny Living Dex from auto-platinuming everything', () => {
    const species: Species[] = [];
    const variants: Variant[] = [];
    for (let i = 1; i <= 200; i++) {
      species.push(sp(i, i <= 100 ? 1 : 2, { rarity: i <= 20 ? 'legendary' : 'normal' }));
      variants.push(vr(String(i), i, 'base'));
      if (i <= 50) variants.push(vr(`${i}.cHAT`, i, 'costume'));
      if (i <= 20) variants.push(vr(`${i}.fMEGA`, i, 'mega', { form: 'MEGA' }));
    }
    // Player has 95 % of base species (190/200) and 60 % of shinies (120/200)
    const entries = [
      ...Array.from({ length: 190 }, (_, i) => ({ variantKey: String(i + 1), shiny: false, tag: '' as const, done: true })),
      ...Array.from({ length: 120 }, (_, i) => ({ variantKey: String(i + 1), shiny: true, tag: '' as const, done: true })),
    ];
    const { pokedex } = computeMedals({ species, variants }, { entries, completedLists: 0 });
    expect(pokedex.find((m) => m.id === 'national_dex')?.tier).toBe(3); // Gold, not Platinum (needs 200/200)
    expect(pokedex.find((m) => m.id === 'shiny_dex')?.tier).toBe(2); // Silver, not Platinum (needs 95 % = 190)
    expect(pokedex.find((m) => m.id === 'variants_dex')?.tier).toBe(2); // Silver, not Platinum (needs costumes & megas too)
  });

  it('computes collection stats by gen, kind, shiny, and tag', () => {
    const stats = computeCollectionStats(ds, [
      { variantKey: '1', shiny: false, tag: '', done: true },
      { variantKey: '4', shiny: true, tag: '', done: false },
      { variantKey: '6.fMEGA_X', shiny: false, tag: '', done: true },
      { variantKey: '152', shiny: false, tag: 'shadow', done: true },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.done).toBe(3);
    expect(stats.pct).toBe(75);
    expect(stats.shinyTotal).toBe(1);
    expect(stats.shinyDone).toBe(0);
    expect(stats.byGen).toEqual([{ gen: 1, total: 3, done: 2 }, { gen: 2, total: 1, done: 1 }]);
    expect(stats.byKind.map((x) => x.kind)).toEqual(['base', 'mega']);
    expect(stats.byTag).toEqual([{ tag: 'shadow', total: 1, done: 1 }]);
  });
});
