import { describe, expect, it } from 'vitest';
import { cardsOf, missingCards } from './cards.js';
describe('missing-only exports', () => {
  it('a caught male is not shown at all', () => {
    const e = (gender: 'm' | 'f' | '', done: boolean, key = '25') => ({ variantKey: key, gender, shiny: false, tag: '', done }) as never;
    const cards = missingCards(cardsOf([e('m', true), e('f', false), e('m', true, '26'), e('f', true, '26'), e('', false, '1')]));
    expect(cards.map((c) => `${c.variantKey}:${c.members.map((m) => m.gender || '-').join('')}`)).toEqual(['25:f', '1:-']);
  });
});
