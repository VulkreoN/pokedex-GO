import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App, reloadOnceForChunkError } from './App.js';
import './styles.css';
import { installErrorReporting } from './lib/errorReport.js';
import { markSwUpdateAvailable } from './lib/swUpdate.js';

installErrorReporting();
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadOnceForChunkError();
});
// An installed app on iPhone is woken up rather than started again, and only looks for a new version when started:
// it also looks each time it comes back to the screen, and every half hour while open.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    markSwUpdateAvailable(() => void updateSW(true));
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => void registration.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 30 * 60_000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
