import { describe, expect, it } from 'vitest';
import { lastSlot, nextSlot } from './slots.js';

const H = [0, 6, 12, 18];
const paris = (iso: string) => new Date(iso);

describe('fixed update times in Paris', () => {
  it('in winter (UTC+1)', () => {
    expect(nextSlot(paris('2026-11-25T10:30:00Z'), H, 'Europe/Paris').toISOString()).toBe('2026-11-25T11:00:00.000Z'); // 12 h
    expect(lastSlot(paris('2026-11-25T10:30:00Z'), H, 'Europe/Paris').toISOString()).toBe('2026-11-25T05:00:00.000Z'); // 6 h
    expect(nextSlot(paris('2026-11-25T22:59:00Z'), H, 'Europe/Paris').toISOString()).toBe('2026-11-25T23:00:00.000Z'); // midnight
  });
  it('in summer (UTC+2)', () => {
    expect(nextSlot(paris('2026-07-01T04:10:00Z'), H, 'Europe/Paris').toISOString()).toBe('2026-07-01T10:00:00.000Z'); // 6 h Paris was 04:00Z: next is 12 h
  });
  it('across the clock change (29 March 2026, 2 h -> 3 h)', () => {
    expect(nextSlot(paris('2026-03-28T23:30:00Z'), H, 'Europe/Paris').toISOString()).toBe('2026-03-29T04:00:00.000Z'); // 6 h summer time
    expect(lastSlot(paris('2026-03-29T03:00:00Z'), H, 'Europe/Paris').toISOString()).toBe('2026-03-28T23:00:00.000Z'); // midnight winter time
  });
  it('an exact slot is the last one, not the next', () => {
    const at = paris('2026-11-25T11:00:00Z');
    expect(lastSlot(at, H, 'Europe/Paris').toISOString()).toBe(at.toISOString());
    expect(nextSlot(at, H, 'Europe/Paris').toISOString()).toBe('2026-11-25T17:00:00.000Z');
  });
});
