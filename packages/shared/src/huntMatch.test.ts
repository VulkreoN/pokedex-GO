import { describe, expect, it } from 'vitest';
import {
  buildHuntIndex,
  buildHuntMatcher,
  candidateTargetKeys,
  entryMatchesLive,
  inferHuntSource,
  resolveLiveKey,
  safePreEvolutions,
  type HuntEntry,
} from './huntMatch.js';
import type { Dataset, PvpPokemon, Species, Variant } from './types.js';

const sp = (dex: number, en: string, parent?: number, id = en.toUpperCase()): Species => ({
  dex,
  id,
  name: { en },
  gen: 1,
  types: ['normal'],
  rarity: 'normal',
  family: `FAMILY_${dex}`,
  ...(parent ? { parent } : {}),
  genderDiff: false,
  shinyReleased: true,
  released: true,
});

const variant = (v: Partial<Variant> & Pick<Variant, 'key' | 'dex' | 'kind'>): Variant => ({
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

const pvp = (key: string, dex: number, evolutions?: string[]): PvpPokemon => ({
  key,
  dex,
  name: { en: key },
  types: ['normal'],
  atk: 100,
  def: 100,
  sta: 100,
  ...(evolutions ? { evolutions } : {}),
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
    sp(25, 'Pikachu', 172),
    sp(26, 'Raichu', 25),
    sp(37, 'Vulpix'),
    sp(52, 'Meowth'),
    sp(53, 'Persian', 52),
    sp(79, 'Slowpoke'),
    sp(80, 'Slowbro', 79),
    sp(94, 'Gengar'),
    sp(104, 'Cubone'),
    sp(105, 'Marowak', 104),
    sp(123, 'Scyther'),
    sp(143, 'Snorlax', 446),
    sp(172, 'Pichu'),
    sp(194, 'Wooper'),
    sp(195, 'Quagsire', 194),
    sp(199, 'Slowking', 79),
    sp(212, 'Scizor', 123),
    sp(382, 'Kyogre'),
    sp(386, 'Deoxys'),
    sp(412, 'Burmy'),
    sp(413, 'Wormadam', 412),
    sp(414, 'Mothim', 412),
    sp(446, 'Munchlax'),
    sp(546, 'Cottonee'),
    sp(623, 'Golurk'),
    sp(664, 'Scatterbug'),
    sp(665, 'Spewpa', 664),
    sp(666, 'Vivillon', 665),
    sp(669, 'Flabebe'),
    sp(670, 'Floette', 669),
    sp(671, 'Florges', 670),
    sp(710, 'Pumpkaboo'),
    sp(711, 'Gourgeist', 710),
    sp(744, 'Rockruff'),
    sp(745, 'Lycanroc', 744),
    sp(767, 'Wimpod'),
    sp(768, 'Golisopod', 767),
    sp(854, 'Sinistea'),
    sp(855, 'Polteageist', 854),
    sp(863, 'Perrserker', 52),
    sp(900, 'Kleavor', 123),
    sp(980, 'Clodsire', 194),
    sp(1012, 'Poltchageist'),
    sp(1013, 'Sinistcha', 1012),
  ],
  variants: [
    variant({ key: '4', dex: 4, kind: 'base' }),
    variant({ key: '4.fFALL_2019', dex: 4, kind: 'costume', form: 'FALL_2019', noEvolve: true }),
    variant({ key: '4.fGOGGLES_2026', dex: 4, kind: 'costume', form: 'GOGGLES_2026' }),
    variant({ key: '5', dex: 5, kind: 'base' }),
    variant({ key: '5.fGOGGLES_2026', dex: 5, kind: 'costume', form: 'GOGGLES_2026' }),
    variant({ key: '6', dex: 6, kind: 'base' }),
    variant({ key: '6.fGOGGLES_2026', dex: 6, kind: 'costume', form: 'GOGGLES_2026' }),
    variant({ key: '6.fCOPY_2019', dex: 6, kind: 'costume', form: 'COPY_2019', noMega: true }),
    variant({ key: '6.fMEGA_X', dex: 6, kind: 'mega', form: 'MEGA_X' }),
    variant({ key: '6.fMEGA_Y', dex: 6, kind: 'mega', form: 'MEGA_Y' }),
    variant({ key: '6.fGIGANTAMAX', dex: 6, kind: 'gmax', form: 'GIGANTAMAX' }),
    variant({ key: '172', dex: 172, kind: 'base' }),
    variant({ key: '172.cPARTY_HAT', dex: 172, kind: 'costume', costume: 'PARTY_HAT' }),
    variant({ key: '25', dex: 25, kind: 'base' }),
    variant({ key: '25.cPARTY_HAT', dex: 25, kind: 'costume', costume: 'PARTY_HAT' }),
    variant({ key: '25.cNO_EVOLVE', dex: 25, kind: 'costume', costume: 'NO_EVOLVE', noEvolve: true }),
    variant({ key: '26', dex: 26, kind: 'base' }),
    variant({ key: '26.fALOLA', dex: 26, kind: 'regional', form: 'ALOLA' }),
    variant({ key: '26.cPARTY_HAT', dex: 26, kind: 'costume', costume: 'PARTY_HAT' }),
    variant({ key: '26.cNO_EVOLVE', dex: 26, kind: 'costume', costume: 'NO_EVOLVE' }),
    variant({ key: '37', dex: 37, kind: 'base' }),
    variant({ key: '37.fALOLA', dex: 37, kind: 'regional', form: 'ALOLA' }),
    variant({ key: '52', dex: 52, kind: 'base' }),
    variant({ key: '52.fALOLA', dex: 52, kind: 'regional', form: 'ALOLA' }),
    variant({ key: '52.fGALARIAN', dex: 52, kind: 'regional', form: 'GALARIAN' }),
    variant({ key: '52.fGIGANTAMAX', dex: 52, kind: 'gmax', form: 'GIGANTAMAX' }),
    variant({ key: '53', dex: 53, kind: 'base' }),
    variant({ key: '53.fALOLA', dex: 53, kind: 'regional', form: 'ALOLA' }),
    variant({ key: '79', dex: 79, kind: 'base' }),
    variant({ key: '79.fGALARIAN', dex: 79, kind: 'regional', form: 'GALARIAN' }),
    variant({ key: '79.f2020', dex: 79, kind: 'costume', form: '2020' }),
    variant({ key: '80', dex: 80, kind: 'base' }),
    variant({ key: '80.fMEGA', dex: 80, kind: 'mega', form: 'MEGA' }),
    variant({ key: '80.fGALARIAN', dex: 80, kind: 'regional', form: 'GALARIAN' }),
    variant({ key: '80.f2021', dex: 80, kind: 'costume', form: '2021' }),
    variant({ key: '94', dex: 94, kind: 'base' }),
    variant({ key: '94.fMEGA', dex: 94, kind: 'mega', form: 'MEGA' }),
    variant({ key: '104', dex: 104, kind: 'base' }),
    variant({ key: '105', dex: 105, kind: 'base' }),
    variant({ key: '105.fALOLA', dex: 105, kind: 'regional', form: 'ALOLA' }),
    variant({ key: '123', dex: 123, kind: 'base' }),
    variant({ key: '212', dex: 212, kind: 'base' }),
    variant({ key: '900', dex: 900, kind: 'base' }),
    variant({ key: '143', dex: 143, kind: 'base' }),
    variant({ key: '143.fGIGANTAMAX', dex: 143, kind: 'gmax', form: 'GIGANTAMAX' }),
    variant({ key: '446', dex: 446, kind: 'base' }),
    variant({ key: '194', dex: 194, kind: 'base' }),
    variant({ key: '194.fPALDEA', dex: 194, kind: 'regional', form: 'PALDEA' }),
    variant({ key: '195', dex: 195, kind: 'base' }),
    variant({ key: '980', dex: 980, kind: 'base' }),
    variant({ key: '199', dex: 199, kind: 'base' }),
    variant({ key: '199.fGALARIAN', dex: 199, kind: 'regional', form: 'GALARIAN' }),
    variant({ key: '199.f2022', dex: 199, kind: 'costume', form: '2022' }),
    variant({ key: '382', dex: 382, kind: 'base' }),
    variant({ key: '382.fPRIMAL', dex: 382, kind: 'mega', form: 'PRIMAL' }),
    variant({ key: '386', dex: 386, kind: 'base' }),
    variant({ key: '386.fDEFENSE', dex: 386, kind: 'form', form: 'DEFENSE' }),
    variant({ key: '412.fBURMY_PLANT', dex: 412, kind: 'form', form: 'BURMY_PLANT' }),
    variant({ key: '412.fBURMY_SANDY', dex: 412, kind: 'form', form: 'BURMY_SANDY' }),
    variant({ key: '412.fBURMY_TRASH', dex: 412, kind: 'form', form: 'BURMY_TRASH' }),
    variant({ key: '413.fWORMADAM_SANDY', dex: 413, kind: 'form', form: 'WORMADAM_SANDY' }),
    variant({ key: '414', dex: 414, kind: 'base' }),
    variant({ key: '546.cSPRING_2024', dex: 546, kind: 'costume', costume: 'SPRING_2024' }),
    variant({ key: '623', dex: 623, kind: 'base' }),
    variant({ key: '664', dex: 664, kind: 'base' }),
    variant({ key: '665', dex: 665, kind: 'base' }),
    variant({ key: '666.fPOLAR', dex: 666, kind: 'form', form: 'POLAR' }),
    variant({ key: '666.fPOKEBALL', dex: 666, kind: 'form', form: 'POKEBALL' }),
    variant({ key: '666.fFANCY', dex: 666, kind: 'form', form: 'FANCY' }),
    variant({ key: '669.fYELLOW', dex: 669, kind: 'form', form: 'YELLOW' }),
    variant({ key: '669.fRED', dex: 669, kind: 'form', form: 'RED' }),
    variant({ key: '670.fYELLOW', dex: 670, kind: 'form', form: 'YELLOW' }),
    variant({ key: '671.fYELLOW', dex: 671, kind: 'form', form: 'YELLOW' }),
    variant({ key: '710.fSUPER.cFALL_2022', dex: 710, kind: 'costume', form: 'SUPER', costume: 'FALL_2022' }),
    variant({ key: '711.fSUPER.cFALL_2022', dex: 711, kind: 'costume', form: 'SUPER', costume: 'FALL_2022' }),
    variant({ key: '744', dex: 744, kind: 'base' }),
    variant({ key: '744.fDUSK', dex: 744, kind: 'form', form: 'DUSK' }),
    variant({ key: '745.fMIDDAY', dex: 745, kind: 'form', form: 'MIDDAY' }),
    variant({ key: '745.fDUSK', dex: 745, kind: 'form', form: 'DUSK' }),
    variant({ key: '767', dex: 767, kind: 'base' }),
    variant({ key: '768', dex: 768, kind: 'base' }),
    variant({ key: '768.fMEGA', dex: 768, kind: 'mega', form: 'MEGA' }),
    variant({ key: '854.fANTIQUE', dex: 854, kind: 'form', form: 'ANTIQUE' }),
    variant({ key: '854.fPHONY', dex: 854, kind: 'form', form: 'PHONY' }),
    variant({ key: '855.fANTIQUE', dex: 855, kind: 'form', form: 'ANTIQUE' }),
    variant({ key: '863', dex: 863, kind: 'base' }),
    variant({ key: '1012.fARTISAN', dex: 1012, kind: 'form', form: 'ARTISAN' }),
    variant({ key: '1012.fCOUNTERFEIT', dex: 1012, kind: 'form', form: 'COUNTERFEIT' }),
    variant({ key: '1013.fMASTERPIECE', dex: 1013, kind: 'form', form: 'MASTERPIECE' }),
    variant({ key: '1013.fUNREMARKABLE', dex: 1013, kind: 'form', form: 'UNREMARKABLE' }),
  ],
  pvp: {
    cpm: [],
    stardust: [],
    candy: [],
    xlCandy: [],
    xlFrom: 40,
    maxLevel: 50,
    pokemon: [
      pvp('4', 4, ['5']),
      pvp('5', 5, ['6']),
      pvp('172', 172, ['25']),
      pvp('25', 25, ['26']),
      pvp('52', 52, ['53']),
      pvp('52.fALOLA', 52, ['53.fALOLA']),
      pvp('52.fGALARIAN', 52, ['863']),
      pvp('79', 79, ['80', '199']),
      pvp('79.fGALARIAN', 79, ['80.fGALARIAN', '199.fGALARIAN']),
      pvp('104', 104, ['105']),
      pvp('123', 123, ['212']),
      pvp('194', 194, ['195']),
      pvp('194.fPALDEA', 194, ['980']),
      pvp('412', 412, ['413', '414']),
      pvp('446', 446, ['143']),
      pvp('664', 664, ['665']),
      pvp('665', 665, ['666']),
      pvp('669', 669, ['670']),
      pvp('670', 670, ['671']),
      pvp('710', 710, ['711']),
      pvp('744', 744, ['745', '745.fMIDNIGHT']),
      pvp('767', 767, ['768']),
      pvp('854', 854, ['855']),
      pvp('1012', 1012, ['1013']),
    ],
  },
};

const index = buildHuntIndex(ds);
const img = (f: string) => `https://cdn.leekduck.com/assets/img/pokemon_icons_crop/${f}.icon.png`;
const entry = (variantKey: string, extra: Partial<HuntEntry> = {}): HuntEntry => ({
  variantKey,
  shiny: false,
  tag: '',
  done: false,
  alertPreEvolutions: false,
  ...extra,
});

describe('resolveLiveKey (strict)', () => {
  it('keeps explicit forms, costumes, clones, Megas, and Gigantamax intact', () => {
    expect(resolveLiveKey(img('pm143'), 'Snorlax', index)).toBe('143');
    expect(resolveLiveKey(img('pm143.fGIGANTAMAX'), 'Gigantamax Snorlax', index)).toBe('143.fGIGANTAMAX');
    expect(resolveLiveKey(img('pm52.fGALARIAN'), 'Galarian Meowth', index)).toBe('52.fGALARIAN');
    expect(resolveLiveKey(img('pm6.fMEGA_X'), 'Mega Charizard X', index)).toBe('6.fMEGA_X');
    expect(resolveLiveKey(img('pm6.fCOPY_2019'), 'Clone Charizard', index)).toBe('6.fCOPY_2019');
    expect(resolveLiveKey(img('pm546.cSPRING_2024'), 'Cottonee wearing a flower crown', index)).toBe('546.cSPRING_2024');
    expect(resolveLiveKey(img('pm623.fNORMAL'), 'Golurk', index)).toBe('623');
  });

  it('NEVER degrades unknown explicit costumes or forms back to plain species', () => {
    expect(resolveLiveKey(img('pm25.cFUTURE_HAT_2099'), 'Future Hat Pikachu', index)).toBe('25.cFUTURE_HAT_2099');
    expect(resolveLiveKey(img('pm6.fUNKNOWN_CLONE_2099'), 'Clone Charizard', index)).toBe('6.fUNKNOWN_CLONE_2099');
    expect(resolveLiveKey('https://cdn/pokemon_icon_025_00_99.png', 'Costumed Pikachu', index)).toBe('25.cLEGACY_99');
    expect(resolveLiveKey('https://cdn/pokemon_icon_025_00.png', 'Pikachu wearing a party hat', index)).toBe('25.cUNRESOLVED');
  });

  it('resolves legacy numbered regional & Mega icons accurately', () => {
    expect(resolveLiveKey('https://cdn/pokemon_icon_037_61.png', 'Alolan Vulpix', index)).toBe('37.fALOLA');
    expect(resolveLiveKey('https://cdn/pokemon_icon_052_62.png', 'Galarian Meowth', index)).toBe('52.fGALARIAN');
    expect(resolveLiveKey('https://cdn/pokemon_icon_094_51.png', 'Mega Gengar', index)).toBe('94.fMEGA');
    expect(resolveLiveKey('https://cdn/pokemon_icon_386_13.png', 'Deoxys (Defense)', index)).toBe('386.fDEFENSE');
    expect(resolveLiveKey('https://cdn/Mega%20Charizard%20X.png', 'Mega Charizard X', index)).toBe('6.fMEGA_X');
    expect(resolveLiveKey('https://cdn/item.png', 'Poké Ball', index)).toBeNull();
  });
});

describe('safePreEvolutions', () => {
  it('returns plain pre-evolutions for plain targets', () => {
    expect(safePreEvolutions(index, '6')).toEqual(['5', '4']);
    expect(safePreEvolutions(index, '26')).toEqual(['25', '172']);
    expect(safePreEvolutions(index, '143')).toEqual(['446']);
  });

  it('returns EMPTY for Gigantamax, and returns Mega-capable base pre-evolutions for Mega/Primal variants', () => {
    expect(safePreEvolutions(index, '143.fGIGANTAMAX')).toEqual([]);
    expect(safePreEvolutions(index, '52.fGIGANTAMAX')).toEqual([]);
    expect(safePreEvolutions(index, '6.fGIGANTAMAX')).toEqual([]);
    expect(safePreEvolutions(index, '6.fMEGA_X')).toEqual(['6', '5', '4']);
    expect(safePreEvolutions(index, '6.fMEGA_Y')).toEqual(['6', '5', '4']);
    expect(safePreEvolutions(index, '80.fMEGA')).toEqual(['80', '79']);
    expect(safePreEvolutions(index, '382.fPRIMAL')).toEqual(['382']);
  });

  it('matches costumed evolutions ONLY to the exact same evolvable costume (never plain, never noEvolve)', () => {
    expect(safePreEvolutions(index, '6.fGOGGLES_2026')).toEqual(['5.fGOGGLES_2026', '4.fGOGGLES_2026']);
    expect(safePreEvolutions(index, '6.fCOPY_2019')).toEqual([]);
    expect(safePreEvolutions(index, '26.cPARTY_HAT')).toEqual(['25.cPARTY_HAT', '172.cPARTY_HAT']);
    expect(safePreEvolutions(index, '26.cNO_EVOLVE')).toEqual([]);
    expect(safePreEvolutions(index, '80.f2021')).toEqual(['79.f2020']);
    expect(safePreEvolutions(index, '199.f2022')).toEqual(['79.f2020']);
  });

  it('respects regional lineages strictly (Perrserker <- Galarian Meowth; Alolan Raichu/Marowak/Kleavor have NONE)', () => {
    expect(safePreEvolutions(index, '863')).toEqual(['52.fGALARIAN']);
    expect(safePreEvolutions(index, '53')).toEqual(['52']);
    expect(safePreEvolutions(index, '53.fALOLA')).toEqual(['52.fALOLA']);
    expect(safePreEvolutions(index, '980')).toEqual(['194.fPALDEA']);
    expect(safePreEvolutions(index, '195')).toEqual(['194']);
    expect(safePreEvolutions(index, '199.fGALARIAN')).toEqual(['79.fGALARIAN']);
    expect(safePreEvolutions(index, '26.fALOLA')).toEqual([]);
    expect(safePreEvolutions(index, '105.fALOLA')).toEqual([]);
    expect(safePreEvolutions(index, '900')).toEqual([]);
  });

  it('respects exact visual form lineages (Rockruff Dusk, Wormadam, Florges, Poltchageist, Pumpkaboo, Sinistea)', () => {
    expect(safePreEvolutions(index, '745.fDUSK')).toEqual(['744.fDUSK']);
    expect(safePreEvolutions(index, '745.fMIDDAY')).toEqual(['744']);
    expect(safePreEvolutions(index, '413.fWORMADAM_SANDY')).toEqual(['412.fBURMY_SANDY']);
    expect(safePreEvolutions(index, '414')).toEqual(['412.fBURMY_PLANT', '412.fBURMY_SANDY', '412.fBURMY_TRASH']);
    expect(safePreEvolutions(index, '671.fYELLOW')).toEqual(['670.fYELLOW', '669.fYELLOW']);
    expect(safePreEvolutions(index, '1013.fMASTERPIECE')).toEqual(['1012.fARTISAN']);
    expect(safePreEvolutions(index, '1013.fUNREMARKABLE')).toEqual(['1012.fCOUNTERFEIT']);
    expect(safePreEvolutions(index, '711.fSUPER.cFALL_2022')).toEqual(['710.fSUPER.cFALL_2022']);
    expect(safePreEvolutions(index, '855.fANTIQUE')).toEqual(['854.fANTIQUE']);
    expect(safePreEvolutions(index, '666.fPOKEBALL')).toEqual([]);
    expect(safePreEvolutions(index, '666.fFANCY')).toEqual([]);
  });
});

describe('exact & pre-evolution hunt matching (Vipezarre & user regressions)', () => {
  it('fixes Vipezarre bug #1: hunting Gigantamax Snorlax NEVER highlights wild or Dynamax Snorlax', () => {
    const m = buildHuntMatcher(index, [entry('143.fGIGANTAMAX', { alertPreEvolutions: true })]);
    expect(m.isWanted(img('pm143'), 'Snorlax', 'wild', true)).toBe(false);
    expect(m.isWanted(img('pm446'), 'Munchlax', 'egg', true)).toBe(false);
    expect(m.isWantedKey('143', 'max', true)).toBe(false);
    expect(m.isWantedKey('143.fGIGANTAMAX', 'gmax', true)).toBe(true);
  });

  it('fixes Vipezarre bug #2: hunting Gigantamax or Kanto Meowth NEVER highlights Galarian Meowth in 7 km eggs', () => {
    const gmaxMeowth = buildHuntMatcher(index, [entry('52.fGIGANTAMAX', { alertPreEvolutions: true })]);
    expect(gmaxMeowth.isWanted(img('pm52.fGALARIAN'), 'Galarian Meowth', 'egg', true)).toBe(false);
    expect(gmaxMeowth.isWanted(img('pm52'), 'Meowth', 'wild', true)).toBe(false);
    expect(gmaxMeowth.isWantedKey('52.fGIGANTAMAX', 'gmax', true)).toBe(true);

    const kantoMeowth = buildHuntMatcher(index, [entry('52', { alertPreEvolutions: true })]);
    expect(kantoMeowth.isWanted(img('pm52.fGALARIAN'), 'Galarian Meowth', 'egg', true)).toBe(false);
    expect(kantoMeowth.isWanted(img('pm52.fALOLA'), 'Alolan Meowth', 'egg', true)).toBe(false);
    expect(kantoMeowth.isWanted(img('pm52'), 'Meowth', 'wild', true)).toBe(true);
  });

  it('hunting Mega Charizard X matches Mega raids directly, and Mega-capable base pre-evolutions ONLY when alertPreEvolutions is on', () => {
    const off = buildHuntMatcher(index, [entry('6.fMEGA_X', { alertPreEvolutions: false })]);
    expect(off.isWanted(img('pm6.fMEGA_X'), 'Mega Charizard X', 'megaRaid', true)).toBe(true);
    expect(off.isWanted(img('pm6.fMEGA_X'), 'Mega Charizard X', 'raid', true)).toBe(true);
    expect(off.isWanted(img('pm6.fCOPY_2019'), 'Clone Charizard', 'raid', true)).toBe(false);
    expect(off.isWanted(img('pm6'), 'Charizard', 'wild', true)).toBe(false);
    expect(off.isWanted(img('pm4'), 'Charmander', 'wild', true)).toBe(false);

    const on = buildHuntMatcher(index, [entry('6.fMEGA_X', { alertPreEvolutions: true })]);
    expect(on.isWanted(img('pm6.fMEGA_X'), 'Mega Charizard X', 'megaRaid', true)).toBe(true);
    expect(on.isWanted(img('pm6'), 'Charizard', 'wild', true)).toBe(true);
    expect(on.isWanted(img('pm5'), 'Charmeleon', 'raid', true)).toBe(true);
    expect(on.isWanted(img('pm4'), 'Charmander', 'wild', true)).toBe(true);
    expect(on.isWanted(img('pm4'), 'Charmander', 'max', true)).toBe(true);
    // Rocket & Shadow Raids also match unified Mega pre-evolutions (Shadow Pokémon can be purified and Mega Evolved).
    expect(on.isWanted(img('pm4'), 'Shadow Charmander', 'rocket', true)).toBe(true);
    expect(on.isWanted(img('pm4'), 'Shadow Charmander', 'shadowRaid', true)).toBe(true);
    // Clones and costumes still cannot evolve/Mega Evolve into Mega Charizard directly.
    expect(on.isWanted(img('pm6.fCOPY_2019'), 'Clone Charizard', 'raid', true)).toBe(false);
    expect(on.isWanted(img('pm4.fFALL_2019'), 'Charmander', 'wild', true)).toBe(false);
    expect(on.isWanted(img('pm4.fGOGGLES_2026'), 'Charmander', 'wild', true)).toBe(false);

    // Mega Golisopod (Méga-Sarmuraï) with alertPreEvolutions highlights Wimpod (Sovkipou) uniformly across ALL non-Gigantamax sources.
    const golisopod = buildHuntMatcher(index, [entry('768.fMEGA', { alertPreEvolutions: true })]);
    for (const src of ['wild', 'egg', 'research', 'raid', 'max', 'rocket', 'shadowRaid'] as const) {
      expect(golisopod.isWanted(img('pm767'), 'Wimpod', src, false), `Wimpod via ${src}`).toBe(true);
    }
    expect(golisopod.isWanted(img('pm768.fMEGA'), 'Mega Golisopod', 'megaRaid', true)).toBe(true);
    expect(golisopod.isWanted(img('pm767'), 'Wimpod', 'gmax', true)).toBe(false);

    // Mega Slowbro only matches Kanto Slowbro/Slowpoke, NEVER Galarian Slowpoke/Slowbro.
    const slowbro = buildHuntMatcher(index, [entry('80.fMEGA', { alertPreEvolutions: true })]);
    expect(slowbro.isWanted(img('pm80'), 'Slowbro', 'raid', true)).toBe(true);
    expect(slowbro.isWanted(img('pm79'), 'Slowpoke', 'wild', true)).toBe(true);
    expect(slowbro.isWanted(img('pm79.fGALARIAN'), 'Galarian Slowpoke', 'egg', true)).toBe(false);
    expect(slowbro.isWanted(img('pm80.fGALARIAN'), 'Galarian Slowbro', 'raid', true)).toBe(false);
  });

  it('Mega Raid also satisfies a hunt for the plain species (caught after defeating the Mega boss)', () => {
    const plain = buildHuntMatcher(index, [entry('6')]);
    expect(plain.isWanted(img('pm6.fMEGA_X'), 'Mega Charizard X', 'megaRaid', true)).toBe(true);
    expect(plain.isWanted(img('pm6.fCOPY_2019'), 'Clone Charizard', 'raid', true)).toBe(false);
  });

  it('respects per-list alertPreEvolutions toggle for plain, costumed, regional and Shadow entries', () => {
    const off = buildHuntMatcher(index, [entry('6', { alertPreEvolutions: false })]);
    expect(off.isWanted(img('pm4'), 'Charmander', 'wild', true)).toBe(false);
    expect(off.isWanted(img('pm6'), 'Charizard', 'wild', true)).toBe(true);

    const on = buildHuntMatcher(index, [entry('6', { alertPreEvolutions: true })]);
    expect(on.isWanted(img('pm4'), 'Charmander', 'wild', true)).toBe(true);
    expect(on.isWanted(img('pm5'), 'Charmeleon', 'raid', false)).toBe(true);
    expect(on.isWanted(img('pm4.fFALL_2019'), 'Charmander', 'wild', true)).toBe(false);
    expect(on.isWanted(img('pm4.fGOGGLES_2026'), 'Charmander', 'wild', true)).toBe(false);
    // Plain collections also highlight Rocket & Shadow Raid encounters (can be caught & purified or kept for the dex).
    expect(on.isWanted(img('pm4'), 'Shadow Charmander', 'rocket', true)).toBe(true);
    expect(on.isWanted(img('pm4'), 'Shadow Charmander', 'shadowRaid', true)).toBe(true);

    const shadow = buildHuntMatcher(index, [entry('6', { tag: 'shadow', alertPreEvolutions: true })]);
    expect(shadow.isWanted(img('pm4'), 'Charmander', 'rocket', false)).toBe(true);
    expect(shadow.isWanted(img('pm4'), 'Shadow Charmander', 'shadowRaid', true)).toBe(true);
    expect(shadow.isWanted(img('pm4'), 'Charmander', 'wild', true)).toBe(false);

    const costRaichu = buildHuntMatcher(index, [entry('26.cPARTY_HAT', { alertPreEvolutions: true })]);
    expect(costRaichu.isWanted(img('pm25.cPARTY_HAT'), 'Party Hat Pikachu', 'wild', true)).toBe(true);
    expect(costRaichu.isWanted(img('pm172.cPARTY_HAT'), 'Party Hat Pichu', 'egg', true)).toBe(true);
    expect(costRaichu.isWanted(img('pm25'), 'Pikachu', 'wild', true)).toBe(false);
    expect(costRaichu.isWanted(img('pm25.cNO_EVOLVE'), 'Other Pikachu', 'wild', true)).toBe(false);
  });

  it('respects shiny locks and tags (lucky/background/dynamax)', () => {
    expect(entryMatchesLive(index, entry('6', { shiny: true, alertPreEvolutions: true }), { key: '4', source: 'wild', canBeShiny: false })).toBe(false);
    expect(entryMatchesLive(index, entry('6', { shiny: true, alertPreEvolutions: true }), { key: '4', source: 'wild', canBeShiny: true })).toBe(true);
    expect(entryMatchesLive(index, entry('4', { tag: 'lucky' }), { key: '4', source: 'wild', canBeShiny: true })).toBe(false);
    expect(entryMatchesLive(index, entry('4', { tag: 'background' }), { key: '4', source: 'raid', canBeShiny: true })).toBe(false);
    expect(entryMatchesLive(index, entry('4', { tag: 'dynamax' }), { key: '4', source: 'wild', canBeShiny: true })).toBe(false);
    expect(entryMatchesLive(index, entry('4', { tag: 'dynamax' }), { key: '4', source: 'max', canBeShiny: true })).toBe(true);
    expect(entryMatchesLive(index, entry('6', { tag: 'dynamax', alertPreEvolutions: true }), { key: '4', source: 'max', canBeShiny: true })).toBe(true);
  });

  it('computes SQL candidateTargetKeys including Mega catches and safe evolution descendants', () => {
    const targets = candidateTargetKeys(index, [
      { key: '4', source: 'wild' },
      { key: '6.fMEGA_X', source: inferHuntSource('raid', '6.fMEGA_X', 'Mega Charizard X') },
      { key: '52.fGALARIAN', source: 'egg' },
    ]);
    expect(targets).toContain('4');
    expect(targets).toContain('5');
    expect(targets).toContain('6');
    expect(targets).toContain('6.fMEGA_X');
    expect(targets).toContain('6.fMEGA_Y');
    expect(targets).toContain('863');
    expect(targets).not.toContain('53');
    expect(targets).not.toContain('6.fGIGANTAMAX');
  });
});
