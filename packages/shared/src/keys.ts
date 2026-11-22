import type { Gender } from './types.js';

export interface VariantKeyParts {
  dex: number;
  form: string | null;
  costume: string | null;
  gender: Gender | null;
}

/** Builds the stable variant key used across the dataset, the API and share links. */
export function makeVariantKey(p: VariantKeyParts): string {
  let key = String(p.dex);
  if (p.form) key += `.f${p.form}`;
  if (p.costume) key += `.c${p.costume}`;
  if (p.gender === 'f') key += '.g2';
  return key;
}

const KEY_RE = /^(\d+)((?:\.(?:f[A-Za-z0-9_]+|c[A-Za-z0-9_]+|g2))*)$/;

export function parseVariantKey(key: string): VariantKeyParts | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const parts: VariantKeyParts = { dex: Number(m[1]), form: null, costume: null, gender: null };
  for (const tok of (m[2] ?? '').split('.').filter(Boolean)) {
    if (tok === 'g2') parts.gender = 'f';
    else if (tok.startsWith('f')) parts.form = tok.slice(1);
    else if (tok.startsWith('c')) parts.costume = tok.slice(1);
  }
  return parts;
}

export function isValidVariantKey(key: string): boolean {
  return KEY_RE.test(key) && key.length <= 80;
}

/** "25.fX.g2" -> "25.fX": list entries keep the gender apart from the key. */
export function neutralKey(key: string): string {
  return key.endsWith('.g2') ? key.slice(0, -3) : key;
}
