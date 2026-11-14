import { describe, expect, it } from 'vitest';
import { humanizeToken, localizeHumanized, looksLikeCostume } from './labels.js';

describe('humanizeToken', () => {
  it('expands known words and drops variant numbers', () => {
    expect(humanizeToken('GOFEST_2026_CAP_RED')).toBe('GO Fest 2026 Cap Red');
    expect(humanizeToken('HALLOWEEN_2026_01')).toBe('Halloween 2026');
    expect(humanizeToken('A_HALLOWEEN_2026_01')).toBe('A Halloween 2026');
    expect(humanizeToken('JAN_2020_NOEVOLVE')).toBe('Jan 2020');
    expect(humanizeToken('FLYING_5TH_ANNIV')).toBe('Flying 5th Anniversary');
  });
  it('translates the easy words to French', () => {
    expect(localizeHumanized('Fall 2019')).toEqual({ en: 'Fall 2019', fr: 'Automne 2019' });
    expect(localizeHumanized('WCS 2026')).toEqual({ en: 'WCS 2026' });
  });
});

describe('looksLikeCostume', () => {
  it('spots event tokens', () => {
    expect(looksLikeCostume('HALLOWEEN_2026_01')).toBe(true);
    expect(looksLikeCostume('GOGGLES_2026')).toBe(true);
    expect(looksLikeCostume('ALOLA')).toBe(false);
    expect(looksLikeCostume('MEGA_X')).toBe(false);
    expect(looksLikeCostume('UNOWN_A')).toBe(false);
  });
});
