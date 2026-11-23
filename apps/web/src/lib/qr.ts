import qrcode from 'qrcode-generator';

// The library writes text as Latin-1; phones read QR text as UTF-8 ("échangé", "mâle"...).
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

/** A QR code as rows of dark / light modules, to draw on a canvas or in a PDF; null when the text is too long for one. */
export function qrModules(text: string): boolean[][] | null {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  try {
    qr.make();
  } catch {
    // Past about 2,900 bytes no QR code holds it: callers keep the text alone.
    return null;
  }
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
