/**
 * Field research from Leek Duck's research page, cached for an hour. Unlike ScrapedDuck's research.json, it keeps
 * event tasks apart (with their end) and the item rewards (balls, berries, stardust, candy...).
 */
import { tracked } from '../lib/health.js';

export interface ResearchReward {
  kind: 'encounter' | 'item' | 'resource';
  name: string;
  image: string;
  quantity?: number;
  /** Candy and Mega Energy: whose. */
  dex?: number;
  canBeShiny?: boolean;
  combatPower?: { min: number; max: number };
}
export interface ResearchCategory {
  title: string;
  /** Tasks only given during an event. */
  event: boolean;
  end: string | null;
  tasks: { text: string; rewards: ResearchReward[] }[];
}

let cache: { at: number; categories: ResearchCategory[] } | null = null;
/** Admin: fetch again on the next request. */
export const resetResearchCache = () => void (cache = null);

export async function getResearch(now = Date.now()): Promise<ResearchCategory[]> {
  if (!cache || now - cache.at >= 3600_000) {
    const categories = await tracked('research', async () => {
      const res = await fetch('https://leekduck.com/research/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; mydexpogo/1.0)' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`research: HTTP ${res.status}`);
      const parsed = parseResearch(await res.text());
      if (parsed.length === 0) throw new Error('research: no task parsed, markup changed?');
      return parsed;
    });
    cache = { at: now, categories };
  }
  // Event tasks stay on Leek Duck for a while after the event.
  return cache.categories.filter((c) => !c.end || Date.parse(c.end) > now);
}

export function parseResearch(html: string): ResearchCategory[] {
  const out: ResearchCategory[] = [];
  for (const chunk of html.split('<div class="task-category').slice(1)) {
    const head = chunk.slice(0, chunk.indexOf('>'));
    const title = strip(/<h2>(.*?)<\/h2>/s.exec(chunk)?.[1] ?? '');
    const end = /data-event-end="([^"]+)"/.exec(head)?.[1];
    const tasks = chunk
      .split('<li class="task-item"')
      .slice(1)
      .map((t) => ({
        text: strip(/class="task-text">(.*?)<\/span><ul/s.exec(t)?.[1] ?? ''),
        rewards: t.split('<li class="reward"').slice(1).flatMap(parseReward),
      }))
      .filter((t) => t.text);
    if (!title || tasks.length === 0) continue;
    const endDate = end ? new Date(end) : null;
    out.push({ title, event: /event-field-research/.test(head), end: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null, tasks });
  }
  return out;
}

function safeEncodeUrl(u: string): string {
  try {
    return encodeURI(decodeURI(u));
  } catch {
    return u;
  }
}

function parseReward(li: string): ResearchReward[] {
  const kind = /data-reward-type="([a-z]+)"/.exec(li)?.[1];
  const image = /class="reward-image" src="([^"]+)"/.exec(li)?.[1];
  const label = /class="reward-label">(.*?)<\/span>(?:<span class="cp-values"|<\/li>)/s.exec(li)?.[1];
  if (!image || !label || (kind !== 'encounter' && kind !== 'item' && kind !== 'resource')) return [];
  if (kind === 'encounter') {
    const cp = (k: string) => Number(new RegExp(`class="${k}-cp"><div>[^<]*</div>\\s*(\\d+)`).exec(li)?.[1]);
    const min = cp('min');
    const max = cp('max');
    return [{ kind, name: strip(label), image, canBeShiny: /shiny-badge/.test(li), ...(min && max ? { combatPower: { min, max } } : {}) }];
  }
  // "Pinap Berry <span>×3</span>": the quantity sits inside the label.
  const text = strip(label);
  const quantity = Number(/×\s*([\d,]+)/.exec(li)?.[1]?.replace(/,/g, '')) || undefined;
  const dex = kind === 'resource' ? Number(/pokemon_icons_crop\/pm(\d+)\./.exec(li)?.[1]) || undefined : undefined;
  return [{ kind, name: text.replace(/\s*×\s*[\d,]+$/, ''), image: safeEncodeUrl(image), ...(quantity ? { quantity } : {}), ...(dex ? { dex } : {}) }];
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
