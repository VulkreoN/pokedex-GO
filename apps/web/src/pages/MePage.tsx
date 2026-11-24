import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, PasswordField, Sheet, TopBar } from '../components/ui.js';
import { PushSettings } from '../components/PushSettings.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { Badge } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { useLogout, useMe } from '../lib/auth.js';
import { useDataset } from '../lib/dataset.js';
import { useLang, useT } from '../lib/i18n.js';
import { applyTheme, getTheme, type Theme } from '../lib/theme.js';
import { fmtCode } from './FriendsPage.js';
import { relativeTime, useAdminStats, useDataStatus } from '../lib/admin.js';
import type { Role } from '@mydexpogo/shared';
import { setFeedbackPref, useFeedbackPref } from '../lib/feedback.js';

export function MePage() {
  const t = useT();
  const { lang, setLang } = useLang();
  const me = useMe();
  const logout = useLogout();
  const dataset = useDataset();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [deleting, setDeleting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [password, setPassword] = useState('');
  const status = useDataStatus();
  const isAdmin = me.data?.role === 'admin';
  const toast = useToast();

  const pick = (th: Theme) => { setTheme(th); applyTheme(th); };
  const ds = dataset.data?.ds;

  return (
    <>
      <TopBar title={t.nav_me} />
      <main className="mx-auto max-w-3xl space-y-6 px-3 pb-24">
        <InstallBanner dismissible={false} />
        {me.data ? (
          <section className="rounded-card border border-line p-4">
            <div className="flex items-center gap-2 text-[22px] font-bold">{me.data.username} {me.data.role !== 'user' && <Badge tone="grass">{t[`role_${me.data.role}`]}</Badge>}</div>
            <div className="tnum text-sm text-ink-2">{t.my_code} · {fmtCode(me.data.friendCode)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={async () => { await logout.mutateAsync(); navigate('/login'); }}>{t.logout}</Button>
              <Button tone="ghost" onClick={() => setChanging(true)}>{t.change_password}</Button>
              <Button tone="danger" onClick={() => setDeleting(true)}>{t.delete_account}</Button>
            </div>
          </section>
        ) : null}
        {me.data && (
          <Link to="/welcome" className="card flex items-center gap-3 p-3 transition hover:brightness-[0.98] active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-go-soft text-lg" aria-hidden="true">🧭</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t.welcome_replay}</span>
              <span className="block text-sm text-ink-2">{t.welcome_replay_hint}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </Link>
        )}
        <FeedbackSettings />
        {isAdmin && <AdminCard />}
        {me.data && <PushSettings />}
        {me.data ? null : (
          <section className="rounded-card sky-header rounded-card p-4">
            <h2 className="text-[22px] font-bold leading-tight">{t.welcome_title}</h2>
            <p className="mt-1 text-sm opacity-80">{t.welcome_text}</p>
            <Link to="/login" className="mt-3 inline-block"><Button tone="primary">{t.login}</Button></Link>
          </section>
        )}

        {(me.data?.role === 'manager' || me.data?.role === 'admin') && (
          <Link to="/review" className="card flex items-center gap-3 p-4">
            <span className="flex-1">
              <span className="block font-bold">{t.review_title}</span>
              <span className="block text-sm text-ink-2">{t.review_pending(status.data?.feed?.pending ?? 0)}</span>
            </span>
            {(status.data?.feed?.pending ?? 0) > 0 && <span className="tnum rounded-full bg-berry px-2 py-0.5 text-xs font-bold text-white">{status.data?.feed?.pending}</span>}
            <span className="text-ink-3">›</span>
          </Link>
        )}

        <section>
          <h2 className="mb-2 text-base font-bold">{t.language}</h2>
          <div className="flex gap-2">
            {(['fr', 'en'] as Lang[]).map((l) => (
              <Chip key={l} active={lang === l} onClick={() => setLang(l)}>{l === 'fr' ? 'Français' : 'English'}</Chip>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">{t.theme}</h2>
          <div className="flex gap-2">
            {(['auto', 'light', 'dark'] as Theme[]).map((th) => (
              <Chip key={th} active={theme === th} onClick={() => pick(th)}>{{ auto: t.theme_auto, light: t.theme_light, dark: t.theme_dark }[th]}</Chip>
            ))}
          </div>
        </section>

        <section className="card p-4 text-sm text-ink-2">
          <h2 className="mb-2 text-base font-bold text-ink">{t.data_status}</h2>
          {status.data && (
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt>{t.data_generated_at}</dt><dd className="tnum text-right font-semibold text-ink">{relativeTime(status.data.generatedAt, lang)}{ds && <span className="block text-xs font-normal text-ink-3">v{ds.version} · {ds.species.length} Pokémon · {ds.variants.length} variantes</span>}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t.data_next}</dt><dd className="tnum font-semibold text-ink">{status.data.running ? t.data_running : relativeTime(status.data.nextRunAt, lang)}</dd></div>
              {status.data.lastError && <div className="rounded-lg bg-berry/10 p-2 text-xs text-berry">{t.data_error} : {status.data.lastError}</div>}
            </dl>
          )}
          {status.data?.sources.length ? (
            <>
              <h3 className="mb-1 mt-3 text-xs font-semibold text-ink-3">{t.data_sources_title}</h3>
              <ul className="space-y-1">
                {status.data.sources.map((s) => (
                  <li key={s.name} className="flex justify-between gap-3"><a href={s.url} target="_blank" rel="noreferrer" className="truncate">{s.label}</a><span className="tnum shrink-0 font-semibold text-ink">{relativeTime(s.updatedAt, lang)}</span></li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

      </main>
      <Sheet open={changing} onClose={() => setChanging(false)} title={t.change_password}>
        <div className="space-y-3">
          <PasswordField label={t.current_password} value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
          <PasswordField label={t.new_password} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} />
          <PasswordField label={t.password_confirm} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" minLength={8} aria-invalid={!!newPw2 && newPw2 !== newPw} />
          {!!newPw2 && newPw2 !== newPw && <p className="text-sm text-berry">{t.password_mismatch}</p>}
          <Button tone="primary" className="w-full" disabled={!curPw || newPw.length < 8 || newPw2 !== newPw} onClick={async () => {
            try {
              await api('/auth/password', { body: { current: curPw, password: newPw } });
              toast(t.password_changed); setChanging(false); setCurPw(''); setNewPw(''); setNewPw2('');
            } catch { alert(t.err_invalid_credentials); }
          }}>{t.save}</Button>
        </div>
      </Sheet>
      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t.delete_account}>
        <p className="mb-3 text-sm text-ink-2">{t.confirm_delete_account}</p>
        <PasswordField label={t.password} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <Button
          tone="danger"
          className="mt-3 w-full"
          disabled={!password}
          onClick={async () => {
            try {
              await api('/auth/me', { method: 'DELETE', body: { password } });
              qc.clear();
              setDeleting(false);
              navigate('/');
            } catch {
              alert(t.err_invalid_credentials);
            }
          }}
        >
          {t.delete}
        </Button>
      </Sheet>
    </>
  );
}

/** Admins: the way into the panel, with what waits for them. */
function AdminCard() {
  const t = useT();
  const stats = useAdminStats();
  const waiting = (stats.data?.openReports ?? 0) + (stats.data?.errorsToday ?? 0);
  return (
    <Link to="/admin" className="sky-header flex items-center gap-3 rounded-card p-4 hover:brightness-105">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{t.admin_panel}</span>
        <span className="block text-sm opacity-80">{t.admin_panel_hint}</span>
      </span>
      {waiting > 0 && <span className="tnum rounded-full bg-berry px-2 py-0.5 text-sm font-bold text-white">{waiting}</span>}
    </Link>
  );
}

/** Sounds and vibrations on ticks, saved on this device. */
function FeedbackSettings() {
  const t = useT();
  const sounds = useFeedbackPref('sounds');
  const haptics = useFeedbackPref('haptics');
  const row = (label: string, hint: string, on: boolean, k: 'sounds' | 'haptics') => (
    <button type="button" aria-pressed={on} onClick={() => setFeedbackPref(k, !on)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? 'bg-go' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
  return (
    <section aria-label={t.feedback_title} className="card divide-y divide-line overflow-hidden">
      {row(t.feedback_sounds, t.feedback_sounds_hint, sounds, 'sounds')}
      {'vibrate' in navigator && row(t.feedback_haptics, t.feedback_haptics_hint, haptics, 'haptics')}
    </section>
  );
}
