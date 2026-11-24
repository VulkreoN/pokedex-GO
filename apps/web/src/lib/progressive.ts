/**
 * Long grids (the whole Pokédex, a collection of 600) build their first cards at once and the next ones just before
 * they scroll into view: typing, filtering or ticking never rebuilds hundreds of cards off screen.
 */
import { useEffect, useRef, useState } from 'react';

export function useProgressive<T>(items: T[], resetKey: unknown, step = 60) {
  const [count, setCount] = useState(step);
  const sentinel = useRef<HTMLLIElement | null>(null);
  // A new search or filter starts from the top again; ticking a card does not.
  useEffect(() => setCount(step), [resetKey, step]);
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
