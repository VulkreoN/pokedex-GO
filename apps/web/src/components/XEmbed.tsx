import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useT } from '../lib/i18n.js';

declare global {
  interface Window {
    twttr?: { widgets: { load: (el?: HTMLElement) => void } };
  }
}

let loading: Promise<void> | null = null;
/** Loads X's official widget script once; it turns blockquotes / timeline anchors into live embeds. */
function loadWidgets(): Promise<void> {
  if (window.twttr) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://platform.twitter.com/widgets.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * X's widget can leave its own cookies: it only loads once the player asks for it, a choice kept on this device and
 * withdrawn from the About page.
 */
const listeners = new Set<() => void>();
const allowed = () => {
  try {
    return localStorage.getItem('x-embeds') === '1';
  } catch {
    return false;
  }
};
export function setXEmbeds(on: boolean) {
  try {
    if (on) localStorage.setItem('x-embeds', '1');
    else localStorage.removeItem('x-embeds');
  } catch {}
  listeners.forEach((l) => l());
}
export const useXEmbeds = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    allowed,
    () => false,
  );

/** Renders oEmbed HTML (one post) or a profile timeline through the official widget, once allowed. */
export function XEmbed({ html, dark }: { html: string; dark: boolean }) {
  const t = useT();
  const on = useXEmbeds();
  if (!on) {
    return (
      <button type="button" onClick={() => setXEmbeds(true)} className="w-full rounded-xl border border-dashed border-line px-3 py-2 text-left text-sm">
        <span className="block font-semibold text-sky">{t.x_embed_show}</span>
        <span className="block text-xs text-ink-3">{t.x_embed_hint}</span>
      </button>
    );
  }
  return <XWidget html={html} dark={dark} />;
}

function XWidget({ html, dark }: { html: string; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html.replace('<blockquote class="twitter-tweet"', `<blockquote class="twitter-tweet" data-theme="${dark ? 'dark' : 'light'}" data-dnt="true"`).replace('<a class="twitter-timeline"', `<a class="twitter-timeline" data-theme="${dark ? 'dark' : 'light'}" data-dnt="true" data-chrome="noheader nofooter noborders" data-height="1200"`);
    void loadWidgets().then(() => window.twttr?.widgets.load(el));
  }, [html, dark]);
  return <div ref={ref} className="x-embed min-h-10" />;
}
