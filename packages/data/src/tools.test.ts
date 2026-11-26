import { describe, expect, it } from 'vitest';
import { extractTools, type ToolsContext } from './tools.js';

type Gm = Parameters<typeof extractTools>[0];

const ctx: ToolsContext = {
  isCostume: () => false,
  released: () => true,
  megaReleased: () => true,
  name: (dex, token) => ({ en: token ? `#${dex} (${token})` : `#${dex}` }),
  dexOf: () => undefined,
  text: () => undefined,
  moveText: () => undefined,
  questText: (id) => ({ en: `Quest ${id}` }),
};

const mon = (dex: number, pokemonId: string, form?: string, evolutionBranch?: Record<string, unknown>[]): Gm[number] => ({
  templateId: `V${String(dex).padStart(4, '0')}_POKEMON_${form ?? pokemonId}`,
  data: {
    pokemonSettings: {
      pokemonId,
      ...(form ? { form } : {}),
      type: 'POKEMON_TYPE_NORMAL',
      stats: { baseAttack: 100, baseDefense: 100, baseStamina: 100 },
      ...(evolutionBranch ? { evolutionBranch: evolutionBranch as NonNullable<Gm[number]['data']['pokemonSettings']>['evolutionBranch'] } : {}),
    },
  },
});

describe('extractTools special & random evolutions', () => {
  it('marks multi-branch candy-only evolutions (Eevee, Cherubi, Clamperl, Wurmple, Toxel) and weighted ones (Dunsparce, Tandemaus) as random', () => {
    const gm: Gm = [
      // Eevee -> Vaporeon / Jolteon / Flareon (random) + Espeon (daytime/buddy) + Sylveon (quest)
      mon(133, 'EEVEE', 'EEVEE_NORMAL', [
        { evolution: 'VAPOREON', form: 'VAPOREON_NORMAL', candyCost: 25 },
        { evolution: 'JOLTEON', form: 'JOLTEON_NORMAL', candyCost: 25 },
        { evolution: 'FLAREON', form: 'FLAREON_NORMAL', candyCost: 25 },
        { evolution: 'ESPEON', form: 'ESPEON_NORMAL', candyCost: 25, kmBuddyDistanceRequirement: 10, onlyDaytime: true },
        { evolution: 'SYLVEON', form: 'SYLVEON_NORMAL', candyCost: 25, questDisplay: [{ questRequirementTemplateId: 'SYLVEON_EVOLUTION_QUEST' }] },
      ]),
      mon(134, 'VAPOREON', 'VAPOREON_NORMAL'),
      mon(135, 'JOLTEON', 'JOLTEON_NORMAL'),
      mon(136, 'FLAREON', 'FLAREON_NORMAL'),
      mon(196, 'ESPEON', 'ESPEON_NORMAL'),
      mon(700, 'SYLVEON', 'SYLVEON_NORMAL'),
      // Cherubi -> Cherrim Overcast / Sunny (random)
      mon(420, 'CHERUBI', 'CHERUBI_NORMAL', [
        { evolution: 'CHERRIM', form: 'CHERRIM_OVERCAST', candyCost: 50 },
        { evolution: 'CHERRIM', form: 'CHERRIM_SUNNY', candyCost: 50 },
      ]),
      mon(421, 'CHERRIM', 'CHERRIM_OVERCAST'),
      mon(421, 'CHERRIM', 'CHERRIM_SUNNY'),
      // Clamperl -> Huntail / Gorebyss (random)
      mon(366, 'CLAMPERL', 'CLAMPERL_NORMAL', [
        { evolution: 'HUNTAIL', form: 'HUNTAIL_NORMAL', candyCost: 50 },
        { evolution: 'GOREBYSS', form: 'GOREBYSS_NORMAL', candyCost: 50 },
      ]),
      mon(367, 'HUNTAIL', 'HUNTAIL_NORMAL'),
      mon(368, 'GOREBYSS', 'GOREBYSS_NORMAL'),
      // Dunsparce -> weighted random
      mon(206, 'DUNSPARCE', 'DUNSPARCE_NORMAL', [
        { evolution: 'DUDUNSPARCE', form: 'DUDUNSPARCE_TWO', candyCost: 50, evolutionLikelihoodWeight: 99 },
        { evolution: 'DUDUNSPARCE', form: 'DUDUNSPARCE_THREE', candyCost: 50, evolutionLikelihoodWeight: 1 },
      ]),
      mon(982, 'DUDUNSPARCE', 'DUDUNSPARCE_TWO'),
      mon(982, 'DUDUNSPARCE', 'DUDUNSPARCE_THREE'),
      // Tyrogue -> by highest IV (Attack / Defense / HP), NOT random
      mon(236, 'TYROGUE', 'TYROGUE_NORMAL', [
        { evolution: 'HITMONLEE', form: 'HITMONLEE_NORMAL', candyCost: 25 },
        { evolution: 'HITMONCHAN', form: 'HITMONCHAN_NORMAL', candyCost: 25 },
        { evolution: 'HITMONTOP', form: 'HITMONTOP_NORMAL', candyCost: 25 },
      ]),
      mon(106, 'HITMONLEE', 'HITMONLEE_NORMAL'),
      mon(107, 'HITMONCHAN', 'HITMONCHAN_NORMAL'),
      mon(237, 'HITMONTOP', 'HITMONTOP_NORMAL'),
      // Gloom -> 1 plain + 1 item branch: neither is random
      mon(44, 'GLOOM', 'GLOOM_NORMAL', [
        { evolution: 'VILEPLUME', form: 'VILEPLUME_NORMAL', candyCost: 100 },
        { evolution: 'BELLOSSOM', form: 'BELLOSSOM_NORMAL', candyCost: 100, evolutionItemRequirement: 'ITEM_SUN_STONE' },
      ]),
      mon(45, 'VILEPLUME', 'VILEPLUME_NORMAL'),
      mon(182, 'BELLOSSOM', 'BELLOSSOM_NORMAL'),
    ];

    const out = extractTools(gm, ctx, 'test');
    const byKey = new Map(out.pokemon.map((p) => [p.key, p]));

    const eevee = byKey.get('133')!.evolutions!;
    expect(eevee.filter((e) => e.random).map((e) => e.to)).toEqual(['134', '135', '136']);
    expect(eevee.find((e) => e.to === '134')?.nickname).toBe('Rainer');
    expect(eevee.find((e) => e.to === '196')?.random).toBeUndefined();
    expect(eevee.find((e) => e.to === '196')?.nickname).toBe('Sakura');
    expect(eevee.find((e) => e.to === '700')?.nickname).toBe('Kira');

    const cherubi = byKey.get('420')!.evolutions!;
    expect(cherubi.every((e) => e.random)).toBe(true);
    expect(cherubi.map((e) => e.to)).toEqual(['421.fOVERCAST', '421.fSUNNY']);

    const clamperl = byKey.get('366')!.evolutions!;
    expect(clamperl.every((e) => e.random)).toBe(true);

    const dunsparce = byKey.get('206')!.evolutions!;
    expect(dunsparce.every((e) => e.random)).toBe(true);

    const tyrogue = byKey.get('236')!.evolutions!;
    expect(tyrogue.every((e) => !e.random)).toBe(true);
    expect(tyrogue.map((e) => [e.to, e.byStat])).toEqual([
      ['106', 'atk'],
      ['107', 'def'],
      ['237', 'sta'],
    ]);

    const gloom = byKey.get('44')!.evolutions!;
    expect(gloom.every((e) => !e.random)).toBe(true);
  });

  it('includes nonTmCinematicMoves, formChange fusion moves, adventure-effect moves, and excludes unreleased shadow/battle forms', () => {
    const mv = (num: number, id: string, type: string, power: number): Gm[number] => ({
      templateId: `V${String(num).padStart(4, '0')}_MOVE_${id}`,
      data: { moveSettings: { movementId: id, pokemonType: `POKEMON_TYPE_${type}`, power, durationMs: 2000, energyDelta: -100 } },
    });
    const gm: Gm = [
      mv(384, 'DRAGON_ASCENT', 'FLYING', 140),
      mv(388, 'SPACIAL_REND', 'DRAGON', 160),
      mv(394, 'ROAR_OF_TIME', 'DRAGON', 160),
      mv(405, 'MOONGEIST_BEAM', 'GHOST', 230),
      {
        templateId: 'V0384_POKEMON_RAYQUAZA',
        data: {
          pokemonSettings: {
            pokemonId: 'RAYQUAZA',
            type: 'POKEMON_TYPE_DRAGON',
            stats: { baseAttack: 284, baseDefense: 170, baseStamina: 213 },
            nonTmCinematicMoves: ['DRAGON_ASCENT'],
            tempEvoOverrides: [{ tempEvoId: 'TEMP_EVOLUTION_MEGA', stats: { baseAttack: 377, baseDefense: 210, baseStamina: 227 }, typeOverride1: 'POKEMON_TYPE_DRAGON', typeOverride2: 'POKEMON_TYPE_FLYING' }],
          },
        },
      },
      {
        templateId: 'V0800_POKEMON_NECROZMA',
        data: {
          pokemonSettings: {
            pokemonId: 'NECROZMA',
            type: 'POKEMON_TYPE_PSYCHIC',
            stats: { baseAttack: 251, baseDefense: 195, baseStamina: 219 },
            formChange: [{ availableForm: ['NECROZMA_DAWN_WINGS'], moveReassignment: { cinematicMoves: [{ replacementMoves: ['MOONGEIST_BEAM'] }] } }],
          },
        },
      },
      {
        templateId: 'V0800_POKEMON_NECROZMA_DAWN_WINGS',
        data: { pokemonSettings: { pokemonId: 'NECROZMA', form: 'NECROZMA_DAWN_WINGS', type: 'POKEMON_TYPE_PSYCHIC', type2: 'POKEMON_TYPE_GHOST', stats: { baseAttack: 277, baseDefense: 220, baseStamina: 200 } } },
      },
      {
        templateId: 'V0800_POKEMON_NECROZMA_ULTRA',
        data: { pokemonSettings: { pokemonId: 'NECROZMA', form: 'NECROZMA_ULTRA', type: 'POKEMON_TYPE_PSYCHIC', type2: 'POKEMON_TYPE_DRAGON', stats: { baseAttack: 337, baseDefense: 196, baseStamina: 200 } } },
      },
      {
        templateId: 'V0484_POKEMON_PALKIA_ORIGIN',
        data: { pokemonSettings: { pokemonId: 'PALKIA', form: 'PALKIA_ORIGIN', type: 'POKEMON_TYPE_WATER', type2: 'POKEMON_TYPE_DRAGON', stats: { baseAttack: 286, baseDefense: 223, baseStamina: 189 }, shadow: { purificationStardustNeeded: 20000 } } },
      },
      {
        templateId: 'V0487_POKEMON_GIRATINA_ALTERED',
        data: { pokemonSettings: { pokemonId: 'GIRATINA', form: 'GIRATINA_ALTERED', type: 'POKEMON_TYPE_GHOST', type2: 'POKEMON_TYPE_DRAGON', stats: { baseAttack: 187, baseDefense: 225, baseStamina: 284 }, shadow: { purificationStardustNeeded: 20000 } } },
      },
      {
        templateId: 'V0487_POKEMON_GIRATINA_ORIGIN',
        data: { pokemonSettings: { pokemonId: 'GIRATINA', form: 'GIRATINA_ORIGIN', type: 'POKEMON_TYPE_GHOST', type2: 'POKEMON_TYPE_DRAGON', stats: { baseAttack: 225, baseDefense: 187, baseStamina: 284 }, shadow: { purificationStardustNeeded: 20000 } } },
      },
    ];

    const out = extractTools(gm, { ...ctx, formReleased: (_dex, key) => key !== '800.fULTRA' }, 'test');
    const byKey = new Map(out.pokemon.map((p) => [p.key, p]));

    expect(byKey.get('384')?.charged).toContain('DRAGON_ASCENT');
    expect(byKey.get('384.fMEGA')?.charged).toContain('DRAGON_ASCENT');
    expect(byKey.get('800.fDAWN_WINGS')?.charged).toContain('MOONGEIST_BEAM');
    expect(byKey.get('800.fDAWN_WINGS')?.elite).toContain('MOONGEIST_BEAM');
    expect(byKey.get('800.fULTRA')?.released).toBe(false);
    expect(byKey.get('484.fORIGIN')?.charged).toContain('SPACIAL_REND');
    expect(byKey.get('484.fORIGIN')?.shadow).toBeUndefined();
    expect(byKey.get('487.fALTERED')?.shadow).toBe(true);
    expect(byKey.get('487.fORIGIN')?.shadow).toBeUndefined();
  });
});
