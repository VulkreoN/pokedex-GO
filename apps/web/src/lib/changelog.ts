/**
 * What's new, in players' words: the newest first. Add an entry (with a new id and version) for each update worth
 * telling; players see the ones they have not seen yet in a banner, and all of them in About (by version or by date).
 */
export interface ChangelogEntry {
  id: string;
  /** Release version shown alongside the date (e.g. "1.3", "1.2.1"). */
  version: string;
  /** Day of the update (YYYY-MM-DD). */
  date: string;
  fr: string[];
  en: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-11-27-v1-4',
    version: '1.4',
    date: '2026-11-27',
    fr: [
      'Calendrier « Ma semaine » complet et plus lisible : retrouve les rendez-vous hebdomadaires récurrents (Lundi Max, Mardi Concours, Heure de Raid, Jeudi Combat GO, Vendredi Amitié, Dimanche Balade — repliables en un clic), la bande Raids, un bloc Événements unifié (événements du jour, barres multi-jours mondiales et événements mondiaux en cours comme GO Pass ou études longues), et le nom de la saison active.',
      'Événements locaux et régionaux remontés automatiquement : les collabs et événements par pays/lieu (centres commerciaux en Asie, musées ESA en Europe, National Trust, Pokémon Fossil Museum, Pokémon Center, PokéPark KANTO, City Safari, GO Tour/Fest présentiels…) apparaissent avec leurs drapeaux dans « Aussi en cours · Locaux & exclusifs » et dans la liste dessous.',
      'Filtres locaux pratiques : masque tous les événements locaux en un clic (dans le calendrier, dans les fiches dessous et dans l’export PNG/PDF), ou clique sur la nouvelle catégorie « 📍 Locaux » pour ne voir qu’eux et chercher par pays ou ville.',
      'Export calendrier (.ics) sur chaque fiche d’événement : ajoute n’importe quel événement directement dans Apple Calendrier, Google Agenda ou Outlook avec ses horaires locaux, ses bonus et un rappel 15 min avant.',
      'Confort de lecture sur les fiches : ouvrir une fiche d’événement (ou toute fenêtre) verrouille maintenant le défilement de la page derrière pour éviter de faire défiler le fond en arrivant en bas.',
    ],
    en: [
      'Complete, cleaner “This week” schedule: recurring Daily Discoveries (Max Monday, Showcase Tuesday, Raid Hour, GO Battle Thursday, Friendship Friday, Scenic Sunday — collapsible in one tap), dedicated Raids row, unified Events band (daily events, multi-day global bars and ongoing global events like GO Pass or long researches), plus the active season badge.',
      'Automatic local & regional events: country- and venue-exclusive collaborations (SEA Mall Exploration, ESA European museums, UK National Trust, Pokémon Fossil Museum, Pokémon Center, PokéPark KANTO, City Safari, in-person GO Tour/Fest…) now show up automatically with country flags in “Also happening · Local & exclusive” and in the feed below.',
      'Handy local filters: hide all local events in one tap (across the weekly calendar, the event feed and PNG/PDF exports), or tap the new “📍 Local” category chip to browse only local events and search by country or city.',
      'Per-event Calendar (.ics) export: add any event directly to Apple Calendar, Google Calendar or Outlook with local times, bonuses and a 15-minute reminder.',
      'Smoother modal scrolling: opening an event sheet (or any dialog) now locks background scroll and focuses the sheet so scrolling to the end never scrolls the page underneath.',
    ],
  },
  {
    id: '2026-11-27-v1-3-2',
    version: '1.3.2',
    date: '2026-11-27',
    fr: [
      'Correctif des sons de l’appli et des cris des Pokémon : les petits sons au clic refonctionnent de façon fiable sur iPhone, Android et ordinateur (y compris après un aller-retour dans Pokémon GO ou après avoir réactivé les sons dans Moi), et les cris gèrent mieux la bascule de secours.',
    ],
    en: [
      'Fixed app sound effects and Pokémon cries: tick/celebration sounds now play reliably on iPhone, Android and desktop (including after switching back from Pokémon GO or re-enabling sounds in Me), and Pokémon cries fall back cleanly when needed.',
    ],
  },
  {
    id: '2026-11-27-v1-3-1',
    version: '1.3.1',
    date: '2026-11-27',
    fr: [
      'Ajouter des Pokémon plus vite : un seul bouton « + Ajouter » dans tes collections (recherche, import du jeu et modèles au même endroit), un mode « Ajout 1 clic » dans le Pokédex, et la possibilité d’annuler n’importe quelle erreur depuis l’historique d’une collection.',
      'Médailles repensées comme dans le jeu : 26 médailles inspirées des vrais Pokédex (National, Shiny, Chanceux, Obscur, Purifié, Méga, Max, Costumes), des défis Zarbi, Prismillon et Légendaires Shiny, avec des médailles Platine vraiment méritées.',
      'Onglet Jeu encore plus pratique : coche directement tes Pokémon comme attrapés depuis « Pour moi », retrouve les phrases des sbires Team GO Rocket pour les reconnaître en un coup d’œil, filtre les contres sans CT Élite et cherche facilement un événement.',
      'Programme de la Ligue Combat GO ajouté dans l’onglet PvP : vois les coupes de la semaine et celles à venir sans quitter l’appli.',
      'Amis, Prismillon & Profil plus clairs : un onglet « 🦋 Prismillon » dédié pour tes cartes postales, une recherche dans tes amis, une page Moi rangée en deux onglets (Profil et Préférences) avec ton QR code en un clic, et des notifications qui ne se marquent lues que quand tu les ouvres.',
      'Correctifs & français amélioré : ajout des formes Méga de Nigirigon, noms français complétés (Métalosse Obscur, Super Niveau Max…), et les événements de « Ma semaine » s’ouvrent maintenant directement dans l’appli.',
    ],
    en: [
      'Add Pokémon faster: one “+ Add” button inside collections (search, game import and templates in one place), a “1-tap add” mode in the Pokédex, and undo any mistake straight from collection history.',
      'Reworked in-game inspired medals: 26 medals matching real Pokédex tabs (National, Shiny, Lucky, Shadow, Purified, Mega, Max, Costumes) plus Unown, Vivillon and Shiny Legendaries — with truly challenging Platinum tiers.',
      'Handier Game tab: tick Pokémon as caught right from “For me”, spot Team GO Rocket grunts by their in-game catchphrases, filter raid counters without Elite TMs, and search or filter events easily.',
      'GO Battle League schedule added to PvP: check this week’s active cups and upcoming rotations right inside the PvP tab.',
      'Cleaner Friends, Vivillon & Profile: a dedicated “🦋 Vivillon” tab for gift postcards, friend search & filters, a 2-tab Me page (Profile & Preferences) with a quick QR code, and notifications only marked read when you tap them.',
      'Fixes & localization: Mega Tatsugiri forms added, cleaner French & English names, and “This week” events now open directly inside the app.',
    ],
  },
  {
    id: '2026-11-26-v1-3',
    version: '1.3',
    date: '2026-11-27',
    fr: [
      'Onglet Jeu repensé : « Événements » en premier avec le calendrier automatique « Ma semaine » (Lundi → Dimanche), des fiches visuelles traduites en français par type d’événement (Gigamax, Journée Communauté, Heure vedette, Journée Raids, Événements longs) exportables en image PNG ou PDF avec les vraies icônes de bonus, et les codes promo repliés en menu déroulant masquable.',
      'Nouvel onglet « Pour moi » : toutes tes chasses actives sur un seul écran, comptes à rebours en direct, alertes Gigamax/Dynamax, chasses Rocket & Raids obscurs unifiées et pré-évolutions des Méga prises en compte quand l’option pré-évolutions est cochée.',
      'Amis & Prismillon : indique tes cartes postales Prismillon dans Moi, retrouve-les directement sur la liste d’amis et ouvre le profil complet d’un ami (collections partagées, badges & médailles, cartes postales, Ami Chanceux ✨) + onglet « Ajout d’amis · Prismillon » pour trouver des dresseurs ayant les motifs qu’il te manque.',
      'Médailles de dresseur à paliers (Bronze → Platine) dans Moi, stats par collection, filtre « Sorties récentes » et notification « Je l’ai » groupée envoyée uniquement en quittant la collection.',
      'PvP & Outils : enregistre tes équipes de 3 par ligue, calcul exact des coûts poussières / bonbons / XL (Normal, Obscur, Purifié, Chanceux, Chanceux purifié) et Quoi de neuf classable par version ou par date.',
      'Version web / grand écran retravaillée (plus d’onglets ou filtres coupés, grilles plus larges) et guides interactifs passables sur chaque page (bouton « ? » en haut).',
    ],
    en: [
      'Reworked Game tab: “Events” now comes first with the automatic “This week” Monday → Sunday schedule, tailored localized infographics per event type (Max Battles, Community Day, Spotlight, Raid Day, Long Events) exportable as PNG image or PDF with real bonus icons, and a collapsible/hideable promo codes menu.',
      'New “For me” overview: every active hunt on one screen, live countdowns, Gigantamax/Dynamax alerts, unified Rocket & Shadow Raid hunts and Mega pre-evolutions included when pre-evolution alerts are checked.',
      'Friends & Vivillon: set your available Vivillon postcards in Me, see them right on your friends list and open any friend’s full profile (shared collections, medals, postcards, Lucky Friend ✨) + “Add friends · Vivillon” tab matching trainers who have your missing patterns.',
      'Tiered trainer medals (Bronze → Platinum) in Me, collection stats, “Recent releases” filter, and batched “I have it” notification sent only when leaving the collection.',
      'PvP & Tools: save your teams of 3 per league, exact Stardust / Candy / XL power-up costs (Normal, Shadow, Purified, Lucky, Lucky Purified), and What’s new sortable by version or by date.',
      'Improved desktop responsive layout (no more clipped tabs or filters, wider multi-column grids) and skippable interactive guides on every page (“?” button at top).',
    ],
  },
  {
    id: '2026-11-26-hunts-startup',
    version: '1.2.1',
    date: '2026-11-26',
    fr: [
      'Page au démarrage au choix dans Moi : ouvre directement l’appli sur le Pokédex, tes Collections, ta Dernière collection, Jeu, PvP ou Amis.',
      'Mes chasses & alertes corrigées : correspondance exacte par forme, costume, Méga, Gigamax et Obscur (fini Ronflex sauvage pour un Gigamax ou Miaouss de Galar pour un Miaouss classique).',
      'Option par collection « Pré-évolutions dans Mes chasses et alertes » : active-la sur une liste pour être prévenu dès qu’une pré-évolution sûre apparaît (jamais pour les Gigamax, Méga ou costumes qui n’évoluent pas).',
    ],
    en: [
      'Choose your startup page in Me: open the app straight on Pokédex, Collections, Last collection, Game, PvP or Friends.',
      'Fixed My hunts & alerts: strict matching by form, costume, Mega, Gigantamax and Shadow (no more wild Snorlax matching Gigantamax or Galarian Meowth matching base Meowth).',
      'Per-collection “Pre-evolutions in My hunts & alerts” toggle: enable it on any list to highlight & notify safe pre-evolutions (never for Gigantamax, Megas or non-evolving costumes).',
    ],
  },
  {
    id: '2026-11-26-ux',
    version: '1.2',
    date: '2026-11-26',
    fr: [
      'Collections & Pokédex : ajout direct depuis une liste, modèles prêts à l’emploi (Living Dex, Shiny, Costumes, Gen 1 à 9…), notes perso, filtres Type / Rareté / Shiny / Fonds spéciaux, recherche +famille et 1-151, et export image/PDF fiabilisé sur les grandes listes.',
      'Onglet Jeu & Contres : badge « Me manque » + filtre « Mes chasses », œufs triés par distance avec recherche et sources claires (Suivi d’exploration, Routes Mateo), évolutions au hasard complètes, et contres mis à jour avec les fusions et attaques signatures.',
      'PvP & Échanges : onglet Échanges chez chaque ami, aperçu « Prochaine saison » PvPoke avec évolution des rangs, équipes populaires mises à jour et filtrables, et boutons −/+ / Rang 1 sur les IV.',
      'Nouveaux thèmes complets pour l’appli dans Moi : Sagesse, Bravoure, Intuition, Team Rocket, Sakura, Forêt et Nuit OLED, en mode clair et sombre.',
    ],
    en: [
      'Collections & Pokédex: add straight from any list, starter templates (Living Dex, Shinies, Costumes, Gen 1–9…), personal notes, Type / Rarity / Shiny / Background filters, +family & 1-151 search, and rock-solid large-list image/PDF exports.',
      'Game tab & Counters: “Missing” highlights + “My hunts” filter, cleaner Eggs search & source labels (Adventure Sync, Mateo Routes), complete random evolutions, and updated raid counters with fusions & signature moves.',
      'PvP & Trades: automatic Trades tab on every friend, PvPoke “Next season” preview with rank deltas, up-to-date filterable popular teams, and −/+ / Rank 1 IV presets.',
      'Brand-new full-app themes in Me: Mystic, Valor, Instinct, Team Rocket, Sakura, Forest and OLED Night in both light and dark modes.',
    ],
  },
  {
    id: '2026-11-26-styles',
    version: '1.1',
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
    version: '1.0.2',
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
    version: '1.0.1',
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
    version: '1.0',
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
    version: '0.9',
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

import { useSyncExternalStore } from 'react';

const KEY = 'changelogSeen';
const listeners = new Set<() => void>();

export function seenChangelog(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let cachedUnseen: ChangelogEntry[] = computeUnseen();

function computeUnseen(seen = seenChangelog()): ChangelogEntry[] {
  if (!seen) return CHANGELOG.slice(0, 1);
  const i = CHANGELOG.findIndex((e) => e.id === seen);
  return i < 0 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, i);
}

export function markChangelogSeen() {
  try {
    localStorage.setItem(KEY, CHANGELOG[0]!.id);
  } catch {}
  cachedUnseen = [];
  listeners.forEach((l) => l());
}

/** The entries not seen on this device; only the newest one for a device that never saw any. */
export function unseenChangelog(seen = seenChangelog()): ChangelogEntry[] {
  return computeUnseen(seen);
}

export function useUnseenChangelog(): ChangelogEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cachedUnseen,
    () => cachedUnseen,
  );
}
