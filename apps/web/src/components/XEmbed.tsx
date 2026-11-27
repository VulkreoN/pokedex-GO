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

const ALLOWED_TAGS = new Set(['BLOCKQUOTE', 'P', 'A', 'BR', 'SPAN']);

function sanitizeOEmbed(raw: string, dark: boolean): DocumentFragment {
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const out = document.createDocumentFragment();
  const walk = (node: Node, target: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const src = node as HTMLElement;
    if (!ALLOWED_TAGS.has(src.tagName)) {
      for (const child of src.childNodes) walk(child, target);
      return;
    }
    const clean = document.createElement(src.tagName.toLowerCase());
    const cls = src.getAttribute('class');
    if (cls && /^(twitter-tweet|twitter-timeline)$/.test(cls.trim())) {
      clean.setAttribute('class', cls.trim());
      clean.setAttribute('data-theme', dark ? 'dark' : 'light');
      clean.setAttribute('data-dnt', 'true');
      if (cls.trim() === 'twitter-timeline') {
        clean.setAttribute('data-chrome', 'noheader nofooter noborders');
        clean.setAttribute('data-height', '1200');
      }
    }
    if (src.tagName === 'A') {
      const href = src.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        clean.setAttribute('href', href);
        clean.setAttribute('rel', 'noopener noreferrer');
        clean.setAttribute('target', '_blank');
      }
    }
    const lang = src.getAttribute('lang');
    if (lang && /^[a-zA-Z-]{2,10}$/.test(lang)) clean.setAttribute('lang', lang);
    const dir = src.getAttribute('dir');
    if (dir === 'ltr' || dir === 'rtl') clean.setAttribute('dir', dir);
    for (const child of src.childNodes) walk(child, clean);
    target.appendChild(clean);
  };
  for (const child of doc.body.childNodes) walk(child, out);
  return out;
}

function XWidget({ html, dark }: { html: string; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren(sanitizeOEmbed(html, dark));
    void loadWidgets().then(() => window.twttr?.widgets.load(el));
  }, [html, dark]);
  return <div ref={ref} className="x-embed min-h-10" />;
}
