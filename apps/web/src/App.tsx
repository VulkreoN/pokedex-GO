import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { ToastProvider } from './components/toast.js';
import { BottomNav, Spinner } from './components/ui.js';
import { useMe } from './lib/auth.js';
import { LangContext, detectLang } from './lib/i18n.js';
import { applyTheme, getTheme } from './lib/theme.js';
import { FriendListsPage, FriendsPage } from './pages/FriendsPage.js';
import { ListPage, SharedListPage } from './pages/ListPage.js';
import { ListsPage } from './pages/ListsPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { MePage } from './pages/MePage.js';
import { PokedexPage } from './pages/PokedexPage.js';
import { SpeciesPage } from './pages/SpeciesPage.js';

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
  useEffect(() => window.scrollTo(0, 0), [pathname]);
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
    document.documentElement.lang = lang;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(getTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [lang]);

  return (
    <QueryClientProvider client={queryClient}>
      <LangContext.Provider value={{ lang, setLang }}>
        <ToastProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<PokedexPage />} />
              <Route path="/dex/:dex" element={<SpeciesPage />} />
              <Route path="/lists" element={<RequireAuth><ListsPage /></RequireAuth>} />
              <Route path="/lists/:id" element={<RequireAuth><ListPage /></RequireAuth>} />
              <Route path="/s/:token" element={<SharedListPage />} />
              <Route path="/friends" element={<RequireAuth><FriendsPage /></RequireAuth>} />
              <Route path="/friends/:id" element={<RequireAuth><FriendListsPage /></RequireAuth>} />
              <Route path="/me" element={<MePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <BottomNav />
          </BrowserRouter>
        </ToastProvider>
      </LangContext.Provider>
    </QueryClientProvider>
  );
}
