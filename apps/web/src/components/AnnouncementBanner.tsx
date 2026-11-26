import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api.js';
import type { Announcement } from '../lib/admin.js';
import { useT } from '../lib/i18n.js';

const KEY = 'announcementClosed';

/** The admins' announcement, on top of every page until closed (per device, per announcement). */
export function AnnouncementBanner() {
  const t = useT();
  const q = useQuery({ queryKey: ['announcement'], queryFn: () => api<{ announcement: Announcement | null }>('/announcements').then((r) => r.announcement), staleTime: 5 * 60_000 });
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const a = q.data;
  if (!a || closed === a.id) return null;
  const close = () => {
    setClosed(a.id);
    try {
      localStorage.setItem(KEY, a.id);
    } catch {}
  };
  const text = <span className="min-w-0 flex-1 text-sm font-semibold">{a.message}</span>;
  return (
    <div role="status" className={`pt-safe flex items-center gap-2 px-3 py-2 ${a.level === 'warning' ? 'bg-shiny text-on-shiny' : 'bg-ink text-card'}`}>
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        {a.link ? (a.link.startsWith('/') ? <Link to={a.link} className="flex min-w-0 flex-1 underline">{text}</Link> : <a href={a.link} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 underline">{text}</a>) : text}
        <button type="button" onClick={close} aria-label={t.announce_close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-black/10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
