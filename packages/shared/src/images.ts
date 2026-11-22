import type { Dataset, Variant } from './types.js';

/** Resolves the picture URL of a variant, shiny or not. Returns null when there is no picture. */
export function variantImageUrl(ds: Pick<Dataset, 'assetBase'>, v: Variant, shiny = false): string | null {
  if (!v.img) return null;
  if (shiny) {
    if (!v.hasShiny) return null;
    if (v.shinyImg) return v.shinyImg;
    if (isAbsolute(v.img)) return null;
    return ds.assetBase + v.img.replace(/\.icon\.png$/, '.s.icon.png');
  }
  return isAbsolute(v.img) ? v.img : ds.assetBase + v.img;
}

function isAbsolute(s: string): boolean {
  return /^https?:\/\//.test(s);
}
