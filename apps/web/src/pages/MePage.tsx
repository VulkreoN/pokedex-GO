import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Sheet, TextField, TopBar } from '../components/ui.js';
import { PushSettings } from '../components/PushSettings.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { ClientErrors } from '../components/ClientErrors.js';
import { Badge } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { useLogout, useMe } from '../lib/auth.js';
import { useDataset } from '../lib/dataset.js';
import { useLang, useT } from '../lib/i18n.js';
import { applyTheme, getTheme, type Theme } from '../lib/theme.js';
import { fmtCode } from './FriendsPage.js';
import { relativeTime, useDataStatus, useRefreshData, useSetRole, useUsers } from '../lib/admin.js';
import type { Role } from '@mydexpogo/shared';

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
  const [issued, setIssued] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const status = useDataStatus();
  const refresh = useRefreshData();
  const [userQuery, setUserQuery] = useState('');
  const isAdmin = me.data?.role === 'admin';
  const [userOffset, setUserOffset] = useState(0);
  const users = useUsers(userQuery, userOffset, isAdmin);
  const setRole = useSetRole();
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
          {isAdmin && (
            <Button className="mt-3" disabled={refresh.isPending || status.data?.running} onClick={async () => { await refresh.mutateAsync(); toast(t.data_refresh_started); }}>{t.data_refresh_now}</Button>
          )}
        </section>

        {isAdmin && (
          <section className="card p-4">
            <h2 className="mb-1 text-base font-bold">{t.admin_title}</h2>
            <p className="mb-3 text-xs text-ink-3">{t.admin_hint}</p>
            <TextField placeholder={t.admin_search} value={userQuery} onChange={(e) => { setUserQuery(e.target.value); setUserOffset(0); }} />
            {issued && <p className="mt-2 rounded-lg bg-go-soft p-2 text-sm font-semibold text-go-ink"><code>{issued}</code></p>}
            <p className="tnum mt-2 text-xs text-ink-3">{t.admin_count(users.data?.total ?? 0)}</p>
            <ul className="mt-1 divide-y divide-line">
              {users.data?.users.map((u) => (
                <li key={u.id} className="py-3">
                  {/* Name and code on one line, actions below: a phone has no room for both side by side. */}
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{u.username}</span>
                    <span className="tnum shrink-0 text-xs text-ink-3">{fmtCode(u.friendCode)} · {new Date(u.createdAt).toLocaleDateString(lang)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(['user', 'manager', 'admin'] as Role[]).map((r) => (
                      <Chip key={r} active={u.role === r} disabled={u.id === me.data?.id} className="min-h-8 px-2.5 text-xs" onClick={() => setRole.mutate({ id: u.id, role: r })}>{t[`role_${r}`]}</Chip>
                    ))}
                    <Chip className="ml-auto min-h-8 px-2.5 text-xs" onClick={async () => { const r = await api<{ username: string; code: string }>(`/users/${u.id}/reset-code`, { method: 'POST' }); setIssued(t.reset_issued(r.username, r.code)); }}>{t.issue_reset}</Chip>
                  </div>
                </li>
              ))}
              {users.data?.users.length === 0 && <li className="py-2 text-sm text-ink-3">{t.nothing_here}</li>}
            </ul>
            {users.data && users.data.total > 50 && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <Button tone="ghost" className="min-h-9" disabled={userOffset === 0} onClick={() => setUserOffset(Math.max(0, userOffset - 50))}>‹</Button>
                <span className="tnum text-ink-3">{userOffset + 1}–{Math.min(userOffset + 50, users.data.total)}</span>
                <Button tone="ghost" className="min-h-9" disabled={userOffset + 50 >= users.data.total} onClick={() => setUserOffset(userOffset + 50)}>›</Button>
              </div>
            )}
          </section>
        )}
        {isAdmin && <ClientErrors />}
      </main>
      <Sheet open={changing} onClose={() => setChanging(false)} title={t.change_password}>
        <div className="space-y-3">
          <TextField type="password" label={t.current_password} value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
          <TextField type="password" label={t.new_password} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} />
          <Button tone="primary" className="w-full" disabled={!curPw || newPw.length < 8} onClick={async () => {
            try {
              await api('/auth/password', { body: { current: curPw, password: newPw } });
              toast(t.password_changed); setChanging(false); setCurPw(''); setNewPw('');
            } catch { alert(t.err_invalid_credentials); }
          }}>{t.save}</Button>
        </div>
      </Sheet>
      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t.delete_account}>
        <p className="mb-3 text-sm text-ink-2">{t.confirm_delete_account}</p>
        <TextField type="password" label={t.password} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
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
