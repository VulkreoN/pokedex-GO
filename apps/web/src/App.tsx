import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persistOptions } from './lib/persist.js';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { ToastProvider } from './components/toast.js';
import { SelectionBar } from './components/SelectionBar.js';
import { BottomNav, Spinner } from './components/ui.js';
import { useMe } from './lib/auth.js';
import { LangContext, detectLang } from './lib/i18n.js';
import { applyTheme, getTheme } from './lib/theme.js';
import { FriendListsPage, FriendsPage } from './pages/FriendsPage.js';
import { AnnouncementBanner } from './components/AnnouncementBanner.js';
import { useRealtime } from './lib/social.js';
import { reportError } from './lib/errorReport.js';
import { ListPage, SharedListPage } from './pages/ListPage.js';
import { ListsPage } from './pages/ListsPage.js';
import { MePage } from './pages/MePage.js';
import { PokedexPage } from './pages/PokedexPage.js';
import { SpeciesPage } from './pages/SpeciesPage.js';
import { applyTeam } from './lib/team.js';

/** Pages not everyone opens load on demand, then are fetched in the background once the app is idle. */
const pageLoaders = {
  GamePage: () => import('./pages/GamePage.js').then((m) => ({ default: m.GamePage })),
  PvpPage: () => import('./pages/PvpPage.js').then((m) => ({ default: m.PvpPage })),
  PvpTeamPage: () => import('./pages/PvpTeamPage.js').then((m) => ({ default: m.PvpTeamPage })),
  PvpBattlePage: () => import('./pages/PvpBattlePage.js').then((m) => ({ default: m.PvpBattlePage })),
  AdminPage: () => import('./pages/AdminPage.js').then((m) => ({ default: m.AdminPage })),
  WelcomePage: () => import('./pages/WelcomePage.js').then((m) => ({ default: m.WelcomePage })),
  NotificationsPage: () => import('./pages/NotificationsPage.js').then((m) => ({ default: m.NotificationsPage })),
  LoginPage: () => import('./pages/LoginPage.js').then((m) => ({ default: m.LoginPage })),
  ReviewPage: () => import('./pages/ReviewPage.js').then((m) => ({ default: m.ReviewPage })),
};
const GamePage = lazy(pageLoaders.GamePage);
const PvpPage = lazy(pageLoaders.PvpPage);
const PvpTeamPage = lazy(pageLoaders.PvpTeamPage);
const PvpBattlePage = lazy(pageLoaders.PvpBattlePage);
const AdminPage = lazy(pageLoaders.AdminPage);
const WelcomePage = lazy(pageLoaders.WelcomePage);
const NotificationsPage = lazy(pageLoaders.NotificationsPage);
const LoginPage = lazy(pageLoaders.LoginPage);
const ReviewPage = lazy(pageLoaders.ReviewPage);

function prefetchPages() {
  const run = () => Object.values(pageLoaders).forEach((load) => void load().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 3000);
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (count, err) => !(err instanceof Error && 'status' in err) && count < 2, refetchOnWindowFocus: true } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Spinner />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Logged-in users land on the Pokédex, others on the login page (the Pokédex stays reachable at /dex). */
function Home() {
  const me = useMe();
  if (me.isPending) return <Spinner />;
  return <Navigate to={me.data ? '/dex' : '/login'} replace />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportError(error, 'render');
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto max-w-sm px-6 py-20 text-center">
        <p className="text-lg font-bold">Oups.</p>
        <p className="mt-2 text-sm text-ink-2">{this.state.error.message}</p>
        <a href="/" className="mt-6 inline-block rounded-xl bg-sky px-4 py-3 font-semibold text-white">Recharger</a>
      </main>
    );
  }
}

/** One live connection while logged in: friends' edits, friend requests and notifications show up without reloading. */
function Realtime() {
  const me = useMe();
  useRealtime(!!me.data);
  return null;
}

export function App() {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch {}
    document.documentElement.lang = l;
  };
  useEffect(() => {
    applyTheme(getTheme());
    applyTeam();
    document.documentElement.lang = lang;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(getTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [lang]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // What was kept shows at once, and is all checked again with the server right after.
      onSuccess={() => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'dataset' })}
    >
      <LangContext.Provider value={{ lang, setLang }}>
        <ToastProvider>
          <BrowserRouter>
            <ScrollToTop />
            <ErrorBoundary>
            <AnnouncementBanner />
            <PageFade>
            <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dex" element={<PokedexPage />} />
              <Route path="/dex/:dex" element={<SpeciesPage />} />
              <Route path="/lists" element={<RequireAuth><ListsPage /></RequireAuth>} />
              <Route path="/lists/:id" element={<RequireAuth><ListPage /></RequireAuth>} />
              <Route path="/s/:token" element={<SharedListPage />} />
              <Route path="/game" element={<GamePage />} />
              <Route path="/pvp" element={<PvpPage />} />
              <Route path="/pvp/team" element={<PvpTeamPage />} />
              <Route path="/pvp/battle" element={<PvpBattlePage />} />
              <Route path="/pvp/:key" element={<PvpPage />} />
              <Route path="/friends" element={<RequireAuth><FriendsPage /></RequireAuth>} />
              <Route path="/friends/:id" element={<RequireAuth><FriendListsPage /></RequireAuth>} />
              <Route path="/me" element={<MePage />} />
              <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
              <Route path="/review" element={<RequireAuth><ReviewPage /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
              <Route path="/welcome" element={<RequireAuth><WelcomePage /></RequireAuth>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </PageFade>
            </ErrorBoundary>
            <SelectionBar />
            <BottomNav />
            <Realtime />
          </BrowserRouter>
        </ToastProvider>
      </LangContext.Provider>
    </PersistQueryClientProvider>
  );
}

/** Each page fades in when the address changes (not on a query string change, e.g. a tab). */
function PageFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(prefetchPages, []);
  return <div key={pathname} className="page-enter">{children}</div>;
}
