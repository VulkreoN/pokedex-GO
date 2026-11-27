import { describe, expect, it } from 'vitest';
import { buildTexts, translateWith } from './gameTexts.js';

const en = new Map([
  ['quest_land_great_plural', 'Make {0} Great Throws'],
  ['quest_land_inarow_great_curveball_plural', 'Make {0} Great Curveball Throws in a row'],
  ['badge_capture_total', 'Catch {0} Pokémon.'],
  ['quest_trade_singular', 'Trade a Pokémon'],
  ['marrd_2019_easy_land_curve', 'Lotad Research: Make {0} Curveball Throws'],
  ['item_pinap_berry_name', 'Pinap Berry'],
]);
const fr = new Map([
  ['quest_land_great_plural', 'Fais {0} Super lancers'],
  ['quest_land_inarow_great_curveball_plural', 'Fais {0} Super lancers à effet à la suite'],
  ['badge_capture_total', 'Attrape {0} Pokémon.'],
  ['quest_trade_singular', 'Échange un Pokémon'],
  ['marrd_2019_easy_land_curve', 'Étude Nénupiot : fais {0} lancers à effet'],
  ['item_pinap_berry_name', 'Baie Nanana'],
]);

describe("the game's own French", () => {
  const t = buildTexts(en, fr);
  it('translates research tasks with the most precise template, numbers kept', () => {
    expect(translateWith(t, 'Make 3 Great Curveball Throws in a row')).toBe('Fais 3 Super lancers à effet à la suite');
    expect(translateWith(t, 'Make 5 Great Throws')).toBe('Fais 5 Super lancers');
    expect(translateWith(t, 'Catch 10 Pokémon')).toBe('Attrape 10 Pokémon'); // no full stop added
    expect(translateWith(t, 'Catch 5 Weather Boosted Pokémon')).toBeNull();
    expect(translateWith(t, 'Trade a Pokémon')).toBe('Échange un Pokémon');
    expect(translateWith(t, 'Win a Max Battle')).toBeNull();
  });
  it('knows item names', () => {
    expect(t.items.get('pinap berry')).toBe('Baie Nanana');
  });
});
