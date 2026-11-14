import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useT } from '../lib/i18n.js';

type Tone = 'primary' | 'quiet' | 'danger' | 'ghost';
const tones: Record<Tone, string> = {
  primary: 'bg-sky text-white hover:brightness-110 disabled:opacity-50',
  quiet: 'bg-[var(--paper-2)] text-[var(--ink)] hover:brightness-95 dark:hover:brightness-125 disabled:opacity-50',
  danger: 'bg-berry/10 text-berry hover:bg-berry/20 disabled:opacity-50',
  ghost: 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] disabled:opacity-50',
};

export function Button({ tone = 'quiet', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition active:scale-[0.98] ${tones[tone]} ${className}`}
    />
  );
}

export function IconButton({ label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} {...props} className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--paper-2)] ${className}`} />;
}

export function Chip({ active, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
        active ? 'border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink' : 'border-[var(--dust)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
      } ${className}`}
    />
  );
}

export function TextField({ label, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-sm font-medium text-[var(--ink-2)]">{label}</span>}
      <input
        {...props}
        className="min-h-11 w-full rounded-xl border border-[var(--dust)] bg-transparent px-3 text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-sky"
      />
    </label>
  );
}

export function Badge({ tone, children }: { tone: 'shiny' | 'datamined' | 'muted' | 'grass'; children: ReactNode }) {
  const cls = {
    shiny: 'bg-shiny-2 text-[#7a5a0e] dark:bg-shiny/20 dark:text-shiny',
    datamined: 'bg-sky-2 text-[#1d4bb8] dark:bg-sky/20 dark:text-[#9bb8ff]',
    muted: 'bg-[var(--paper-2)] text-[var(--ink-2)]',
    grass: 'bg-grass-2 text-[#1d6b47] dark:bg-grass/20 dark:text-[#8fe0b8]',
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none ${cls}`}>{children}</span>;
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper-2)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-grass transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TopBar({ title, back, actions, children }: { title: ReactNode; back?: boolean; actions?: ReactNode; children?: ReactNode }) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <header className="pt-safe sticky top-0 z-20 bg-[var(--paper)]/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-1 px-3">
        {back && (
          <IconButton label={t.close} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dex'))}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </IconButton>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold">{title}</h1>
        {actions}
      </div>
      {children}
    </header>
  );
}

export function BottomNav() {
  const t = useT();
  const { pathname } = useLocation();
  if (pathname === '/login') return null;
  const items = [
    { to: '/dex', label: t.nav_dex, icon: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h6m6 0h6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /> },
    { to: '/lists', label: t.nav_lists, icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
    { to: '/friends', label: t.nav_friends, icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> },
    { to: '/me', label: t.nav_me, icon: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /> },
  ];
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-[var(--dust)] bg-[var(--paper)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={false}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}
          >
            {({ isActive }) => (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
                {it.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Bottom sheet. Closes on backdrop tap and Escape. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-3xl justify-self-center rounded-t-3xl bg-[var(--paper)] p-0 text-[var(--ink)] backdrop:bg-ink/40 open:animate-[sheet_.22s_ease-out]"
    >
      <div className="pb-safe px-4 pt-2">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--dust)]" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label={t.close} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </IconButton>
        </div>
        <div className="max-h-[75vh] overflow-y-auto pb-4">{children}</div>
      </div>
      <style>{`@keyframes sheet{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </dialog>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="mx-auto max-w-sm px-6 py-16 text-center text-[15px] text-[var(--ink-2)]">{children}</p>;
}

export function Spinner() {
  const t = useT();
  return (
    <div className="flex justify-center py-16" role="status" aria-label={t.loading}>
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--dust)] border-t-ink dark:border-t-paper" />
    </div>
  );
}
