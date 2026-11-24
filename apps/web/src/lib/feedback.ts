/**
 * Small rewards for actions: soft synthesized sounds (no files to download), a short vibration where phones allow
 * it, and confetti when a collection is complete. Sounds and vibrations can be switched off in Me; confetti follows
 * the device's "reduce motion" setting.
 */
import { useSyncExternalStore } from 'react';

type Pref = 'sounds' | 'haptics';
const listeners = new Set<() => void>();
const read = (k: Pref) => {
  try {
    return localStorage.getItem(`fx-${k}`) !== '0';
  } catch {
    return true;
  }
};
export function setFeedbackPref(k: Pref, on: boolean) {
  try {
    localStorage.setItem(`fx-${k}`, on ? '1' : '0');
  } catch {}
  listeners.forEach((l) => l());
  // A sample of what was just switched on.
  if (on) feedback('tick');
}
export function useFeedbackPref(k: Pref): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(k),
    () => true,
  );
}

let audio: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/** One soft note: a sine with a quick attack and a short fade, optionally gliding to another pitch. */
function note(a: AudioContext, at: number, from: number, to: number, dur: number, volume: number) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export type FeedbackKind = 'tick' | 'untick' | 'drop' | 'success';
const VIBRATIONS: Record<FeedbackKind, number | number[]> = { tick: 12, untick: 8, drop: 18, success: [20, 60, 30] };

export function feedback(kind: FeedbackKind) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (read('haptics')) navigator.vibrate?.(VIBRATIONS[kind]);
  if (!read('sounds')) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  if (kind === 'tick') note(a, t, 880, 1320, 0.09, 0.08);
  else if (kind === 'untick') note(a, t, 520, 360, 0.09, 0.06);
  else if (kind === 'drop') note(a, t, 220, 140, 0.12, 0.1);
  // C, E, G, high C: a little "done".
  else [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(a, t + i * 0.08, f, f * 1.01, 0.22, 0.07));
}

/** A burst of confetti over the page, gone in about two seconds. */
export function celebrate() {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '60' });
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const colors = ['#2a9d5c', '#40c2d6', '#3f8fe0', '#e0a91b', '#ef6f6c', '#ffffff'];
  const W = window.innerWidth;
  const H = window.innerHeight;
  const bits = Array.from({ length: 110 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -6 - Math.random() * 9,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    c: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  const start = performance.now();
  const frame = (now: number) => {
    const life = (now - start) / 2200;
    g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.35;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - life);
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (life < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
