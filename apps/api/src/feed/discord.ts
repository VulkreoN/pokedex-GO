/**
 * Reads messages from Discord channels with a bot token (REST, no gateway).
 * Intended for announcement channels followed from PokeMiners' server into your own.
 */
import { env } from '../env.js';

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  author: { username: string; bot?: boolean };
  attachments: { id: string; filename: string; size: number; url: string; content_type?: string }[];
  embeds: { title?: string; description?: string; url?: string; image?: { url: string }; thumbnail?: { url: string } }[];
}

const API = 'https://discord.com/api/v10';

export async function fetchMessages(channelId: string, afterId: string | null, limit = 50): Promise<DiscordMessage[]> {
  const url = new URL(`${API}/channels/${channelId}/messages`);
  url.searchParams.set('limit', String(limit));
  if (afterId) url.searchParams.set('after', afterId);
  const res = await fetch(url, { headers: { authorization: `Bot ${env.discordToken}`, 'user-agent': 'DiscordBot (mydexpogo, 1.0)' } });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after') ?? '5');
    await new Promise((r) => setTimeout(r, wait * 1000));
    return fetchMessages(channelId, afterId, limit);
  }
  if (!res.ok) throw new Error(`discord ${channelId}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const msgs = (await res.json()) as DiscordMessage[];
  return msgs.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)); // oldest first
}

/** Discord snowflake -> creation date (used for cursors on first run). */
export function snowflakeDate(id: string): Date {
  return new Date(Number(BigInt(id) >> 22n) + 1420070400000);
}
