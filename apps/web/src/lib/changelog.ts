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
    id: '2026-11-25-dex',
    date: '2026-11-25',
    fr: [
      'Pokédex : en revenant d’un Pokémon, tu retrouves ta recherche, tes filtres et l’endroit où tu étais dans la liste.',
      'Dans les résultats d’une recherche ou d’un filtre, toucher un Pokémon ouvre sa fiche ; « + Ajouter » est juste en dessous.',
      'Évolutions spéciales : les évolutions au hasard (Évoli, Chenipotte, Coquiperl, Ceribou, Toxizap…), Debugant selon ses IV, et l’astuce des surnoms pour les 8 Évolitions.',
    ],
    en: [
      'Pokédex: back from a Pokémon, your search, filters and place in the list are as you left them.',
      'In search or filter results, tapping a Pokémon opens it; “+ Add” is right below.',
      'Special evolutions: random ones (Eevee, Wurmple, Clamperl, Cherubi, Toxel…), Tyrogue by its IVs, and the nickname trick for all 8 Eeveelutions.',
    ],
  },
  {
    id: '2026-11-25-events',
    date: '2026-11-25',
    fr: [
      'Jeu : les Pokémon amenés par un événement en cours ont un fond bleu dans Raids, Œufs, Études et Rocket.',
      'Pops : une vue « Tout en ce moment » rassemble tous les Pokémon des événements en cours, chacun une fois.',
      'Rappel la veille d’un événement quand un Pokémon qui te manque y sera (sauvage, raid, œuf, étude ou Rocket).',
      'Cette bannière, pour savoir ce qui change à chaque mise à jour.',
    ],
    en: [
      'Game: Pokémon brought by an event under way have a blue background in Raids, Eggs, Research and Rocket.',
      'Spawns: an “Everything now” view gathers every Pokémon of the current events, each one once.',
      'A reminder the day before an event when a Pokémon you miss will be in it (wild, raids, eggs, research or Rocket).',
      'This banner, to know what changes with each update.',
    ],
  },
  {
    id: '2026-11-25',
    date: '2026-11-25',
    fr: [
      'Raids refaits : les boss de la semaine par niveau, tous les Méga en cours, les Heures de Raids à part et les prochains boss.',
      'PC, types et meilleurs contres pour tous les boss, y compris chaque forme de Deoxys.',
      'Les cris des Pokémon marchent sur iPhone, et un nouveau toucher coupe le cri en cours.',
      'Partage en image ou PDF : les mêmes réglages de recherche que « Copier pour le jeu ».',
      'Export des manquants : un sexe déjà attrapé n’apparaît plus.',
      'Nouvel onglet Pops : ce qui apparaît pendant les événements, et une alerte quand un Pokémon qui te manque est dans un événement ou en quête.',
      'Outil Évolutions spéciales : pleines lunes à venir, jour, nuit, crépuscule, téléphone à l’envers, quêtes.',
      'Ton code ami du jeu sur ton compte, et une page À propos.',
    ],
    en: [
      'Raids rebuilt: this week’s bosses by level, every Mega running, Raid Hours apart and the next bosses.',
      'CP, types and best counters for every boss, each Deoxys form included.',
      'Pokémon cries work on iPhone, and a new tap stops the one playing.',
      'Sharing as a picture or PDF: the same search settings as “Copy for the game”.',
      'Missing-only exports: a gender already caught is left out.',
      'New Spawns tab: what appears during events, and an alert when a Pokémon you miss is in an event or a research reward.',
      'Special evolutions tool: next full moons, day, night, dusk, phone upside down, tasks.',
      'Your in-game friend code on your account, and an About page.',
    ],
  },
  {
    id: '2026-11-24',
    date: '2026-11-24',
    fr: [
      'L’appli s’ouvre tout de suite, même avec une connexion lente.',
      'Annuler après avoir coché ou retiré des Pokémon.',
      'Réorganiser ses collections en les faisant glisser.',
      'Recherche dans une collection, et recherches du jeu coupées à la longueur voulue (2 000 pour les raccourcis iPhone).',
      'Les pré-évolutions dans les recherches du jeu (Lépidonille et Pérégrain pour un Prismillon).',
    ],
    en: [
      'The app opens at once, even on a slow connection.',
      'Undo after ticking or removing Pokémon.',
      'Reorder your collections by dragging them.',
      'Search inside a collection, and game searches cut to the length you want (2,000 for iPhone text replacements).',
      'Pre-evolutions in game searches (Scatterbug and Spewpa for a Vivillon).',
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
