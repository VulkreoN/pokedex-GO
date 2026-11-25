/**
 * The game's own French, from its English and French texts (cached by the data pipeline): research task templates
 * ("Catch {0} Pokémon" -> "Attrape {0} Pokémon") and item names. Read again after each data update.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';

interface Texts {
  quests: { re: RegExp; fr: string }[];
  items: Map<string, string>;
}
let texts: Texts | null = null;
let loading: Promise<Texts | null> | null = null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function readMap(file: string): Promise<Map<string, string>> {
  const data = (JSON.parse(await readFile(path.join(env.dataDir, 'cache', file), 'utf8')) as { data: string[] }).data;
  const m = new Map<string, string>();
  for (let i = 0; i + 1 < data.length; i += 2) m.set(data[i]!, data[i + 1]!);
  return m;
}

/** Templates from the game's texts: research tasks and badge goals, without "Event Research:" style prefixes. */
export function buildTexts(en: Map<string, string>, fr: Map<string, string>): Texts {
  const quests: { re: RegExp; fr: string; literal: number }[] = [];
  const items = new Map<string, string>();
  for (const [k, v] of en) {
    const f = fr.get(k);
    if (!f) continue;
    if (/^item_.*_name$/.test(k)) items.set(v.toLowerCase(), f);
    if (!/^(quest_|badge_)/.test(k) || v.includes(': ') || /\{[^0-9]/.test(v)) continue;
    const plain = v.replace(/\.$/, '');
    try {
      quests.push({ re: new RegExp(`^${esc(plain).replace(/\\\{(\d)\\\}/g, '(?<p$1>.+?)')}\\.?$`, 'i'), fr: f.trim(), literal: plain.replace(/\{\d\}/g, '').length });
    } catch {}
  }
  // The most literal template wins ("Make {0} Great Curveball Throws in a row" before "Make {0} Throws").
  quests.sort((a, b) => b.literal - a.literal);
  return { quests, items };
}

async function load(): Promise<Texts | null> {
  if (texts) return texts;
  loading ??= Promise.all([readMap('textsEn.json'), readMap('textsFr.json')])
    .then(([en, fr]) => (texts = buildTexts(en, fr)))
    .catch(() => null)
    .finally(() => (loading = null));
  return loading;
}

/** After a data update: read the texts again. */
export const resetGameTexts = () => void (texts = null);

/** "Make 3 Great Throws in a row" -> "Fais 3 Super lancers à la suite"; null when the game has no such task. */
export function translateWith(t: Texts, text: string): string | null {
  for (const q of t.quests) {
    const m = q.re.exec(text.trim());
    if (!m) continue;
    const fr = q.fr.replace(/\{(\d)\}/g, (_, n: string) => m.groups?.[`p${n}`] ?? '');
    return text.trim().endsWith('.') ? fr : fr.replace(/\.$/, '');
  }
  return null;
}

export async function questFr(text: string): Promise<string | null> {
  const t = await load();
  return t ? translateWith(t, text) : null;
}

/** "Pinap Berry" -> "Baie Nanana", from the game's item names. */
export async function itemFr(name: string): Promise<string | null> {
  const t = await load();
  return t?.items.get(name.trim().toLowerCase()) ?? null;
}
