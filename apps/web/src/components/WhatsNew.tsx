import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../lib/auth.js';
import { CHANGELOG, markChangelogSeen, unseenChangelog, type ChangelogEntry } from '../lib/changelog.js';
import { useLang, useT } from '../lib/i18n.js';
import { applySwUpdate, dismissSwUpdate, useSwUpdate } from '../lib/swUpdate.js';
import { Badge, Button, Chip, IconButton, Sheet } from './ui.js';

/** After an update: compact card with version & date, shown inside the startup page until dismissed. */
export function WhatsNewBanner() {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const [entries, setEntries] = useState(() => unseenChangelog());
  const [open, setOpen] = useState(false);
  if (!me.data || !entries.length) return null;

  const latest = entries[0]!;
  const lines = entries.flatMap((e) => (lang === 'fr' ? e.fr : e.en));
  const dateLabel = new Date(`${latest.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  const close = () => {
    markChangelogSeen();
    setEntries([]);
    setOpen(false);
  };
  return (
    <aside className="card my-2 p-3" aria-label={t.whats_new}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky/15 text-lg" aria-hidden="true">✨</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-bold">{t.whats_new}</p>
            <Badge tone="grass">v{latest.version}</Badge>
            <span className="tnum text-xs text-ink-3">{dateLabel}</span>
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-ink-2">
            {lines.slice(0, 2).map((l) => <p key={l} className="flex gap-1.5"><span aria-hidden="true">•</span><span>{l}</span></p>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {lines.length > 2 && <Button tone="ghost" className="min-h-8 px-2.5 text-xs" onClick={() => setOpen(true)}>{t.whats_new_more(lines.length - 2)}</Button>}
            <Button tone="primary" className="min-h-8 px-3 text-xs" onClick={close}>{t.whats_new_ok}</Button>
          </div>
        </div>
        <IconButton label={t.close} onClick={close} className="-mr-1 -mt-1 h-9 w-9">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </IconButton>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${t.whats_new} · v${latest.version}`}>
        {open && (
          <>
            <Changelog entries={entries} />
            <Button tone="primary" className="mt-4 w-full" onClick={close}>{t.whats_new_ok}</Button>
            <Link to="/about#news" onClick={close} className="mt-3 block text-center text-sm font-semibold text-sky">{t.whats_new_all}</Link>
          </>
        )}
      </Sheet>
    </aside>
  );
}

/** Discreet banner shown when the service worker has downloaded a fresh build ready to activate. */
export function UpdateBanner() {
  const t = useT();
  const ready = useSwUpdate();
  if (!ready) return null;
  return (
    <div role="status" className="mx-auto max-w-6xl px-3 pt-2 sm:px-5">
      <div className="flex items-center gap-2 rounded-card bg-sky/15 px-3 py-2 text-sm ring-1 ring-sky/40">
        <span aria-hidden="true">⬆️</span>
        <span className="min-w-0 flex-1 font-semibold">{t.sw_update_ready}</span>
        <Button tone="primary" className="min-h-8 px-3 text-xs" onClick={applySwUpdate}>{t.sw_update_reload}</Button>
        <button type="button" onClick={dismissSwUpdate} aria-label={t.close} className="flex h-7 w-7 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">✕</button>
      </div>
    </div>
  );
}

/** Updates, newest first, viewable by version (with date) or grouped by day (with version badges). */
export function Changelog({ entries = CHANGELOG, showToggle = false }: { entries?: ChangelogEntry[]; showToggle?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [mode, setMode] = useState<'version' | 'date'>('version');
  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });

  const byDay = () => {
    const days = new Map<string, { versions: string[]; lines: string[] }>();
    for (const e of entries) {
      const slot = days.get(e.date) ?? days.set(e.date, { versions: [], lines: [] }).get(e.date)!;
      if (!slot.versions.includes(e.version)) slot.versions.push(e.version);
      slot.lines.push(...(lang === 'fr' ? e.fr : e.en));
    }
    return [...days.entries()];
  };

  return (
    <div className="space-y-4">
      {showToggle && (
        <div className="flex gap-1.5" role="group" aria-label={t.whats_new_history}>
          <Chip active={mode === 'version'} onClick={() => setMode('version')} className="min-h-8 px-2.5 text-xs">{t.whats_new_by_version}</Chip>
          <Chip active={mode === 'date'} onClick={() => setMode('date')} className="min-h-8 px-2.5 text-xs">{t.whats_new_by_date}</Chip>
        </div>
      )}
      {mode === 'version'
        ? entries.map((e) => (
            <section key={e.id}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge tone="grass">v{e.version}</Badge>
                <h3 className="text-xs font-semibold capitalize text-ink-3">{fmtDate(e.date)}</h3>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">
                {(lang === 'fr' ? e.fr : e.en).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </section>
          ))
        : byDay().map(([date, { versions, lines }]) => (
            <section key={date}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-bold capitalize text-ink-3">{fmtDate(date)}</h3>
                {versions.map((v) => <Badge key={v} tone="muted">v{v}</Badge>)}
              </div>
              <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">
                {lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </section>
          ))}
    </div>
  );
}
