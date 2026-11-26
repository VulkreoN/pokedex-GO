import { useMemo, useState } from 'react';
import type { ListDetail } from '@mydexpogo/shared';
import { cardDone, cardsOf, missingCards } from '../lib/cards.js';
import { entryVariant, type DatasetIndex } from '../lib/dataset.js';
import { fmtCode } from '../lib/errors.js';
import {
  EXPORT_THEMES,
  EXPORT_THEME_IDS,
  resolveExportTheme,
  saveExportShowCode,
  saveExportTheme,
  savedExportShowCode,
  savedExportTheme,
  suggestExportTheme,
  type ExportTheme,
  type ExportThemeChoice,
} from '../lib/exportTheme.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { exportListPdf, fileSlug } from '../lib/pdf.js';
import { exportSearch } from '../lib/searchString.js';
import { canCopyPicture, canSharePictures, copyPicture, downloadBlob, renderListImages, sharePictures, type ImageLayout } from '../lib/shareImage.js';
import { FormBlindWarning, SearchSettingsPanel, useSearchSettings } from './SearchStrings.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet, SwitchThumb, TextField } from './ui.js';

interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  idx: DatasetIndex;
  list: ListDetail;
  defaultOnlyMissing: boolean;
  friendCode?: string;
}

export function ExportSheet(props: ExportSheetProps) {
  const t = useT();
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t.export_title}>
      {props.open && <ExportSheetBody {...props} />}
    </Sheet>
  );
}

function ExportSheetBody({ onClose, idx, list, defaultOnlyMissing, friendCode }: ExportSheetProps) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();

  const [exportMissing, setExportMissing] = useState(defaultOnlyMissing);

  const [themeChoice, setThemeChoiceState] = useState<ExportThemeChoice>(savedExportTheme);
  const setThemeChoice = (c: ExportThemeChoice) => {
    setThemeChoiceState(c);
    saveExportTheme(c);
  };
  const [showCode, setShowCodeState] = useState(savedExportShowCode);
  const setShowCode = (on: boolean) => {
    setShowCodeState(on);
    saveExportShowCode(on);
  };
  const [note, setNote] = useState('');
  const [imageLayout, setImageLayout] = useState<ImageLayout>('preview');
  const [exporting, setExporting] = useState<'save' | 'copy' | 'share' | 'pdf' | null>(null);
  const [withSearch, setWithSearchState] = useState(() => {
    try {
      return localStorage.getItem('exportWithSearch') !== '0';
    } catch {
      return true;
    }
  });
  const setWithSearch = (on: boolean) => {
    setWithSearchState(on);
    try {
      localStorage.setItem('exportWithSearch', on ? '1' : '0');
    } catch {}
  };

  // The same search settings as "Copy for the game", always for the missing ones.
  const searchSettings = useSearchSettings();
  const ss = { ...searchSettings.settings, onlyMissing: true };
  const exportedSearch = useMemo(
    () => exportSearch(idx, list.entries, ss),
    [idx, list.entries, ss.gameLang, ss.exclude, ss.preEvolutions, ss.maxLength],
  );
  const search = exportedSearch.text;

  const suggestedId = useMemo(() => suggestExportTheme(list.entries, exportMissing), [list.entries, exportMissing]);
  const theme = useMemo(() => resolveExportTheme(themeChoice, list.entries, exportMissing), [themeChoice, list.entries, exportMissing]);
  const activeCode = showCode && friendCode ? friendCode : undefined;

  /** Image or PDF export using the active theme, note, friend code, and search settings. */
  const exportAs = async (kind: 'save' | 'copy' | 'share' | 'pdf') => {
    setExporting(kind);
    try {
      const common = { onlyMissing: exportMissing, search: withSearch ? search : null, theme, note: note.trim() || undefined, friendCode: activeCode };
      if (kind === 'pdf') await exportListPdf(idx, list, lang, t, common);
      else {
        const blobs = await renderListImages(idx, list, lang, t, { ...common, layout: imageLayout });
        const names = blobs.map((_, i) => `${fileSlug(list.name)}${blobs.length > 1 ? `-${i + 1}` : ''}.png`);
        if (kind === 'save') {
          blobs.forEach((b, i) => downloadBlob(b, names[i]!));
          toast(t.images_saved(blobs.length));
        } else if (kind === 'copy') {
          if (blobs.length > 1) {
            toast(t.image_copy_pages(blobs.length));
            return;
          }
          await copyPicture(blobs[0]!);
          toast(t.image_copied);
        } else if (!(await sharePictures(blobs, names, list.name))) return;
      }
      onClose();
    } catch {
      toast(t.err_generic);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Chip active={exportMissing} onClick={() => setExportMissing(true)}>{t.export_scope_missing}</Chip>
        <Chip active={!exportMissing} onClick={() => setExportMissing(false)}>{t.export_scope_all}</Chip>
      </div>

      {/* Live miniature preview reflecting the active theme, scope, note, and friend code. */}
      <ExportPreview idx={idx} list={list} onlyMissing={exportMissing} theme={theme} note={note.trim()} friendCode={activeCode} />

      {/* Visual style swatches: Auto + 8 Pokémon GO collector themes. */}
      <section aria-label={t.export_style}>
        <p className="mb-1.5 text-sm font-semibold">{t.export_style}</p>
        <div className="grid grid-cols-3 gap-1.5">
          <ThemeSwatchButton
            active={themeChoice === 'auto'}
            onClick={() => setThemeChoice('auto')}
            theme={EXPORT_THEMES[suggestedId]}
            label={`${t.export_theme_auto} · ${t.export_themes[suggestedId]}`}
          />
          {EXPORT_THEME_IDS.map((id) => (
            <ThemeSwatchButton
              key={id}
              active={themeChoice === id}
              onClick={() => setThemeChoice(id)}
              theme={EXPORT_THEMES[id]}
              label={t.export_themes[id] ?? id}
            />
          ))}
        </div>
      </section>

      {/* Image export actions. */}
      <section className="card space-y-3 p-3" aria-label={t.export_image}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-go-soft text-go-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
          </span>
          <span>
            <span className="block font-semibold">{t.export_image}</span>
            <span className="block text-xs text-ink-3">{t.export_image_hint}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={imageLayout === 'preview'} onClick={() => setImageLayout('preview')} className="min-h-8 px-2.5 text-xs">{t.export_layout_preview}</Chip>
          <Chip active={imageLayout === 'compact'} onClick={() => setImageLayout('compact')} className="min-h-8 px-2.5 text-xs">{t.export_layout_compact}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" className="min-h-10 flex-1 px-3 text-sm" disabled={!!exporting} onClick={() => exportAs('save')}>{exporting === 'save' ? t.export_working : t.export_save}</Button>
          {canCopyPicture() && <Button className="min-h-10 flex-1 px-3 text-sm" disabled={!!exporting} onClick={() => exportAs('copy')}>{exporting === 'copy' ? t.export_working : t.copy}</Button>}
          {canSharePictures() && <Button className="min-h-10 flex-1 px-3 text-sm" disabled={!!exporting} onClick={() => exportAs('share')}>{exporting === 'share' ? t.export_working : t.share}</Button>}
        </div>
      </section>

      {/* PDF export button. */}
      <button
        type="button"
        disabled={!!exporting}
        onClick={() => exportAs('pdf')}
        aria-label={t.export_pdf}
        className="card flex w-full items-center gap-3 p-3 text-left transition hover:brightness-[0.98] active:scale-[0.98] disabled:opacity-60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-go-soft text-go-ink">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
        </span>
        <span>
          <span className="block font-semibold">{exporting === 'pdf' ? t.export_working : t.export_pdf_short}</span>
          <span className="block text-xs text-ink-3">{t.export_pdf_hint}</span>
        </span>
      </button>

      {/* Optional visual customizations: short trainer note + friend code. */}
      <div className="space-y-2.5">
        <TextField
          label={t.export_note_label}
          placeholder={t.export_note_placeholder}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={80}
        />
        {friendCode && (
          <button type="button" aria-pressed={showCode} onClick={() => setShowCode(!showCode)} className="flex w-full items-center gap-3 rounded-card border border-line px-3 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.export_show_code}</span>
              <span className="block text-xs text-ink-3">{t.export_show_code_hint}</span>
            </span>
            <SwitchThumb on={showCode} />
          </button>
        )}
      </div>

      {/* In-game search string & QR code settings. */}
      <button type="button" aria-pressed={withSearch} onClick={() => setWithSearch(!withSearch)} className="flex w-full items-center gap-3 rounded-card border border-line px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t.export_search_toggle}</span>
          <span className="block text-xs text-ink-3">{t.export_with_search}</span>
        </span>
        <SwitchThumb on={withSearch} />
      </button>
      {withSearch && (
        <>
          {!search && <p className="text-xs text-ink-3">{t.export_search_empty}</p>}
          {search && exportedSearch.blind.length > 0 && <FormBlindWarning idx={idx} variants={exportedSearch.blind} />}
          <SearchSettingsPanel s={searchSettings} showOnlyMissing={false} />
        </>
      )}
    </div>
  );
}

/** Compact theme swatch chip with header gradient preview + card dot. */
function ThemeSwatchButton({ active, onClick, theme, label }: { active: boolean; onClick: () => void; theme: ExportTheme; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold transition active:scale-[0.97] ${
        active ? 'border-ink bg-ink text-card shadow-sm' : 'border-line bg-card text-ink-2 hover:border-ink-3'
      }`}
    >
      <span
        aria-hidden="true"
        className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full ring-1 ring-black/15"
        style={{ background: `linear-gradient(135deg, ${theme.headerFrom}, ${theme.headerTo})` }}
      >
        <span className="absolute bottom-0 inset-x-0 h-2" style={{ background: theme.paper }} />
        <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full" style={{ background: theme.accent }} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Live CSS/React miniature preview of the exported visual (zero canvas lag while picking styles). */
function ExportPreview({
  idx,
  list,
  onlyMissing,
  theme,
  note,
  friendCode,
}: {
  idx: DatasetIndex;
  list: ListDetail;
  onlyMissing: boolean;
  theme: ExportTheme;
  note: string;
  friendCode?: string;
}) {
  const t = useT();
  const { lang } = useLang();
  const cards = useMemo(() => {
    const all = onlyMissing ? missingCards(cardsOf(list.entries)) : cardsOf(list.entries);
    return all.slice(0, 4).flatMap((c) => {
      const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
      const sp = v && idx.speciesByDex.get(v.dex);
      return v && sp ? [{ c, v, sp }] : [];
    });
  }, [idx, list.entries, onlyMissing]);
  const done = list.entries.filter((e) => e.done).length;
  const total = list.entries.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div
      data-export-theme={theme.id}
      className="overflow-hidden rounded-2xl border shadow-card transition-colors"
      style={{ background: theme.paper, borderColor: theme.cardBorder }}
    >
      {/* Header preview */}
      <div
        className="relative overflow-hidden px-3.5 py-3"
        style={{ background: `linear-gradient(145deg, ${theme.headerFrom}, ${theme.headerTo})`, color: theme.headerInk }}
      >
        {/* Subtle decorative motif preview */}
        {theme.motif === 'male' ? (
          <svg viewBox="0 0 120 120" width="84" height="84" className="pointer-events-none absolute -right-2 -top-2 opacity-20" aria-hidden="true">
            <circle cx="48" cy="70" r="28" fill="none" stroke="currentColor" strokeWidth="9" />
            <path d="M68 50l28-28M72 22h24v24" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : theme.motif === 'female' ? (
          <svg viewBox="0 0 120 120" width="84" height="84" className="pointer-events-none absolute -right-2 -top-2 opacity-20" aria-hidden="true">
            <circle cx="60" cy="42" r="26" fill="none" stroke="currentColor" strokeWidth="9" />
            <path d="M60 68v34M43 86h34" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 120 120" width="88" height="88" className="pointer-events-none absolute -right-3 -top-3 opacity-15" aria-hidden="true">
            <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="8" />
            <circle cx="60" cy="60" r="15" fill="none" stroke="currentColor" strokeWidth="8" />
            <path d="M14 60h31M75 60h31" stroke="currentColor" strokeWidth="8" />
          </svg>
        )}
        {theme.motif === 'stars' && (
          <svg viewBox="0 0 80 40" width="80" height="40" className="pointer-events-none absolute right-6 top-2" aria-hidden="true">
            <path d="M16 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={theme.shiny} opacity="0.85" />
            <path d="M44 16l1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3z" fill={theme.shiny} opacity="0.6" />
          </svg>
        )}
        {theme.motif === 'bokeh' && (
          <span aria-hidden="true" className="pointer-events-none absolute right-8 top-1 h-12 w-12 rounded-full bg-[#fff8d6]/25" />
        )}
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold leading-tight">{list.name}</p>
            <p className="truncate text-[11px]" style={{ color: theme.headerMuted }}>
              {[t.by(list.ownerName), onlyMissing ? t.missing : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
          {friendCode && (
            <span className="tnum shrink-0 rounded-full bg-black/20 px-2 py-0.5 font-mono text-[10px] font-bold ring-1 ring-white/25">
              {fmtCode(friendCode)}
            </span>
          )}
        </div>
        {note && <p className="relative mt-1 truncate text-[11px] font-semibold">{note}</p>}
        <div className="relative mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: theme.headerTrack }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: theme.headerBar }} />
          </div>
          <span className="tnum shrink-0 text-[10px] font-bold">{t.progress(done, total)}</span>
        </div>
      </div>

      {/* Mini cards preview */}
      {cards.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 p-2.5">
          {cards.map(({ c, v, sp }) => {
            const caught = cardDone(c);
            return (
              <div
                key={c.id}
                className="relative flex flex-col items-center rounded-xl border px-1 pb-1.5 pt-1 text-center"
                style={{
                  background: theme.card,
                  borderColor: caught ? theme.accent : theme.cardBorder,
                  color: theme.ink,
                }}
              >
                <div className="relative flex items-center justify-center">
                  <span aria-hidden="true" className="absolute h-10 w-10 rounded-full" style={{ background: theme.halo }} />
                  <Sprite idx={idx} variant={v} shiny={c.shiny} dim={caught} size={44} className="relative" />
                  {c.shiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
                </div>
                <span className="w-full truncate text-[10px] font-bold leading-tight">{localized(sp.name, lang)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
