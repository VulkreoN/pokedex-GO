import { describe, expect, it } from 'vitest';
import { parseEmbedHtml, parseTweetUrl } from './oembed.js';

describe('tweet urls', () => {
  it('accepts x.com and twitter.com', () => {
    expect(parseTweetUrl('https://x.com/g47ix/status/1234567890123?s=20')).toEqual({ handle: 'g47ix', id: '1234567890123' });
    expect(parseTweetUrl('https://twitter.com/g47ix/status/99999')).toEqual({ handle: 'g47ix', id: '99999' });
    expect(parseTweetUrl('https://example.com/x.com/a/status/1')).toBeNull();
  });
});

describe('embed html', () => {
  it('extracts text, links, redeem codes and the date', () => {
    const html = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Crocs code! Redeem: <a href="https://t.co/abc">https://store.pokemongo.com/offer-redemption?passcode=POKEMONGOxCROCSxELECTRIFYING</a> &amp; more <a href="https://twitter.com/hashtag/PokemonGO?src=hash&amp;ref_src=twsrc%5Etfw">#PokemonGO</a> <a href="https://t.co/img">pic.twitter.com/img</a></p>&mdash; g47ix (@g47ix) <a href="https://twitter.com/g47ix/status/1?ref_src=twsrc%5Etfw">November 15, 2026</a></blockquote>`;
    const r = parseEmbedHtml(html);
    expect(r.text).toContain('Crocs code!');
    expect(r.text).toContain('passcode=POKEMONGOxCROCSxELECTRIFYING');
    expect(r.codes).toEqual(['POKEMONGOxCROCSxELECTRIFYING']);
    expect(r.links).toContain('https://t.co/abc');
    expect(r.postedAt?.toISOString().slice(0, 10)).toBe('2026-11-15');
  });
});
