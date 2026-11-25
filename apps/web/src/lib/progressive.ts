/**
 * Long grids (the whole Pokédex, a collection of 600) build their first cards at once and the next ones just before
 * they scroll into view: typing, filtering or ticking never rebuilds hundreds of cards off screen.
 */
import { useEffect, useRef, useState } from 'react';

/** `initial`: as many cards as were built before, when a page comes back to where it was. */
export function useProgressive<T>(items: T[], resetKey: unknown, step = 60, initial = step) {
  const [count, setCount] = useState(Math.max(step, initial));
  const sentinel = useRef<HTMLLIElement | null>(null);
  // A new search or filter starts from the top again; ticking a card does not. Not on the first build.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setCount(step);
  }, [resetKey, step]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= items.length) return;
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setCount((c) => c + step * 2);
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [count, items.length, step]);
  return { shown: items.length > count ? items.slice(0, count) : items, more: items.length > count, sentinel };
}
