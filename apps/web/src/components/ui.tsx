import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useT } from '../lib/i18n.js';
import { useTheme } from '../lib/theme.js';

type Tone = 'primary' | 'quiet' | 'danger' | 'ghost';
const tones: Record<Tone, string> = {
  primary: 'bg-go text-white shadow-card hover:brightness-110 disabled:opacity-50',
  quiet: 'bg-paper-2 text-ink hover:brightness-95 dark:hover:brightness-110 disabled:opacity-50',
  danger: 'bg-berry/10 text-berry hover:bg-berry/20 disabled:opacity-50',
  ghost: 'text-ink-2 hover:bg-paper-2 disabled:opacity-50',
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
  return <button type="button" aria-label={label} title={label} {...props} className={`icon-btn inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-paper-2 ${className}`} />;
}

export function Chip({ active, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`chip inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${
        active ? 'chip-active border-ink bg-ink text-card' : 'border-line bg-card text-ink-2 hover:border-ink-3'
      } ${className}`}
    />
  );
}

export function TextField({ label, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>}
      <input
        {...props}
        className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] text-ink placeholder:text-ink-3 focus:border-sky"
      />
    </label>
  );
}

export function Badge({ tone, children }: { tone: 'shiny' | 'datamined' | 'muted' | 'grass'; children: ReactNode }) {
  const cls = {
    shiny: 'bg-shiny-soft text-[#7a5a0e] dark:text-shiny',
    datamined: 'bg-[#dcebff] text-[#1d4bb8] dark:bg-[#24405f] dark:text-[#9bc4ff]',
    muted: 'bg-paper-2 text-ink-2',
    grass: 'bg-go-soft text-go-ink',
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none ${cls}`}>{children}</span>;
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="track h-2 w-full overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-go transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TopBar({ title, back, actions, children }: { title: ReactNode; back?: boolean; actions?: ReactNode; children?: ReactNode }) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <header className="sky-header pt-safe sticky top-0 z-20">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-1 px-3">
        {back && (
          <IconButton label={t.close} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dex'))}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </IconButton>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold">{title}</h1>
        {actions}
        {!back && <ThemeToggle />}
      </div>
      {children}
    </header>
  );
}

export function ThemeToggle() {
  const { dark, setTheme } = useTheme();
  const t = useT();
  return (
    <IconButton label={dark ? t.theme_light : t.theme_dark} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
      )}
    </IconButton>
  );
}

export function BottomNav() {
  const t = useT();
  const { pathname } = useLocation();
  if (pathname === '/login') return null;
  const items = [
    { to: '/dex', label: t.nav_dex, icon: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h6m6 0h6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /> },
    { to: '/lists', label: t.nav_lists, icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
    { to: '/game', label: t.nav_game, icon: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /> },
    { to: '/friends', label: t.nav_friends, icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> },
    { to: '/me', label: t.nav_me, icon: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /> },
  ];
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 shadow-[0_-6px_18px_-12px_rgb(35_56_66/0.35)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={false}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-go-ink dark:text-go' : 'text-ink-3'}`}
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
      className="m-0 mt-auto w-full max-w-3xl justify-self-center rounded-t-3xl bg-card p-0 text-ink backdrop:bg-[#0f2230]/50 open:animate-[sheet_.22s_ease-out]"
    >
      <div className="pb-safe px-4 pt-2">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
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
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-go" />
    </div>
  );
}
