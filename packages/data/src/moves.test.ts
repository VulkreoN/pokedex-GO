import { describe, expect, it } from 'vitest';
import { moveNames } from './build.js';

describe('moveNames', () => {
  it('names each move by its game id, fast moves without their _FAST suffix', () => {
    const gm = [{ templateId: 'COMBAT_V0216_MOVE_MUD_SHOT_FAST' }, { templateId: 'COMBAT_V0087_MOVE_MOONBLAST' }, { templateId: 'COMBAT_V9999_MOVE_UNNAMED' }, { templateId: 'V0001_POKEMON_BULBASAUR' }];
    const texts = {
      en: new Map([['move_name_0216', 'Mud Shot'], ['move_name_0087', 'Moonblast']]),
      fr: new Map([['move_name_0216', 'Tir de Boue']]),
    };
    expect(moveNames(gm, texts)).toEqual({ MUD_SHOT: { en: 'Mud Shot', fr: 'Tir de Boue' }, MOONBLAST: { en: 'Moonblast' } });
  });
});
