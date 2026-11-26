import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useT } from '../lib/i18n.js';
import { Button, Sheet } from './ui.js';

/** Our QR codes hold the 12 digits; any 12-digit code in a scanned text is taken, spaces or not. */
export function friendCodeIn(text: string): string | null {
  const digits = /(?:^|\D)(\d{4}\s?\d{4}\s?\d{4})(?:\D|$)/.exec(text)?.[1]?.replace(/\s/g, '');
  return digits ?? null;
}

/** My friend code as a QR code, dark on white whatever the theme so any camera reads it. */
export function FriendQr({ code, size = 184 }: { code: string; size?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(code, 'Numeric');
  qr.make();
  const n = qr.getModuleCount();
  const cells: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={code} className="rounded-xl bg-white" shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={cells.join('')} fill="#14232b" />
    </svg>
  );
}

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

/** Reads a QR code from a frame or a picture: the browser's own detector when there is one, jsQR otherwise. */
async function readQr(source: HTMLVideoElement | HTMLImageElement, canvas: HTMLCanvasElement, detector: Detector | null): Promise<string | null> {
  if (detector) {
    try {
      const found = await detector.detect(source);
      if (found[0]) return found[0].rawValue;
      return null;
    } catch {}
  }
  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!w || !h) return null;
  // Large screenshots are scaled down: jsQR is fast enough at ~1000 px and still finds the code.
  const scale = Math.min(1, 1000 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import('jsqr');
  return jsQR(img.data, img.width, img.height)?.data ?? null;
}

/** Scan a friend's QR code with the camera, or read it from a screenshot. */
export function QrScanSheet({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const detector = useRef<Detector | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    try {
      detector.current = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    } catch {
      detector.current = null;
    }
    // The camera needs HTTPS (or localhost); the picture route works everywhere.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(t.qr_no_camera);
      return;
    }
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped || !video.current || !canvas.current) return;
      const text = await readQr(video.current, canvas.current, detector.current).catch(() => null);
      const code = text && friendCodeIn(text);
      if (code) {
        onCode(code);
        return;
      }
      if (text) setError(t.qr_not_friend_code);
      timer = window.setTimeout(tick, 250);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setCameraOn(true);
        tick();
      })
      .catch(() => setError(t.qr_camera_denied));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      setCameraOn(false);
    };
  }, [open]);

  const fromFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const text = await readQr(img, canvas.current!, detector.current);
      const code = text && friendCodeIn(text);
      if (code) onCode(code);
      else setError(text ? t.qr_not_friend_code : t.qr_not_found);
    } catch {
      setError(t.qr_not_found);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.qr_scan_title}>
      <div className="space-y-3">
        <div className={`relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-[#14232b] ${cameraOn ? '' : 'hidden'}`}>
          <video ref={video} muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
        </div>
        {cameraOn && <p className="text-center text-sm text-ink-2">{t.qr_scan_hint}</p>}
        {error && <p className="text-sm text-ink-2">{error}</p>}
        <canvas ref={canvas} className="hidden" />
        <label className="block">
          <span className="sr-only">{t.qr_from_picture}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromFile(f); e.target.value = ''; }} />
          <span className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-paper-2 px-4 text-[15px] font-semibold text-ink hover:brightness-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
            {t.qr_from_picture}
          </span>
        </label>
        <Button tone="ghost" className="w-full" onClick={onClose}>{t.cancel}</Button>
      </div>
    </Sheet>
  );
}
