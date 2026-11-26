/**
 * What's new, in players' words: the newest first. Add an entry (with a new id) for each update worth telling;
 * players see the ones they have not seen yet in a banner, and all of them in About.
 */
export interface ChangelogEntry {
  id: string;
  /** Day of the update (YYYY-MM-DD). */
  date: string;
  fr: string[];
  en: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-11-26-styles',
    date: '2026-11-26',
    fr: [
      'Partage en image et PDF : choisis un style (Shiny, Chanceux, Obscur, Mâle, Femelle, Nuit, Papier) ou laisse l’appli l’adapter toute seule, avec aperçu en direct, message perso et ton code ami.',
      'Recherche dans le jeu : un avertissement te prévient quand des Pokémon ont plusieurs couleurs, formes ou costumes (Tapatoès, Météno, Prismillon…) et t’affiche ceux concernés.',
      'Appli plus rapide à ouvrir sur téléphone, couleurs et badges de types plus lisibles, et mode sombre amélioré.',
    ],
    en: [
      'Picture & PDF sharing: pick a style (Shiny, Lucky, Shadow, Male, Female, Night, Paper) or let the app match your list automatically, with live preview, custom message and your friend code.',
      'In-game search: a heads-up warns you when Pokémon have multiple colours, forms or costumes (Squawkabilly, Minior, Vivillon…) and shows which ones.',
      'Faster to open on phones, sharper type badges and colours, and a cleaner dark mode.',
    ],
  },
  {
    id: '2026-11-25-dex',
    date: '2026-11-25',
    fr: [
      'Pokédex : en revenant d’une fiche, tu retrouves exactement ta recherche, tes filtres et ta position.',
      'Touche un Pokémon dans les résultats pour ouvrir sa fiche ; « + Ajouter » est juste en dessous.',
      'Évolutions spéciales : évolutions au hasard, Debugant selon ses IV et astuce des surnoms d’Évoli.',
    ],
    en: [
      'Pokédex: coming back from a Pokémon keeps your search, filters and scroll position.',
      'Tap a Pokémon in search results to open its page; “+ Add” sits right below.',
      'Special evolutions: random outcomes, Tyrogue by IVs, and Eevee’s nickname trick.',
    ],
  },
  {
    id: '2026-11-25-events',
    date: '2026-11-25',
    fr: [
      'Événements : les Pokémon d’un événement en cours ressortent en bleu dans Raids, Œufs, Études et Rocket.',
      'Onglet Pops : vue « Tout en ce moment » et rappel la veille si un Pokémon qui te manque arrive.',
    ],
    en: [
      'Events: current event Pokémon are highlighted in blue across Raids, Eggs, Research and Rocket.',
      'Spawns tab: an “Everything now” view plus a reminder the day before a Pokémon you miss appears.',
    ],
  },
  {
    id: '2026-11-25',
    date: '2026-11-25',
    fr: [
      'Raids repensés avec PC, types, meilleurs contres et prochains boss.',
      'Cris des Pokémon fonctionnels sur iPhone.',
      'Partage image et PDF aligné sur « Copier pour le jeu », sans les sexes déjà attrapés.',
      'Outil Évolutions spéciales (pleines lunes, jour/nuit, quêtes) et page À propos.',
    ],
    en: [
      'Rebuilt Raids with CP, types, top counters and upcoming bosses.',
      'Pokémon cries now play smoothly on iPhone.',
      'Picture and PDF sharing match “Copy for the game” and leave out caught genders.',
      'Special evolutions tool (full moons, day/night, tasks) and About page.',
    ],
  },
  {
    id: '2026-11-24',
    date: '2026-11-24',
    fr: [
      'Ouverture instantanée même avec peu de réseau, et bouton Annuler après une action.',
      'Réorganisation des collections au glisser-déposer et recherche dans une collection.',
      'Recherches du jeu découpables (2 000 car. max pour iPhone) et option pré-évolutions.',
    ],
    en: [
      'Opens right away even on slow connections, plus an Undo button after ticking or removing.',
      'Drag-and-drop collection sorting and search inside any collection.',
      'Split long game searches (2,000 chars max for iPhone) and pre-evolutions option.',
    ],
  },
];

const KEY = 'changelogSeen';

export function seenChangelog(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen() {
  try {
    localStorage.setItem(KEY, CHANGELOG[0]!.id);
  } catch {}
}

/** The entries not seen on this device; only the newest one for a device that never saw any. */
export function unseenChangelog(seen = seenChangelog()): ChangelogEntry[] {
  if (!seen) return CHANGELOG.slice(0, 1);
  const i = CHANGELOG.findIndex((e) => e.id === seen);
  return i < 0 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, i);
}
