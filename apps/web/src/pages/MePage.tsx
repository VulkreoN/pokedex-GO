import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Chip, CopyButton, HoldButton, PasswordField, Sheet, SwitchThumb, TopBar, buttonClass } from '../components/ui.js';
import { BannerSlot } from '../components/BannerSlot.js';
import { FriendQr } from '../components/FriendQr.js';
import { PushSettings } from '../components/PushSettings.js';
import { TrainerMedalsCard } from '../components/Medals.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { PageTourButton, PageTourSheet } from '../components/PageTour.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { useLogout, useMe } from '../lib/auth.js';
import { useLang, useT } from '../lib/i18n.js';
import { useFriends, useLists, useMyPostcards } from '../lib/lists.js';
import { applyTheme, getTheme, useTheme, type Theme } from '../lib/theme.js';
import { errorMessage, fmtCode } from '../lib/errors.js';
import { useAdminStats, useDataStatus } from '../lib/admin.js';
import { setFeedbackPref, useFeedbackPref } from '../lib/feedback.js';
import { TEAMS, TEAM_META, setTeam, useTeam } from '../lib/team.js';
import { START_PAGES, setStartPage, useStartPage, type StartPage } from '../lib/startPage.js';
import { resetAllTours, useTourState } from '../lib/tour.js';

export function MePage() {
  const t = useT();
  const { lang, setLang } = useLang();
  const me = useMe();
  const logout = useLogout();
  const lists = useLists();
  const friends = useFriends();
  const postcards = useMyPostcards(!!me.data);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [deleting, setDeleting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [delError, setDelError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'prefs' ? 'prefs' : 'profile';
  const status = useDataStatus();
  const tour = useTourState();
  const isAdmin = me.data?.role === 'admin';
  const toast = useToast();

  const pick = (th: Theme) => { setTheme(th); applyTheme(th); };
  const { dark } = useTheme();
  const team = useTeam();
  const startPage = useStartPage();
  const startPageLabels: Record<StartPage, string> = {
    '/dex': t.nav_dex,
    '/lists': t.nav_lists,
    '/lists/last': t.start_page_last_list,
    '/game': t.nav_game,
    '/pvp': t.nav_pvp,
    '/friends': t.nav_friends,
  };
  const totalEntries = (lists.data ?? []).reduce((n, l) => n + l.entryCount, 0);
  const totalDone = (lists.data ?? []).reduce((n, l) => n + l.doneCount, 0);

  return (
    <>
      <TopBar title={t.nav_me} actions={<PageTourButton page="me" />}>
        <div className="mx-auto flex max-w-6xl gap-2 px-3 pb-2 sm:px-5" role="tablist">
          <Chip role="tab" aria-selected={tab === 'profile'} active={tab === 'profile'} onClick={() => setParams({}, { replace: true })}>
            {t.me_tab_profile}
          </Chip>
          <Chip role="tab" aria-selected={tab === 'prefs'} active={tab === 'prefs'} onClick={() => setParams({ tab: 'prefs' }, { replace: true })}>
            {t.me_tab_prefs}
          </Chip>
        </div>
      </TopBar>
      <main className="mx-auto max-w-6xl space-y-6 px-3 pb-24 sm:px-5">
        <BannerSlot page="me" />
        {tab === 'profile' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              {me.data ? (
                <section className="card p-4">
                  <div className="flex items-center gap-2 text-[22px] font-bold">{me.data.username} {me.data.role !== 'user' && <Badge tone="grass">{t[`role_${me.data.role}`]}</Badge>}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="tnum text-sm text-ink-2">{t.my_code} · {fmtCode(me.data.friendCode)}</span>
                    <CopyButton text={me.data.friendCode} className="min-h-8 px-2.5 text-xs" />
                    <Button tone="ghost" className="min-h-8 bg-paper-2 px-2.5 text-xs" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
                      {showQr ? t.qr_hide : 'QR'}
                    </Button>
                  </div>
                  {showQr && (
                    <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-paper-2/60 p-3">
                      <FriendQr code={me.data.friendCode} size={160} />
                      <p className="text-center text-xs text-ink-2">{t.qr_show_hint}</p>
                    </div>
                  )}
                  {(lists.data || friends.data) && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                      {lists.data && (
                        <Link to="/lists" className="tnum rounded-full bg-paper-2 px-2.5 py-1 text-ink-2 hover:text-ink">
                          {t.me_stats_lists(lists.data.length)}{totalEntries > 0 ? ` · ${t.progress(totalDone, totalEntries)}` : ''}
                        </Link>
                      )}
                      {friends.data && (
                        <Link to="/friends" className="tnum rounded-full bg-paper-2 px-2.5 py-1 text-ink-2 hover:text-ink">
                          {t.me_stats_friends(friends.data.length)}
                        </Link>
                      )}
                      {postcards.data && (
                        <Link to="/friends?tab=postcards" className="tnum rounded-full bg-paper-2 px-2.5 py-1 text-ink-2 hover:text-ink">
                          🦋 {t.me_stats_postcards(postcards.data.length)}
                        </Link>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={async () => { await logout.mutateAsync(); navigate('/login'); }}>{t.logout}</Button>
                    <Button tone="ghost" onClick={() => { setPwError(null); setChanging(true); }}>{t.change_password}</Button>
                  </div>
                </section>
              ) : (
                <section className="sky-header rounded-card p-4">
                  <h2 className="text-[22px] font-bold leading-tight">{t.welcome_title}</h2>
                  <p className="mt-1 text-sm opacity-80">{t.welcome_text}</p>
                  <Link to="/login" className={buttonClass('primary', 'mt-3')}>{t.login}</Link>
                </section>
              )}
              {isAdmin && <AdminCard />}
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
            </div>

            <div className="space-y-6">
              {me.data && <TrainerMedalsCard />}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <InstallBanner dismissible={false} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
              <div className="space-y-6">
                {me.data && <PushSettings />}
                <FeedbackSettings />
              </div>

              <div className="space-y-6">
                {me.data && (
                  <section>
                    <h2 className="mb-1 text-base font-bold">{t.start_page}</h2>
                    <p className="mb-2 text-xs text-ink-3">{t.start_page_hint}</p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.start_page}>
                      {START_PAGES.map((p) => (
                        <Chip key={p} active={startPage === p} onClick={() => setStartPage(p)}>{startPageLabels[p]}</Chip>
                      ))}
                    </div>
                  </section>
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
                  <h3 className="mb-2 mt-4 text-sm font-semibold text-ink-2">{t.team_colour}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4" role="group" aria-label={t.team_colour}>
                    {TEAMS.map((tm) => {
                      const p = TEAM_META[tm].preview;
                      const active = team === tm;
                      return (
                        <button
                          key={tm}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setTeam(tm)}
                          className={`card flex flex-col overflow-hidden p-0 text-left transition active:scale-[0.98] ${active ? 'ring-2 ring-go' : 'hover:brightness-[0.98]'}`}
                        >
                          <div className="flex h-10 w-full flex-col justify-between p-1.5" style={{ background: dark ? p.darkPaper : p.paper }}>
                            <div className="h-3 w-full rounded-sm" style={{ background: `linear-gradient(135deg, ${p.top}, ${p.bottom})` }} />
                            <div className="flex items-center gap-1">
                              <span className="h-2.5 w-8 rounded-full" style={{ background: dark ? p.darkAccent : p.accent }} />
                              <span className="h-2 w-4 rounded-full opacity-35" style={{ background: dark ? '#fff' : '#000' }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold">
                            <span className="min-w-0 flex-1 truncate">{t.team_names[tm]}</span>
                            {active && <span className="text-go-ink dark:text-go" aria-hidden="true">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Unified Help & Guided Tours card */}
                <section className="card p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky/15 text-lg" aria-hidden="true">🧭</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t.me_help_title}</p>
                      <p className="text-xs text-ink-2">{t.tour_me_hint(tour.seenCount, tour.totalCount)}</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button tone="quiet" className="min-h-9 px-3 text-xs" onClick={() => setGuideOpen(true)}>
                          {t.tour_me_browse}
                        </Button>
                        <Button
                          tone="ghost"
                          className="min-h-9 px-3 text-xs"
                          onClick={() => {
                            resetAllTours();
                            toast(t.tour_me_enabled_toast);
                          }}
                        >
                          {t.tour_me_enable}
                        </Button>
                        {me.data && (
                          <Link to="/welcome" className={buttonClass('ghost', 'min-h-9 px-3 text-xs')}>
                            {t.welcome_replay}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <Link to="/about" className="card flex items-center gap-3 p-3 transition hover:brightness-[0.98] active:scale-[0.99]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-lg" aria-hidden="true">ℹ️</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.about_title}</span>
                    <span className="block text-sm text-ink-2">{t.about_link_hint}</span>
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </Link>
              </div>
            </div>
            {/* Out of the way, at the very end of preferences. */}
            {me.data && (
              <div className="pt-2 text-center">
                <button type="button" onClick={() => { setDelError(null); setDeleting(true); }} className="text-sm font-semibold text-berry hover:underline">{t.delete_account}</button>
              </div>
            )}
          </div>
        )}
      </main>
      <PageTourSheet open={guideOpen} initialPage="dex" onClose={() => setGuideOpen(false)} />
      <Sheet open={changing} onClose={() => setChanging(false)} title={t.change_password}>
        {changing && (
          <div className="space-y-3">
            <PasswordField label={t.current_password} value={curPw} onChange={(e) => { setCurPw(e.target.value); setPwError(null); }} autoComplete="current-password" />
            <PasswordField label={t.new_password} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} />
            <PasswordField label={t.password_confirm} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" minLength={8} aria-invalid={!!newPw2 && newPw2 !== newPw} />
            {!!newPw2 && newPw2 !== newPw && <p role="alert" className="text-sm text-berry">{t.password_mismatch}</p>}
            {pwError && <p role="alert" className="text-sm text-berry">{pwError}</p>}
            <Button tone="primary" className="w-full" disabled={!curPw || newPw.length < 8 || newPw2 !== newPw} onClick={async () => {
              setPwError(null);
              try {
                await api('/auth/password', { body: { current: curPw, password: newPw } });
                toast(t.password_changed); setChanging(false); setCurPw(''); setNewPw(''); setNewPw2('');
              } catch (err) { setPwError(errorMessage(t, err)); }
            }}>{t.save}</Button>
          </div>
        )}
      </Sheet>
      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t.delete_account}>
        {deleting && (
          <>
            <p className="mb-3 text-sm text-ink-2">{t.confirm_delete_account}</p>
            <PasswordField label={t.password} value={password} onChange={(e) => { setPassword(e.target.value); setDelError(null); }} autoComplete="current-password" />
            {delError && <p role="alert" className="mt-2 text-sm text-berry">{delError}</p>}
            <HoldButton
              className="mt-3 w-full"
              disabled={!password}
              onConfirm={async () => {
                setDelError(null);
                try {
                  await api('/auth/me', { method: 'DELETE', body: { password } });
                  qc.clear();
                  setDeleting(false);
                  navigate('/');
                } catch (err) {
                  setDelError(errorMessage(t, err));
                }
              }}
            >
              {t.delete_account}
            </HoldButton>
          </>
        )}
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
      <SwitchThumb on={on} />
    </button>
  );
  return (
    <section aria-label={t.feedback_title} className="card divide-y divide-line overflow-hidden">
      {row(t.feedback_sounds, t.feedback_sounds_hint, sounds, 'sounds')}
      {'vibrate' in navigator && row(t.feedback_haptics, t.feedback_haptics_hint, haptics, 'haptics')}
    </section>
  );
}
