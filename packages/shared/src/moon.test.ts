import { describe, expect, it } from 'vitest';
import { nextFullMoons } from './moon.js';

const near = (d: Date, iso: string) => Math.abs(d.getTime() - Date.parse(iso)) < 30 * 60_000;

describe('full moons', () => {
  it('match published dates within half an hour', () => {
    // Published full moons (UTC): 23 Apr 2024 23:49, 3 Jan 2026 10:03, 1 Feb 2026 22:09.
    expect(near(nextFullMoons(new Date('2024-04-20T00:00:00Z'), 1)[0]!, '2024-04-23T23:49:00Z')).toBe(true);
    const [jan, feb] = nextFullMoons(new Date('2026-01-01T00:00:00Z'), 2);
    expect(near(jan!, '2026-01-03T10:03:00Z')).toBe(true);
    expect(near(feb!, '2026-02-01T22:09:00Z')).toBe(true);
  });
  it('one a lunar month, in order', () => {
    const moons = nextFullMoons(new Date('2026-11-25T00:00:00Z'), 6);
    for (let i = 1; i < moons.length; i++) {
      const days = (moons[i]!.getTime() - moons[i - 1]!.getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThan(30.1);
    }
  });
});
