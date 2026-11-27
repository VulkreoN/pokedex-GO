/** Official news from pokemongo.com: list page -> post pages, server-rendered HTML. */

export interface NewsPost {
  slug: string;
  url: string;
  title: string;
  text: string;
  image: string | null;
  postedAt: Date;
}

const UA = 'Mozilla/5.0 (compatible; mydexpogo/1.0)';

export async function listNewsSlugs(locale: string): Promise<string[]> {
  const res = await fetch(`https://pokemongo.com/${locale}/news`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`news list ${locale}: HTTP ${res.status}`);
  const html = await res.text();
  const slugs = [...html.matchAll(new RegExp(`href="/${locale}/news/([a-z0-9-]+)"`, 'g'))].map((m) => m[1]!);
  return [...new Set(slugs)];
}

export async function fetchNewsPost(locale: string, slug: string): Promise<NewsPost> {
  const url = `https://pokemongo.com/${locale}/news/${slug}`;
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`news ${slug}: HTTP ${res.status}`);
  const html = await res.text();
  const title = decode((/<title>(.*?)<\/title>/s.exec(html)?.[1] ?? slug).replace(/\s*[—|-]\s*Pokémon GO\s*$/i, '').trim());
  const body = html.replace(/<script.*?<\/script>|<style.*?<\/style>/gs, '');
  const main = /<article[^>]*>(.*?)<\/article>/s.exec(body)?.[1] ?? /<main[^>]*>(.*?)<\/main>/s.exec(body)?.[1] ?? body;
  const text = decode(main.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 20_000);
  const image = /property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? /<img[^>]+src="(https?:[^"]+\.(?:jpg|png|webp)[^"]*)"/.exec(main)?.[1] ?? null;
  const iso = [...html.matchAll(/"(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?)"/g)].map((m) => new Date(m[1]!)).filter((d) => !Number.isNaN(d.getTime()));
  const postedAt = iso.length ? new Date(Math.min(...iso.map((d) => d.getTime()))) : new Date();
  return { slug, url, title, text, image, postedAt };
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}
