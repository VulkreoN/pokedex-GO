/**
 * Turns raw signals (PokeMiners Discord posts, official news) into candidate variant keys.
 * Pure functions, unit-tested; the service decides what to auto-apply.
 */
import { makeVariantKey, type Dataset, type Species, type Variant } from '@mydexpogo/shared';

export interface Candidate {
  variantKey: string;
  reason: string;
}

/** PokeMiners picture names, e.g. "pm25.fHALLOWEEN_2026.g2.s.icon.png" or "pm41.fHALLOWEEN_2026_01". */
export function extractAssetKeys(text: string): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const m of text.matchAll(/\bpm(\d{1,4})((?:\.(?:f[A-Za-z0-9_]+|c[A-Za-z0-9_]+|g2|s))*)(?:\.icon)?(?:\.png)?\b/g)) {
    const dex = Number(m[1]);
    let form: string | null = null;
    let costume: string | null = null;
    let female = false;
    for (const tok of (m[2] ?? '').split('.').filter(Boolean)) {
      if (tok === 'g2') female = true;
      else if (tok === 's') continue;
      else if (tok.startsWith('f')) form = tok.slice(1);
      else if (tok.startsWith('c')) costume = tok.slice(1).toUpperCase();
    }
    if (!form && !costume) continue; // plain species pictures are not release signals
    const key = makeVariantKey({ dex, form, costume, gender: female ? 'f' : null });
    out.set(key, { variantKey: key, reason: `asset ${m[0]}` });
  }
  return [...out.values()];
}

/**
 * Game master diffs in text-proto form:
 *   template_id: "FORMS_V0025_POKEMON_PIKACHU" ... form: "PIKACHU_HALLOWEEN_2026" is_costume: true
 *   template_id: "V0025_POKEMON_PIKACHU_HALLOWEEN_2026"
 * Returns the (dex, form token) pairs mentioned; the caller maps them to existing variants.
 */
export function extractGmForms(text: string, speciesById: Map<string, Species>): { dex: number; token: string; reason: string }[] {
  const out = new Map<string, { dex: number; token: string; reason: string }>();
  const push = (dex: number, token: string, reason: string) => {
    if (!token || token === 'NORMAL') return;
    out.set(`${dex}:${token}`, { dex, token, reason });
  };
  // Pokémon templates with a form suffix
  for (const m of text.matchAll(/"?V(\d{4})_POKEMON_([A-Z0-9_]+)"?/g)) {
    const dex = Number(m[1]);
    const rest = m[2]!;
    const sp = [...speciesById.values()].find((s) => s.dex === dex);
    if (!sp) continue;
    if (rest === sp.id) continue;
    if (rest.startsWith(`${sp.id}_`)) push(dex, rest.slice(sp.id.length + 1), `game master template ${m[0].replaceAll('"', '')}`);
  }
  // form entries inside FORMS templates: form: "PIKACHU_HALLOWEEN_2026"
  for (const m of text.matchAll(/\bform:\s*"?([A-Z][A-Z0-9_]+)"?/g)) {
    const full = m[1]!;
    for (const sp of speciesById.values()) {
      if (full.startsWith(`${sp.id}_`)) {
        push(sp.dex, full.slice(sp.id.length + 1), `game master form ${full}`);
        break;
      }
    }
  }
  return [...out.values()];
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Species named in a text (official news), accent-insensitive, whole words. */
export function matchSpeciesNames(text: string, species: Species[]): Species[] {
  return mentions(text, species).map((m) => m.species);
}

export interface Mention {
  species: Species;
  /** Text around the first mention that sits next to a costume word (±90 chars), else null. */
  snippet: string | null;
}

/** Species mentioned, with the sentence fragment when a costume word appears close to the name. */
export function mentions(text: string, species: Species[]): Mention[] {
  const hay = stripAccents(text).replace(/[^a-z0-9]+/g, ' ');
  const out: Mention[] = [];
  for (const s of species) {
    const names = [s.name.en, s.name.fr].filter((n): n is string => !!n).map((n) => stripAccents(n).replace(/[^a-z0-9]+/g, ' ').trim()).filter((n) => n.length >= 4);
    let snippet: string | null = null;
    let found = false;
    for (const n of names) {
      const re = new RegExp(`(?<![a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'g');
      for (const m of hay.matchAll(re)) {
        found = true;
        const around = hay.slice(Math.max(0, m.index - 90), m.index + n.length + 90);
        if (COSTUME_WORDS.test(around)) {
          snippet = text.slice(Math.max(0, m.index - 90), m.index + n.length + 90).replace(/\s+/g, ' ').trim();
          break;
        }
      }
      if (snippet) break;
    }
    if (found) out.push({ species: s, snippet });
  }
  return out;
}

export const COSTUME_WORDS = /(costum|deguis|chapeau|casquette|bonnet|echarpe|foulard|lunettes|couronne|noeud|cape|tenue|portant|coiffe|astronaut|wearing|hat|cap|scarf|bow|outfit|helmet)/i;

/**
 * Candidates for one item. Game master and asset mentions map directly to variant keys;
 * news only suggest the not-yet-released variants of the species it names (managers decide).
 */
export function candidatesFor(text: string, ds: Pick<Dataset, 'species' | 'variants'>, speciesById: Map<string, Species>): Candidate[] {
  const byKey = new Map(ds.variants.map((v) => [v.key, v]));
  const out = new Map<string, Candidate>();
  for (const c of extractAssetKeys(text)) {
    const v = byKey.get(c.variantKey) ?? byKey.get(c.variantKey.replace(/\.g2$/, ''));
    if (v) out.set(v.key, { variantKey: v.key, reason: c.reason });
    else out.set(c.variantKey, { variantKey: c.variantKey, reason: `${c.reason} (pas encore dans le dataset)` });
  }
  for (const f of extractGmForms(text, speciesById)) {
    const vs = ds.variants.filter((v) => v.dex === f.dex && v.form === f.token);
    for (const v of vs) out.set(v.key, { variantKey: v.key, reason: f.reason });
  }
  if (out.size === 0) {
    // News: only species named right next to a costume word, so "Pikachu" in a bonus list does not trigger
    for (const m of mentions(text, ds.species)) {
      if (!m.snippet) continue;
      for (const v of ds.variants) {
        if (v.dex === m.species.dex && v.datamined && v.kind !== 'base') out.set(v.key, { variantKey: v.key, reason: `« …${m.snippet}… »` });
      }
    }
  }
  return [...out.values()];
}

export function variantLabel(v: Variant | undefined, key: string): string {
  return v?.label?.fr ?? v?.label?.en ?? key;
}
