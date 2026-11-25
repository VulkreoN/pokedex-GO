import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useMe } from '../lib/auth.js';
import { useNotifications } from '../lib/social.js';
import { useT } from '../lib/i18n.js';
import { useTheme } from '../lib/theme.js';
import { copyText } from '../lib/api.js';
import { feedback } from '../lib/feedback.js';

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

export function Chip({ active, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`chip inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 ${
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

/** A password input with an eye to show what was typed. */
export function PasswordField({ label, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const t = useT();
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-2">{label}</label>
      <div className="relative">
        <input id={id} {...props} type={shown ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-h-11 w-full rounded-xl border border-line bg-card py-0 pl-3 pr-12 text-[16px] text-ink placeholder:text-ink-3 focus:border-sky" />
        <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? t.password_hide : t.password_show} aria-pressed={shown} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-3 hover:text-ink">
          {shown ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
    </div>
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
      <div className="h-full rounded-full bg-go transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TopBar({ title, back, actions, children }: { title: ReactNode; back?: boolean; actions?: ReactNode; children?: ReactNode }) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <header className="topbar sky-header pt-safe sticky top-0 z-20">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-1 px-3">
        {back && (
          <IconButton label={t.close} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dex'))}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </IconButton>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold">{title}</h1>
        {actions}
        {!back && <NotificationsBell />}
        {!back && <ThemeToggle />}
      </div>
      {children}
    </header>
  );
}

/** Bell with the unread count, only for logged-in users. */
export function NotificationsBell() {
  const me = useMe();
  const t = useT();
  const q = useNotifications(!!me.data);
  if (!me.data) return null;
  const n = q.data?.unread ?? 0;
  return (
    <Link to="/notifications" aria-label={n ? `${t.notifications} (${n})` : t.notifications} title={t.notifications} className="icon-btn relative inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-paper-2">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
      {n > 0 && <span className="tnum absolute right-1 top-1 min-w-4 rounded-full bg-berry px-1 text-center text-[10px] font-bold leading-4 text-white">{n > 9 ? '9+' : n}</span>}
    </Link>
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
  if (pathname === '/login' || pathname === '/welcome') return null;
  const items = [
    { to: '/dex', label: t.nav_dex, icon: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h6m6 0h6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /> },
    { to: '/lists', label: t.nav_lists, icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
    { to: '/game', label: t.nav_game, icon: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /> },
    { to: '/pvp', label: t.nav_pvp, icon: <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 21 18M5 14l4 4M7 17l-3 3M3 19l2 2M14.5 6.5 18 3h3v3l-3.5 3.5" /> },
    { to: '/friends', label: t.nav_friends, icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> },
    { to: '/me', label: t.nav_me, icon: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /> },
  ];
  // A rubber pill slides under the active tab: it stretches toward the new one, then squashes into place.
  const active = items.findIndex((it) => pathname.startsWith(it.to));
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 shadow-[0_-6px_18px_-12px_rgb(35_56_66/0.35)] backdrop-blur">
      <div className="relative mx-auto flex max-w-3xl">
        {active >= 0 && (
          <span aria-hidden="true" className="rubber-track pointer-events-none absolute inset-y-1 left-0" style={{ width: `${100 / items.length}%`, transform: `translateX(${active * 100}%)` }}>
            <span key={active} className="rubber-pill absolute inset-x-1.5 inset-y-0 rounded-2xl bg-go-soft dark:bg-go/15" />
          </span>
        )}
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={false}
            className={({ isActive }) => `relative z-10 flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${isActive ? 'text-go-ink dark:text-go' : 'text-ink-3'}`}
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
      <Pokeball className="pokeball-wobble h-9 w-9" />
    </div>
  );
}

/** Copies a text; the button itself says "Copied ✓" for a moment, with a small sound. */
export function CopyButton({ text, label, className = '', tone, disabled }: { text: string; label?: string; className?: string; tone?: Tone; disabled?: boolean }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Button
      tone={tone}
      disabled={disabled}
      className={className}
      onClick={async () => {
        if (!(await copyText(text))) return;
        feedback('tick');
        setDone(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <span key="done" className="pop" role="status">{t.copied_check}</span> : (label ?? t.copy)}
    </Button>
  );
}

/** A Poké Ball, drawn in the page's colours. */
export function Pokeball({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.4" />
      <path d="M2 16a14 14 0 0 1 28 0Z" fill="#ef5350" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M2 16h28" stroke="var(--ink)" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="4.2" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.4" />
    </svg>
  );
}

/** Grey cards that pulse while a grid of Pokémon loads. */
export function CardsSkeleton({ count = 9, className = 'grid-cols-3 sm:grid-cols-4' }: { count?: number; className?: string }) {
  const t = useT();
  return (
    <ul className={`grid gap-2 py-2 ${className}`} role="status" aria-label={t.loading}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="card flex h-[170px] flex-col items-center gap-2 p-3" style={{ animationDelay: `${i * 60}ms` }}>
          <span className="skeleton mt-2 h-16 w-16 rounded-full" />
          <span className="skeleton h-3 w-3/4 rounded" />
          <span className="skeleton h-2.5 w-1/2 rounded" />
        </li>
      ))}
    </ul>
  );
}

/**
 * A destructive action confirmed by holding: a liquid fill rises while pressed and drains back if let go early.
 * Keyboard: hold Space or Enter. One tap does nothing but show the hint, so a stray touch never deletes.
 */
export function HoldButton({ children, onConfirm, ms = 1200, disabled = false, className = '', small = false }: { children: ReactNode; onConfirm: () => void | Promise<void>; ms?: number; disabled?: boolean; className?: string; small?: boolean }) {
  const t = useT();
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = () => {
    if (disabled || done || timer.current) return;
    setHolding(true);
    feedback('tick');
    timer.current = window.setTimeout(async () => {
      timer.current = undefined;
      setHolding(false);
      setDone(true);
      feedback('drop');
      try {
        await onConfirm();
      } finally {
        setDone(false);
      }
    }, ms);
  };
  const stop = () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={typeof children === 'string' ? t.hold_to(children) : undefined}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
      onContextMenu={(e) => e.preventDefault()}
      className={`hold-btn relative select-none overflow-hidden rounded-xl border-2 border-berry font-semibold text-berry transition active:scale-[0.98] disabled:opacity-50 ${small ? 'px-3 py-1 text-sm' : 'px-4 py-2'} ${className}`}
      style={{ ['--hold-ms' as string]: `${ms}ms`, touchAction: 'none' }}
    >
      <span aria-hidden="true" className={`hold-fill ${holding || done ? 'hold-fill-on' : ''}`} />
      <span className={`relative z-10 transition-colors ${holding || done ? 'text-white' : ''}`}>{done ? '…' : children}</span>
      <span className="relative z-10 block text-[10px] font-medium opacity-70">{holding ? t.hold_keep : t.hold_hint}</span>
    </button>
  );
}

/** An on / off switch whose thumb stretches while pressed and squashes as it lands. */
export function SwitchThumb({ on }: { on: boolean }) {
  return (
    <span className={`switch relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-go' : 'bg-line'}`} aria-hidden="true">
      <span className={`switch-thumb absolute top-0.5 h-5 rounded-full bg-white shadow ${on ? 'switch-on' : 'switch-off'}`} />
    </span>
  );
}

/** A number that rolls to its new value instead of jumping (no roll when motion is reduced). */
export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`tnum ${className}`}>{useRolling(value)}</span>;
}

/** The value, rolled toward each new one over half a second. */
export function useRolling(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (from.current === value) return;
    const start = from.current;
    from.current = value;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 450);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** A number on an odometer: each digit rolls through its column to the new value (stats, counts). */
export function Odometer({ value, className = '' }: { value: number; className?: string }) {
  const text = value.toLocaleString();
  // Shown at zero for one frame, so the digits roll up when the number first appears too.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className={`tnum ${className}`} aria-label={text}>
      <span aria-hidden="true" className="odo">
        {[...text].map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={`${text.length - i}`} className="odo-col" style={{ transform: `translateY(-${ready ? Number(ch) : 0}em)` }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </span>
          ) : (
            <span key={`${text.length - i}`}>{ch}</span>
          ),
        )}
      </span>
    </span>
  );
}
