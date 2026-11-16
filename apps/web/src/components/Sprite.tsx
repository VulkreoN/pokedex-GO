import { useState } from 'react';
import type { Variant } from '@mydexpogo/shared';
import { imageUrl, type DatasetIndex } from '../lib/dataset.js';

/**
 * A Pokémon picture. `muted` draws it as a dark silhouette (the in-game "seen but not caught" look).
 * `shiny` shows the shiny art when it exists.
 */
export function Sprite({ idx, variant, shiny = false, muted = false, dim = false, size = 64, className = '' }: { idx: DatasetIndex; variant: Variant; shiny?: boolean; muted?: boolean; dim?: boolean; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(idx, variant, shiny) ?? imageUrl(idx, variant, false);
  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center rounded-full bg-paper-2 ${className}`} style={{ width: size, height: size }} aria-hidden>
        <div className="h-1/2 w-1/2 rounded-full border-4 border-line" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${muted ? 'silhouette' : ''} ${dim ? 'opacity-50 saturate-[0.6]' : ''} select-none object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" className={className} aria-hidden>
      <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" fill="currentColor" />
    </svg>
  );
}
