/**
 * Skippable, interactive per-page guided tutorial explaining what lives where on every main screen of the app.
 * - `<PageTourButton page="..." />` sits in `TopBar` so players can open the walkthrough anytime on any page.
 * - `<PageTourBanner page="..." />` shows automatically inside `<main>` (without `<ul><li>`) when guided tours are
 *   enabled (e.g. after completing `/welcome` or toggling guides in Me), and can be skipped per page or everywhere.
 */
import { useEffect, useState } from 'react';
import type { Lang } from '@mydexpogo/shared';
import { useLang, useT } from '../lib/i18n.js';
import {
  TOUR_PAGES,
  disableGuidedTours,
  markTourSeen,
  useTourState,
  type TourPageId,
} from '../lib/tour.js';
import { Badge, Button, IconButton, Sheet } from './ui.js';

interface TourStep {
  icon: string;
  title: string;
  where: string;
  text: string;
}

interface PageTourDef {
  label: string;
  intro: string;
  steps: TourStep[];
}

const GUIDES: Record<Lang, Record<TourPageId, PageTourDef>> = {
  fr: {
    dex: {
      label: 'Pokédex',
      intro: 'Toutes les espèces, formes, costumes, sexes, shinies et fonds spéciaux du jeu.',
      steps: [
        {
          icon: '🔍',
          title: 'Recherche puissante',
          where: 'Barre de recherche en haut',
          text: 'Tape un nom, un numéro, un nom de costume (« sorcière »), « +pikachu » pour toute la famille d’évolution ou « 1-151 » pour toute une génération.',
        },
        {
          icon: '🎛️',
          title: 'Filtres & sorties récentes',
          where: 'Bouton « Filtres » sous la recherche',
          text: 'Filtre par type, rareté, génération, sexe, fonds spéciaux, « Shiny sortis seulement » ou « Sorties récentes » (les nouveautés des 45 derniers jours).',
        },
        {
          icon: '✨',
          title: 'Shiny, PvP, Ajout 1 clic & Sélection',
          where: 'Puces rapides sous la recherche',
          text: 'Passe tout le Pokédex en shiny, affiche les rangs PvP, active « Ajout 1 clic » pour remplir directement une collection en touchant les cartes ou utilise « Sélection » pour ajouter en lot.',
        },
        {
          icon: '📖',
          title: 'Fiche Pokémon & disponibilité en direct',
          where: 'Touche un Pokémon dans la grille',
          text: 'Ouvre sa fiche pour voir toutes ses variantes, écouter son cri, consulter ses évolutions et savoir s’il est dispo en raids, œufs, études ou apparitions en ce moment.',
        },
      ],
    },
    lists: {
      label: 'Collections',
      intro: 'Crée tes listes de chasse et suis celles de tes amis en temps réel.',
      steps: [
        {
          icon: '➕',
          title: 'Créer ou utiliser un modèle',
          where: 'Bouton « + Nouvelle collection » en haut',
          text: 'Crée une collection vide ou pré-remplis-la en 1 clic : Living Dex, Tous les Shiny sortis, Costumes, Formes régionales, Méga & Gigamax ou Gen 1 à 9.',
        },
        {
          icon: '👥',
          title: 'Collections de tes amis',
          where: 'Onglet « Celles de mes amis » en haut',
          text: 'Parcours les collections que tes amis partagent, épingle tes favorites en haut avec ★ et indique-leur « Je l’ai » pour préparer vos échanges.',
        },
        {
          icon: '↕️',
          title: 'Réorganiser tes listes',
          where: 'Bouton « Réorganiser » au-dessus des cartes',
          text: 'Glisse tes collections par la poignée (ou utilise les flèches) pour choisir l’ordre exact que verront tes amis.',
        },
      ],
    },
    list: {
      label: 'Dans une collection',
      intro: 'Coche tes captures, exporte ta recherche pour le jeu et partage tes avancées.',
      steps: [
        {
          icon: '➕',
          title: 'Ajout rapide, Cocher (♂/♀) & Annuler',
          where: 'Bouton « + Ajouter » · cartes et bulles ♂ / ♀',
          text: 'Touche « + Ajouter » pour ajouter des Pokémon en 1 clic, importer une recherche ou appliquer un modèle. Touche une carte (ou ♂ / ♀) pour cocher — chaque opération peut être annulée depuis le bandeau ou l’historique (🕒).',
        },
        {
          icon: '📋',
          title: 'Copier pour le jeu & Importer',
          where: '« Copier pour le jeu » en haut · « Importer » en bas',
          text: 'Copie la recherche prête à coller dans Pokémon GO (découpée pour iPhone, avec option pré-évolutions). Et « Importer » ajoute directement une recherche du jeu dans ta liste.',
        },
        {
          icon: '🖼️',
          title: 'Partager en image ou PDF',
          where: 'Bouton « Partager » en haut',
          text: 'Génère une ou plusieurs images (ou un PDF) avec le style de ton choix (Shiny, Chanceux, Obscur, Nuit…), un message perso et ton code ami.',
        },
        {
          icon: '📊',
          title: 'Stats, Notes, Historique & Options',
          where: 'Icônes 📊 / 🕒 / ✏️ en haut · « … » sur chaque carte',
          text: 'Suis ton avancement par génération et catégorie, ajoute des notes perso sur un Pokémon, active les alertes de pré-évolutions dans Modifier ou utilise « Sélectionner » pour agir en lot.',
        },
      ],
    },
    game: {
      label: 'Jeu',
      intro: 'Tout ce qui se passe en ce moment et cette semaine dans Pokémon GO.',
      steps: [
        {
          icon: '🗓️',
          title: 'Ma semaine & fiches Événements',
          where: 'Onglet « Événements » (le premier !)',
          text: 'Retrouve ton calendrier Lundi → Dimanche en haut, puis les fiches visuelles automatiques en français de chaque événement (bonus, raids, apparitions, GO Pass, tickets) — partageables en image PNG ou PDF.',
        },
        {
          icon: '🎯',
          title: 'Onglet « Pour moi »',
          where: '2ᵉ onglet « Pour moi »',
          text: 'Réunit sur un seul écran tous les raids, apparitions, Combats Max, Rocket, études et œufs actifs qui correspondent aux Pokémon manquants de tes collections.',
        },
        {
          icon: '⚔️',
          title: 'Raids, PC 100 % & Contres',
          where: 'Onglet « Raids »',
          text: 'Filtre par niveau de raid ou « Mes chasses », repère le PC 100 % (normal et boost météo) et le compte à rebours. Touche n’importe quel boss pour voir ses meilleurs contres.',
        },
        {
          icon: '🧰',
          title: 'Pops, Dynamax, Rocket, Études, Œufs & Outils',
          where: 'Tous les onglets en haut de la page',
          text: 'Explore les apparitions d’événements, les Combats Dynamax/Gigamax, les sbires/chefs Rocket, les études de terrain, les œufs par distance et les outils (Contres, Évolutions spéciales, Coûts, Copain, Capsules).',
        },
      ],
    },
    pvp: {
      label: 'PvP',
      intro: 'Évalue tes IV, bâtis tes équipes de 3 et simule tes duels de Ligue Combat GO.',
      steps: [
        {
          icon: '🏆',
          title: 'Calculateur d’IV & Top PvPoke',
          where: 'Barre de recherche ou Top des ligues',
          text: 'Choisis un Pokémon pour voir son rang exact en Super, Hyper et Master, le coût de recharge, les attaques PvPoke conseillées et une recherche pour trouver mieux dans ton stockage.',
        },
        {
          icon: '⭐',
          title: 'Enregistrer « Mes Pokémon »',
          where: 'Bouton « Enregistrer » sur une fiche PvP',
          text: 'Garde tes meilleurs Pokémon PvP avec leurs IV et niveau : ils s’affichent triés par meilleur rang et se sélectionnent en 1 clic dans le constructeur d’équipe.',
        },
        {
          icon: '🛡️',
          title: 'Équipes de 3 & sauvegardes',
          where: 'Carte « Construire une équipe »',
          text: 'Compose ton équipe de 3, vérifie les faiblesses partagées et les menaces PvPoke, enregistre tes équipes par ligue ou charge les équipes populaires.',
        },
        {
          icon: '⚡',
          title: 'Simulateur de combat 1v1',
          where: 'Carte « Simuler un combat »',
          text: 'Simule un duel complet avec attaques, boucliers, leurres, chronologie tour par tour et matrice de tous les scénarios de boucliers.',
        },
      ],
    },
    friends: {
      label: 'Amis & Prismillon',
      intro: 'Connecte-toi avec tes amis, trouve des cartes postales Prismillon et prépare vos échanges.',
      steps: [
        {
          icon: '📱',
          title: 'Ton code ami du jeu & QR code',
          where: 'Carte bleue dans « Mes amis »',
          text: 'Enregistre ton code Pokémon GO (à la main ou en scannant une capture de ton QR code) et affiche ton QR à faire scanner autour de toi.',
        },
        {
          icon: '✨',
          title: 'Amis Chanceux & épinglage',
          where: 'Étoiles ★ et ✨ sur chaque ami',
          text: 'Épingle tes amis proches en haut, marque tes Amis Chanceux ✨ et touche un ami pour parcourir ses collections partagées.',
        },
        {
          icon: '🦋',
          title: 'Ajouter un ami & cartes Prismillon',
          where: 'Onglets « Ajouter » et « 🦋 Prismillon » en haut',
          text: 'Ajoute un ami par code ou QR, déclare tes motifs de cartes postales (illimité ou quantité de voyage) et découvre les dresseurs qui ont les Prismillon qu’il te manque !',
        },
      ],
    },
    me: {
      label: 'Moi & Réglages',
      intro: 'Ton profil, tes médailles de dresseur, ton thème et tes préférences.',
      steps: [
        {
          icon: '🏅',
          title: 'Médailles de dresseur à paliers',
          where: 'Bloc « Mes médailles »',
          text: 'Débloque Bronze, Argent, Or et Platine sur 26 médailles inspirées du jeu (Pokédex, défis Zarbi/Prismillon/Légendaires et 9 régions), calculées automatiquement depuis tes collections.',
        },
        {
          icon: '🎨',
          title: 'Page au démarrage & Thèmes',
          where: 'Sections « Page au démarrage » et « Thème »',
          text: 'Choisis l’onglet qui s’ouvre quand tu lances l’appli et applique un thème complet (Sagesse, Bravoure, Intuition, Team Rocket, Sakura, Forêt, Nuit OLED…).',
        },
        {
          icon: '🔔',
          title: 'Notifications push & guides',
          where: 'Cartes « Notifications » et « Guides »',
          text: 'Active les alertes raids, apparitions, études, Gigamax et échanges d’amis. Tu peux aussi relancer les guides d’ici ou toucher « ? » en haut de chaque page.',
        },
      ],
    },
  },
  en: {
    dex: {
      label: 'Pokédex',
      intro: 'Every species, form, costume, gender, shiny and special background in the game.',
      steps: [
        {
          icon: '🔍',
          title: 'Power search',
          where: 'Search bar at the top',
          text: 'Type a name, number, costume label (“witch”), “+pikachu” for the full evolution family or “1-151” for a Pokédex range.',
        },
        {
          icon: '🎛️',
          title: 'Filters & recent releases',
          where: '“Filters” chip under search',
          text: 'Filter by type, rarity, generation, gender, special backgrounds, “Released shinies only” or “Recent releases” (last 45 days).',
        },
        {
          icon: '✨',
          title: 'Shiny, PvP, 1-tap Add & Multi-select',
          where: 'Quick chips under search',
          text: 'Toggle shiny sprites across the Pokédex, show PvP ranks, enable “1-tap add” to fill a collection directly by tapping cards, or use Multi-select for bulk actions.',
        },
        {
          icon: '📖',
          title: 'Species page & live availability',
          where: 'Tap any Pokémon card',
          text: 'Open its page for every variant, its cry, evolutions, where it is obtainable right now in GO, and add it to your collections.',
        },
      ],
    },
    lists: {
      label: 'Collections',
      intro: 'Build your hunting checklists and browse your friends’ lists live.',
      steps: [
        {
          icon: '➕',
          title: 'Create or pick a template',
          where: '“+ New collection” button at top',
          text: 'Start empty or pre-fill in 1 tap: Living Dex, All released Shinies, Costumes, Regional forms, Mega & Gigantamax or Gen 1–9.',
        },
        {
          icon: '👥',
          title: 'Friends’ collections',
          where: '“Friends’ collections” tab at the top',
          text: 'Browse lists shared by your friends, pin favourites with ★ and tap “I have it” on entries they are hunting.',
        },
        {
          icon: '↕️',
          title: 'Reorder your lists',
          where: '“Reorder” button above cards',
          text: 'Drag lists by their handle (or use the arrows) to set the exact order your friends see.',
        },
      ],
    },
    list: {
      label: 'Inside a collection',
      intro: 'Tick what you caught, copy your game search string and share progress.',
      steps: [
        {
          icon: '➕',
          title: 'Quick add, Tick (♂/♀) & Undo',
          where: '“+ Add” button · cards and ♂ / ♀ pills',
          text: 'Tap “+ Add” to add Pokémon in 1 tap, import a search or apply a template. Tap a card (or ♂ / ♀) to tick — any change can be undone right away or from History (🕒).',
        },
        {
          icon: '📋',
          title: 'Copy for the game & Import',
          where: '“Copy for the game” on top · “Import” at bottom',
          text: 'Copy ready-to-paste Pokémon GO search strings (split for iPhone, with optional pre-evolutions). “Import” adds a game search directly into your list.',
        },
        {
          icon: '🖼️',
          title: 'Share as image or PDF',
          where: '“Share” button on top',
          text: 'Export crisp images or PDFs with your chosen visual style (Shiny, Lucky, Shadow, Night…), custom message and friend code.',
        },
        {
          icon: '📊',
          title: 'Stats, Notes, History & Multi-pick',
          where: 'Top bar icons · “…” on any card',
          text: 'Track completion by generation & kind, add personal notes per Pokémon, enable pre-evolution alerts in Edit, or use “Select” for bulk actions.',
        },
      ],
    },
    game: {
      label: 'Game',
      intro: 'Everything live right now and coming this week in Pokémon GO.',
      steps: [
        {
          icon: '🗓️',
          title: 'This Week & Event Infographics',
          where: '“Events” tab (first tab!)',
          text: 'Check your automatic Monday → Sunday schedule on top, then tap any visual event card for full bonuses, raids, spawns, GO Pass and tickets — shareable as PNG image or PDF.',
        },
        {
          icon: '🎯',
          title: '“For me” tab',
          where: '2nd tab “For me”',
          text: 'All active raids, spawns, Max Battles, Rocket, field research and eggs matching Pokémon missing from your collections — in one place.',
        },
        {
          icon: '⚔️',
          title: 'Raids, 100% CP & Counters',
          where: '“Raids” tab',
          text: 'Filter by raid tier or “My hunts”, check hundo CP and live countdowns, and tap any boss to open its best raid counters.',
        },
        {
          icon: '🧰',
          title: 'Spawns, Dynamax, Rocket, Research, Eggs & Tools',
          where: 'All tabs across the top',
          text: 'Browse event spawns, Dynamax/Gigantamax battles, Rocket lineups, field research, egg pools by distance and handy calculators (Counters, Special Evolutions, Costs, Buddy, Bottle Caps).',
        },
      ],
    },
    pvp: {
      label: 'PvP',
      intro: 'Rate IVs, build teams of 3 and simulate GO Battle League matchups.',
      steps: [
        {
          icon: '🏆',
          title: 'IV Ranker & PvPoke Top',
          where: 'Search bar or Top League grid',
          text: 'Pick a Pokémon to see its exact Great, Ultra & Master rank, power-up cost, PvPoke moveset and a storage search string to find better IVs.',
        },
        {
          icon: '⭐',
          title: 'Save “My Pokémon”',
          where: '“Save” button on any PvP page',
          text: 'Store your PvP catches with their IVs & level so they show up ranked and ready to pick in the Team Builder.',
        },
        {
          icon: '🛡️',
          title: 'Teams of 3 & saved rosters',
          where: '“Build a team” card',
          text: 'Assemble 3 Pokémon, inspect shared weaknesses & PvPoke threats, save your own teams per league or load popular teams.',
        },
        {
          icon: '⚡',
          title: '1v1 Battle Simulator',
          where: '“Simulate a battle” card',
          text: 'Test matchups with custom moves, shields, baits, turn-by-turn timeline and the full 3×3 shield matrix.',
        },
      ],
    },
    friends: {
      label: 'Friends & Vivillon',
      intro: 'Connect with friends, discover Vivillon gift postcards and browse each other’s collections.',
      steps: [
        {
          icon: '📱',
          title: 'Your game friend code & QR',
          where: 'Blue card in “My friends”',
          text: 'Save your Pokémon GO friend code (typed or scanned from a screenshot) and show your QR code for nearby trainers to scan.',
        },
        {
          icon: '✨',
          title: 'Lucky Friends & pinning',
          where: '★ and ✨ buttons on each friend',
          text: 'Pin close friends on top, mark Lucky Friends ✨ and tap a friend to browse their shared collections.',
        },
        {
          icon: '🦋',
          title: 'Add friends & Vivillon postcards',
          where: '“Add” and “🦋 Vivillon” tabs at the top',
          text: 'Add by code or QR, share the regional postcards you can send (unlimited or travel count) and find trainers who have the Vivillon patterns you are missing!',
        },
      ],
    },
    me: {
      label: 'Me & Settings',
      intro: 'Your trainer profile, tiered medals, visual themes and alerts.',
      steps: [
        {
          icon: '🏅',
          title: 'Tiered trainer medals',
          where: '“My medals” card',
          text: 'Progress from Bronze to Platinum across 26 in-game inspired medals (Pokédex, Unown/Vivillon/Legendary challenges and all 9 regions), calculated straight from your collections.',
        },
        {
          icon: '🎨',
          title: 'Startup page & full themes',
          where: '“Startup page” and “Theme” sections',
          text: 'Choose which tab opens on launch and pick a complete colour theme (Mystic, Valor, Instinct, Team Rocket, Sakura, Forest, OLED Night…).',
        },
        {
          icon: '🔔',
          title: 'Push alerts & guides',
          where: '“Notifications” and “Guides” cards',
          text: 'Enable alerts for raids, spawns, research, Gigantamax and friend offers. Replay page guides anytime from here or via “?” in any top bar.',
        },
      ],
    },
  },
};

/** "?" help button in TopBar: opens an interactive multi-step walkthrough Sheet for the current (or any) page. */
export function PageTourButton({ page }: { page: TourPageId }) {
  const t = useT();
  const { shouldShowBanner } = useTourState();
  const [open, setOpen] = useState(false);
  const pulse = shouldShowBanner(page);
  return (
    <>
      <IconButton label={t.tour_open} onClick={() => setOpen(true)} className="relative">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 3.6" />
          <circle cx="12" cy="17.2" r="0.7" fill="currentColor" stroke="none" />
        </svg>
        {pulse && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-shiny ring-2 ring-white/80" aria-hidden="true" />}
      </IconButton>
      <PageTourSheet open={open} initialPage={page} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Skippable inline step-by-step guide shown automatically on each page when guided tours are enabled.
 * Intentionally avoids `<ul><li>` so pages whose E2E tests count `main ul > li` stay unaffected.
 */
export function PageTourBanner({ page }: { page: TourPageId }) {
  const t = useT();
  const { lang } = useLang();
  const { shouldShowBanner } = useTourState();
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    setStepIdx(0);
  }, [page]);

  if (!shouldShowBanner(page)) return null;
  const def = GUIDES[lang][page];
  const step = def.steps[Math.min(stepIdx, def.steps.length - 1)]!;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx >= def.steps.length - 1;

  return (
    <aside
      aria-label={t.tour_banner_label(def.label)}
      className="card my-2.5 overflow-hidden border border-go/35 bg-gradient-to-br from-go-soft/45 via-card to-card p-3.5 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="grass">🧭 {t.tour_badge(def.label)}</Badge>
        <span className="tnum text-xs font-semibold text-ink-3">
          {t.tour_step(stepIdx + 1, def.steps.length)}
        </span>
        <button
          type="button"
          onClick={() => markTourSeen(page)}
          className="ml-auto text-xs font-semibold text-ink-3 hover:text-ink"
        >
          {t.tour_skip_page}
        </button>
      </div>

      {/* Step progress bars (clickable to jump to any step, 24px+ touch target) */}
      <div className="mt-1 flex gap-1.5" role="group" aria-label={t.tour_badge(def.label)}>
        {def.steps.map((s, idx) => (
          <button
            key={s.title}
            type="button"
            aria-current={idx === stepIdx ? 'step' : undefined}
            aria-label={`${idx + 1}. ${s.title}`}
            onClick={() => setStepIdx(idx)}
            className="flex min-h-6 flex-1 items-center py-2"
          >
            <span className={`block h-1.5 w-full rounded-full transition ${idx <= stepIdx ? 'bg-go' : 'bg-paper-2 hover:bg-line'}`} />
          </button>
        ))}
      </div>

      {/* Active step body */}
      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-go-soft text-xl" aria-hidden="true">
          {step.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-snug text-ink">{step.title}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-sky">📍 {step.where}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{step.text}</p>
        </div>
      </div>

      {/* Footer navigation + global skip */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2.5">
        <button
          type="button"
          onClick={() => disableGuidedTours()}
          className="mr-auto text-xs font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          {t.tour_skip_all}
        </button>
        {!isFirst && (
          <Button tone="ghost" className="min-h-8 px-2.5 text-xs" onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>
            {t.tour_prev}
          </Button>
        )}
        {isLast ? (
          <Button tone="primary" className="min-h-8 px-3 text-xs" onClick={() => markTourSeen(page)}>
            {t.tour_done_page}
          </Button>
        ) : (
          <Button tone="primary" className="min-h-8 px-3 text-xs" onClick={() => setStepIdx((i) => Math.min(def.steps.length - 1, i + 1))}>
            {t.tour_next}
          </Button>
        )}
      </div>
    </aside>
  );
}

/** Interactive full-site Guide Sheet: shows the active page's walkthrough and lets players browse every page's guide. */
export function PageTourSheet({
  open,
  initialPage,
  onClose,
}: {
  open: boolean;
  initialPage: TourPageId;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [activePage, setActivePage] = useState<TourPageId>(initialPage);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setActivePage(initialPage);
      setStepIdx(0);
    }
  }, [open, initialPage]);

  const def = GUIDES[lang][activePage];
  const step = def.steps[Math.min(stepIdx, def.steps.length - 1)]!;
  const isLast = stepIdx >= def.steps.length - 1;

  return (
    <Sheet open={open} onClose={onClose} title={`🧭 ${t.tour_sheet_title(def.label)}`}>
      {open && (
        <div className="space-y-4">
          {/* Switch between any page's guide directly */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {TOUR_PAGES.map((pid) => {
              const active = pid === activePage;
              return (
                <button
                  key={pid}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setActivePage(pid); setStepIdx(0); }}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    active ? 'border-ink bg-ink text-card' : 'border-line bg-card text-ink-2 hover:border-ink-3'
                  }`}
                >
                  {GUIDES[lang][pid].label}
                </button>
              );
            })}
          </div>

          <p className="text-sm text-ink-2">{def.intro}</p>

          {/* Focused step card */}
          <div className="rounded-2xl border border-go/30 bg-go-soft/30 p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-xl shadow-sm" aria-hidden="true">
                {step.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="tnum text-[11px] font-bold uppercase tracking-wide text-go-ink dark:text-go">
                  {t.tour_step(stepIdx + 1, def.steps.length)}
                </p>
                <h3 className="text-base font-extrabold leading-tight">{step.title}</h3>
              </div>
            </div>
            <p className="text-xs font-semibold text-sky">📍 {step.where}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.text}</p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                tone="ghost"
                className="min-h-9 px-3 text-xs"
                disabled={stepIdx === 0}
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              >
                {t.tour_prev}
              </Button>
              <div className="flex flex-1 justify-center gap-0.5">
                {def.steps.map((s, idx) => (
                  <button
                    key={s.title}
                    type="button"
                    aria-current={idx === stepIdx ? 'step' : undefined}
                    aria-label={`${idx + 1}. ${s.title}`}
                    onClick={() => setStepIdx(idx)}
                    className="flex min-h-7 min-w-7 items-center justify-center"
                  >
                    <span className={`block h-2 rounded-full transition-all ${idx === stepIdx ? 'w-5 bg-go' : 'w-2 bg-line hover:bg-ink-3'}`} />
                  </button>
                ))}
              </div>
              {isLast ? (
                <Button
                  tone="primary"
                  className="min-h-9 px-3 text-xs"
                  onClick={() => {
                    markTourSeen(activePage);
                    onClose();
                  }}
                >
                  {t.tour_done_page}
                </Button>
              ) : (
                <Button
                  tone="primary"
                  className="min-h-9 px-3 text-xs"
                  onClick={() => setStepIdx((i) => Math.min(def.steps.length - 1, i + 1))}
                >
                  {t.tour_next}
                </Button>
              )}
            </div>
          </div>

          {/* All steps overview for quick scanning */}
          <div className="space-y-1.5">
            {def.steps.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setStepIdx(idx)}
                className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                  idx === stepIdx ? 'border-go bg-go-soft/20' : 'border-line hover:bg-paper-2/60'
                }`}
              >
                <span className="text-base leading-none" aria-hidden="true">{s.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold">{idx + 1}. {s.title}</span>
                  <span className="block text-[11px] text-ink-3">{s.where}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
