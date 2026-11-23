/** Sends the app's JavaScript errors to our API, so an admin sees what breaks on players' devices. */

const sent = new Set<string>();
const MAX_PER_PAGE = 10;
/** Not ours: browser extensions, cross-origin scripts we cannot read, a harmless layout warning. */
const IGNORED = /extension:\/\/|^Script error\.?$|ResizeObserver loop/;

export function reportError(error: unknown, context?: string) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));
  const message = `${context ? `${context}: ` : ''}${err.name && !err.message.startsWith(err.name) ? `${err.name}: ` : ''}${err.message}`.slice(0, 500);
  const stack = err.stack?.slice(0, 4000);
  if (!err.message || IGNORED.test(err.message) || IGNORED.test(stack ?? '')) return;
  const key = `${message}\n${stack?.split('\n')[1] ?? ''}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
  sent.add(key);
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, stack, url: location.href, appVersion: import.meta.env.VITE_APP_VERSION || undefined }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandled promise'));
}
