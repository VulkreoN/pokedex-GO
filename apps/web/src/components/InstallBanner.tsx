import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { isIos, isStandalone } from '../lib/social.js';
import { useT } from '../lib/i18n.js';
import { Button, IconButton } from './ui.js';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

// Chrome fires this once, early: keep it for whenever the banner shows.
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const DISMISS_KEY = 'installDismissed';

/**
 * "Install the app": a button where the browser offers it (Android Chrome), the Share > Add to Home Screen steps on
 * iPhone, where nothing is offered. Hidden once installed; the dismissible one stays closed on this device.
 */
export function InstallBanner({ dismissible = true }: { dismissible?: boolean }) {
  const t = useT();
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return dismissible && localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const ios = isIos();
  const android = /Android/i.test(navigator.userAgent);
  if (dismissed || isStandalone() || (!deferred && !ios && !android)) return null;
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };
  return (
    <aside className="card my-2 flex items-start gap-3 p-3" aria-label={t.install_title}>
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.install_title}</p>
        {deferred ? (
          <>
            <p className="text-sm text-ink-2">{t.install_why}</p>
            <Button
              tone="primary"
              className="mt-2 min-h-9 px-3 text-sm"
              onClick={async () => {
                const p = deferred!;
                await p.prompt();
                if ((await p.userChoice).outcome === 'accepted') deferred = null;
                rerender((n) => n + 1);
              }}
            >
              {t.install_button}
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink-2">{ios ? t.install_ios : t.install_android}</p>
        )}
      </div>
      {dismissible && (
        <IconButton label={t.close} onClick={close} className="-mr-2 -mt-2 h-9 w-9">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </IconButton>
      )}
    </aside>
  );
}

/** A new account that left the welcome tour halfway: a way back in, or done with it. */
export function WelcomeResume() {
  const t = useT();
  const me = useMe();
  const qc = useQueryClient();
  if (!me.data || me.data.onboarded !== false) return null;
  return (
    <aside className="card my-2 flex items-center gap-3 p-3" aria-label={t.welcome_resume_title}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.welcome_resume_title}</p>
        <p className="text-sm text-ink-2">{t.welcome_resume_text}</p>
      </div>
      <Link to="/welcome" className="inline-flex min-h-9 shrink-0 items-center rounded-xl bg-go px-3 text-sm font-semibold text-white">{t.welcome_resume}</Link>
      <IconButton label={t.welcome_later} className="-mr-2 h-9 w-9" onClick={async () => { await api('/auth/onboarded', { method: 'POST' }).catch(() => {}); qc.setQueryData(['me'], { ...me.data, onboarded: true }); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </IconButton>
    </aside>
  );
}
