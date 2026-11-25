/**
 * Exports a list as an A4 PDF: a grid of pictures with names, caught ones faded and struck through.
 * jsPDF is loaded on demand; sprites are fetched as data URLs (both image hosts send CORS headers).
 */
import type { ListDetail } from '@mydexpogo/shared';
import { entryVariant, imageUrl, tagLabel, type DatasetIndex } from './dataset.js';
import { cardDone, cardsOf, missingCards } from './cards.js';
import { localized } from './i18n.js';
import { qrModules } from './qr.js';
import { drawGender } from './genderGlyph.js';
import type { Lang } from '@mydexpogo/shared';

export async function toDataUrl(url: string): Promise<string | null> {
  try {
    // The page already displayed these pictures as plain <img>, so the browser and the service worker hold
    // responses that cannot be read from script. A distinct URL makes them fetch a readable (CORS) copy.
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}pdf=1`, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = () => ok(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * A picture redrawn small enough for a PDF cell. Game pictures are large: embedded as they are, a list of a few
 * hundred Pokémon made a PDF of several hundred megabytes that desktop browsers failed to produce.
 */
async function shrink(dataUrl: string, size = 160): Promise<string | null> {
  const img = await new Promise<HTMLImageElement | null>((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = dataUrl;
  });
  if (!img) return null;
  const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

/** A list name as a file name: "Shinies à chasser" -> "shinies-a-chasser". */
export const fileSlug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'liste';

/** Standard PDF fonts only cover Latin-1-ish text: replace what they cannot draw. */
const pdfText = (s: string) => s.replace(/♂/g, '(m)').replace(/♀/g, '(f)').replace(/[’]/g, "'").replace(/[^\x20-\x7E -ſŒœ]/g, '');

export interface PdfLabels {
  export_search_title: string;
  export_search_hint: string;
  export_search_no_qr: string;
  caught: string;
  missing: string;
  shiny: string;
  by: (name: string) => string;
  progress: (done: number, total: number) => string;
}

export async function exportListPdf(idx: DatasetIndex, list: ListDetail, lang: Lang, t: PdfLabels & Record<string, unknown>, opts: { onlyMissing?: boolean; search?: string | null } = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 12;
  const COLS = 5;
  const cellW = (W - 2 * M) / COLS;
  const cellH = 44;
  const img = 24;

  // One cell per card (variant x normal/shiny x trait); its genders are listed under the name.
  const cards = opts.onlyMissing ? missingCards(cardsOf(list.entries)) : cardsOf(list.entries);
  const rows = cards
    .map((c) => {
      const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
      const sp = v && idx.speciesByDex.get(v.dex);
      return v && sp ? { c, e: { shiny: c.shiny, tag: c.tag, done: cardDone(c) }, v, sp } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const pictures = await mapLimit(rows, 8, async ({ e, v }) => {
    const url = imageUrl(idx, v, e.shiny) ?? imageUrl(idx, v, false);
    const data = url ? await toDataUrl(url) : null;
    return data ? shrink(data) : null;
  });

  const done = list.entries.filter((e) => e.done).length;
  const header = (first: boolean) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(first ? 18 : 11);
    doc.setTextColor(30, 45, 55);
    doc.text(pdfText(list.name), M, first ? M + 6 : M + 3);
    if (!first) return M + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 110, 120);
    const sub = [t.by(list.ownerName), t.progress(done, list.entries.length), new Date().toLocaleDateString(lang)].join('  ·  ');
    doc.text(pdfText(sub), M, M + 12);
    return M + 18;
  };

  let y = header(true);
  // The in-game search for what is missing: selectable text, and a QR code for phones that cannot copy from a PDF.
  if (opts.search) {
    const qr = qrModules(opts.search);
    const qrSize = qr ? 30 : 0;
    const textW = W - 2 * M - qrSize - 6;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(pdfText(opts.search), textW - 6) as string[];
    const boxH = Math.max(qr ? qrSize + 6 : 0, 13 + lines.length * 3.6);
    doc.setFillColor(233, 244, 234);
    doc.roundedRect(M, y, W - 2 * M, boxH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 45, 55);
    doc.text(pdfText(t.export_search_title), M + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 110, 120);
    doc.text(pdfText(qr ? t.export_search_hint : t.export_search_no_qr), M + 4, y + 10);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 45, 55);
    doc.text(lines, M + 4, y + 15);
    if (qr) {
      const cell = qrSize / (qr.length + 2);
      const qx = W - M - qrSize - 3;
      const qy = y + 3;
      doc.setFillColor(255, 255, 255);
      doc.rect(qx, qy, qrSize, qrSize, 'F');
      doc.setFillColor(20, 35, 43);
      qr.forEach((row, r) => row.forEach((dark, c) => { if (dark) doc.rect(qx + (c + 1) * cell, qy + (r + 1) * cell, cell + 0.02, cell + 0.02, 'F'); }));
    }
    y += boxH + 5;
  }
  rows.forEach(({ c, e, v, sp }, i) => {
    const col = i % COLS;
    if (col === 0 && i > 0) y += cellH;
    if (y + cellH > H - M) {
      doc.addPage();
      y = header(false);
    }
    const x = M + col * cellW;
    const cx = x + cellW / 2;
    const pic = pictures[i];
    if (pic) {
      if (e.done) doc.setGState(doc.GState({ opacity: 0.3 }));
      try {
        doc.addImage(pic, 'PNG', cx - img / 2, y + 1, img, img, undefined, 'FAST');
      } catch {}
      if (e.done) doc.setGState(doc.GState({ opacity: 1 }));
    }
    const name = pdfText(localized(sp.name, lang));
    const detail = pdfText(
      [v.label ? localized(v.label, lang) : '', e.shiny ? t.shiny : '', e.tag ? tagLabel(idx, e.tag, t) : ''].filter(Boolean).join(' · '),
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(e.done ? 150 : 30, e.done ? 155 : 45, e.done ? 160 : 55);
    const nameLines = doc.splitTextToSize(name, cellW - 3).slice(0, 1) as string[];
    const ny = y + img + 5;
    doc.text(nameLines, cx, ny, { align: 'center' });
    if (e.done) {
      const w = Math.min(doc.getTextWidth(nameLines[0] ?? ''), cellW - 3);
      doc.setDrawColor(90, 160, 110);
      doc.setLineWidth(0.5);
      doc.line(cx - w / 2 - 1, ny - 1.1, cx + w / 2 + 1, ny - 1.1);
    }
    let dy = ny + 3.5;
    if (detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 128, 136);
      const lines = (doc.splitTextToSize(detail, cellW - 3) as string[]).slice(0, 1);
      doc.text(lines, cx, dy, { align: 'center' });
      dy += 3.5;
    }
    // Genders as drawn ♂ / ♀ (standard PDF fonts cannot write them), green with a tick once caught.
    const genders = c.members.filter((m) => m.gender);
    if (genders.length) {
      const gap = 7;
      let gx = cx - ((genders.length - 1) * gap) / 2;
      doc.setLineWidth(0.3);
      doc.setLineCap('round');
      for (const m of genders) {
        if (m.done) doc.setDrawColor(60, 150, 90);
        else doc.setDrawColor(30, 45, 55);
        const pen = { circle: (x: number, y: number, r: number) => doc.circle(x, y, r, 'S'), line: (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2) };
        const gy = dy - 1.2;
        drawGender(pen, m.gender as 'm' | 'f', m.done ? gx - 1 : gx, gy, 3.2);
        if (m.done) {
          doc.line(gx + 1.3, gy, gx + 1.9, gy + 0.7);
          doc.line(gx + 1.9, gy + 0.7, gx + 3, gy - 0.8);
        }
        gx += gap;
      }
    }
  });

  doc.save(`${fileSlug(list.name)}.pdf`);
}
