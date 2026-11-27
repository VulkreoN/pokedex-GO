/**
 * Generates shareable PNG posters and A4 PDF infographics for Pokémon GO events and the weekly Mon–Sun schedule.
 * - Uses our dataset's CORS-safe Pokémon sprites (via `resolveLiveKey` + `fetchSpriteBlob`) so the canvas never taints.
 * - Applies the comprehensive French event dictionary (`eventTitle`, `bonusFr`, `eventTextFr`, `eventLabelFr`, move names).
 * - Tailors colors & layout to each of the 5 event templates (Max Battle, Community Day, Spotlight, Raid Day, Long Event).
 */
import {
  bonusFr,
  eventLabelFr,
  eventTextFr,
  eventTitle,
  moveFr,
  resolveLiveKey,
  type EventBonusItem,
  type EventDetailMon,
  type EventTemplateKind,
  type Lang,
  type LocalizedText,
  type RichGameEvent,
  type ToolPokemon,
  type ToolsData,
} from '@mydexpogo/shared';
import { TYPE_COLORS } from '../components/TypeBadge.js';
import { imageUrl, type DatasetIndex } from './dataset.js';
import { typeName } from './i18n.js';
import { dexFromImage, liveName, splitLiveLabel, type GameEvent } from './live.js';
import { fetchSpriteBlob, fileSlug, mapLimit } from './pdf.js';
import { downloadBlob } from './shareImage.js';

const FONT = '"Bricolage Grotesque Variable", system-ui, -apple-system, sans-serif';

interface PosterPalette {
  bgTop: string;
  bgBottom: string;
  heroStart: string;
  heroEnd: string;
  accent: string;
  accentSoft: string;
  cardBg: string;
  cardBorder: string;
  pillBg: string;
  pillText: string;
  badgeIcon: string;
}

const POSTER_PALETTES: Record<EventTemplateKind, PosterPalette> = {
  max: {
    bgTop: '#160726',
    bgBottom: '#0b0416',
    heroStart: '#3b0764',
    heroEnd: '#86198f',
    accent: '#e879f9',
    accentSoft: 'rgba(232,121,249,0.16)',
    cardBg: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(232,121,249,0.28)',
    pillBg: 'rgba(232,121,249,0.25)',
    pillText: '#fae8ff',
    badgeIcon: '⚡',
  },
  community_day: {
    bgTop: '#05241f',
    bgBottom: '#031312',
    heroStart: '#064e3b',
    heroEnd: '#0f766e',
    accent: '#34d399',
    accentSoft: 'rgba(52,211,153,0.16)',
    cardBg: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(52,211,153,0.28)',
    pillBg: 'rgba(52,211,153,0.24)',
    pillText: '#d1fae5',
    badgeIcon: '🌿',
  },
  spotlight: {
    bgTop: '#241405',
    bgBottom: '#140b03',
    heroStart: '#78350f',
    heroEnd: '#b45309',
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.16)',
    cardBg: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(251,191,36,0.32)',
    pillBg: 'rgba(251,191,36,0.25)',
    pillText: '#fef3c7',
    badgeIcon: '✨',
  },
  raid_day: {
    bgTop: '#26080b',
    bgBottom: '#140406',
    heroStart: '#7f1d1d',
    heroEnd: '#b91c1c',
    accent: '#fb7185',
    accentSoft: 'rgba(251,113,133,0.16)',
    cardBg: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(251,113,133,0.30)',
    pillBg: 'rgba(251,113,133,0.24)',
    pillText: '#ffe4e6',
    badgeIcon: '⚔️',
  },
  event: {
    bgTop: '#091533',
    bgBottom: '#050c1f',
    heroStart: '#0b1e49',
    heroEnd: '#1d4ed8',
    accent: '#fbbf24',
    accentSoft: 'rgba(56,189,248,0.16)',
    cardBg: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(125,211,252,0.26)',
    pillBg: 'rgba(251,191,36,0.24)',
    pillText: '#fef3c7',
    badgeIcon: '🗓️',
  },
};

export interface EventExportLabels {
  events_templates: Record<string, string>;
  events_debut: string;
  events_new_shiny: string;
  events_special_bg: string;
  events_new_move: string;
  events_super_max: string;
  events_evo_req: string;
  events_highlights: string;
  events_bonuses: string;
  events_bonuses_free: string;
  events_bonuses_ticket: string;
  events_spawns: string;
  events_raids: string;
  events_eggs: string;
  events_research: string;
  events_moves: string;
  events_gopass: string;
  events_gopass_free: string;
  events_gopass_deluxe: string;
  events_ticket: string;
  events_export_footer: string;
  new_badge: string;
  weekly_title: string;
  weekly_multiday: string;
  weekly_raids_new: string;
  weekly_today: string;
  weekly_all_day: string;
}

/** Translates an English Pokémon GO move name (including "+" / "++" suffixes) via the game master moveNames table. */
export function moveNameLocalized(
  raw: string,
  moveNames: Record<string, LocalizedText> | undefined,
  lang: Lang,
): string {
  return moveFr(raw, moveNames, lang);
}

const KNOWN_TYPES = new Set([
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]);
const DARK_INK_TYPES = new Set(['normal', 'fire', 'grass', 'electric', 'ice', 'ground', 'flying', 'bug', 'rock', 'steel', 'fairy']);

/** Extracts announced types from event highlight/summary prose (e.g. "a Fairy- and Flying-type Pokémon"). */
function announcedTypesFromEvent(event: RichGameEvent): ToolPokemon['types'] {
  const texts = [event.summary ?? '', ...event.highlights.map((h) => h.text)];
  for (const txt of texts) {
    const dual = /\ban?\s+([A-Za-z]+)-?\s+and\s+([A-Za-z]+)-type\s+Pok[eé]mon/i.exec(txt);
    if (dual) {
      const t1 = dual[1]!.toLowerCase();
      const t2 = dual[2]!.toLowerCase();
      if (KNOWN_TYPES.has(t1) && KNOWN_TYPES.has(t2)) return [t1, t2] as ToolPokemon['types'];
    }
    const single = /\ban?\s+([A-Za-z]+)-type\s+Pok[eé]mon/i.exec(txt);
    if (single) {
      const t1 = single[1]!.toLowerCase();
      if (KNOWN_TYPES.has(t1)) return [t1] as ToolPokemon['types'];
    }
  }
  return [];
}

export interface ResolvedHeroMon {
  mon: EventDetailMon;
  image: string;
  label: string;
  types: ToolPokemon['types'];
  counterTarget: ToolPokemon | null;
}

/**
 * Promotes featured hero Pokémon to their actual Mega / Gigantamax form on Mega Raid Days and Gigantamax events
 * (Leek Duck often shows the post-raid catchable base sprite like Clefable on Mega Clefable Super Mega Raid Day),
 * and resolves their accurate types + Raid Counters target!
 */
export function resolveHeroMon(
  event: RichGameEvent,
  m: EventDetailMon,
  idx: DatasetIndex | undefined,
  tools: ToolsData | undefined,
  lang: Lang,
): ResolvedHeroMon {
  const dex = dexFromImage(m.image);
  const sp = dex ? idx?.speciesByDex.get(dex) : undefined;
  const isMegaEvent =
    (event.template === 'raid_day' && /\bmega\b/i.test(event.name)) ||
    event.highlights.some((h) => /\bmega\b/i.test(h.title));
  const isGmaxEvent = event.template === 'max' && /gigantamax/i.test(event.name);
  const isPrimal = /\bprimal\b/i.test(m.name) || /\.fPRIMAL\b/i.test(m.image);
  const alreadyMega = /\bmega\b/i.test(m.name) || /\.fMEGA\b/i.test(m.image);
  const alreadyGmax = /gigantamax/i.test(m.name) || /\.fGIGANTAMAX/i.test(m.image);

  let image = m.image;
  let enName = m.name;
  let variantKey = idx ? resolveLiveKey(m.image, m.name, idx.hunt) : null;
  let promotedMega = alreadyMega || isPrimal;
  let synthesizedMega = false;

  if (idx && dex && isMegaEvent && !alreadyMega && !isPrimal) {
    const megaV = idx.variantsByDex.get(dex)?.find((v) => v.kind === 'mega');
    if (megaV) {
      const url = imageUrl(idx, megaV, false);
      if (url) image = url;
      variantKey = megaV.key;
      enName = sp ? `Mega ${sp.name.en}` : `Mega ${m.name}`;
      promotedMega = true;
      synthesizedMega = true;
    }
  } else if (idx && dex && isGmaxEvent && !alreadyGmax) {
    const gmaxV = idx.variantsByDex.get(dex)?.find((v) => v.kind === 'gmax');
    if (gmaxV) {
      const url = imageUrl(idx, gmaxV, false);
      if (url) image = url;
      variantKey = gmaxV.key;
      enName = sp ? `Gigantamax ${sp.name.en}` : `Gigantamax ${m.name}`;
    }
  }

  const label = synthesizedMega && sp
    ? lang === 'fr'
      ? `Méga-${sp.name.fr ?? sp.name.en}`
      : `Mega ${sp.name.en}`
    : liveName(enName, m.image, idx, lang);

  // Resolve types: exact tools variant > announced event types (for brand-new Megas like Mega Clefable) > species types
  const exactTool = tools?.pokemon.find((p) => (variantKey && p.key === variantKey) || (promotedMega && dex && p.dex === dex && p.mega));
  const baseTool = dex ? tools?.pokemon.find((p) => p.dex === dex && !p.mega) : undefined;
  const announced = promotedMega ? announcedTypesFromEvent(event) : [];
  const types = exactTool?.types?.length
    ? exactTool.types
    : announced.length
      ? announced
      : baseTool?.types?.length
        ? baseTool.types
        : (sp?.types ?? []);

  let counterTarget: ToolPokemon | null = exactTool ?? null;
  if (!counterTarget && baseTool) {
    counterTarget = promotedMega
      ? {
          ...baseTool,
          key: variantKey ?? `${baseTool.dex}.fMEGA`,
          mega: true,
          types: types.length ? types : baseTool.types,
        }
      : baseTool;
  }

  return { mon: m, image, label, types, counterTarget };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 6): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current) {
    const remainingStart = lines.join(' ').length;
    const leftover = text.replace(/\s+/g, ' ').trim().slice(remainingStart).trim();
    lines.push(fitText(ctx, lines.length === maxLines - 1 && leftover.length > current.length ? leftover : current, maxWidth));
  }
  return lines.slice(0, maxLines);
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#fbbf24') {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPokeballWatermark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx - r * 0.34, cy);
  ctx.moveTo(cx + r * 0.34, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });

const PROXY_FIRST_HOSTS = new Set(['cdn.leekduck.com', 'leekduck.com', 'www.leekduck.com']);
const PROXYABLE_HOSTS = new Set([...PROXY_FIRST_HOSTS, 'raw.githubusercontent.com', 'trade.pokemongopro.com']);

async function fetchProxiedBlob(url: string, timeoutMs: number): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/game/asset?url=${encodeURIComponent(url)}`, {
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches an image blob CORS-safely, using our same-origin `/api/game/asset` proxy for non-CORS hosts like Leek Duck. */
async function fetchCorsSafeBlob(url: string, timeoutMs = 4_500): Promise<Blob | null> {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url, location.origin);
  } catch {}

  if (parsed && parsed.protocol === 'https:' && PROXY_FIRST_HOSTS.has(parsed.hostname)) {
    const proxied = await fetchProxiedBlob(parsed.toString(), timeoutMs + 2_000);
    if (proxied) return proxied;
    return await fetchSpriteBlob(url, timeoutMs);
  }

  const direct = await fetchSpriteBlob(url, timeoutMs);
  if (direct) return direct;
  if (parsed && parsed.protocol === 'https:' && PROXYABLE_HOSTS.has(parsed.hostname)) {
    return await fetchProxiedBlob(parsed.toString(), timeoutMs + 2_000);
  }
  return null;
}

/**
 * Resolves each Pokémon image in priority order:
 * 1. Exact matching variant in our CORS-native dataset (when `resolveLiveKey` matched the exact form/costume),
 * 2. Exact page asset `item.image` (fetched via `/api/game/asset` proxy if hosted on Leek Duck — preserves brand-new costumes!),
 * 3. Species cover sprite from our dataset only if both above fail.
 */
async function loadSprites(
  items: { image: string; name?: string }[],
  idx: DatasetIndex | undefined,
): Promise<{ byKey: Map<string, HTMLImageElement>; cleanup: () => void }> {
  const urlForItem = (item: { image: string; name?: string }): string[] => {
    const candidates: string[] = [];
    let fallbackUrl: string | null = null;
    if (idx) {
      const resolvedKey = resolveLiveKey(item.image, item.name ?? '', idx.hunt);
      const exactVariant = resolvedKey ? idx.variantByKey.get(resolvedKey) : undefined;
      const exactUrl = exactVariant ? imageUrl(idx, exactVariant, false) : null;
      if (exactUrl) candidates.push(exactUrl);
      const dex = dexFromImage(item.image);
      const cover = dex ? idx.coverOf.get(dex) : undefined;
      fallbackUrl = cover ? imageUrl(idx, cover, false) : null;
    }
    if (item.image) candidates.push(item.image);
    if (fallbackUrl) candidates.push(fallbackUrl);
    return [...new Set(candidates)];
  };

  const uniqueKeys = [...new Set(items.map((i) => i.image).filter(Boolean))];
  const itemByImg = new Map<string, { image: string; name?: string }>();
  for (const it of items) if (it.image && !itemByImg.has(it.image)) itemByImg.set(it.image, it);

  const objUrls: string[] = [];
  const byKey = new Map<string, HTMLImageElement>();

  await mapLimit(uniqueKeys, 8, async (imgKey) => {
    const item = itemByImg.get(imgKey)!;
    for (const url of urlForItem(item)) {
      const blob = await fetchCorsSafeBlob(url, 4_500);
      if (!blob) continue;
      const objUrl = URL.createObjectURL(blob);
      objUrls.push(objUrl);
      const el = await loadImageElement(objUrl);
      if (el && el.naturalWidth > 0) {
        byKey.set(imgKey, el);
        return;
      }
    }
  });

  return {
    byKey,
    cleanup: () => objUrls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

/** Loads raw page assets (bonus icons, event hero banner) directly with CORS-safe proxy fallback. */
async function loadRawAssets(urls: (string | null | undefined)[]): Promise<{ byUrl: Map<string, HTMLImageElement>; cleanup: () => void }> {
  const unique = [...new Set(urls.filter((u): u is string => !!u && !u.includes('default')))];
  const objUrls: string[] = [];
  const byUrl = new Map<string, HTMLImageElement>();

  await mapLimit(unique, 8, async (url) => {
    const blob = await fetchCorsSafeBlob(url, 4_500);
    if (!blob) return;
    const objUrl = URL.createObjectURL(blob);
    objUrls.push(objUrl);
    const el = await loadImageElement(objUrl);
    if (el && el.naturalWidth > 0) byUrl.set(url, el);
  });

  return {
    byUrl,
    cleanup: () => objUrls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawSpriteOrFallback(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  size: number,
) {
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    return;
  }
  drawPokeballWatermark(ctx, x + size / 2, y + size / 2, size * 0.34, 'rgba(255,255,255,0.28)');
}

function drawDateTiles(
  ctx: CanvasRenderingContext2D,
  start: string | null,
  end: string | null,
  lang: Lang,
  rightX: number,
  topY: number,
) {
  if (!start) return;
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  if (Number.isNaN(s.getTime())) return;
  const monthFmt = new Intl.DateTimeFormat(lang, { month: 'short' });
  const timeFmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
  const sameDay = !e || s.toDateString() === e.toDateString();

  const drawOne = (d: Date, x: number, y: number, w: number, sub?: string) => {
    const h = sub ? 96 : 74;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = `900 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(d.getDate()), x + w / 2, y + 36);

    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(x, y + 46, w, 24);
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(monthFmt.format(d).replace(/\.$/, '').toUpperCase(), x + w / 2, y + 63);

    if (sub) {
      ctx.save();
      roundRect(ctx, x, y + 70, w, 26, 0);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(sub, x + w / 2, y + 88);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  };

  if (sameDay) {
    const w = 96;
    drawOne(s, rightX - w, topY, w);
    const windowStr = `${timeFmt.format(s)}${e ? ` – ${timeFmt.format(e)}` : ''}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(windowStr, rightX - w / 2, topY + 96);
    ctx.textAlign = 'left';
  } else {
    const w = 88;
    const gap = 10;
    if (e) {
      drawOne(s, rightX - w * 2 - gap, topY, w, timeFmt.format(s));
      drawOne(e, rightX - w, topY, w, timeFmt.format(e));
    } else {
      drawOne(s, rightX - w, topY, w, timeFmt.format(s));
    }
  }
}

/** Renders a full Event Infographic poster onto an HTMLCanvasElement (caller must clear canvas dimensions when done). */
async function buildEventInfographicCanvas(
  event: RichGameEvent,
  idx: DatasetIndex | undefined,
  lang: Lang,
  t: EventExportLabels,
  tools?: ToolsData,
): Promise<HTMLCanvasElement> {
  const W = 1080;
  const PAD = 44;
  const CW = W - 2 * PAD;
  const pal = POSTER_PALETTES[event.template];
  const moveNames = tools?.moveNames;

  const resolvedHero = event.featured.map((m) => resolveHeroMon(event, m, idx, tools, lang));

  // Collect all Pokémon sprites + page bonus icons & hero banner to load once (CORS-safe)
  const allMons: { image: string; name?: string }[] = [
    ...resolvedHero.map((h) => ({ image: h.image, name: h.label })),
    ...event.highlights.flatMap((h) => h.mons ?? []),
    ...event.spawnGroups.flatMap((g) => g.mons),
    ...event.raidGroups.flatMap((g) => g.mons),
    ...event.eggGroups.flatMap((g) => g.mons),
    ...event.research,
    ...event.rocket,
    ...event.moves.flatMap((m) => m.mons),
  ];
  const rawAssetUrls: (string | null | undefined)[] = [
    event.image,
    ...event.bonuses.map((b) => b.image),
    ...(event.ticket?.bonuses ?? []).map((b) => b.image),
  ];
  const [{ byKey: sprites, cleanup: cleanupSprites }, { byUrl: rawAssets, cleanup: cleanupAssets }] = await Promise.all([
    loadSprites(allMons, idx),
    loadRawAssets(rawAssetUrls),
  ]);
  const cleanup = () => {
    cleanupSprites();
    cleanupAssets();
  };

  // Measure canvas context
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = W;
  measureCanvas.height = 10;
  const mctx = measureCanvas.getContext('2d')!;

  const title = eventTitle(event.name, idx?.speciesByDex, lang);
  const summary = event.summary ? eventTextFr(event.summary, idx?.speciesByDex, lang, moveNames) : '';
  const templateLabel = `${pal.badgeIcon}  ${(t.events_templates[event.template] ?? event.heading).toUpperCase()}`;

  // Prepare hero metrics
  const hasDateTiles = !!event.start;
  const dateBlockW = hasDateTiles ? (event.end && new Date(event.start!).toDateString() !== new Date(event.end).toDateString() ? 200 : 120) : 0;
  const heroTextW = CW - 56 - dateBlockW;

  mctx.font = `900 42px ${FONT}`;
  const titleLines = wrapWords(mctx, title, heroTextW, 3);
  mctx.font = `500 20px ${FONT}`;
  const summaryLines = summary ? wrapWords(mctx, summary, heroTextW, 3) : [];
  const showHeroShowcase = (event.template === 'max' || event.template === 'spotlight' || event.template === 'raid_day') && resolvedHero.length > 0;

  const heroTopH = Math.max(120, 44 + titleLines.length * 48 + (summaryLines.length ? 12 + summaryLines.length * 26 : 0));
  const heroShowcaseH = showHeroShowcase ? 232 : 0;
  const heroH = 28 + heroTopH + (showHeroShowcase ? 18 + heroShowcaseH : 0) + 28;

  // Layout sections
  interface SectionPlan {
    height: number;
    draw: (ctx: CanvasRenderingContext2D, topY: number) => void;
  }
  const sections: SectionPlan[] = [];

  const monCols = 6;
  const monGap = 14;
  const monTileW = Math.floor((CW - 32 - (monCols - 1) * monGap) / monCols);
  const monTileH = 152;

  const drawMonGrid = (ctx: CanvasRenderingContext2D, mons: EventDetailMon[], startX: number, startY: number) => {
    mons.forEach((m, i) => {
      const col = i % monCols;
      const row = Math.floor(i / monCols);
      const tx = startX + col * (monTileW + monGap);
      const ty = startY + row * (monTileH + monGap);
      roundRect(ctx, tx, ty, monTileW, monTileH, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.strokeStyle = m.newShiny ? 'rgba(251,191,36,0.75)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = m.newShiny ? 2 : 1;
      ctx.stroke();

      drawSpriteOrFallback(ctx, sprites.get(m.image), tx + (monTileW - 82) / 2, ty + 8, 82);
      if (m.canBeShiny) sparkle(ctx, tx + monTileW - 18, ty + 18, 9, '#fbbf24');
      if (m.newShiny) {
        roundRect(ctx, tx + 10, ty + 72, monTileW - 20, 18, 9);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = `900 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(t.new_badge.toUpperCase(), tx + monTileW / 2, ty + 85);
        ctx.textAlign = 'left';
      }

      const fullName = liveName(m.name, m.image, idx, lang);
      const { main, form } = splitLiveLabel(fullName);
      ctx.textAlign = 'center';
      if (form) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = `700 15px ${FONT}`;
        ctx.fillText(fitText(ctx, main, monTileW - 12), tx + monTileW / 2, ty + 111);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = `600 12px ${FONT}`;
        const fLines = wrapWords(ctx, form, monTileW - 12, 2);
        fLines.forEach((line, li) => ctx.fillText(line, tx + monTileW / 2, ty + 128 + li * 14));
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.font = `700 15px ${FONT}`;
        const lines = wrapWords(ctx, main, monTileW - 14, 2);
        lines.forEach((line, li) => ctx.fillText(line, tx + monTileW / 2, ty + 116 + li * 18));
      }
      ctx.textAlign = 'left';
    });
  };

  const sectionHeader = (ctx: CanvasRenderingContext2D, label: string, x: number, y: number) => {
    ctx.fillStyle = pal.accent;
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x, y + 18);
  };

  // 1. Highlights
  if (event.highlights.length > 0) {
    const items = event.highlights.map((h) => {
      const hTitle = eventLabelFr(h.title, lang, idx?.speciesByDex, moveNames);
      const hText = h.text ? eventTextFr(h.text, idx?.speciesByDex, lang, moveNames) : '';
      mctx.font = `500 19px ${FONT}`;
      const lines = hText ? wrapWords(mctx, hText, CW - 56, 4) : [];
      const monRows = h.mons?.length ? Math.ceil(h.mons.length / monCols) : 0;
      const hCard = 50 + lines.length * 25 + (monRows ? 14 + monRows * (monTileH + monGap) : 0) + 14;
      return { h, hTitle, lines, hCard };
    });
    const totalH = 34 + items.reduce((sum, it) => sum + it.hCard + 12, 0);
    sections.push({
      height: totalH,
      draw: (ctx, topY) => {
        sectionHeader(ctx, t.events_highlights, PAD, topY);
        let y = topY + 32;
        for (const { h, hTitle, lines, hCard } of items) {
          roundRect(ctx, PAD, y, CW, hCard, 18);
          ctx.fillStyle = pal.cardBg;
          ctx.fill();
          ctx.strokeStyle = pal.cardBorder;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = pal.accent;
          ctx.font = `800 19px ${FONT}`;
          ctx.fillText(`★  ${hTitle}`, PAD + 22, y + 32);

          ctx.fillStyle = 'rgba(241,245,249,0.92)';
          ctx.font = `500 19px ${FONT}`;
          lines.forEach((line, li) => ctx.fillText(line, PAD + 22, y + 62 + li * 25));

          if (h.mons?.length) {
            drawMonGrid(ctx, h.mons, PAD + 16, y + 54 + lines.length * 25 + 10);
          }
          y += hCard + 12;
        }
      },
    });
  }

  // 2. Free bonuses (2-column cards, grouped)
  const freeBonuses = event.bonuses.filter((b) => !b.paid);
  const deluxeBonuses = event.bonuses.filter((b) => b.paid);

  const planBonuses = (heading: string, list: EventBonusItem[], accentBorder?: string) => {
    const grouped = new Map<string, EventBonusItem[]>();
    for (const b of list) {
      const k = b.group ?? '';
      (grouped.get(k) ?? grouped.set(k, []).get(k)!).push(b);
    }
    const colGap = 14;
    const colW = (CW - colGap) / 2;
    type BonusCell = { lines: string[]; image?: string | null };
    const prepared = [...grouped.entries()].map(([group, items]) => {
      const gLabel = group ? eventLabelFr(group, lang, idx?.speciesByDex, moveNames) : '';
      const rows: { left: BonusCell; right?: BonusCell; h: number }[] = [];
      mctx.font = `600 19px ${FONT}`;
      for (let i = 0; i < items.length; i += 2) {
        const leftItem = items[i]!;
        const rightItem = items[i + 1];
        const lWidth = rightItem ? colW - 76 : CW - 76;
        const lLines = wrapWords(mctx, bonusFr(leftItem.text, idx?.speciesByDex, lang), lWidth, 3);
        const rLines = rightItem ? wrapWords(mctx, bonusFr(rightItem.text, idx?.speciesByDex, lang), colW - 76, 3) : undefined;
        const maxL = Math.max(lLines.length, rLines?.length ?? 0);
        rows.push({
          left: { lines: lLines, image: leftItem.image },
          ...(rLines ? { right: { lines: rLines, image: rightItem?.image } } : {}),
          h: Math.max(62, 28 + maxL * 24),
        });
      }
      const gH = (gLabel ? 32 : 0) + rows.reduce((s, r) => s + r.h + 10, 0);
      return { gLabel, rows, gH };
    });
    const totalH = 34 + prepared.reduce((s, g) => s + g.gH + 8, 0);
    sections.push({
      height: totalH,
      draw: (ctx, topY) => {
        sectionHeader(ctx, heading, PAD, topY);
        let y = topY + 34;
        for (const g of prepared) {
          if (g.gLabel) {
            ctx.font = `800 15px ${FONT}`;
            const pillW = Math.min(CW, ctx.measureText(g.gLabel).width + 26);
            roundRect(ctx, PAD, y, pillW, 26, 13);
            ctx.fillStyle = pal.pillBg;
            ctx.fill();
            ctx.fillStyle = pal.pillText;
            ctx.fillText(g.gLabel, PAD + 13, y + 18);
            y += 34;
          }
          for (const row of g.rows) {
            const drawBonusCard = (x: number, w: number, cell: BonusCell) => {
              roundRect(ctx, x, y, w, row.h, 16);
              ctx.fillStyle = pal.cardBg;
              ctx.fill();
              ctx.strokeStyle = accentBorder ?? pal.cardBorder;
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Reuse the real Leek Duck bonus icon from the page when available; fall back to a neutral '+' badge if missing (never a shiny star).
              const icon = cell.image ? rawAssets.get(cell.image) : undefined;
              if (icon) {
                const iconSize = 36;
                const scale = Math.min(iconSize / icon.naturalWidth, iconSize / icon.naturalHeight);
                const dw = icon.naturalWidth * scale;
                const dh = icon.naturalHeight * scale;
                ctx.drawImage(icon, x + 14 + (iconSize - dw) / 2, y + (row.h - dh) / 2, dw, dh);
              } else {
                const cx = x + 31;
                const cy = y + row.h / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, 13, 0, Math.PI * 2);
                ctx.fillStyle = pal.accentSoft;
                ctx.fill();
                ctx.strokeStyle = pal.accent;
                ctx.lineWidth = 2.4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(cx - 5, cy);
                ctx.lineTo(cx + 5, cy);
                ctx.moveTo(cx, cy - 5);
                ctx.lineTo(cx, cy + 5);
                ctx.stroke();
              }

              ctx.fillStyle = '#f8fafc';
              ctx.font = `600 19px ${FONT}`;
              const startTextY = y + (row.h - (cell.lines.length - 1) * 24) / 2 + 6;
              cell.lines.forEach((line, li) => ctx.fillText(line, x + 60, startTextY + li * 24));
            };
            if (row.right) {
              drawBonusCard(PAD, colW, row.left);
              drawBonusCard(PAD + colW + colGap, colW, row.right);
            } else {
              drawBonusCard(PAD, CW, row.left);
            }
            y += row.h + 10;
          }
          y += 6;
        }
      },
    });
  };

  if (freeBonuses.length > 0) {
    planBonuses(event.ticket ? t.events_bonuses_free : t.events_bonuses, freeBonuses);
  }

  // 3. Mon group helper (Spawns / Raids / Eggs / Research / Rocket)
  const planMonGroups = (heading: string, groups: { label: string; mons: EventDetailMon[] }[], note?: string | null) => {
    const nonEmpty = groups.filter((g) => g.mons.length > 0);
    if (!nonEmpty.length && !note) return;
    const noteText = note ? eventTextFr(note, idx?.speciesByDex, lang, moveNames) : '';
    mctx.font = `500 18px ${FONT}`;
    const noteLines = noteText ? wrapWords(mctx, noteText, CW - 44, 3) : [];
    const prepared = nonEmpty.map((g) => {
      const showSub = g.label && g.label !== 'Spawns' && g.label !== heading;
      const rows = Math.ceil(g.mons.length / monCols);
      const h = (showSub ? 34 : 0) + rows * (monTileH + monGap) - monGap + 28;
      return { label: showSub ? eventLabelFr(g.label, lang, idx?.speciesByDex, moveNames) : '', mons: g.mons, h };
    });
    const noteH = noteLines.length ? 22 + noteLines.length * 23 : 0;
    const totalH = 34 + noteH + prepared.reduce((s, g) => s + g.h + 12, 0);
    sections.push({
      height: totalH,
      draw: (ctx, topY) => {
        sectionHeader(ctx, heading, PAD, topY);
        let y = topY + 32;
        if (noteLines.length) {
          ctx.fillStyle = 'rgba(226,232,240,0.85)';
          ctx.font = `500 18px ${FONT}`;
          noteLines.forEach((line, li) => ctx.fillText(line, PAD + 4, y + 18 + li * 23));
          y += noteH;
        }
        for (const g of prepared) {
          roundRect(ctx, PAD, y, CW, g.h, 20);
          ctx.fillStyle = pal.cardBg;
          ctx.fill();
          ctx.strokeStyle = pal.cardBorder;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          let innerY = y + 14;
          if (g.label) {
            ctx.fillStyle = '#e2e8f0';
            ctx.font = `800 18px ${FONT}`;
            ctx.fillText(g.label, PAD + 18, innerY + 18);
            innerY += 32;
          }
          drawMonGrid(ctx, g.mons, PAD + 16, innerY);
          y += g.h + 12;
        }
      },
    });
  };

  if (event.spawnGroups.length > 0) planMonGroups(t.events_spawns, event.spawnGroups);
  if (event.raidGroups.length > 0) planMonGroups(t.events_raids, event.raidGroups);
  if (event.eggGroups.length > 0) planMonGroups(t.events_eggs, event.eggGroups);
  if (event.research.length > 0 || event.researchNote) {
    planMonGroups(t.events_research, event.research.length ? [{ label: '', mons: event.research }] : [], event.researchNote);
  }
  if (event.rocket.length > 0) planMonGroups('Team GO Rocket', [{ label: '', mons: event.rocket }]);

  // 4. Exclusive Moves
  if (event.moves.length > 0) {
    const colGap = 14;
    const colW = (CW - colGap) / 2;
    const rows = Math.ceil(event.moves.length / 2);
    const cardH = 74;
    const totalH = 34 + rows * (cardH + 10);
    sections.push({
      height: totalH,
      draw: (ctx, topY) => {
        sectionHeader(ctx, t.events_moves, PAD, topY);
        event.moves.forEach((mv, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = PAD + col * (colW + colGap);
          const y = topY + 34 + row * (cardH + 10);
          roundRect(ctx, x, y, colW, cardH, 16);
          ctx.fillStyle = pal.cardBg;
          ctx.fill();
          ctx.strokeStyle = pal.cardBorder;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (mv.mons[0]) drawSpriteOrFallback(ctx, sprites.get(mv.mons[0].image), x + 12, y + 11, 52);
          const textX = mv.mons[0] ? x + 76 : x + 20;
          ctx.fillStyle = '#ffffff';
          ctx.font = `800 19px ${FONT}`;
          ctx.fillText(fitText(ctx, bonusFr(mv.pokemon, idx?.speciesByDex, lang), colW - (textX - x) - 14), textX, y + 32);
          ctx.fillStyle = pal.accent;
          ctx.font = `600 17px ${FONT}`;
          ctx.fillText(fitText(ctx, moveNameLocalized(mv.move, moveNames, lang), colW - (textX - x) - 14), textX, y + 56);
        });
      },
    });
  }

  // 5. GO Pass & Deluxe
  if (event.goPass || deluxeBonuses.length > 0) {
    type PassRow = { lines: string[]; image?: string | null; hasIcon: boolean };
    const freeItems = (event.goPass?.freeRewards ?? []).map((r) => ({ text: bonusFr(r, idx?.speciesByDex, lang), image: null as string | null }));
    const deluxeItems = [
      ...deluxeBonuses.map((b) => ({ text: bonusFr(b.text, idx?.speciesByDex, lang), image: b.image ?? null })),
      ...(event.goPass?.deluxeRewards ?? []).map((r) => ({ text: bonusFr(r, idx?.speciesByDex, lang), image: null as string | null })),
    ];
    const hasTwoCols = freeItems.length > 0 && deluxeItems.length > 0;
    const colW = hasTwoCols ? (CW - 52) / 2 : CW - 40;
    mctx.font = `600 18px ${FONT}`;
    const preparePassRows = (items: { text: string; image: string | null }[]): PassRow[] =>
      items.map((it) => {
        const hasIcon = !!(it.image && rawAssets.get(it.image));
        return {
          image: it.image,
          hasIcon,
          lines: wrapWords(mctx, hasIcon ? it.text : `• ${it.text}`, colW - (hasIcon ? 56 : 24), 2),
        };
      });
    const freeWrapped = preparePassRows(freeItems);
    const deluxeWrapped = preparePassRows(deluxeItems);
    const colHeight = (arr: PassRow[]) =>
      arr.length ? 34 + arr.reduce((s, r) => s + Math.max(r.hasIcon ? 26 : 23, r.lines.length * 23) + 6, 0) + 12 : 0;
    const bodyH = hasTwoCols ? Math.max(colHeight(freeWrapped), colHeight(deluxeWrapped)) : colHeight(freeWrapped) + colHeight(deluxeWrapped);
    const totalH = 56 + bodyH + 22;

    sections.push({
      height: totalH,
      draw: (ctx, topY) => {
        roundRect(ctx, PAD, topY, CW, totalH, 22);
        ctx.fillStyle = 'rgba(251,191,36,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.50)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.font = `900 22px ${FONT}`;
        const gpTitle = `🎫  ${event.goPass?.title ? eventTitle(event.goPass.title, idx?.speciesByDex, lang) : t.events_gopass}`;
        ctx.fillText(gpTitle, PAD + 22, topY + 36);
        if (event.goPass?.price) {
          const pText = `${t.events_gopass_deluxe} · ${event.goPass.price}`;
          ctx.font = `800 15px ${FONT}`;
          const pw = ctx.measureText(pText).width + 24;
          roundRect(ctx, PAD + CW - 22 - pw, topY + 14, pw, 28, 14);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.fillText(pText, PAD + CW - 22 - pw + 12, topY + 33);
        }

        const drawCol = (x: number, y: number, w: number, h: number, heading: string, headingColor: string, rows: PassRow[]) => {
          roundRect(ctx, x, y, w, h, 14);
          ctx.fillStyle = 'rgba(15,23,42,0.55)';
          ctx.fill();
          ctx.fillStyle = headingColor;
          ctx.font = `800 15px ${FONT}`;
          ctx.fillText(heading.toUpperCase(), x + 14, y + 24);
          ctx.fillStyle = '#f8fafc';
          ctx.font = `600 18px ${FONT}`;
          let cy = y + 48;
          for (const r of rows) {
            const icon = r.image ? rawAssets.get(r.image) : undefined;
            if (icon) {
              const sz = 22;
              const sc = Math.min(sz / icon.naturalWidth, sz / icon.naturalHeight);
              ctx.drawImage(icon, x + 14 + (sz - icon.naturalWidth * sc) / 2, cy - 16 + (sz - icon.naturalHeight * sc) / 2, icon.naturalWidth * sc, icon.naturalHeight * sc);
            }
            const tx = icon ? x + 44 : x + 14;
            const rowH = Math.max(icon ? 26 : 23, r.lines.length * 23);
            r.lines.forEach((line, li) => ctx.fillText(line, tx, cy + li * 23));
            cy += rowH + 6;
          }
        };

        const cy = topY + 54;
        if (hasTwoCols) {
          drawCol(PAD + 20, cy, colW, bodyH, t.events_gopass_free, '#cbd5e1', freeWrapped);
          drawCol(PAD + 32 + colW, cy, colW, bodyH, `👑 ${t.events_gopass_deluxe}`, '#fbbf24', deluxeWrapped);
        } else if (freeWrapped.length) {
          drawCol(PAD + 20, cy, colW, bodyH, t.events_gopass_free, '#cbd5e1', freeWrapped);
        } else if (deluxeWrapped.length) {
          drawCol(PAD + 20, cy, colW, bodyH, `👑 ${t.events_gopass_deluxe}`, '#fbbf24', deluxeWrapped);
        }
      },
    });
  }

  // 6. Paid Event Ticket
  if (event.ticket) {
    const rewards = event.ticket.rewards.map((r) => bonusFr(r, idx?.speciesByDex, lang));
    const tBonuses = event.ticket.bonuses.map((b) => ({ text: bonusFr(b.text, idx?.speciesByDex, lang), image: b.image }));
    mctx.font = `700 17px ${FONT}`;
    // Lay out rewards as wrapping pills
    const pillRows: { text: string; w: number }[][] = [];
    let curRow: { text: string; w: number }[] = [];
    let curW = 0;
    for (const r of rewards) {
      const pw = Math.min(CW - 44, ctxWidth(mctx, r) + 28);
      if (curW + pw + (curRow.length ? 10 : 0) > CW - 44 && curRow.length) {
        pillRows.push(curRow);
        curRow = [];
        curW = 0;
      }
      curRow.push({ text: r, w: pw });
      curW += pw + (curRow.length > 1 ? 10 : 0);
    }
    if (curRow.length) pillRows.push(curRow);

    mctx.font = `600 18px ${FONT}`;
    const bLines = tBonuses.map((b) => {
      const hasIcon = !!(b.image && rawAssets.get(b.image));
      return {
        image: b.image,
        hasIcon,
        lines: wrapWords(mctx, hasIcon ? b.text : `• ${b.text}`, CW - (hasIcon ? 84 : 56), 2),
      };
    });
    const totalH =
      58 +
      (pillRows.length ? pillRows.length * 42 + 8 : 0) +
      (bLines.length ? 26 + bLines.reduce((s, item) => s + Math.max(item.hasIcon ? 28 : 24, item.lines.length * 24) + 6, 0) : 0) +
      16;

    sections.push({
      height: totalH,
      draw: (ctx, topY) => {
        roundRect(ctx, PAD, topY, CW, totalH, 22);
        ctx.fillStyle = 'rgba(217,70,239,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,121,249,0.48)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f5d0fe';
        ctx.font = `900 22px ${FONT}`;
        const tkTitle = `🎟️  ${eventLabelFr(event.ticket!.title, lang, idx?.speciesByDex, moveNames) || t.events_ticket}`;
        ctx.fillText(tkTitle, PAD + 22, topY + 36);
        if (event.ticket!.price) {
          ctx.font = `800 16px ${FONT}`;
          const pw = ctx.measureText(event.ticket!.price).width + 24;
          roundRect(ctx, PAD + CW - 22 - pw, topY + 14, pw, 28, 14);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.fillText(event.ticket!.price, PAD + CW - 22 - pw + 12, topY + 33);
        }

        let y = topY + 56;
        ctx.font = `700 17px ${FONT}`;
        for (const row of pillRows) {
          let x = PAD + 22;
          for (const pill of row) {
            roundRect(ctx, x, y, pill.w, 34, 12);
            ctx.fillStyle = 'rgba(15,23,42,0.72)';
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(fitText(ctx, pill.text, pill.w - 20), x + 14, y + 23);
            x += pill.w + 10;
          }
          y += 42;
        }
        if (bLines.length) {
          y += 8;
          ctx.fillStyle = '#e879f9';
          ctx.font = `800 14px ${FONT}`;
          ctx.fillText(t.events_bonuses_ticket.toUpperCase(), PAD + 22, y + 12);
          y += 30;
          ctx.fillStyle = '#f8fafc';
          ctx.font = `600 18px ${FONT}`;
          for (const item of bLines) {
            const icon = item.image ? rawAssets.get(item.image) : undefined;
            if (icon) {
              const sz = 24;
              const sc = Math.min(sz / icon.naturalWidth, sz / icon.naturalHeight);
              ctx.drawImage(icon, PAD + 22 + (sz - icon.naturalWidth * sc) / 2, y - 18 + (sz - icon.naturalHeight * sc) / 2, icon.naturalWidth * sc, icon.naturalHeight * sc);
            }
            const tx = icon ? PAD + 54 : PAD + 22;
            const rowH = Math.max(icon ? 28 : 24, item.lines.length * 24);
            item.lines.forEach((line, li) => ctx.fillText(line, tx, y + li * 24));
            y += rowH + 6;
          }
        }
      },
    });
  }

  // Compute total height safely
  const FOOTER_H = 74;
  const SECTION_GAP = 26;
  const bodyTotalH = sections.reduce((s, sec) => s + sec.height + SECTION_GAP, 0);
  const H = Math.min(14000, Math.max(520, PAD + heroH + 28 + bodyTotalH + FOOTER_H));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  try {
    // Full dark cosmic backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bgTop);
    bg.addColorStop(1, pal.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle ambient top glow
    const glow = ctx.createRadialGradient(W * 0.8, 120, 20, W * 0.8, 120, 520);
    glow.addColorStop(0, pal.accentSoft);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 620);

    // Hero card
    roundRect(ctx, PAD, PAD, CW, heroH, 28);
    const heroGrad = ctx.createLinearGradient(PAD, PAD, PAD + CW, PAD + heroH);
    heroGrad.addColorStop(0, pal.heroStart);
    heroGrad.addColorStop(1, pal.heroEnd);
    ctx.fillStyle = heroGrad;
    ctx.fill();

    ctx.save();
    roundRect(ctx, PAD, PAD, CW, heroH, 28);
    ctx.clip();
    const heroBanner = event.image ? rawAssets.get(event.image) : undefined;
    if (heroBanner) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.globalCompositeOperation = 'luminosity';
      drawCoverImage(ctx, heroBanner, PAD, PAD, CW, heroH);
      ctx.restore();
    }
    drawPokeballWatermark(ctx, PAD + CW - 70, PAD + heroH - 30, 140, 'rgba(255,255,255,0.08)');
    sparkle(ctx, PAD + CW - 230, PAD + 48, 11, 'rgba(255,255,255,0.45)');
    sparkle(ctx, PAD + CW - 270, PAD + 94, 7, 'rgba(251,191,36,0.55)');

    // Template pill
    ctx.font = `800 15px ${FONT}`;
    const pillW = ctx.measureText(templateLabel).width + 28;
    roundRect(ctx, PAD + 28, PAD + 26, pillW, 30, 15);
    ctx.fillStyle = pal.pillBg;
    ctx.fill();
    ctx.fillStyle = pal.pillText;
    ctx.fillText(templateLabel, PAD + 42, PAD + 46);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 42px ${FONT}`;
    titleLines.forEach((line, li) => ctx.fillText(line, PAD + 28, PAD + 102 + li * 48));

    // Summary
    if (summaryLines.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.font = `500 20px ${FONT}`;
      const sy = PAD + 102 + titleLines.length * 48 + 4;
      summaryLines.forEach((line, li) => ctx.fillText(line, PAD + 28, sy + li * 26));
    }

    // Date tiles
    drawDateTiles(ctx, event.start, event.end, lang, PAD + CW - 26, PAD + 26);

    // Featured Hero Showcase for Max / Spotlight / Raid Day
    if (showHeroShowcase) {
      const boxY = PAD + 28 + heroTopH + 14;
      const boxW = CW - 56;
      roundRect(ctx, PAD + 28, boxY, boxW, heroShowcaseH, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();

      const shown = resolvedHero.slice(0, 4);
      const slotW = boxW / shown.length;
      shown.forEach((h, i) => {
        const m = h.mon;
        const cx = PAD + 28 + slotW * i + slotW / 2;
        drawSpriteOrFallback(ctx, sprites.get(h.image), cx - 62, boxY + 10, 124);
        if (m.canBeShiny) sparkle(ctx, cx + 52, boxY + 24, 13, '#fbbf24');
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(fitText(ctx, h.label, slotW - 20), cx, boxY + 158);

        // Draw colored type pills (e.g. Fée + Vol for Méga-Mélodelfe)
        if (h.types.length > 0) {
          ctx.font = `800 13px ${FONT}`;
          const pills = h.types.map((ty) => {
            const txt = typeName(ty, lang);
            return { ty, txt, w: ctx.measureText(txt).width + 18 };
          });
          const totalW = pills.reduce((s, p) => s + p.w, 0) + (pills.length - 1) * 8;
          let px = cx - totalW / 2;
          const py = boxY + 170;
          for (const p of pills) {
            roundRect(ctx, px, py, p.w, 22, 8);
            ctx.fillStyle = TYPE_COLORS[p.ty] ?? '#50646e';
            ctx.fill();
            ctx.fillStyle = DARK_INK_TYPES.has(p.ty) ? '#1c2a30' : '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(p.txt, px + p.w / 2, py + 15);
            px += p.w + 8;
          }
        }

        if (m.newShiny) {
          const nsText = `✨ ${t.events_new_shiny.toUpperCase()}`;
          ctx.font = `900 12px ${FONT}`;
          const nw = ctx.measureText(nsText).width + 20;
          roundRect(ctx, cx - nw / 2, boxY + 200, nw, 22, 11);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.fillText(nsText, cx, boxY + 215);
        }
        ctx.textAlign = 'left';
      });
    }
    ctx.restore();

    // Draw all sections
    let y = PAD + heroH + 28;
    for (const sec of sections) {
      if (y + sec.height > H - FOOTER_H) break;
      sec.draw(ctx, y);
      y += sec.height + SECTION_GAP;
    }

    // Footer bar
    const fy = H - 30;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, H - FOOTER_H + 14);
    ctx.lineTo(W - PAD, H - FOOTER_H + 14);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText('MyDexPoGo', PAD, fy);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `500 17px ${FONT}`;
    ctx.textAlign = 'right';
    const today = new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillText(`${t.events_export_footer}  ·  ${today}`, W - PAD, fy);
    ctx.textAlign = 'left';

    return canvas;
  } finally {
    cleanup();
    measureCanvas.width = 0;
    measureCanvas.height = 0;
  }
}

function ctxWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

/** Generates a PNG Blob for one Event Infographic. */
export async function renderEventInfographicImage(
  event: RichGameEvent,
  idx: DatasetIndex | undefined,
  lang: Lang,
  t: EventExportLabels,
  tools?: ToolsData,
): Promise<{ blob: Blob; filename: string }> {
  const canvas = await buildEventInfographicCanvas(event, idx, lang, t, tools);
  try {
    const blob = await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), 'image/png'),
    );
    const slug = fileSlug(eventTitle(event.name, idx?.speciesByDex, lang));
    return { blob, filename: `${slug}.png` };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Generates an A4 PDF infographic by slicing the crisp poster canvas across A4 pages with dark poster bleed.
 * Guarantees 100% French typography, gradients, date tiles and Pokémon sprites without Helvetica font limitations.
 */
async function canvasToPdf(canvas: HTMLCanvasElement, filename: string, orientation: 'p' | 'l', bgHex: string): Promise<{ blob: Blob; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 5;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const pxPerMm = canvas.width / usableW;
  const slicePxH = Math.floor(usableH * pxPerMm);

  const [r, g, b] = [
    parseInt(bgHex.slice(1, 3), 16) || 9,
    parseInt(bgHex.slice(3, 5), 16) || 21,
    parseInt(bgHex.slice(5, 7), 16) || 51,
  ];

  const totalPages = Math.max(1, Math.ceil(canvas.height / slicePxH));
  const slice = document.createElement('canvas');
  try {
    for (let p = 0; p < totalPages; p++) {
      if (p > 0) doc.addPage();
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, pageW, pageH, 'F');

      const sy = p * slicePxH;
      const sh = Math.min(slicePxH, canvas.height - sy);
      slice.width = canvas.width;
      slice.height = sh;
      const sctx = slice.getContext('2d')!;
      sctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      const dataUrl = slice.toDataURL('image/png');
      const drawH = (sh / canvas.width) * usableW;
      doc.addImage(dataUrl, 'PNG', margin, margin, usableW, drawH, undefined, 'FAST');
    }
  } finally {
    slice.width = 0;
    slice.height = 0;
  }

  const blob = doc.output('blob');
  downloadBlob(blob, filename);
  return { blob, filename };
}

export async function exportEventInfographicPdf(
  event: RichGameEvent,
  idx: DatasetIndex | undefined,
  lang: Lang,
  t: EventExportLabels,
  tools?: ToolsData,
): Promise<{ blob: Blob; filename: string }> {
  const canvas = await buildEventInfographicCanvas(event, idx, lang, t, tools);
  try {
    const slug = fileSlug(eventTitle(event.name, idx?.speciesByDex, lang));
    return await canvasToPdf(canvas, `${slug}.pdf`, 'p', POSTER_PALETTES[event.template].bgTop);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/* ---------- Weekly Mon–Sun Schedule Infographic Export ---------- */

export interface WeeklyExportDay {
  wdShort: string;
  dayNum: number;
  monthShort: string;
  isToday: boolean;
}

export interface WeeklyExportEntry {
  ev: GameEvent;
  rich?: RichGameEvent;
  startMs: number;
  endMs: number;
  sprite: string | null;
}

export interface WeeklyExportMulti extends WeeklyExportEntry {
  startCol: number;
  endCol: number;
  startsBefore: boolean;
  endsAfter: boolean;
  sprites: string[];
}

export interface WeeklyExportPayload {
  rangeLabel: string;
  days: WeeklyExportDay[];
  raidsByDay: WeeklyExportEntry[][];
  dailyByDay: WeeklyExportEntry[][];
  multiDay: WeeklyExportMulti[];
}

function weekAccentHex(ev: GameEvent, rich?: RichGameEvent): { border: string; fill: string; icon: string } {
  const s = `${ev.eventType} ${ev.name}`.toLowerCase();
  if (rich?.template === 'max' || /max-|dynamax|gigantamax/.test(s)) return { border: '#e879f9', fill: 'rgba(134,25,143,0.45)', icon: '⚡' };
  if (rich?.template === 'spotlight' || /spotlight/.test(s)) return { border: '#fbbf24', fill: 'rgba(180,83,9,0.45)', icon: '✨' };
  if (rich?.template === 'community_day' || /community-day/.test(s)) return { border: '#34d399', fill: 'rgba(15,118,110,0.45)', icon: '🌿' };
  if (rich?.template === 'raid_day' || /raid-day|raid-hour/.test(s)) return { border: '#fb7185', fill: 'rgba(153,27,27,0.45)', icon: '⚔️' };
  if (/go-battle-league/.test(s)) return { border: '#818cf8', fill: 'rgba(67,56,202,0.45)', icon: '🏆' };
  return { border: '#38bdf8', fill: 'rgba(23,52,115,0.58)', icon: '🗓️' };
}

async function buildWeeklyCanvas(
  data: WeeklyExportPayload,
  idx: DatasetIndex | undefined,
  lang: Lang,
  t: EventExportLabels,
): Promise<HTMLCanvasElement> {
  const W = 1600;
  const PAD = 38;
  const CW = W - 2 * PAD;
  const colGap = 12;
  const colW = (CW - 6 * colGap) / 7;

  // Gather sprites across all 7 columns & multi-day bars
  const spriteRequests: { image: string; name?: string }[] = [];
  for (const list of [...data.raidsByDay, ...data.dailyByDay]) {
    for (const item of list) {
      if (item.sprite) spriteRequests.push({ image: item.sprite, name: item.ev.name });
      for (const b of item.ev.extraData?.raidbattles?.bosses?.slice(0, 2) ?? []) {
        spriteRequests.push({ image: b.image, name: b.name });
      }
    }
  }
  for (const m of data.multiDay) {
    for (const src of m.sprites.slice(0, 3)) spriteRequests.push({ image: src, name: m.ev.name });
  }
  const { byKey: sprites, cleanup } = await loadSprites(spriteRequests, idx);

  const timeFmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
  const maxItemsInCol = Math.max(
    2,
    ...data.days.map((_, i) => (data.raidsByDay[i]?.length ?? 0) + (data.dailyByDay[i]?.length ?? 0)),
  );
  const HEADER_H = 104;
  const colBodyH = Math.max(410, 68 + maxItemsInCol * 118);
  const multiH = data.multiDay.length ? 40 + data.multiDay.length * 60 : 0;
  const FOOTER_H = 56;
  const H = PAD + HEADER_H + colBodyH + (multiH ? 22 + multiH : 0) + FOOTER_H + 12;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  try {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#091736');
    bg.addColorStop(0.55, '#12285a');
    bg.addColorStop(1, '#08132d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawPokeballWatermark(ctx, W - 90, 95, 130, 'rgba(255,255,255,0.06)');

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 42px ${FONT}`;
    ctx.fillText(`📅  ${t.weekly_title}`, PAD, PAD + 44);
    ctx.fillStyle = '#bae6fd';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(data.rangeLabel, PAD, PAD + 80);

    // 7 day columns
    const gridY = PAD + HEADER_H;
    data.days.forEach((d, i) => {
      const x = PAD + i * (colW + colGap);
      roundRect(ctx, x, gridY, colW, colBodyH, 18);
      ctx.fillStyle = d.isToday ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = d.isToday ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = d.isToday ? 2.5 : 1;
      ctx.stroke();

      // Day header
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `800 17px ${FONT}`;
      ctx.fillText(d.wdShort.toUpperCase(), x + 12, gridY + 32);

      roundRect(ctx, x + colW - 44, gridY + 12, 32, 28, 8);
      ctx.fillStyle = d.isToday ? '#fbbf24' : 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.fillStyle = d.isToday ? '#0f172a' : '#ffffff';
      ctx.font = `900 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(d.dayNum), x + colW - 28, gridY + 32);
      ctx.textAlign = 'left';

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 10, gridY + 48);
      ctx.lineTo(x + colW - 10, gridY + 48);
      ctx.stroke();

      let cy = gridY + 58;
      // Raids
      for (const r of data.raidsByDay[i] ?? []) {
        const isMega = /mega/i.test(r.ev.name);
        const isShadow = /shadow/i.test(r.ev.name);
        const cardH = 88;
        if (cy + cardH > gridY + colBodyH - 8) break;
        roundRect(ctx, x + 8, cy, colW - 16, cardH, 12);
        ctx.fillStyle = isMega ? 'rgba(8,145,178,0.42)' : isShadow ? 'rgba(126,34,206,0.42)' : 'rgba(190,18,60,0.40)';
        ctx.fill();
        ctx.strokeStyle = isMega ? '#22d3ee' : isShadow ? '#c084fc' : '#fb7185';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const bossImg = r.ev.extraData?.raidbattles?.bosses?.[0]?.image ?? r.sprite;
        if (bossImg) drawSpriteOrFallback(ctx, sprites.get(bossImg), x + 14, cy + 16, 48);
        const tx = bossImg ? x + 66 : x + 16;
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = `800 12px ${FONT}`;
        ctx.fillText(`${isMega ? (lang === 'fr' ? 'MÉGA' : 'MEGA') : isShadow ? (lang === 'fr' ? 'OBSCUR' : 'SHADOW') : '5★'} · ${t.weekly_raids_new.toUpperCase()}`, tx, cy + 26);
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 14px ${FONT}`;
        const lines = wrapWords(ctx, eventTitle(r.ev.name, idx?.speciesByDex, lang), colW - (tx - x) - 14, 3);
        lines.forEach((line, li) => ctx.fillText(line, tx, cy + 46 + li * 17));
        cy += cardH + 8;
      }

      // Daily events
      for (const item of data.dailyByDay[i] ?? []) {
        const st = weekAccentHex(item.ev, item.rich);
        const cardH = 104;
        if (cy + cardH > gridY + colBodyH - 8) break;
        roundRect(ctx, x + 8, cy, colW - 16, cardH, 12);
        ctx.fillStyle = st.fill;
        ctx.fill();
        ctx.strokeStyle = st.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `800 13px ${FONT}`;
        ctx.fillText(`${st.icon} ${timeFmt.format(new Date(item.startMs))}`, x + 16, cy + 22);

        if (item.sprite) drawSpriteOrFallback(ctx, sprites.get(item.sprite), x + 12, cy + 32, 54);
        const tx = item.sprite ? x + 70 : x + 16;
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 14px ${FONT}`;
        const lines = wrapWords(ctx, eventTitle(item.ev.name, idx?.speciesByDex, lang), colW - (tx - x) - 14, 3);
        lines.forEach((line, li) => ctx.fillText(line, tx, cy + 48 + li * 17));
        cy += cardH + 8;
      }
    });

    // Multi-day spanning bars
    if (data.multiDay.length > 0) {
      let my = gridY + colBodyH + 22;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `800 14px ${FONT}`;
      ctx.fillText(t.weekly_multiday.toUpperCase(), PAD, my + 14);
      my += 26;
      for (const m of data.multiDay) {
        const st = weekAccentHex(m.ev, m.rich);
        const bx = PAD + (m.startCol - 1) * (colW + colGap);
        const bw = (m.endCol - m.startCol + 1) * colW + (m.endCol - m.startCol) * colGap;
        roundRect(ctx, bx, my, bw, 50, 14);
        ctx.fillStyle = st.fill;
        ctx.fill();
        ctx.strokeStyle = st.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const title = `${m.startsBefore ? '‹ ' : ''}${eventTitle(m.ev.name, idx?.speciesByDex, lang)}${m.endsAfter ? ' ›' : ''}`;
        const spritesCount = Math.min(3, m.sprites.length);
        const spritesSpace = spritesCount * 38 + (spritesCount ? 16 : 0);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 18px ${FONT}`;
        ctx.fillText(fitText(ctx, title, bw - 32 - spritesSpace), bx + 16, my + 32);

        m.sprites.slice(0, 3).forEach((src, si) => {
          drawSpriteOrFallback(ctx, sprites.get(src), bx + bw - 14 - (spritesCount - si) * 38, my + 5, 40);
        });
        my += 58;
      }
    }

    // Footer
    const fy = H - 20;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText('MyDexPoGo', PAD, fy);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `500 16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(t.events_export_footer, W - PAD, fy);
    ctx.textAlign = 'left';

    return canvas;
  } finally {
    cleanup();
  }
}

export async function renderWeeklyInfographicImage(
  data: WeeklyExportPayload,
  idx: DatasetIndex | undefined,
  lang: Lang,
  t: EventExportLabels,
): Promise<{ blob: Blob; filename: string }> {
  const canvas = await buildWeeklyCanvas(data, idx, lang, t);
  try {
    const blob = await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), 'image/png'),
    );
    return { blob, filename: `ma-semaine-${fileSlug(data.rangeLabel)}.png` };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function exportWeeklyInfographicPdf(
  data: WeeklyExportPayload,
  idx: DatasetIndex | undefined,
  lang: Lang,
  t: EventExportLabels,
): Promise<{ blob: Blob; filename: string }> {
  const canvas = await buildWeeklyCanvas(data, idx, lang, t);
  try {
    return await canvasToPdf(canvas, `ma-semaine-${fileSlug(data.rangeLabel)}.pdf`, 'l', '#091736');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
