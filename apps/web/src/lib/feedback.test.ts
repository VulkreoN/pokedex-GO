import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetFeedbackAudioForTest, feedback, setFeedbackPref, unlockAudio } from './feedback.js';

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: string = 'suspended';
  currentTime = 0;
  destination = {};
  oscillatorsStarted = 0;
  resumes = 0;
  closed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume = vi.fn(async () => {
    this.resumes++;
    this.state = 'running';
    this.currentTime += 0.05;
  });

  close = vi.fn(async () => {
    this.closed = true;
    this.state = 'closed';
  });

  createBuffer = vi.fn(() => ({}));
  createBufferSource = vi.fn(() => ({
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
  }));

  createOscillator = vi.fn(() => {
    const osc = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn((node: unknown) => node),
      disconnect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(() => {
        this.oscillatorsStarted++;
      }),
      stop: vi.fn(),
    };
    return osc;
  });

  createGain = vi.fn(() => ({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn((node: unknown) => node),
    disconnect: vi.fn(),
  }));
}

describe('feedback audio lifecycle', () => {
  const storage = new Map<string, string>();
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  const origLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    storage.clear();
    FakeAudioContext.instances = [];
    _resetFeedbackAudioForTest();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
    });
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('document', { visibilityState: 'visible' });
  });

  afterEach(() => {
    _resetFeedbackAudioForTest();
    vi.stubGlobal('window', origWindow);
    vi.stubGlobal('document', origDocument);
    vi.stubGlobal('localStorage', origLocalStorage);
  });

  it('resumes a suspended AudioContext and plays notes cleanly', async () => {
    feedback('tick');
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.resumes).toBe(1);
    await Promise.resolve();
    expect(ctx.oscillatorsStarted).toBe(1);

    // Subsequent sound plays synchronously while running.
    ctx.currentTime += 0.2;
    feedback('milestone');
    expect(ctx.oscillatorsStarted).toBe(3); // 1 + 2 notes
  });

  it('recreates AudioContext after iOS interrupted state instead of staying silent', async () => {
    const first = unlockAudio() as unknown as FakeAudioContext;
    await Promise.resolve();
    expect(first.state).toBe('running');

    // Simulate switching to Pokémon GO and back on iOS Safari.
    first.state = 'interrupted';
    feedback('tick');
    await Promise.resolve();

    expect(first.closed).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(2);
    const fresh = FakeAudioContext.instances[1]!;
    expect(fresh.state).toBe('running');
    expect(fresh.oscillatorsStarted).toBe(1);
  });

  it('respects the sounds toggle and still unlocks when re-enabled later', async () => {
    setFeedbackPref('sounds', false);
    expect(unlockAudio()).toBeNull();
    feedback('tick');
    expect(FakeAudioContext.instances).toHaveLength(0);

    // Turning sounds back on unlocks and plays the sample tick.
    setFeedbackPref('sounds', true);
    await Promise.resolve();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]!.oscillatorsStarted).toBe(1);
  });
});
