/**
 * Exports a list as an A4 PDF: a grid of pictures with names, caught ones faded and struck through.
 * jsPDF is loaded on demand; sprites are fetched as data URLs (both image hosts send CORS headers).
 */
import type { ListDetail } from '@mydexpogo/shared';
import { imageUrl, tagLabel, type DatasetIndex } from './dataset.js';
import { localized } from './i18n.js';
import type { Lang } from '@mydexpogo/shared';

async function toDataUrl(url: string): Promise<string | null> {
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

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
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

/** Standard PDF fonts only cover Latin-1-ish text: replace what they cannot draw. */
const pdfText = (s: string) => s.replace(/♂/g, '(m)').replace(/♀/g, '(f)').replace(/[’]/g, "'").replace(/[^\x20-\x7E -ſŒœ]/g, '');

export interface PdfLabels {
  caught: string;
  missing: string;
  shiny: string;
  by: (name: string) => string;
  progress: (done: number, total: number) => string;
}

export async function exportListPdf(idx: DatasetIndex, list: ListDetail, lang: Lang, t: PdfLabels & Record<string, unknown>, opts: { onlyMissing?: boolean } = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 12;
  const COLS = 5;
  const cellW = (W - 2 * M) / COLS;
  const cellH = 44;
  const img = 24;

  const entries = list.entries.filter((e) => !opts.onlyMissing || !e.done);
  const rows = entries
    .map((e) => {
      const v = idx.variantByKey.get(e.variantKey);
      const sp = v && idx.speciesByDex.get(v.dex);
      return v && sp ? { e, v, sp } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const pictures = await mapLimit(rows, 8, async ({ e, v }) => {
    const url = imageUrl(idx, v, e.shiny) ?? imageUrl(idx, v, false);
    return url ? toDataUrl(url) : null;
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
  rows.forEach(({ e, v, sp }, i) => {
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
        doc.addImage(pic, 'PNG', cx - img / 2, y + 1, img, img);
      } catch {}
      if (e.done) doc.setGState(doc.GState({ opacity: 1 }));
    }
    const name = pdfText(localized(sp.name, lang));
    const detail = pdfText(
      [v.label ? localized(v.label, lang) : '', v.gender === 'f' ? '♀' : v.gender === 'm' ? '♂' : '', e.shiny ? t.shiny : '', e.tag ? tagLabel(idx, e.tag, t) : ''].filter(Boolean).join(' · '),
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
    if (detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 128, 136);
      doc.text((doc.splitTextToSize(detail, cellW - 3) as string[]).slice(0, 2), cx, ny + 3.5, { align: 'center' });
    }
  });

  const slug = list.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'liste';
  doc.save(`${slug}.pdf`);
}
