/** Reads one X post through the official oEmbed endpoint (no API key, no scraping). */

export interface OEmbedPost {
  id: string;
  url: string;
  author: string;
  authorUrl: string | null;
  text: string;
  html: string;
  links: string[];
  codes: string[];
  postedAt: Date | null;
}

const TWEET_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,20})\/status\/(\d{1,25})/;

export function parseTweetUrl(input: string): { handle: string; id: string } | null {
  const m = TWEET_URL.exec(input.trim());
  return m ? { handle: m[1]!, id: m[2]! } : null;
}

export async function fetchOEmbed(tweetUrl: string): Promise<OEmbedPost> {
  const parsed = parseTweetUrl(tweetUrl);
  if (!parsed) throw new Error('not a post url');
  const canonical = `https://x.com/${parsed.handle}/status/${parsed.id}`;
  const res = await fetch(`https://publish.x.com/oembed?url=${encodeURIComponent(canonical)}&omit_script=true&dnt=true&hide_thread=true`, {
    headers: { 'user-agent': 'mydexpogo/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`oembed: HTTP ${res.status}`);
  const data = (await res.json()) as { author_name: string; author_url?: string; html: string; url: string };
  return { id: parsed.id, url: canonical, author: data.author_name, authorUrl: data.author_url ?? null, ...parseEmbedHtml(data.html), html: data.html };
}

/** The oEmbed HTML is a blockquote: <p>text with <a href>links</a></p>&mdash; author (@handle) <a href=...>date</a>. */
export function parseEmbedHtml(html: string): { text: string; links: string[]; codes: string[]; postedAt: Date | null } {
  const p = /<p[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? html;
  const links = [...p.matchAll(/href="([^"]+)"/g)].map((m) => decode(m[1]!)).filter((u) => /^https?:\/\//i.test(u));
  let text = p.replace(/<br\s*\/?>/gi, '\n').replace(/<a[^>]*>(.*?)<\/a>/gs, '$1').replace(/<[^>]+>/g, '');
  text = decode(text).replace(/[ \t]+\n/g, '\n').trim();
  const codes = [...new Set([...links, text].flatMap((s) => [...s.matchAll(/passcode=([A-Za-z0-9]+)/g)].map((m) => m[1]!)))];
  const dateText = /<\/p>.*?<a href="[^"]+">([^<]+)<\/a>\s*<\/blockquote>/s.exec(html)?.[1];
  const postedAt = dateText ? new Date(`${dateText} 12:00:00 UTC`) : null; // day precision only, keep it timezone-proof
  return { text, links: [...new Set(links)], codes, postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null };
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ');
}
