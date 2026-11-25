import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../lib/auth.js';
import { CHANGELOG, markChangelogSeen, unseenChangelog, type ChangelogEntry } from '../lib/changelog.js';
import { useLang, useT } from '../lib/i18n.js';
import { Button, IconButton, Sheet } from './ui.js';

/** After an update: what changed, in a few lines; the rest in a sheet. Closed for good once read, on this device. */
export function WhatsNewBanner() {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const [entries, setEntries] = useState(() => unseenChangelog());
  const [open, setOpen] = useState(false);
  if (!me.data || !entries.length) return null;
  const lines = entries.flatMap((e) => (lang === 'fr' ? e.fr : e.en));
  const close = () => {
    markChangelogSeen();
    setEntries([]);
    setOpen(false);
  };
  return (
    <aside className="card my-2 p-3" aria-label={t.whats_new}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky/15 text-xl" aria-hidden="true">✨</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t.whats_new}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink-2">
            {lines.slice(0, 3).map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {lines.length > 3 && <Button tone="ghost" className="min-h-9 px-3 text-sm" onClick={() => setOpen(true)}>{t.whats_new_more(lines.length - 3)}</Button>}
            <Button tone="primary" className="min-h-9 px-3 text-sm" onClick={close}>{t.whats_new_ok}</Button>
          </div>
        </div>
        <IconButton label={t.close} onClick={close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </IconButton>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.whats_new}>
        <Changelog entries={entries} />
        <Button tone="primary" className="mt-4 w-full" onClick={close}>{t.whats_new_ok}</Button>
        <Link to="/about#news" onClick={close} className="mt-3 block text-center text-sm font-semibold text-sky">{t.whats_new_all}</Link>
      </Sheet>
    </aside>
  );
}

/** Updates, newest first, grouped by day. */
export function Changelog({ entries = CHANGELOG }: { entries?: ChangelogEntry[] }) {
  const { lang } = useLang();
  const days = new Map<string, string[]>();
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), ...(lang === 'fr' ? e.fr : e.en)]);
  return (
    <div className="space-y-4">
      {[...days].map(([date, lines]) => (
        <section key={date}>
          <h3 className="mb-1 text-sm font-bold text-ink-3">{new Date(`${date}T12:00:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
