/**
 * A list as a picture to post (Discord, Instagram...): the app's sky header, a grid of cards, and the in-game search
 * with a QR code, since a phone cannot copy text out of a picture but its camera reads a QR code.
 */
import type { Lang, ListDetail } from '@mydexpogo/shared';
import { cardDone, cardMissing, cardsOf } from './cards.js';
import { entryVariant, imageUrl, tagLabel, type DatasetIndex } from './dataset.js';
import { canvasPen, drawGender } from './genderGlyph.js';
import { localized } from './i18n.js';
import { mapLimit, toDataUrl } from './pdf.js';
import { qrModules } from './qr.js';

export interface ImageLabels {
  by: (name: string) => string;
  progress: (done: number, total: number) => string;
  shiny: string;
  missing: string;
  export_search_title: string;
  export_search_qr: string;
  export_more: (n: number) => string;
  [k: string]: unknown;
}

const W = 1080;
const PAD = 56;
const COLS = 4;
const GAP = 20;
const CARD_W = (W - 2 * PAD - (COLS - 1) * GAP) / COLS;
const CARD_H = 320;
/** Past this many cards the picture gets too long to read: the rest is counted in a last tile. */
const MAX_CARDS = 48;
const FONT = '"Bricolage Grotesque Variable", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const C = { ink: '#233842', ink2: '#4a5f6a', ink3: '#6e828c', paper: '#e9f4ea', paper2: '#d9ebdb', go: '#2a9d5c', goSoft: '#d7f2e2', shiny: '#e0a91b', line: '#c9dccb' };

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

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = C.shiny;
  ctx.fill();
}

export async function renderListImage(idx: DatasetIndex, list: ListDetail, lang: Lang, t: ImageLabels, opts: { onlyMissing: boolean; search: string | null }): Promise<Blob> {
  await Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`500 24px ${FONT}`)]).catch(() => {});

  const all = cardsOf(list.entries).filter((c) => !opts.onlyMissing || cardMissing(c));
  const shown = all.length > MAX_CARDS ? all.slice(0, MAX_CARDS - 1) : all;
  const more = all.length - shown.length;
  const rows = shown.flatMap((c) => {
    const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
    const sp = v && idx.speciesByDex.get(v.dex);
    return v && sp ? [{ c, v, sp }] : [];
  });
  const pictures = await mapLimit(rows, 8, async ({ c, v }) => {
    const url = imageUrl(idx, v, c.shiny) ?? imageUrl(idx, v, false);
    const data = url ? await toDataUrl(url) : null;
    return data ? loadImage(data) : null;
  });

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `500 26px ${MONO}`;
  const qr = opts.search ? qrModules(opts.search) : null;
  const QR = 240;
  const searchLines = opts.search ? wrapChars(measure, opts.search, W - 2 * PAD - QR - 3 * 32) : [];

  const HEADER = 300;
  const tiles = rows.length + (more ? 1 : 0);
  const gridH = tiles ? Math.ceil(tiles / COLS) * (CARD_H + GAP) - GAP : 0;
  const searchH = opts.search ? Math.max(QR + 64, 140 + searchLines.length * 36) : 0;
  const H = HEADER + 48 + gridH + (searchH ? 48 + searchH : 0) + 110;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  // Page and sky header, as in the app.
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  const sky = ctx.createLinearGradient(0, 0, W, HEADER);
  sky.addColorStop(0, '#40c2d6');
  sky.addColorStop(1, '#3f8fe0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HEADER);

  const done = list.entries.filter((e) => e.done).length;
  const total = list.entries.length;
  ctx.fillStyle = '#fff';
  ctx.font = `800 68px ${FONT}`;
  ctx.fillText(fitText(ctx, list.name, W - 2 * PAD), PAD, 118);
  ctx.font = `500 30px ${FONT}`;
  ctx.globalAlpha = 0.9;
  ctx.fillText(fitText(ctx, [t.by(list.ownerName), opts.onlyMissing ? t.missing : ''].filter(Boolean).join(' · '), W - 2 * PAD), PAD, 168);
  ctx.globalAlpha = 1;
  // Progress bar with the count at its right.
  ctx.font = `700 30px ${FONT}`;
  const countText = t.progress(done, total);
  const countW = ctx.measureText(countText).width;
  const barW = W - 2 * PAD - countW - 28;
  roundRect(ctx, PAD, 216, barW, 20, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  if (total && done) {
    roundRect(ctx, PAD, 216, Math.max(20, (barW * done) / total), 20, 10);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(countText, W - PAD - countW, 236);

  // Cards.
  let y0 = HEADER + 48;
  rows.forEach(({ c, v, sp }, i) => {
    const x = PAD + (i % COLS) * (CARD_W + GAP);
    const y = y0 + Math.floor(i / COLS) * (CARD_H + GAP);
    const caught = cardDone(c);
    ctx.save();
    ctx.shadowColor = 'rgba(35,56,66,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, x, y, CARD_W, CARD_H, 28);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    if (caught) {
      roundRect(ctx, x + 2, y + 2, CARD_W - 4, CARD_H - 4, 26);
      ctx.strokeStyle = C.go;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    const pic = pictures[i];
    // Game pictures have a wide transparent margin: drawn larger than the box they fill.
    const S = 210;
    if (pic) {
      ctx.globalAlpha = caught ? 0.45 : 1;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(pic, x + (CARD_W - S) / 2, y - 2, S, S);
      ctx.globalAlpha = 1;
    }
    if (c.shiny) sparkle(ctx, x + CARD_W - 34, y + 36, 14);
    if (caught) {
      ctx.beginPath();
      ctx.arc(x + 34, y + 36, 18, 0, Math.PI * 2);
      ctx.fillStyle = C.go;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 26, y + 36);
      ctx.lineTo(x + 32, y + 42);
      ctx.lineTo(x + 43, y + 29);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    const cx = x + CARD_W / 2;
    ctx.fillStyle = C.ink;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(fitText(ctx, localized(sp.name, lang), CARD_W - 24), cx, y + 232);
    const detail = [v.label ? localized(v.label, lang) : '', c.tag ? tagLabel(idx, c.tag, t) : ''].filter(Boolean).join(' · ');
    if (detail) {
      ctx.fillStyle = C.ink3;
      ctx.font = `500 21px ${FONT}`;
      ctx.fillText(fitText(ctx, detail, CARD_W - 24), cx, y + 260);
    }
    // Genders as pills: filled green once caught.
    const genders = c.members.filter((m) => m.gender);
    if (genders.length) {
      const pw = 58;
      const ph = 34;
      let px = cx - (genders.length * pw + (genders.length - 1) * 10) / 2;
      for (const m of genders) {
        roundRect(ctx, px, y + CARD_H - ph - 14, pw, ph, ph / 2);
        ctx.fillStyle = m.done ? C.go : C.paper;
        ctx.fill();
        const color = m.done ? '#fff' : C.ink2;
        const pen = canvasPen(ctx, color, 2.6);
        const my = y + CARD_H - 14 - ph / 2;
        if (m.done) {
          drawGender(pen, m.gender as 'm' | 'f', px + pw / 2 - 10, my, 20);
          pen.line(px + pw / 2 + 6, my, px + pw / 2 + 10, my + 5);
          pen.line(px + pw / 2 + 10, my + 5, px + pw / 2 + 18, my - 5);
        } else drawGender(pen, m.gender as 'm' | 'f', px + pw / 2, my, 20);
        px += pw + 10;
      }
    }
    ctx.textAlign = 'left';
  });
  if (more) {
    const i = rows.length;
    const x = PAD + (i % COLS) * (CARD_W + GAP);
    const y = y0 + Math.floor(i / COLS) * (CARD_H + GAP);
    roundRect(ctx, x, y, CARD_W, CARD_H, 28);
    ctx.fillStyle = C.paper2;
    ctx.fill();
    ctx.fillStyle = C.ink2;
    ctx.textAlign = 'center';
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(`+${more}`, x + CARD_W / 2, y + CARD_H / 2 + 8);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(t.export_more(more), x + CARD_W / 2, y + CARD_H / 2 + 46);
    ctx.textAlign = 'left';
  }

  // In-game search with its QR code.
  let y = y0 + gridH;
  if (opts.search && qr) {
    y += 48;
    roundRect(ctx, PAD, y, W - 2 * PAD, searchH, 32);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(t.export_search_title, PAD + 32, y + 58);
    ctx.fillStyle = C.ink3;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(t.export_search_qr, PAD + 32, y + 92);
    ctx.fillStyle = C.ink;
    ctx.font = `500 26px ${MONO}`;
    searchLines.forEach((line, i) => ctx.fillText(line, PAD + 32, y + 140 + i * 36));
    const qx = W - PAD - 32 - QR;
    const qy = y + 32;
    const cell = QR / (qr.length + 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(qx, qy, QR, QR);
    ctx.fillStyle = '#14232b';
    qr.forEach((row, r) => row.forEach((dark, c) => { if (dark) ctx.fillRect(Math.floor(qx + (c + 1) * cell), Math.floor(qy + (r + 1) * cell), Math.ceil(cell), Math.ceil(cell)); }));
    y += searchH;
  }

  // Signature.
  ctx.fillStyle = C.ink3;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText('MyDexPoGo', PAD, y + 72);
  ctx.font = `500 22px ${FONT}`;
  const date = new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.textAlign = 'right';
  ctx.fillText(date, W - PAD, y + 72);
  ctx.textAlign = 'left';

  return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), 'image/png'));
}

/** Shares the picture where the device can (phones), downloads it otherwise. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
