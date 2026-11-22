import { describe, expect, it } from 'vitest';
import { FIRST_SEEN_BEFORE_TRACKING, repairFirstSeen } from './build.js';

describe('repairFirstSeen', () => {
  it('drops a date shared by hundreds of keys and keeps real ones', () => {
    const map: Record<string, string> = { a: '2025-10-01', b: '2026-11-20', c: FIRST_SEEN_BEFORE_TRACKING };
    for (let i = 0; i < 400; i++) map[`k${i}`] = '2026-11-16';
    expect(repairFirstSeen(map)).toBe(400);
    expect(map).toEqual({ a: '2025-10-01', b: '2026-11-20', c: FIRST_SEEN_BEFORE_TRACKING });
  });
  it('leaves a normal map alone', () => {
    const map = { a: '2026-11-16', b: '2026-11-16' };
    expect(repairFirstSeen(map)).toBe(0);
  });
});
