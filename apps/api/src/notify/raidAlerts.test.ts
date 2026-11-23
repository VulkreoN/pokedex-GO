import { describe, expect, it } from 'vitest';
import { bossOf, matchAlerts, type MissingEntry } from './raidAlerts.js';

const img = (f: string) => `https://cdn.leekduck.com/assets/img/pokemon_icons_crop/${f}.icon.png`;
const known = (k: string) => ['105.fALOLA', '641.fINCARNATE'].includes(k);

describe('bossOf', () => {
  it('reads our variant key from the picture: forms kept, Mega / Primal give the normal form, Shadow apart', () => {
    expect(bossOf({ name: 'Alolan Marowak', image: img('pm105.fALOLA'), canBeShiny: true }, known)).toEqual({ key: '105.fALOLA', shadow: false, canBeShiny: true });
    expect(bossOf({ name: 'Mega Banette', image: img('pm354.fMEGA') }, known)).toEqual({ key: '354', shadow: false, canBeShiny: false });
    expect(bossOf({ name: 'Shadow Tornadus (Incarnate)', image: img('pm641.fINCARNATE') }, known)).toMatchObject({ key: '641.fINCARNATE', shadow: true });
    // A form we do not list as its own variant: the species.
    expect(bossOf({ name: 'Golurk', image: img('pm623.fNORMAL') }, known)).toMatchObject({ key: '623' });
    expect(bossOf({ name: '?', image: 'https://example.com/x.png' }, known)).toBeNull();
  });
});

describe('matchAlerts', () => {
  const marowak = { key: '105.fALOLA', shadow: false, canBeShiny: false };
  const shadowLarvitar = { key: '246', shadow: true, canBeShiny: true };
  const e = (userId: string, variantKey: string, extra: Partial<MissingEntry> = {}): MissingEntry => ({ userId, listId: 'L1', variantKey, shiny: false, tag: '', ...extra });

  it('matches plain entries to normal raids, Shadow entries to Shadow raids, shinies only when the boss can be shiny', () => {
    const got = matchAlerts(
      [marowak, shadowLarvitar],
      [e('ash', '105.fALOLA'), e('ash', '105.fALOLA', { listId: 'L2' }), e('ash', '105.fALOLA', { shiny: true }), e('misty', '246'), e('brock', '246', { tag: 'shadow', shiny: true })],
      new Set(),
    );
    expect(got.get('ash')).toEqual([{ boss: marowak, listIds: ['L1', 'L2'] }]); // the shiny one: this Marowak cannot be shiny
    expect(got.has('misty')).toBe(false); // a Shadow raid does not give a plain Larvitar
    expect(got.get('brock')).toEqual([{ boss: shadowLarvitar, listIds: ['L1'] }]);
  });

  it('leaves out a boss the player was already told about', () => {
    expect(matchAlerts([marowak], [e('ash', '105.fALOLA')], new Set(['ash|105.fALOLA'])).size).toBe(0);
  });
});
