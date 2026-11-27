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

type AudioCtxCtor = typeof AudioContext;
function audioCtor(): AudioCtxCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext ?? null;
}

let audio: AudioContext | null = null;
let lastAudioTime = -1;
let lastPlayWall = 0;

function resetAudio() {
  if (audio) {
    try {
      if (audio.state !== 'closed') void audio.close().catch(() => {});
    } catch {}
  }
  audio = null;
  lastAudioTime = -1;
  lastPlayWall = 0;
}

function getOrCreateCtx(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  // iOS Safari moves AudioContext to "interrupted" after switching apps (e.g. Pokémon GO) and often cannot resume it.
  if (audio && (audio.state === 'closed' || (audio.state as string) === 'interrupted')) {
    resetAudio();
  }
  if (!audio) {
    try {
      audio = new Ctor({ latencyHint: 'interactive' });
    } catch {
      audio = new Ctor();
    }
  }
  return audio;
}

/**
 * Wakes Web Audio inside a real user gesture (touchend / click / keydown).
 * - Never detaches permanently: returning from another app (iOS 'interrupted') or re-enabling sounds in Me re-arms it.
 * - Plays a 1-sample silent buffer when resuming (required on iOS WebKit so subsequent async feedback() calls play).
 */
export function unlockAudio(): AudioContext | null {
  if (!read('sounds')) return null;
  const a = getOrCreateCtx();
  if (!a) return null;
  if (a.state !== 'running') {
    void a.resume().catch(() => {});
    try {
      const silent = a.createBuffer(1, 1, 22050);
      const src = a.createBufferSource();
      src.buffer = silent;
      src.connect(a.destination);
      src.start(0);
    } catch {}
  }
  return a;
}

/** Test helper to reset module-level AudioContext state between unit tests. */
export function _resetFeedbackAudioForTest() {
  resetAudio();
}

if (typeof window !== 'undefined') {
  const wake = () => {
    if (!read('sounds')) return;
    if (!audio || audio.state !== 'running') unlockAudio();
  };
  // Use real user-activation gestures (NOT pointerdown, which iOS Safari ignores for AudioContext.resume()).
  window.addEventListener('touchend', wake, { capture: true, passive: true });
  window.addEventListener('click', wake, { capture: true, passive: true });
  window.addEventListener('keydown', wake, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && read('sounds') && audio) {
      if ((audio.state as string) === 'interrupted') resetAudio();
      else if (audio.state !== 'running') void audio.resume().catch(() => {});
    }
  });
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
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {}
  };
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export type FeedbackKind = 'tick' | 'untick' | 'drop' | 'milestone' | 'success';
const VIBRATIONS: Record<FeedbackKind, number | number[]> = { tick: 12, untick: 8, drop: 18, milestone: [15, 40, 15], success: [20, 60, 30] };

export function feedback(kind: FeedbackKind) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (read('haptics')) navigator.vibrate?.(VIBRATIONS[kind]);
  if (!read('sounds')) return;
  let a = getOrCreateCtx();
  if (!a) return;
  // Detect a frozen iOS WebKit AudioContext (reports 'running' after app switch, yet currentTime stopped advancing).
  const now = Date.now();
  if (a.state === 'running' && lastPlayWall > 0 && now - lastPlayWall > 500 && a.currentTime === lastAudioTime) {
    resetAudio();
    a = getOrCreateCtx();
    if (!a) return;
  }
  if (a.state !== 'running') {
    const requestedAt = now;
    void a
      .resume()
      .then(() => {
        if (a && a.state === 'running' && Date.now() - requestedAt < 1000) play(a, kind);
      })
      .catch(() => {});
    return;
  }
  play(a, kind);
}

function play(a: AudioContext, kind: FeedbackKind) {
  lastAudioTime = a.currentTime;
  lastPlayWall = Date.now();
  const t = a.currentTime + 0.005;
  if (kind === 'tick') note(a, t, 880, 1320, 0.09, 0.16);
  else if (kind === 'untick') note(a, t, 520, 360, 0.09, 0.13);
  else if (kind === 'drop') note(a, t, 220, 140, 0.12, 0.18);
  // Two rising notes: a step taken.
  else if (kind === 'milestone') [659.25, 987.77].forEach((f, i) => note(a, t + i * 0.09, f, f * 1.01, 0.16, 0.15));
  // C, E, G, high C: a little "done".
  else [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(a, t + i * 0.08, f, f * 1.01, 0.22, 0.15));
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
