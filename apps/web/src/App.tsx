import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persistOptions } from './lib/persist.js';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { ToastProvider } from './components/toast.js';
import { SelectionBar } from './components/SelectionBar.js';
import { BottomNav, Spinner } from './components/ui.js';
import { useMe } from './lib/auth.js';
import { LangContext, detectLang } from './lib/i18n.js';
import { applyTheme, getTheme } from './lib/theme.js';
import { AnnouncementBanner } from './components/AnnouncementBanner.js';
import { UpdateBanner } from './components/WhatsNew.js';
import { useRealtime } from './lib/social.js';
import { reportError } from './lib/errorReport.js';
import { PokedexPage } from './pages/PokedexPage.js';
import { SpeciesPage } from './pages/SpeciesPage.js';
import { applyTeam } from './lib/team.js';
import { getStartPage } from './lib/startPage.js';

const CHUNK_RELOAD_KEY = 'chunk-reload-at';

/** True when a lazy route failed to load because a newer deploy replaced its hashed JS bundle. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /is not a valid JavaScript MIME type|Importing a module script failed|Failed to fetch dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(msg);
}

/** Reloads the page at most once per 30 s so a stale tab seamlessly picks up the newly deployed bundle. */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0');
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {}
  location.reload();
  return true;
}

function lazyRoute<T extends { default: React.ComponentType }>(loader: () => Promise<T>) {
  return lazy(() =>
    loader().catch((err) => {
      if (isChunkLoadError(err) && reloadOnceForChunkError()) {
        return new Promise<T>(() => {});
      }
      throw err;
    }),
  );
}

/** Secondary tabs and routes load on demand; core tabs prefetch once the app is idle. */
const coreLoaders = {
  ListsPage: () => import('./pages/ListsPage.js').then((m) => ({ default: m.ListsPage })),
  ListPage: () => import('./pages/ListPage.js').then((m) => ({ default: m.ListPage })),
  GamePage: () => import('./pages/GamePage.js').then((m) => ({ default: m.GamePage })),
  PvpPage: () => import('./pages/PvpPage.js').then((m) => ({ default: m.PvpPage })),
  FriendsPage: () => import('./pages/FriendsPage.js').then((m) => ({ default: m.FriendsPage })),
  MePage: () => import('./pages/MePage.js').then((m) => ({ default: m.MePage })),
};
const ListsPage = lazyRoute(coreLoaders.ListsPage);
const ListPage = lazyRoute(coreLoaders.ListPage);
const SharedListPage = lazyRoute(() => import('./pages/ListPage.js').then((m) => ({ default: m.SharedListPage })));
const LastListRedirect = lazyRoute(() => import('./pages/ListPage.js').then((m) => ({ default: m.LastListRedirect })));
const FriendsPage = lazyRoute(coreLoaders.FriendsPage);
const FriendListsPage = lazyRoute(() => import('./pages/FriendsPage.js').then((m) => ({ default: m.FriendListsPage })));
const MePage = lazyRoute(coreLoaders.MePage);
const GamePage = lazyRoute(coreLoaders.GamePage);
const PvpPage = lazyRoute(coreLoaders.PvpPage);
const PvpTeamPage = lazyRoute(() => import('./pages/PvpTeamPage.js').then((m) => ({ default: m.PvpTeamPage })));
const PvpBattlePage = lazyRoute(() => import('./pages/PvpBattlePage.js').then((m) => ({ default: m.PvpBattlePage })));
const AdminPage = lazyRoute(() => import('./pages/AdminPage.js').then((m) => ({ default: m.AdminPage })));
const WelcomePage = lazyRoute(() => import('./pages/WelcomePage.js').then((m) => ({ default: m.WelcomePage })));
const NotificationsPage = lazyRoute(() => import('./pages/NotificationsPage.js').then((m) => ({ default: m.NotificationsPage })));
const LoginPage = lazyRoute(() => import('./pages/LoginPage.js').then((m) => ({ default: m.LoginPage })));
const ReviewPage = lazyRoute(() => import('./pages/ReviewPage.js').then((m) => ({ default: m.ReviewPage })));
const AboutPage = lazyRoute(() => import('./pages/AboutPage.js').then((m) => ({ default: m.AboutPage })));

function prefetchPages() {
  const run = () => Object.values(coreLoaders).forEach((load) => void load().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 3000);
}

const queryClient = new QueryClient({
  // Data less than 30 s old is not asked again on each page or each return to the app; live events and the
  // player's own actions refresh it at once anyway.
  defaultOptions: { queries: { retry: (count, err) => !(err instanceof Error && 'status' in err) && count < 2, refetchOnWindowFocus: true, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Spinner />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** A new page opens at the top; going back leaves the page to put itself where it was (the Pokédex does). */
function ScrollToTop() {
  const { pathname } = useLocation();
  const how = useNavigationType();
  useEffect(() => {
    if (how !== 'POP') window.scrollTo(0, 0);
  }, [pathname, how]);
  return null;
}

/** Logged-in users land on their chosen startup page (Pokédex by default), others on login. */
function Home() {
  const me = useMe();
  if (me.isPending) return <Spinner />;
  return <Navigate to={me.data ? getStartPage() : '/login'} replace />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return;
    reportError(error, 'render');
  }
  render() {
    if (!this.state.error) return this.props.children;
    const fr = detectLang() === 'fr';
    return (
      <main className="mx-auto max-w-sm px-6 py-20 text-center">
        <h1 className="text-lg font-bold">{fr ? 'Oups.' : 'Oops.'}</h1>
        <p className="mt-2 text-sm text-ink-2">{this.state.error.message}</p>
        <a href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-sky px-4 py-2 font-semibold text-white">{fr ? 'Recharger' : 'Reload'}</a>
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
            <UpdateBanner />
            <AnnouncementBanner />
            <PageFade>
            <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dex" element={<PokedexPage />} />
              <Route path="/dex/:dex" element={<SpeciesPage />} />
              <Route path="/lists" element={<RequireAuth><ListsPage /></RequireAuth>} />
              <Route path="/lists/last" element={<RequireAuth><LastListRedirect /></RequireAuth>} />
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
              <Route path="/about" element={<AboutPage />} />
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
