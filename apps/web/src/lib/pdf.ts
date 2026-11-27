/**
 * Exports a list as a themed A4 PDF: a grid of collector cards with names, caught ones faded and struck through.
 * jsPDF is loaded on demand; sprites are fetched with a timeout, deduplicated by URL, and shrunk so huge lists stay light.
 */
import type { Lang, ListDetail } from '@mydexpogo/shared';
import { cardDone, cardsOf, missingCards } from './cards.js';
import { entryVariant, imageUrl, tagLabel, type DatasetIndex } from './dataset.js';
import { fmtCode } from './errors.js';
import { EXPORT_THEMES, hexRgb, type ExportTheme } from './exportTheme.js';
import { drawGender } from './genderGlyph.js';
import { localized } from './i18n.js';
import { qrModules } from './qr.js';

/** Fetches a CORS sprite blob with a hard timeout so a single stalled image never hangs an export. */
export async function fetchSpriteBlob(url: string, timeoutMs = 8_000): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The page already displayed these pictures as plain <img>, so the browser and the service worker hold
    // responses that cannot be read from script. A distinct URL makes them fetch a readable (CORS) copy.
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}pdf=1`, {
      mode: 'cors',
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

export async function toDataUrl(url: string): Promise<string | null> {
  const blob = await fetchSpriteBlob(url);
  if (!blob) return null;
  return await new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = () => ok(null);
    r.readAsDataURL(blob);
  });
}

/**
 * A picture redrawn small enough for a PDF cell. Game pictures are large: embedded as they are, a list of a few
 * hundred Pokémon made a PDF of several hundred megabytes that mobile and desktop browsers failed to produce.
 */
async function shrinkBlob(blob: Blob, size = 120): Promise<string | null> {
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement | null>((ok) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ok(null);
      i.src = objUrl;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/png');
    // Immediately release backing store so mobile Safari does not hit canvas memory limits.
    canvas.width = 0;
    canvas.height = 0;
    return out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }));
  return out;
}

/** A list name as a file name: "Shinies à chasser" -> "shinies-a-chasser". */
export const fileSlug = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'liste';

/** Standard PDF fonts only cover Latin-1-ish text: replace what they cannot draw. */
const pdfText = (s: string) =>
  s
    .replace(/♂/g, '(m)')
    .replace(/♀/g, '(f)')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/[^\x20-\x7E\u00A0-\u017FŒœ]/g, '');

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

export interface PdfOptions {
  onlyMissing?: boolean;
  search?: string | null;
  theme?: ExportTheme;
  note?: string;
  friendCode?: string;
  onProgress?: (done: number, total: number) => void;
}

export async function exportListPdf(idx: DatasetIndex, list: ListDetail, lang: Lang, t: PdfLabels & Record<string, unknown>, opts: PdfOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const theme = opts.theme ?? EXPORT_THEMES.classic;
  const note = opts.note?.trim() ?? '';
  const codeText = opts.friendCode ? fmtCode(opts.friendCode) : '';

  const W = 210;
  const H = 297;
  const M = 11;
  const COLS = 5;
  const GAP = 2.6;
  const cellW = (W - 2 * M - (COLS - 1) * GAP) / COLS;
  const cellH = 44;
  const img = 22;

  const rgbPaper = hexRgb(theme.paper);
  const rgbCard = hexRgb(theme.card);
  const rgbBorder = hexRgb(theme.cardBorder);
  const rgbHeader = hexRgb(theme.headerFrom);
  const rgbHeader2 = hexRgb(theme.headerTo);
  const rgbHeaderInk = hexRgb(theme.headerInk);
  const rgbHeaderBar = hexRgb(theme.headerBar);
  const rgbInk = hexRgb(theme.ink);
  const rgbInk2 = hexRgb(theme.ink2);
  const rgbInk3 = hexRgb(theme.ink3);
  const rgbAccent = hexRgb(theme.accent);
  const rgbShiny = hexRgb(theme.shiny);
  const rgbHalo = hexRgb(theme.pdfHalo);
  const rgbSearchBg = hexRgb(theme.searchBg);
  const rgbSearchBorder = hexRgb(theme.searchBorder);
  const rgbQrDark = hexRgb(theme.qrDark);

  /** Tiny 4-point vector diamond sparkle for shiny markers and starry themes. */
  const drawSparkle = (cx: number, cy: number, r: number, color: [number, number, number]) => {
    doc.setFillColor(...color);
    doc.lines(
      [[r * 0.35, -r * 0.35], [r * 0.65, -r * 0.65], [-r * 0.65, -r * 0.65], [-r * 0.35, -r * 0.35], [-r * 0.35, r * 0.35], [-r * 0.65, r * 0.65], [r * 0.65, r * 0.65], [r * 0.35, r * 0.35]],
      cx,
      cy + r,
      [1, 1],
      'F',
      true,
    );
  };

  // One cell per card (variant x normal/shiny x trait); its genders are listed under the name.
  const cards = opts.onlyMissing ? missingCards(cardsOf(list.entries)) : cardsOf(list.entries);
  const rows = cards
    .map((c) => {
      const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
      const sp = v && idx.speciesByDex.get(v.dex);
      return v && sp ? { c, e: { shiny: c.shiny, tag: c.tag, done: cardDone(c) }, v, sp, url: imageUrl(idx, v, c.shiny) ?? imageUrl(idx, v, false) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  // Deduplicate unique sprite URLs so duplicate forms (e.g. normal + lucky) are fetched & embedded only once.
  const uniqueUrls = [...new Set(rows.map((r) => r.url).filter((u): u is string => !!u))];
  const shrunkByUrl = new Map<string, string | null>();
  let fetched = 0;
  opts.onProgress?.(0, uniqueUrls.length);
  await mapLimit(uniqueUrls, 6, async (url) => {
    const blob = await fetchSpriteBlob(url);
    shrunkByUrl.set(url, blob ? await shrinkBlob(blob) : null);
    opts.onProgress?.(++fetched, uniqueUrls.length);
  });

  const done = list.entries.filter((e) => e.done).length;
  const total = list.entries.length;
  let pageNum = 1;

  const paintPageBg = () => {
    doc.setFillColor(...rgbPaper);
    doc.rect(0, 0, W, H, 'F');
  };

  const header = (first: boolean) => {
    paintPageBg();
    if (!first) {
      doc.setFillColor(...rgbHeader);
      doc.roundedRect(M, M, W - 2 * M, 9.5, 2.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...rgbHeaderInk);
      doc.text(pdfText(list.name), M + 4, M + 6.3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`MyDexPoGo · p. ${pageNum}`, W - M - 4, M + 6.3, { align: 'right' });
      return M + 13.5;
    }

    const bannerH = note ? 31 : 25.5;
    doc.setFillColor(...rgbHeader);
    doc.roundedRect(M, M, W - 2 * M, bannerH, 3.5, 3.5, 'F');
    // Subtle right-hand accent panel + vector motif.
    doc.setFillColor(...rgbHeader2);
    doc.roundedRect(W - M - 58, M, 58, bannerH, 3.5, 3.5, 'F');
    doc.rect(W - M - 60, M, 6, bannerH, 'F');

    doc.setGState(doc.GState({ opacity: 0.16 }));
    doc.setDrawColor(...rgbHeaderInk);
    doc.setLineWidth(1.2);
    const px = W - M - 16;
    const py = M + bannerH * 0.5;
    if (theme.motif === 'male') {
      doc.circle(px - 2, py + 2, 6, 'S');
      doc.line(px + 2.2, py - 2.2, px + 7.5, py - 7.5);
      doc.line(px + 3.5, py - 7.5, px + 7.5, py - 7.5);
      doc.line(px + 7.5, py - 7.5, px + 7.5, py - 3.5);
    } else if (theme.motif === 'female') {
      doc.circle(px, py - 2.8, 5.5, 'S');
      doc.line(px, py + 2.7, px, py + 9.5);
      doc.line(px - 3.6, py + 6.2, px + 3.6, py + 6.2);
    } else {
      doc.circle(px, py, 10, 'S');
      doc.circle(px, py, 3.2, 'S');
      doc.line(px - 10, py, px - 3.2, py);
      doc.line(px + 3.2, py, px + 10, py);
    }
    if (theme.motif === 'bokeh') {
      doc.setFillColor(...rgbHeaderInk);
      doc.circle(W - M - 42, M + 7, 4.5, 'F');
      doc.circle(W - M - 31, M + 18, 3.2, 'F');
      doc.circle(W - M - 50, M + 19, 2.5, 'F');
    }
    doc.setGState(doc.GState({ opacity: 1 }));
    if (theme.motif === 'stars') {
      drawSparkle(W - M - 40, M + 6, 2.1, rgbShiny);
      drawSparkle(W - M - 29, M + 13, 1.4, rgbShiny);
      drawSparkle(W - M - 48, M + 16, 1.5, rgbShiny);
    }

    // Title & meta.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(...rgbHeaderInk);
    const maxTitleW = W - 2 * M - (codeText ? 48 : 16);
    const titleLine = (doc.splitTextToSize(pdfText(list.name), maxTitleW) as string[])[0] ?? '';
    doc.text(titleLine, M + 5, M + 9);

    if (codeText) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      const cw = doc.getTextWidth(codeText) + 5;
      doc.setGState(doc.GState({ opacity: 0.22 }));
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(W - M - cw - 4, M + 4, cw, 6.2, 3, 3, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));
      doc.setTextColor(...rgbHeaderInk);
      doc.text(codeText, W - M - cw / 2 - 4, M + 8.3, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...rgbHeaderInk);
    const sub = [t.by(list.ownerName), t.progress(done, total), new Date().toLocaleDateString(lang)].join('  ·  ');
    doc.text(pdfText(sub), M + 5, M + 14.5);

    if (note) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const noteLine = (doc.splitTextToSize(pdfText(note), W - 2 * M - 14) as string[])[0] ?? '';
      doc.text(noteLine, M + 5, M + 20);
    }

    // Progress bar inside the header banner.
    const barY = M + bannerH - 5.2;
    const barW = W - 2 * M - 10;
    doc.setGState(doc.GState({ opacity: 0.3 }));
    doc.setFillColor(...rgbHeaderInk);
    doc.roundedRect(M + 5, barY, barW, 2.2, 1.1, 1.1, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
    if (total && done) {
      doc.setFillColor(...rgbHeaderBar);
      doc.roundedRect(M + 5, barY, Math.max(2.5, (barW * done) / total), 2.2, 1.1, 1.1, 'F');
    }

    return M + bannerH + 4.5;
  };

  let y = header(true);

  // The in-game search for what is missing: paginated cleanly if very long so it never overflows off page 1.
  if (opts.search) {
    const qr = qrModules(opts.search);
    const qrSize = qr ? 30 : 0;
    const textW = W - 2 * M - qrSize - 6;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    const allLines = doc.splitTextToSize(pdfText(opts.search), textW - 6) as string[];
    const lineH = 3.6;
    let offset = 0;
    let firstBox = true;
    while (offset < allLines.length || firstBox) {
      const topPad = firstBox ? 15 : 6;
      const availH = H - M - y - topPad - 4;
      const maxLines = Math.max(1, Math.floor(availH / lineH));
      const slice = allLines.slice(offset, offset + maxLines);
      offset += slice.length;
      const boxH = Math.max(firstBox && qr ? qrSize + 6 : 0, topPad + slice.length * lineH + 2.5);
      doc.setFillColor(...rgbSearchBg);
      doc.setDrawColor(...rgbSearchBorder);
      doc.setLineWidth(0.35);
      doc.roundedRect(M, y, W - 2 * M, boxH, 3, 3, 'FD');
      if (firstBox) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...rgbInk);
        doc.text(pdfText(t.export_search_title), M + 4, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...rgbInk3);
        doc.text(pdfText(qr ? t.export_search_hint : t.export_search_no_qr), M + 4, y + 10);
      }
      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...rgbInk);
      if (slice.length) doc.text(slice, M + 4, y + topPad);
      if (firstBox && qr) {
        const cell = qrSize / (qr.length + 2);
        const qx = W - M - qrSize - 3;
        const qy = y + 3;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(qx, qy, qrSize, qrSize, 1.5, 1.5, 'F');
        doc.setFillColor(...rgbQrDark);
        qr.forEach((row, r) => row.forEach((dark, c) => { if (dark) doc.rect(qx + (c + 1) * cell, qy + (r + 1) * cell, cell + 0.02, cell + 0.02, 'F'); }));
      }
      firstBox = false;
      y += boxH + 4.5;
      if (offset < allLines.length) {
        doc.addPage();
        pageNum++;
        y = header(false);
      }
    }
  }

  let rowIdx = 0;
  rows.forEach(({ c, e, v, sp, url }) => {
    const col = rowIdx % COLS;
    if (col === 0 && rowIdx > 0) y += cellH + GAP;
    if (y + cellH > H - M) {
      doc.addPage();
      pageNum++;
      y = header(false);
      rowIdx = 0;
    }
    const drawCol = rowIdx % COLS;
    const x = M + drawCol * (cellW + GAP);
    const cx = x + cellW / 2;
    rowIdx++;

    // Collector card container.
    doc.setFillColor(...rgbCard);
    doc.setDrawColor(...(e.done ? rgbAccent : rgbBorder));
    doc.setLineWidth(e.done ? 0.6 : 0.3);
    doc.roundedRect(x, y, cellW, cellH, 3, 3, 'FD');

    // Subtle halo behind sprite.
    doc.setFillColor(...rgbHalo);
    doc.circle(cx, y + 13.5, 9.5, 'F');

    const pic = url ? shrunkByUrl.get(url) : null;
    if (pic) {
      if (e.done) doc.setGState(doc.GState({ opacity: 0.32 }));
      try {
        // Passing `url` as jsPDF image alias ensures duplicate sprites share a single embedded PDF object.
        doc.addImage(pic, 'PNG', cx - img / 2, y + 2.2, img, img, url!, 'FAST');
      } catch {}
      if (e.done) doc.setGState(doc.GState({ opacity: 1 }));
    }

    if (e.shiny) drawSparkle(x + cellW - 3.6, y + 4, 1.6, rgbShiny);

    const name = pdfText(localized(sp.name, lang));
    const formText = v.label ? localized(v.label, lang).replace(/\s+/g, ' ').trim() : '';
    const detail = pdfText([formText, e.shiny ? t.shiny : '', e.tag ? tagLabel(idx, e.tag, t) : ''].filter(Boolean).join(' · '));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...(e.done ? rgbInk3 : rgbInk));
    const nameLines = doc.splitTextToSize(name, cellW - 3.5).slice(0, 1) as string[];
    const ny = y + img + 6;
    doc.text(nameLines, cx, ny, { align: 'center' });
    if (e.done) {
      const w = Math.min(doc.getTextWidth(nameLines[0] ?? ''), cellW - 3.5);
      doc.setDrawColor(...rgbAccent);
      doc.setLineWidth(0.5);
      doc.line(cx - w / 2 - 1, ny - 1.1, cx + w / 2 + 1, ny - 1.1);
    }
    let dy = ny + 3.6;
    if (detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...rgbInk2);
      const lines = (doc.splitTextToSize(detail, cellW - 3.5) as string[]).slice(0, 1);
      doc.text(lines, cx, dy, { align: 'center' });
      dy += 3.6;
    }
    // Genders as drawn ♂ / ♀ (standard PDF fonts cannot write them), accent-coloured with a tick once caught.
    const genders = c.members.filter((m) => m.gender);
    if (genders.length) {
      const gap = 7;
      let gx = cx - ((genders.length - 1) * gap) / 2;
      doc.setLineWidth(0.32);
      doc.setLineCap('round');
      for (const m of genders) {
        if (m.done) doc.setDrawColor(...rgbAccent);
        else doc.setDrawColor(...rgbInk);
        const pen = { circle: (px: number, py: number, r: number) => doc.circle(px, py, r, 'S'), line: (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2) };
        const gy = dy - 0.8;
        drawGender(pen, m.gender as 'm' | 'f', m.done ? gx - 1 : gx, gy, 3.1);
        if (m.done) {
          doc.line(gx + 1.3, gy, gx + 1.9, gy + 0.7);
          doc.line(gx + 1.9, gy + 0.7, gx + 3, gy - 0.8);
        }
        gx += gap;
      }
    }
  });

  const filename = `${fileSlug(list.name)}.pdf`;
  const blob = doc.output('blob');
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dlUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(dlUrl), 30_000);
  return { blob, filename };
}
