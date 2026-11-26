import { describe, expect, it } from 'vitest';
import type { ListEntry } from '@mydexpogo/shared';
import { EXPORT_THEMES, hexRgb, resolveExportTheme, suggestExportTheme } from './exportTheme.js';

const entry = (extra: Partial<ListEntry> = {}): ListEntry => ({
  variantKey: '25',
  gender: 'm',
  shiny: false,
  tag: '',
  done: false,
  note: null,
  ...extra,
});

describe('export themes', () => {
  it('auto-suggests shiny, lucky or shadow when at least half the hunted entries match', () => {
    expect(suggestExportTheme([entry({ shiny: true }), entry({ shiny: true }), entry()])).toBe('shiny');
    expect(suggestExportTheme([entry({ tag: 'lucky' }), entry({ tag: 'lucky', shiny: true })])).toBe('lucky');
    expect(suggestExportTheme([entry({ tag: 'shadow' }), entry()])).toBe('shadow');
    expect(suggestExportTheme([entry(), entry(), entry({ shiny: true })])).toBe('male');
    expect(suggestExportTheme([entry({ gender: 'm' }), entry({ gender: 'f' }), entry({ shiny: true, gender: 'f' })])).toBe('classic');
    expect(suggestExportTheme([entry({ gender: 'f' }), entry({ gender: 'f' }), entry({ gender: '' })])).toBe('female');
    expect(suggestExportTheme([entry({ gender: 'm' }), entry({ gender: 'm' })])).toBe('male');
    expect(suggestExportTheme([])).toBe('classic');
  });

  it('considers missing entries first when onlyMissing is true, falling back to all entries if completed', () => {
    const entries = [
      entry({ shiny: false, gender: 'm', done: true }),
      entry({ shiny: false, gender: 'f', done: true }),
      entry({ shiny: true, gender: 'm', done: false }),
    ];
    expect(suggestExportTheme(entries, true)).toBe('shiny');
    expect(suggestExportTheme(entries, false)).toBe('classic');

    const completed = [entry({ tag: 'lucky', done: true }), entry({ tag: 'lucky', done: true })];
    expect(suggestExportTheme(completed, true)).toBe('lucky');
  });

  it('resolves explicit themes and converts hex colours to RGB tuples for PDFs', () => {
    expect(resolveExportTheme('night', [entry({ shiny: true })]).id).toBe('night');
    expect(resolveExportTheme('auto', [entry({ shiny: true })]).id).toBe('shiny');
    expect(hexRgb(EXPORT_THEMES.shiny.paper)).toEqual([15, 22, 41]);
    expect(hexRgb(EXPORT_THEMES.lucky.headerFrom)).toEqual([196, 116, 0]);
  });
});
