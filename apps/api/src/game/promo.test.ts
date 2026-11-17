import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPromoCodes } from './promo.js';

const card = (code: string, extra = '') =>
  `<div class="promo-card${extra}"><h3 class="title">Title ${code}</h3><div class="description"><p>Desc</p></div>` +
  `<p class="text" style="--code-length: ${code.length}">${code}</p>` +
  `<a class="link-button" href="https://store.pokemongo.com/offer-redemption?passcode=${code}">Redeem</a>` +
  `<ul class="reward-list"><li class="reward"><span class="reward-label">adidas shoes</span></li></ul></div>`;

afterEach(() => vi.unstubAllGlobals());

describe('getPromoCodes', () => {
  it('reads active codes and skips expired ones', async () => {
    const html = card('ADIDASxPOKEMON') + card('OLDCODE', ' expired');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html)));
    const codes = await getPromoCodes();
    expect(codes.map((c) => c.code)).toEqual(['ADIDASxPOKEMON']);
    expect(codes[0]!.rewards).toEqual(['adidas shoes']);
    expect(codes[0]!.redeemUrl).toBe('https://store.pokemongo.com/offer-redemption?passcode=ADIDASxPOKEMON');
  });
});
