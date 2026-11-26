/**
 * A list as a picture to post (Discord, Instagram...): a themed collector header, a grid of cards, and the in-game
 * search with a QR code, since a phone cannot copy text out of a picture but its camera reads a QR code.
 */
import type { Lang, ListDetail } from '@mydexpogo/shared';
import { cardDone, cardsOf, missingCards } from './cards.js';
import { entryVariant, imageUrl, tagLabel, type DatasetIndex } from './dataset.js';
import { fmtCode } from './errors.js';
import { EXPORT_THEMES, type ExportTheme } from './exportTheme.js';
import { canvasPen, drawGender } from './genderGlyph.js';
import { localized } from './i18n.js';
import { mapLimit, toDataUrl } from './pdf.js';
import { qrModules } from './qr.js';
import { isArtwork } from '../components/Sprite.js';

export interface ImageLabels {
  by: (name: string) => string;
  progress: (done: number, total: number) => string;
  shiny: string;
  missing: string;
  export_search_title: string;
  export_search_qr: string;
  export_more: (n: number) => string;
  export_search_no_qr: string;
  [k: string]: unknown;
}

const W = 1080;
const PAD = 56;
/** Past this many cards the preview gets too long to read: the rest is counted in a last tile. */
const MAX_CARDS = 48;
/** Past this height a picture is cut into pages (apps and browsers choke on very tall pictures). */
const MAX_GRID_H = 9000;
export type ImageLayout = 'preview' | 'compact';
/** Preview: big cards, the first 48. Compact: every card, smaller, six per row. k scales the card's insides. */
const LAYOUTS: Record<ImageLayout, { cols: number; gap: number; k: number }> = {
  preview: { cols: 4, gap: 20, k: 1 },
  compact: { cols: 6, gap: 14, k: 0.66 },
};
const FONT = '"Bricolage Grotesque Variable", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Breaks text on any character (a search string has no spaces worth waiting for). */
function wrapChars(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > width && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Subtle geometric Poké Ball emblem watermark in the header corner. */
function drawPokeballWatermark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.11;
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
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Atmospheric geometric motif clipped inside the header band. */
function drawHeaderMotif(ctx: CanvasRenderingContext2D, theme: ExportTheme, headerH: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, headerH);
  ctx.clip();

  if (theme.motif === 'stars') {
    // Soft golden cosmic glow + 4-point sparkles.
    const glow = ctx.createRadialGradient(W - 140, headerH * 0.35, 10, W - 140, headerH * 0.35, 360);
    glow.addColorStop(0, 'rgba(245,200,66,0.22)');
    glow.addColorStop(1, 'rgba(245,200,66,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, headerH);
    drawPokeballWatermark(ctx, W - 110, headerH * 0.45, 155, 'rgba(245,200,66,0.11)');
    const stars: [number, number, number, number][] = [
      [W - 260, 62, 16, 0.85], [W - 190, 128, 10, 0.65], [W - 335, 148, 12, 0.55],
      [W - 92, 54, 14, 0.7], [W - 440, 56, 8, 0.45], [W - 275, 224, 9, 0.5],
      [W - 56, 198, 11, 0.6], [710, 96, 7, 0.4],
    ];
    for (const [sx, sy, sr, alpha] of stars) {
      ctx.globalAlpha = alpha;
      sparkle(ctx, sx, sy, sr, theme.shiny);
    }
    ctx.globalAlpha = 1;
  } else if (theme.motif === 'bokeh') {
    // Pokémon GO Lucky backdrop: warm luminous golden bokeh circles + delicate glints.
    const orbs: [number, number, number, number][] = [
      [W - 90, 70, 110, 0.16], [W - 240, 180, 74, 0.18], [W - 350, 78, 52, 0.14],
      [W - 150, 250, 62, 0.15], [610, 48, 44, 0.12], [W - 38, 220, 46, 0.2],
      [480, 230, 34, 0.1], [760, 235, 28, 0.16],
    ];
    for (const [ox, oy, or, alpha] of orbs) {
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,248,214,${alpha})`;
      ctx.fill();
    }
    drawPokeballWatermark(ctx, W - 110, headerH * 0.48, 150, 'rgba(255,255,255,0.13)');
    for (const [sx, sy, sr] of [[W - 270, 88, 12], [W - 170, 152, 15], [W - 390, 162, 9]] as const) {
      ctx.globalAlpha = 0.72;
      sparkle(ctx, sx, sy, sr, '#fff9db');
    }
    ctx.globalAlpha = 1;
  } else if (theme.motif === 'aura') {
    // Team Rocket / Shadow: subtle diagonal violet energy shafts + glowing wisps.
    const glow = ctx.createRadialGradient(W - 130, headerH * 0.4, 20, W - 130, headerH * 0.4, 380);
    glow.addColorStop(0, 'rgba(200,135,255,0.26)');
    glow.addColorStop(1, 'rgba(200,135,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = 'rgba(200,135,255,0.08)';
    for (const x of [580, 720, 870]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 74, 0);
      ctx.lineTo(x - 30, headerH);
      ctx.lineTo(x - 104, headerH);
      ctx.closePath();
      ctx.fill();
    }
    drawPokeballWatermark(ctx, W - 110, headerH * 0.48, 155, 'rgba(220,175,255,0.13)');
  } else if (theme.motif === 'male') {
    // Bold geometric ♂ emblem watermark.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = W - 155;
    const cy = headerH * 0.56;
    const r = 82;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const d = r * Math.SQRT1_2;
    const ax = cx + d + 62;
    const ay = cy - d - 62;
    ctx.beginPath();
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(ax, ay);
    ctx.moveTo(ax - 46, ay);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax, ay + 46);
    ctx.stroke();
  } else if (theme.motif === 'female') {
    // Bold geometric ♀ emblem watermark + soft rose orbs.
    for (const [ox, oy, or] of [[W - 290, 74, 52], [W - 350, 196, 34]] as const) {
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,235,245,0.13)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.17)';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    const cx = W - 125;
    const cy = headerH * 0.36;
    const r = 74;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx, cy + r + 84);
    ctx.moveTo(cx - 46, cy + r + 42);
    ctx.lineTo(cx + 46, cy + r + 42);
    ctx.stroke();
  } else if (theme.motif === 'night') {
    drawPokeballWatermark(ctx, W - 110, headerH * 0.48, 155, 'rgba(255,255,255,0.09)');
    ctx.fillStyle = 'rgba(235,248,255,0.55)';
    for (const [sx, sy, sr] of [[W - 320, 58, 3], [W - 220, 110, 2.5], [W - 410, 126, 2], [W - 150, 44, 3.2], [W - 280, 210, 2.2]] as const) {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    drawPokeballWatermark(ctx, W - 110, headerH * 0.48, 155, 'rgba(255,255,255,0.11)');
  }
  ctx.restore();
}

export interface RenderImageOptions {
  onlyMissing: boolean;
  search: string | null;
  layout?: ImageLayout;
  theme?: ExportTheme;
  note?: string;
  friendCode?: string;
}

/**
 * The list as one picture (preview: the first cards) or as several (compact: every card, cut into pages when long).
 * The search and its QR code go on the last page.
 */
export async function renderListImages(idx: DatasetIndex, list: ListDetail, lang: Lang, t: ImageLabels, opts: RenderImageOptions): Promise<Blob[]> {
  await Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`500 24px ${FONT}`)]).catch(() => {});
  const theme = opts.theme ?? EXPORT_THEMES.classic;
  const note = opts.note?.trim() ?? '';
  const codeText = opts.friendCode ? fmtCode(opts.friendCode) : '';
  const layout = opts.layout ?? 'preview';
  const { cols: COLS, gap: GAP, k } = LAYOUTS[layout];
  const CARD_W = (W - 2 * PAD - (COLS - 1) * GAP) / COLS;
  const CARD_H = Math.round(320 * k);

  const all = opts.onlyMissing ? missingCards(cardsOf(list.entries)) : cardsOf(list.entries);
  const shown = layout === 'preview' && all.length > MAX_CARDS ? all.slice(0, MAX_CARDS - 1) : all;
  const more = all.length - shown.length;
  const rows = shown.flatMap((c) => {
    const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
    const sp = v && idx.speciesByDex.get(v.dex);
    return v && sp ? [{ c, v, sp }] : [];
  });
  const pictureUrls = rows.map(({ c, v }) => imageUrl(idx, v, c.shiny) ?? imageUrl(idx, v, false));
  const pictures = await mapLimit(rows, 8, async ({ c, v }) => {
    const url = imageUrl(idx, v, c.shiny) ?? imageUrl(idx, v, false);
    const data = url ? await toDataUrl(url) : null;
    return data ? loadImage(data) : null;
  });

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `500 26px ${MONO}`;
  const qr = opts.search ? qrModules(opts.search) : null;
  const QR = qr ? 240 : 0;
  const searchLines = opts.search ? wrapChars(measure, opts.search, W - 2 * PAD - (qr ? QR + 3 * 32 : 2 * 32)) : [];
  const searchH = opts.search ? Math.max(qr ? QR + 64 : 0, 140 + searchLines.length * 36) : 0;

  // Pages: as many card rows as fit under MAX_GRID_H each.
  const tiles = rows.length + (more ? 1 : 0);
  const rowsPerPage = Math.max(1, Math.floor((MAX_GRID_H + GAP) / (CARD_H + GAP)));
  const perPage = rowsPerPage * COLS;
  const pageCount = Math.max(1, Math.ceil(tiles / perPage));
  const blobs: Blob[] = [];
  for (let page = 0; page < pageCount; page++) {
    const from = page * perPage;
    const pageTiles = Math.min(perPage, tiles - from);
    const last = page === pageCount - 1;
    blobs.push(await drawPage(from, pageTiles, last, page));
  }
  return blobs;

  async function drawPage(from: number, pageTiles: number, last: boolean, page: number): Promise<Blob> {
    const HEADER = note ? 344 : 300;
    const gridH = pageTiles ? Math.ceil(pageTiles / COLS) * (CARD_H + GAP) - GAP : 0;
    const withSearch = last && !!opts.search;
    const H = HEADER + 48 + gridH + (withSearch ? 48 + searchH : 0) + 110;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.textBaseline = 'alphabetic';

    // Page canvas + subtle ambient corner glow for themed dark/lucky styles.
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, W, H);
    if (theme.motif === 'stars' || theme.motif === 'aura' || theme.motif === 'bokeh') {
      const amb = ctx.createRadialGradient(W * 0.85, HEADER + 140, 40, W * 0.85, HEADER + 140, 620);
      amb.addColorStop(0, theme.halo);
      amb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = amb;
      ctx.fillRect(0, HEADER, W, H - HEADER);
    }

    // Header gradient + motif.
    const grad = ctx.createLinearGradient(0, 0, W, HEADER);
    grad.addColorStop(0, theme.headerFrom);
    grad.addColorStop(1, theme.headerTo);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, HEADER);
    drawHeaderMotif(ctx, theme, HEADER);

    // Optional friend code badge on top right.
    let codeW = 0;
    if (codeText) {
      ctx.font = `700 24px ${MONO}`;
      const tw = ctx.measureText(codeText).width;
      const bw = tw + 36;
      const bh = 48;
      const bx = W - PAD - bw;
      const by = 68;
      codeW = bw + 20;
      roundRect(ctx, bx, by, bw, bh, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = theme.headerInk;
      ctx.fillText(codeText, bx + 18, by + 32);
    }

    const done = list.entries.filter((e) => e.done).length;
    const total = list.entries.length;
    ctx.fillStyle = theme.headerInk;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(fitText(ctx, list.name, W - 2 * PAD - codeW), PAD, 114);
    ctx.font = `500 29px ${FONT}`;
    ctx.fillStyle = theme.headerMuted;
    ctx.fillText(
      fitText(ctx, [t.by(list.ownerName), opts.onlyMissing ? t.missing : '', pageCount > 1 ? `${page + 1}/${pageCount}` : ''].filter(Boolean).join(' · '), W - 2 * PAD),
      PAD,
      162,
    );

    if (note) {
      ctx.font = `600 25px ${FONT}`;
      ctx.fillStyle = theme.headerInk;
      ctx.fillText(fitText(ctx, note, W - 2 * PAD), PAD, 212);
    }

    // Progress bar with the count at its right.
    const barY = note ? 256 : 216;
    ctx.font = `700 29px ${FONT}`;
    const countText = t.progress(done, total);
    const countW = ctx.measureText(countText).width;
    const barW = W - 2 * PAD - countW - 28;
    roundRect(ctx, PAD, barY, barW, 20, 10);
    ctx.fillStyle = theme.headerTrack;
    ctx.fill();
    if (total && done) {
      roundRect(ctx, PAD, barY, Math.max(20, (barW * done) / total), 20, 10);
      ctx.fillStyle = theme.headerBar;
      ctx.fill();
    }
    ctx.fillStyle = theme.headerInk;
    ctx.fillText(countText, W - PAD - countW, barY + 20);

    // Cards.
    const y0 = HEADER + 48;
    rows.slice(from, from + pageTiles).forEach(({ c, v, sp }, j) => {
      const i = from + j;
      const x = PAD + (j % COLS) * (CARD_W + GAP);
      const y = y0 + Math.floor(j / COLS) * (CARD_H + GAP);
      const caught = cardDone(c);
      ctx.save();
      ctx.shadowColor = theme.dark ? 'rgba(0,0,0,0.34)' : 'rgba(35,56,66,0.10)';
      ctx.shadowBlur = theme.dark ? 20 : 16;
      ctx.shadowOffsetY = 6;
      roundRect(ctx, x, y, CARD_W, CARD_H, 28 * k);
      ctx.fillStyle = theme.card;
      ctx.fill();
      ctx.restore();

      roundRect(ctx, x + 1, y + 1, CARD_W - 2, CARD_H - 2, 27 * k);
      ctx.strokeStyle = caught ? theme.accent : theme.cardBorder;
      ctx.lineWidth = caught ? 4 : 2;
      ctx.stroke();

      // Subtle circular halo behind the sprite so dark Pokémon stand out on dark cards too.
      const cx = x + CARD_W / 2;
      ctx.beginPath();
      ctx.arc(cx, y + 104 * k, 74 * k, 0, Math.PI * 2);
      ctx.fillStyle = theme.halo;
      ctx.fill();

      const pic = pictures[i];
      // Game pictures have a wide transparent margin: drawn larger than the box they fill.
      // Official artwork has no margin: drawn smaller, lower, to sit like a game picture.
      const art = isArtwork(pictureUrls[i] ?? '');
      const S = (art ? 150 : 210) * k;
      if (pic) {
        ctx.globalAlpha = caught ? 0.45 : 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(pic, x + (CARD_W - S) / 2, y + (art ? 30 : -2) * k, S, S);
        ctx.globalAlpha = 1;
      }
      if (c.shiny) {
        sparkle(ctx, x + CARD_W - 32 * k, y + 34 * k, 15 * k, theme.shiny);
        if (theme.motif === 'stars') sparkle(ctx, x + CARD_W - 52 * k, y + 52 * k, 8 * k, theme.shiny);
      }
      if (caught) {
        ctx.beginPath();
        ctx.arc(x + 34 * k, y + 36 * k, 18 * k, 0, Math.PI * 2);
        ctx.fillStyle = theme.accent;
        ctx.fill();
        ctx.strokeStyle = theme.accentInk;
        ctx.lineWidth = 4 * k;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 26 * k, y + 36 * k);
        ctx.lineTo(x + 32 * k, y + 42 * k);
        ctx.lineTo(x + 43 * k, y + 29 * k);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = theme.ink;
      ctx.font = `700 ${Math.round(28 * k)}px ${FONT}`;
      ctx.fillText(fitText(ctx, localized(sp.name, lang), CARD_W - 24 * k), cx, y + 232 * k);
      const formText = v.label ? localized(v.label, lang).replace(/\s+/g, ' ').trim() : '';
      const tagText = c.tag ? tagLabel(idx, c.tag, t) : '';
      const detail = [formText, tagText].filter(Boolean).join(' · ');
      if (detail) {
        ctx.fillStyle = theme.ink3;
        ctx.font = `500 ${Math.round(21 * k)}px ${FONT}`;
        ctx.fillText(fitText(ctx, detail, CARD_W - 24 * k), cx, y + 260 * k);
      }
      // Genders as pills: filled with theme accent once caught.
      const genders = c.members.filter((m) => m.gender);
      if (genders.length) {
        const pw = 58 * k;
        const ph = 34 * k;
        const pg = 10 * k;
        let px = cx - (genders.length * pw + (genders.length - 1) * pg) / 2;
        for (const m of genders) {
          roundRect(ctx, px, y + CARD_H - ph - 14 * k, pw, ph, ph / 2);
          ctx.fillStyle = m.done ? theme.accent : theme.paper2;
          ctx.fill();
          const color = m.done ? theme.accentInk : theme.ink2;
          const pen = canvasPen(ctx, color, 2.6 * k);
          const my = y + CARD_H - 14 * k - ph / 2;
          if (m.done) {
            drawGender(pen, m.gender as 'm' | 'f', px + pw / 2 - 10 * k, my, 20 * k);
            pen.line(px + pw / 2 + 6 * k, my, px + pw / 2 + 10 * k, my + 5 * k);
            pen.line(px + pw / 2 + 10 * k, my + 5 * k, px + pw / 2 + 18 * k, my - 5 * k);
          } else drawGender(pen, m.gender as 'm' | 'f', px + pw / 2, my, 20 * k);
          px += pw + pg;
        }
      }
      ctx.textAlign = 'left';
    });
    if (more && last) {
      const j = rows.length - from;
      const x = PAD + (j % COLS) * (CARD_W + GAP);
      const y = y0 + Math.floor(j / COLS) * (CARD_H + GAP);
      roundRect(ctx, x, y, CARD_W, CARD_H, 28);
      ctx.fillStyle = theme.paper2;
      ctx.fill();
      roundRect(ctx, x + 1, y + 1, CARD_W - 2, CARD_H - 2, 27);
      ctx.strokeStyle = theme.cardBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = theme.ink2;
      ctx.textAlign = 'center';
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText(`+${more}`, x + CARD_W / 2, y + CARD_H / 2 + 8);
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(t.export_more(more), x + CARD_W / 2, y + CARD_H / 2 + 46);
      ctx.textAlign = 'left';
    }

    // In-game search with its QR code.
    let y = y0 + gridH;
    if (withSearch && opts.search) {
      y += 48;
      roundRect(ctx, PAD, y, W - 2 * PAD, searchH, 32);
      ctx.fillStyle = theme.searchBg;
      ctx.fill();
      ctx.strokeStyle = theme.searchBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = theme.ink;
      ctx.font = `800 34px ${FONT}`;
      ctx.fillText(t.export_search_title, PAD + 32, y + 58);
      ctx.fillStyle = theme.ink3;
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(qr ? t.export_search_qr : t.export_search_no_qr, PAD + 32, y + 92);
      ctx.fillStyle = theme.ink;
      ctx.font = `500 26px ${MONO}`;
      searchLines.forEach((line, i) => ctx.fillText(line, PAD + 32, y + 140 + i * 36));
      if (qr) {
        const qx = W - PAD - 32 - QR;
        const qy = y + 32;
        const cell = QR / (qr.length + 2);
        roundRect(ctx, qx - 6, qy - 6, QR + 12, QR + 12, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = theme.qrDark;
        qr.forEach((row, r) => row.forEach((dark, c) => { if (dark) ctx.fillRect(Math.floor(qx + (c + 1) * cell), Math.floor(qy + (r + 1) * cell), Math.ceil(cell), Math.ceil(cell)); }));
      }
      y += searchH;
    }

    // Signature.
    ctx.fillStyle = theme.ink3;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(codeText ? `MyDexPoGo  ·  ${codeText}` : 'MyDexPoGo', PAD, y + 72);
    ctx.font = `500 22px ${FONT}`;
    const date = new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.textAlign = 'right';
    ctx.fillText(date, W - PAD, y + 72);
    ctx.textAlign = 'left';

    return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), 'image/png'));
  }
}

/** Saves a file through the browser's download (works on every computer and phone). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Whether this browser can hand pictures to other apps (phones, some desktops). */
export function canSharePictures(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** The system share sheet with the pictures; false when cancelled. Never falls back to a download by itself. */
export async function sharePictures(blobs: Blob[], names: string[], title: string): Promise<boolean> {
  const files = blobs.map((b, i) => new File([b], names[i]!, { type: 'image/png' }));
  try {
    await navigator.share({ files, title });
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
    throw e;
  }
}

/** Whether the picture can go to the clipboard (desktop browsers mostly). */
export const canCopyPicture = () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

export async function copyPicture(blob: Blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
