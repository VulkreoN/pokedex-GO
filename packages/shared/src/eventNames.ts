/** Leek Duck's English event names and Pokémon phrases, in French: used by the app and by the server's notifications. */

export type SpeciesNames = Map<number, { name: { en: string; fr?: string } }>;
const REGION_FR: Record<string, string> = { Alolan: "d'Alola", Galarian: 'de Galar', Hisuian: 'de Hisui', Paldean: 'de Paldea' };
const FORM_FR: Record<string, string> = {
  Normal: 'Normale', Attack: 'Attaque', Defense: 'Défense', Speed: 'Vitesse', Incarnate: 'Avatar', Therian: 'Totémique', Origin: 'Originelle',
  Altered: 'Alternative', Forme: '', Form: '', Formes: '', Forms: '', Male: 'Mâle', Female: 'Femelle',
};
const MONTHS_FR: Record<string, string> = {
  January: 'janvier', February: 'février', March: 'mars', April: 'avril', May: 'mai', June: 'juin', July: 'juillet',
  August: 'août', September: 'septembre', October: 'octobre', November: 'novembre', December: 'décembre',
};
const enToFr = new WeakMap<SpeciesNames, [RegExp, Map<string, string>]>();

/** Every Pokémon named in a phrase, in French: "Shadow Tornadus (Incarnate Forme)" -> "Boréas (Avatar) obscur". */
export function monsFr(text: string, species: SpeciesNames | undefined): string {
  if (!species) return text;
  let cached = enToFr.get(species);
  if (!cached) {
    const map = new Map<string, string>();
    for (const s of species.values()) if (s.name.fr && s.name.fr !== s.name.en) map.set(s.name.en, s.name.fr);
    const names = [...map.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    cached = [new RegExp(`(?<![\\p{L}])(${names.join('|')})(?![\\p{L}])`, 'gu'), map];
    enToFr.set(species, cached);
  }
  const [re, map] = cached;
  return text
    .replace(re, (n) => map.get(n) ?? n)
    .replace(/\(([^)]*)\)/g, (_, inner: string) => `(${inner.split(/(\s+|,)/).map((w) => FORM_FR[w] ?? w).join('').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').replace(/,? and /g, ' et ').trim()})`)
    .replace(/\bMega (\p{L}[\p{L}-]*)/gu, 'Méga-$1')
    .replace(/\bPrimal (\p{L}[\p{L}-]*)/gu, 'Primo-$1')
    .replace(/\b(Alolan|Galarian|Hisuian|Paldean) (\p{L}[\p{L}-]*)/gu, (_, r: string, n: string) => `${n} ${REGION_FR[r]}`)
    .replace(/\bShadow (\p{L}[\p{L}-]*(?: \([^)]*\))?)/gu, '$1 obscur')
    .replace(/,? and /g, ' et ');
}

const EVENT_FR: [RegExp, (m: RegExpExecArray, mons: (s: string) => string) => string][] = [
  [/^(.+) Spotlight Hour$/, (m, f) => `Heure de mise en lumière : ${f(m[1]!)}`],
  [/^Unannounced Raid Hour$/, () => 'Heure de Raids : à annoncer'],
  [/^(.+) Raid Hour$/, (m, f) => `Heure de Raids : ${f(m[1]!)}`],
  [/^Unannounced Pokémon in (\d)-star Raid Battles$/, (m) => `Pokémon à annoncer dans les Raids ${m[1]} étoiles`],
  [/^(.+) in (\d)-star Raid Battles$/, (m, f) => `${f(m[1]!)} dans les Raids ${m[2]} étoiles`],
  [/^(.+) in Mega Raids$/, (m, f) => `${f(m[1]!)} dans les Méga-Raids`],
  [/^(.+) in Shadow Raids$/, (m, f) => `${f(m[1]!)} dans les Raids obscurs`],
  [/^Dynamax (.+) during Max Monday$/, (m, f) => `Lundi Max : ${f(m[1]!)} Dynamax`],
  [/^Super Mega Raid Day$/, () => 'Super Journée de Méga-Raids'],
  [/^(.+) Super Mega Raid Day$/, (m, f) => `Super Journée de Méga-Raids : ${f(m[1]!)}`],
  [/^Raid Day$/, () => 'Journée de Raids'],
  [/^(.+) Raid Day$/, (m, f) => `Journée de Raids : ${f(m[1]!)}`],
  [/^(\w+) Community Day( Classic)?( \d{4})?$/, (m) => `Journée Communauté${m[2] ? ' Classique' : ''} de ${MONTHS_FR[m[1]!] ?? m[1]}${m[3] ?? ''}`],
  [/^Max Battle Day$/, () => 'Journée Combats Max'],
  [/^GO Pass: (\w+)$/, (m) => `GO Pass : ${MONTHS_FR[m[1]!] ?? m[1]}`],
  [/^Choose Your Path: (.+) \((\w+) (\d+), (\d{4})\)$/, (m) => `Choisis ta voie : ${m[1]} (${m[3]} ${MONTHS_FR[m[2]!] ?? m[2]} ${m[4]})`],
  [/^Minior Showers: (.+)$/, (m) => `Pluie de Météno : ${m[1]}`],
  [/^Hatch Day$/, () => 'Journée Éclosions'],
  [/^New Year's (\d{4})$/, (m) => `Nouvel An ${m[1]}`],
  [/^Winter Holiday (\d{4})$/, (m) => `Fêtes de fin d’année ${m[1]}`],
  [/^Unannounced Event$/, () => 'Événement à annoncer'],
  [/^(.+) Timed Research$/, (m) => `Étude temporaire : ${m[1]}`],
];

/** Leek Duck's event names, in French for the kinds that come back every week; others as they are. */
export function eventTitle(name: string, species: SpeciesNames | undefined, lang: string): string {
  if (lang !== 'fr') return name;
  for (const [re, fr] of EVENT_FR) {
    const m = re.exec(name);
    if (m) return fr(m, (s) => monsFr(s, species));
  }
  return name;
}
