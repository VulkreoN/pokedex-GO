/** Promo codes from Leek Duck's promo page, cached for an hour. */

export interface PromoCode {
  code: string;
  title: string;
  description: string;
  rewards: string[];
  redeemUrl: string;
}

let cache: { at: number; codes: PromoCode[] } | null = null;

export async function getPromoCodes(): Promise<PromoCode[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.codes;
  const res = await fetch('https://leekduck.com/promo-codes/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; mydexpogo/1.0)' } });
  if (!res.ok) throw new Error(`promo: HTTP ${res.status}`);
  const html = await res.text();
  const codes: PromoCode[] = [];
  for (const card of html.split('class="promo-card"').slice(1)) {
    // Prefer the redemption link, fall back to the displayed code (attributes may vary).
    const code = /offer-redemption\?passcode=([A-Za-z0-9]+)/.exec(card)?.[1] ?? /class="text"[^>]*>\s*([A-Za-z0-9]+)\s*</.exec(card)?.[1];
    if (!code) continue;
    const title = strip(/class="title">(.*?)<\/h3>/s.exec(card)?.[1] ?? '');
    const description = strip(/class="description">(.*?)<\/div>/s.exec(card)?.[1] ?? '');
    const rewards = [...(/class="reward-list">(.*?)<\/ul>/s.exec(card)?.[1] ?? '').matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => strip(m[1]!)).filter(Boolean);
    codes.push({ code, title, description, rewards, redeemUrl: `https://store.pokemongo.com/offer-redemption?passcode=${code}` });
  }
  const active = html.split('class="promo-card"').length - 1;
  if (active > 0 && codes.length === 0) console.warn(`promo: ${active} active cards on Leek Duck but no code parsed, markup changed?`);
  cache = { at: Date.now(), codes };
  return codes;
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
