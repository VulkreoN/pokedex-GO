import { describe, expect, it } from 'vitest';
import { buildHuntIndex, type Dataset, type Species, type Variant } from '@mydexpogo/shared';
import { bossOf, matchAlerts, type MissingEntry } from './raidAlerts.js';

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
  species: [sp(4, 'Charmander'), sp(5, 'Charmeleon', 4), sp(6, 'Charizard', 5), sp(105, 'Marowak'), sp(246, 'Larvitar')],
  variants: [
    vr({ key: '4', dex: 4, kind: 'base' }),
    vr({ key: '5', dex: 5, kind: 'base' }),
    vr({ key: '6', dex: 6, kind: 'base' }),
    vr({ key: '6.fMEGA_X', dex: 6, kind: 'mega', form: 'MEGA_X' }),
    vr({ key: '6.fCOPY_2019', dex: 6, kind: 'costume', form: 'COPY_2019', noMega: true }),
    vr({ key: '6.fGIGANTAMAX', dex: 6, kind: 'gmax', form: 'GIGANTAMAX' }),
    vr({ key: '105.fALOLA', dex: 105, kind: 'regional', form: 'ALOLA' }),
    vr({ key: '246', dex: 246, kind: 'base' }),
  ],
};
const huntIndex = buildHuntIndex(ds);

const img = (f: string) => `https://cdn.leekduck.com/assets/img/pokemon_icons_crop/${f}.icon.png`;
const known = (k: string) => ['105.fALOLA', '641.fINCARNATE', '25.cPARTY_HAT', '6.fCOPY_2019'].includes(k);

describe('bossOf', () => {
  it('reads our variant key strictly: forms, costumes, Megas kept; normal marker stripped; unknown costumes never degraded', () => {
    expect(bossOf({ name: 'Alolan Marowak', image: img('pm105.fALOLA'), canBeShiny: true }, known)).toEqual({ key: '105.fALOLA', shadow: false, canBeShiny: true, source: 'raid' });
    expect(bossOf({ name: 'Mega Banette', image: img('pm354.fMEGA') }, known)).toEqual({ key: '354.fMEGA', shadow: false, canBeShiny: false, source: 'megaRaid' });
    expect(bossOf({ name: 'Shadow Tornadus (Incarnate)', image: img('pm641.fINCARNATE') }, known)).toMatchObject({ key: '641.fINCARNATE', shadow: true, source: 'shadowRaid' });
    expect(bossOf({ name: 'Party Hat Pikachu', image: img('pm25.cPARTY_HAT'), canBeShiny: true }, known)).toEqual({ key: '25.cPARTY_HAT', shadow: false, canBeShiny: true, source: 'raid' });
    expect(bossOf({ name: 'Golurk', image: img('pm623.fNORMAL') }, known)).toMatchObject({ key: '623', source: 'raid' });
    expect(bossOf({ name: 'Clone Charizard', image: img('pm6.fCOPY_2099') }, known)).toMatchObject({ key: '6.fCOPY_2099', source: 'raid' });
    expect(bossOf({ name: '?', image: 'https://example.com/x.png' }, known)).toBeNull();
  });
});

describe('matchAlerts', () => {
  const marowak = { key: '105.fALOLA', shadow: false, canBeShiny: false, source: 'raid' as const };
  const shadowLarvitar = { key: '246', shadow: true, canBeShiny: true, source: 'shadowRaid' as const };
  const megaCharizardX = { key: '6.fMEGA_X', shadow: false, canBeShiny: true, source: 'megaRaid' as const };
  const cloneCharizard = { key: '6.fCOPY_2019', shadow: false, canBeShiny: false, source: 'raid' as const };
  const charmander = { key: '4', shadow: false, canBeShiny: true, source: 'raid' as const };
  const e = (userId: string, variantKey: string, extra: Partial<MissingEntry> = {}): MissingEntry => ({
    userId,
    listId: 'L1',
    variantKey,
    shiny: false,
    tag: '',
    alertPreEvolutions: false,
    ...extra,
  });

  it('matches plain entries to normal raids, Shadow entries to Shadow raids, shinies only when the boss can be shiny', () => {
    const got = matchAlerts(
      [marowak, shadowLarvitar],
      [e('ash', '105.fALOLA'), e('ash', '105.fALOLA', { listId: 'L2' }), e('ash', '105.fALOLA', { shiny: true }), e('misty', '246'), e('brock', '246', { tag: 'shadow', shiny: true })],
      new Set(),
      huntIndex,
    );
    expect(got.get('ash')).toEqual([{ boss: marowak, listIds: ['L1', 'L2'] }]);
    expect(got.has('misty')).toBe(false);
    expect(got.get('brock')).toEqual([{ boss: shadowLarvitar, listIds: ['L1'] }]);
  });

  it('Mega Raid alerts both Mega and plain hunters; Clone Charizard NEVER alerts Mega or plain Charizard hunters', () => {
    const got = matchAlerts(
      [megaCharizardX, cloneCharizard],
      [
        e('megaHunter', '6.fMEGA_X', { alertPreEvolutions: true }),
        e('plainHunter', '6', { alertPreEvolutions: true }),
        e('gmaxHunter', '6.fGIGANTAMAX', { alertPreEvolutions: true }),
        e('cloneHunter', '6.fCOPY_2019'),
      ],
      new Set(),
      huntIndex,
    );
    expect(got.get('megaHunter')?.map((x) => x.boss.key)).toEqual(['6.fMEGA_X']);
    expect(got.get('plainHunter')?.map((x) => x.boss.key)).toEqual(['6.fMEGA_X']);
    expect(got.has('gmaxHunter')).toBe(false);
    expect(got.get('cloneHunter')?.map((x) => x.boss.key)).toEqual(['6.fCOPY_2019']);
  });

  it('respects per-list alertPreEvolutions for safe evolutions only', () => {
    const got = matchAlerts(
      [charmander],
      [
        e('optIn', '6', { alertPreEvolutions: true }),
        e('optOut', '6', { alertPreEvolutions: false }),
        e('gmax', '6.fGIGANTAMAX', { alertPreEvolutions: true }),
        e('mega', '6.fMEGA_X', { alertPreEvolutions: true }),
      ],
      new Set(),
      huntIndex,
    );
    expect(got.get('optIn')?.map((x) => x.boss.key)).toEqual(['4']);
    expect(got.has('optOut')).toBe(false);
    expect(got.has('gmax')).toBe(false);
    expect(got.has('mega')).toBe(false);
  });

  it('leaves out a boss the player was already told about', () => {
    expect(matchAlerts([marowak], [e('ash', '105.fALOLA')], new Set(['ash|105.fALOLA']), huntIndex).size).toBe(0);
  });
});
