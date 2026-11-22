import { useEffect, useRef } from 'react';

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

/** Renders oEmbed HTML (one post) or a profile timeline through the official widget. Falls back to the plain link. */
export function XEmbed({ html, dark }: { html: string; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html.replace('<blockquote class="twitter-tweet"', `<blockquote class="twitter-tweet" data-theme="${dark ? 'dark' : 'light'}" data-dnt="true"`).replace('<a class="twitter-timeline"', `<a class="twitter-timeline" data-theme="${dark ? 'dark' : 'light'}" data-dnt="true" data-chrome="noheader nofooter noborders" data-height="1200"`);
    void loadWidgets().then(() => window.twttr?.widgets.load(el));
  }, [html, dark]);
  return <div ref={ref} className="x-embed min-h-10" />;
}
