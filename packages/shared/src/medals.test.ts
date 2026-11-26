import { describe, expect, it } from 'vitest';
import { computeCollectionStats, computeMedals, tierFor } from './medals.js';
import type { Dataset, Species, Variant } from './types.js';

const sp = (dex: number, gen: number, released = true): Species => ({
  dex,
  id: `P${dex}`,
  name: { en: `P${dex}` },
  gen,
  types: ['normal'],
  rarity: 'normal',
  family: `F${dex}`,
  genderDiff: false,
  shinyReleased: true,
  released,
});
const vr = (key: string, dex: number, kind: Variant['kind']): Variant => ({
  key,
  dex,
  form: null,
  costume: null,
  gender: null,
  label: null,
  img: null,
  hasShiny: true,
  datamined: false,
  inGameMaster: true,
  kind,
});

const ds: Pick<Dataset, 'species' | 'variants'> = {
  species: [
    sp(1, 1), sp(4, 1), sp(6, 1), sp(25, 1),
    sp(152, 2), sp(155, 2),
  ],
  variants: [
    vr('1', 1, 'base'),
    vr('4', 4, 'base'),
    vr('6.fMEGA_X', 6, 'mega'),
    vr('25.cHAT', 25, 'costume'),
    vr('52.fGALARIAN', 52, 'regional'),
    vr('152', 152, 'base'),
    vr('155', 155, 'base'),
  ],
};

describe('medals & collection stats', () => {
  it('computes Bronze / Silver / Gold / Platinum tiers accurately', () => {
    expect(tierFor(0, [5, 25, 100, 300])).toEqual({ tier: 0, next: 5, progress: 0 });
    expect(tierFor(5, [5, 25, 100, 300])).toEqual({ tier: 1, next: 25, progress: 0 });
    expect(tierFor(15, [5, 25, 100, 300])).toEqual({ tier: 1, next: 25, progress: 0.5 });
    expect(tierFor(300, [5, 25, 100, 300])).toEqual({ tier: 4, next: null, progress: 1 });
  });

  it('deduplicates caught entries across lists and computes regional & core medals', () => {
    const entries = [
      { variantKey: '1', shiny: false, tag: '' as const, done: true },
      { variantKey: '1', shiny: false, tag: '' as const, done: true }, // duplicate in another list
      { variantKey: '4', shiny: true, tag: '' as const, done: true },
      { variantKey: '6.fMEGA_X', shiny: false, tag: '' as const, done: true },
      { variantKey: '25.cHAT', shiny: true, tag: '' as const, done: true },
      { variantKey: '152', shiny: false, tag: 'shadow' as const, done: true },
      { variantKey: '155', shiny: false, tag: '' as const, done: false },
    ];
    const { core, regions } = computeMedals(ds, { entries, completedLists: 3, friendsCount: 5, pvpCount: 10 });
    expect(core.find((m) => m.id === 'collector')?.value).toBe(5); // deduped!
    expect(core.find((m) => m.id === 'shiny')?.value).toBe(2);
    expect(core.find((m) => m.id === 'costume')?.value).toBe(1);
    expect(core.find((m) => m.id === 'mega_max')?.value).toBe(1);
    expect(core.find((m) => m.id === 'shadow')?.value).toBe(1);
    expect(core.find((m) => m.id === 'completed_lists')?.tier).toBe(2); // silver (3)
    expect(core.find((m) => m.id === 'friends')?.tier).toBe(2); // silver (5)
    expect(core.find((m) => m.id === 'pvp')?.tier).toBe(2); // silver (10)
    // Gen 1: 4 species released -> all 4 caught -> Platinum!
    expect(regions.find((m) => m.id === 'gen_1')?.tier).toBe(4);
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
