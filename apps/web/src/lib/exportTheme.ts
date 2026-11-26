import type { ListEntry } from '@mydexpogo/shared';

export type ExportThemeId = 'classic' | 'shiny' | 'lucky' | 'shadow' | 'male' | 'female' | 'night' | 'minimal';
export type ExportThemeChoice = 'auto' | ExportThemeId;
export type ExportMotif = 'pokeball' | 'stars' | 'bokeh' | 'aura' | 'male' | 'female' | 'night' | 'minimal';

export const EXPORT_THEME_IDS: readonly ExportThemeId[] = ['classic', 'shiny', 'lucky', 'shadow', 'male', 'female', 'night', 'minimal'];

export interface ExportTheme {
  id: ExportThemeId;
  dark: boolean;
  motif: ExportMotif;
  paper: string;
  paper2: string;
  card: string;
  cardBorder: string;
  headerFrom: string;
  headerTo: string;
  headerInk: string;
  headerMuted: string;
  headerTrack: string;
  headerBar: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  shiny: string;
  halo: string;
  /** Solid approximation of halo for PDF vector fills (which avoid alpha transparency issues). */
  pdfHalo: string;
  searchBg: string;
  searchBorder: string;
  qrDark: string;
}

export const EXPORT_THEMES: Record<ExportThemeId, ExportTheme> = {
  classic: {
    id: 'classic',
    dark: false,
    motif: 'pokeball',
    paper: '#e9f4ea',
    paper2: '#d9ebdb',
    card: '#ffffff',
    cardBorder: '#cfe0d2',
    headerFrom: '#158296',
    headerTo: '#246ec4',
    headerInk: '#ffffff',
    headerMuted: 'rgba(255,255,255,0.88)',
    headerTrack: 'rgba(255,255,255,0.32)',
    headerBar: '#ffffff',
    ink: '#233842',
    ink2: '#4a5f6a',
    ink3: '#50646e',
    accent: '#1f7d47',
    accentSoft: '#d7f2e2',
    accentInk: '#ffffff',
    shiny: '#e9b20f',
    halo: 'rgba(31,125,71,0.08)',
    pdfHalo: '#eef7f1',
    searchBg: '#ffffff',
    searchBorder: '#cfe0d2',
    qrDark: '#14232b',
  },
  shiny: {
    id: 'shiny',
    dark: true,
    motif: 'stars',
    paper: '#0f1629',
    paper2: '#1a2542',
    card: '#192440',
    cardBorder: '#3c3a61',
    headerFrom: '#1c2447',
    headerTo: '#402970',
    headerInk: '#fff8e1',
    headerMuted: 'rgba(255,244,210,0.84)',
    headerTrack: 'rgba(245,200,66,0.26)',
    headerBar: '#f5c842',
    ink: '#f4f6fc',
    ink2: '#cbd5e8',
    ink3: '#95a5c4',
    accent: '#f5c842',
    accentSoft: '#332d1f',
    accentInk: '#1c1504',
    shiny: '#ffd24c',
    halo: 'rgba(245,200,66,0.14)',
    pdfHalo: '#27314e',
    searchBg: '#192440',
    searchBorder: '#433f68',
    qrDark: '#10172a',
  },
  lucky: {
    id: 'lucky',
    dark: false,
    motif: 'bokeh',
    paper: '#fdf3d3',
    paper2: '#f5e2a8',
    card: '#fffdf7',
    cardBorder: '#e5c66e',
    headerFrom: '#c47400',
    headerTo: '#e5a30b',
    headerInk: '#ffffff',
    headerMuted: 'rgba(255,255,255,0.9)',
    headerTrack: 'rgba(255,255,255,0.34)',
    headerBar: '#ffffff',
    ink: '#3a2606',
    ink2: '#6b4c14',
    ink3: '#7a5c22',
    accent: '#c47400',
    accentSoft: '#fae8b4',
    accentInk: '#ffffff',
    shiny: '#d98c00',
    halo: 'rgba(230,168,20,0.16)',
    pdfHalo: '#fbf2d4',
    searchBg: '#fffdf7',
    searchBorder: '#e5c66e',
    qrDark: '#3a2606',
  },
  shadow: {
    id: 'shadow',
    dark: true,
    motif: 'aura',
    paper: '#150f21',
    paper2: '#251a38',
    card: '#221833',
    cardBorder: '#4c3470',
    headerFrom: '#2d114d',
    headerTo: '#621d85',
    headerInk: '#faf4ff',
    headerMuted: 'rgba(240,224,255,0.84)',
    headerTrack: 'rgba(200,135,255,0.28)',
    headerBar: '#c887ff',
    ink: '#f5effc',
    ink2: '#cbbbe0',
    ink3: '#a38ec2',
    accent: '#b873ff',
    accentSoft: '#352252',
    accentInk: '#170a26',
    shiny: '#f2c744',
    halo: 'rgba(184,115,255,0.16)',
    pdfHalo: '#31234a',
    searchBg: '#221833',
    searchBorder: '#4c3470',
    qrDark: '#1c1030',
  },
  male: {
    id: 'male',
    dark: false,
    motif: 'male',
    paper: '#e8f1fc',
    paper2: '#d5e5f9',
    card: '#ffffff',
    cardBorder: '#bdd5f2',
    headerFrom: '#1b5ec2',
    headerTo: '#2c84e0',
    headerInk: '#ffffff',
    headerMuted: 'rgba(255,255,255,0.88)',
    headerTrack: 'rgba(255,255,255,0.32)',
    headerBar: '#ffffff',
    ink: '#172c47',
    ink2: '#3f5a7a',
    ink3: '#4c6582',
    accent: '#1b5ec2',
    accentSoft: '#d8e9fc',
    accentInk: '#ffffff',
    shiny: '#e9b20f',
    halo: 'rgba(27,94,194,0.09)',
    pdfHalo: '#edf4fc',
    searchBg: '#ffffff',
    searchBorder: '#bdd5f2',
    qrDark: '#172c47',
  },
  female: {
    id: 'female',
    dark: false,
    motif: 'female',
    paper: '#fcebf2',
    paper2: '#f7d6e4',
    card: '#ffffff',
    cardBorder: '#f0bfd4',
    headerFrom: '#b82962',
    headerTo: '#e0538b',
    headerInk: '#ffffff',
    headerMuted: 'rgba(255,255,255,0.9)',
    headerTrack: 'rgba(255,255,255,0.32)',
    headerBar: '#ffffff',
    ink: '#40182a',
    ink2: '#6e3b52',
    ink3: '#7a495f',
    accent: '#b82962',
    accentSoft: '#fadbe8',
    accentInk: '#ffffff',
    shiny: '#e9b20f',
    halo: 'rgba(184,41,98,0.09)',
    pdfHalo: '#fdf0f5',
    searchBg: '#ffffff',
    searchBorder: '#f0bfd4',
    qrDark: '#40182a',
  },
  night: {
    id: 'night',
    dark: true,
    motif: 'night',
    paper: '#18242e',
    paper2: '#233442',
    card: '#223341',
    cardBorder: '#354b5d',
    headerFrom: '#1b5d6c',
    headerTo: '#1f4170',
    headerInk: '#ffffff',
    headerMuted: 'rgba(230,244,248,0.84)',
    headerTrack: 'rgba(255,255,255,0.28)',
    headerBar: '#3dd484',
    ink: '#edf4f6',
    ink2: '#b9c9d1',
    ink3: '#9bb0bc',
    accent: '#239456',
    accentSoft: '#204536',
    accentInk: '#ffffff',
    shiny: '#f0c23a',
    halo: 'rgba(61,212,132,0.11)',
    pdfHalo: '#293e4e',
    searchBg: '#223341',
    searchBorder: '#354b5d',
    qrDark: '#14232b',
  },
  minimal: {
    id: 'minimal',
    dark: false,
    motif: 'minimal',
    paper: '#f8faf9',
    paper2: '#edf1f0',
    card: '#ffffff',
    cardBorder: '#d3dde0',
    headerFrom: '#233842',
    headerTo: '#334d5a',
    headerInk: '#ffffff',
    headerMuted: 'rgba(255,255,255,0.84)',
    headerTrack: 'rgba(255,255,255,0.28)',
    headerBar: '#ffffff',
    ink: '#1e2e36',
    ink2: '#4a5f6a',
    ink3: '#5a6e78',
    accent: '#1f7d47',
    accentSoft: '#e4f2ea',
    accentInk: '#ffffff',
    shiny: '#d49a00',
    halo: 'rgba(35,56,66,0.04)',
    pdfHalo: '#f3f6f5',
    searchBg: '#f2f5f4',
    searchBorder: '#d3dde0',
    qrDark: '#1e2e36',
  },
};

/** Parses a 6-digit hex colour into [r, g, b] for jsPDF. */
export function hexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

/**
 * Picks the most fitting export theme for a collection based on what it hunts:
 * mostly lucky -> lucky, mostly shadow -> shadow, mostly shiny -> shiny,
 * single-gender collections -> male / female, otherwise classic.
 */
export function suggestExportTheme(entries: ListEntry[], onlyMissing = true): ExportThemeId {
  const active = onlyMissing ? entries.filter((e) => !e.done) : entries;
  const pool = active.length ? active : entries;
  if (!pool.length) return 'classic';
  const lucky = pool.filter((e) => e.tag === 'lucky').length;
  const shadow = pool.filter((e) => e.tag === 'shadow').length;
  const shiny = pool.filter((e) => e.shiny).length;
  const half = pool.length / 2;
  if (lucky >= half) return 'lucky';
  if (shadow >= half) return 'shadow';
  if (shiny >= half) return 'shiny';
  const male = pool.filter((e) => e.gender === 'm').length;
  const female = pool.filter((e) => e.gender === 'f').length;
  if (male >= half && female === 0) return 'male';
  if (female >= half && male === 0) return 'female';
  return 'classic';
}

export function resolveExportTheme(choice: ExportThemeChoice, entries: ListEntry[], onlyMissing = true): ExportTheme {
  return EXPORT_THEMES[choice === 'auto' ? suggestExportTheme(entries, onlyMissing) : choice];
}

const THEME_KEY = 'exportTheme';
const CODE_KEY = 'exportShowCode';

export function savedExportTheme(): ExportThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'auto' || (EXPORT_THEME_IDS as readonly string[]).includes(v ?? '')) return v as ExportThemeChoice;
  } catch {}
  return 'auto';
}
export function saveExportTheme(choice: ExportThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {}
}

export function savedExportShowCode(): boolean {
  try {
    return localStorage.getItem(CODE_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveExportShowCode(on: boolean) {
  try {
    localStorage.setItem(CODE_KEY, on ? '1' : '0');
  } catch {}
}
