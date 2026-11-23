import qrcode from 'qrcode-generator';

// The library writes text as Latin-1; phones read QR text as UTF-8 ("échangé", "mâle"...).
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

/** A QR code as rows of dark / light modules, to draw on a canvas or in a PDF. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
