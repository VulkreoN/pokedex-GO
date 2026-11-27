# Documentation Développeur — MyDexPoGo

Guide technique complet pour contribuer, faire tourner l’application localement, comprendre le pipeline de données et maintenir la production.

---

## 1. Architecture & Stack

MyDexPoGo est un **monorepo pnpm** en **TypeScript** :

| Package / App | Rôle | Stack principale |
|---|---|---|
| [`apps/web`](../apps/web) | Front-end PWA responsive | React 19, Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5 (cache persisté IndexedDB), `vite-plugin-pwa`, `jspdf`, `jsqr`, `qrcode-generator`, `@dnd-kit` |
| [`apps/api`](../apps/api) | API REST + SSE + Jobs planifiés | Node 22+, Hono 4, Drizzle ORM, PostgreSQL 17 (`postgres`), `@node-rs/argon2`, `web-push`, `zod` |
| [`packages/shared`](../packages/shared) | Logique métier & types isomorphes | Types API/Dataset, clés de variantes, compilateur de recherche Pokémon GO, calculs PvP/combat/contres, matching de chasses, médailles, dictionnaire FR |
| [`packages/data`](../packages/data) | Pipeline de génération du Pokédex | Fetch & normalisation PokeMiners, pogoapi, pokemongopro, WatWowMap, ScrapedDuck, overrides permanents |
| [`e2e`](../e2e) | Tests end-to-end navigateur | Playwright (tests app complets + contrôles lecture seule de prod) |

### Schéma d’exécution en production

```text
Navigateur / PWA
   │  HTTPS (Caddy :80/:443)
   ├──► /          → fichiers statiques Vite + Service Worker (Workbox)
   └──► /api/*     → Hono API (:3000)
                        ├──► PostgreSQL 17 (sessions, listes, amis, overrides, push, audit…)
                        ├──► Volume /data (pokedex.json, tools.json, events-archive.json, cache sources, vapid.json)
                        └──► Sources externes (PokeMiners, ScrapedDuck/Leek Duck, Pokémon GO Wiki, Serebii, PvPoke, pokemongo.com)
```

---

## 2. Installation & Développement local

### Prérequis
- **Node.js >= 22** (voir `.nvmrc`)
- **pnpm 10** (`corepack enable`)
- **Docker** (pour PostgreSQL)

### Démarrer le projet

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL sur localhost:5432 (user/pass/db: mydex)
pnpm db:migrate                                   # applique les migrations Drizzle
pnpm dev                                          # lance API (:3000) et Web (:5173 avec proxy /api) en parallèle
```

Au premier démarrage de l’API, le job de données construit automatiquement `pokedex.json` et `tools.json` dans `apps/api/.data/` (environ 20–40 s la première fois, puis quelques secondes grâce au cache local `apps/api/.data/cache/`).

### Commandes utiles

```bash
pnpm typecheck                     # tsc --noEmit sur les 5 workspaces
pnpm test                          # Vitest sur shared, data, api, web
pnpm --filter @mydexpogo/web build # build production + génération SW PWA
pnpm data:build                    # génère le dataset en CLI dans packages/data/dist
pnpm --filter @mydexpogo/api db:generate   # génère une nouvelle migration Drizzle après modif de schema.ts
pnpm test:all                      # batterie complète (statique + intégration API + Playwright E2E)
```

---

## 3. Variables d’environnement

Définies dans `.env` (modèle : [`.env.example`](../.env.example)), lues par [`apps/api/src/env.ts`](../apps/api/src/env.ts) :

| Variable | Défaut | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgres://mydex:mydex@localhost:5432/mydex` | URL PostgreSQL |
| `PORT` | `3000` | Port d’écoute de l’API |
| `COOKIE_SECURE` | `false` | `true` en production HTTPS |
| `CORS_ORIGIN` | *(vide)* | Liste d’origines autorisées (séparées par `,`) si front séparé |
| `DATA_DIR` | `apps/api/.data` | Dossier persistant (dataset, archive événements, cache, `vapid.json`) |
| `DATA_REFRESH_AT` | `0,6,12,18` | Heures de reconstruction quotidienne du dataset |
| `DATA_TIME_ZONE` | `Europe/Paris` | Fuseau horaire des créneaux `DATA_REFRESH_AT` |
| `DATA_REFRESH_HOURS` | `6` | Utilisé uniquement si défini seul (sans `DATA_REFRESH_AT`) |
| `GITHUB_TOKEN` | *(vide)* | Token GitHub lecture seule (augmente le quota d’API pour lister les assets) |
| `ADMIN_USERNAMES` | *(vide)* | Pseudos toujours promus admin (séparés par `,`) |
| `NEWS_LOCALES` | `fr` | Locales officielles sondées sur `pokemongo.com/<locale>/news` (vide = désactivé) |
| `FEED_POLL_MINUTES` | `5` | Fréquence de sondage des news officielles |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact Web Push (clés générées automatiquement dans `DATA_DIR/vapid.json`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | *(auto)* | Optionnel pour réutiliser une paire VAPID existante |
| `PUSH_DRY_RUN` | `0` | `1` en test : enregistre les push en mémoire sans appeler les services push |
| `APP_VERSION` / `APP_COMMIT` | `dev` | Injectés au build Docker par la CI (via `scripts/version.sh`) |

---

## 4. Pipeline de données & Sources live

### Dataset Pokédex (`packages/data`)
Construit à heures fixes par [`apps/api/src/data/service.ts`](../apps/api/src/data/service.ts) et servi en ETag sur `/api/data/pokedex.json` et `/api/data/tools.json` :
1. **PokeMiners `game_masters`** : espèces, formes, statistiques de base, attaques, évolutions, coûts, sexes par forme/costume.
2. **`trade.pokemongopro.com`** : inventaire complet des sprites PokeMiners (costumes dataminés inclus) et table des **fonds spéciaux**.
3. **PokeMiners `pogo_assets`** : textes officiels FR/EN du jeu et sprites des formes Méga.
4. **WatWowMap `pogo-data-api`** : libellés des costumes historiques.
5. **`pogoapi.net`** : espèces et shinies sortis, complétés par les observations Leek Duck et les corrections manuelles.
6. **Overrides** : corrections permanentes dans [`packages/data/src/overrides.json`](../packages/data/src/overrides.json) + corrections dynamiques en base (`variant_overrides`) appliquées en mémoire sans reconstruire tout le dataset.

### Données live de l’onglet Jeu & PvP (`apps/api/src/game/`)
- **Événements mondiaux** (`eventDetails.ts`) : liste issue de [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) (`events.json`) enrichie en scrapant chaque fiche Leek Duck (bonus gratuits/payants, paliers GO Pass, billets, spawns datés, raids par palier, œufs, études, débuts, nouveaux shinies, attaques exclusives). Cache 1 h + endpoint à la demande `/api/game/events/:id`.
- **Événements régionaux & locaux** (`regionalEvents.ts`) : agrège automatiquement les événements par pays/lieu absents de Leek Duck (Mall Exploration Asie, ESA Europe, UK National Trust, Pokémon Fossil Museum, Pokémon Center, Pokémon Jet, PokéPark KANTO, PokéXciting!, Pokémon Observatory…) via :
  - l’**API MediaWiki de Pokémon GO Wiki** (`Template:CurrentEvents` + batches `Category:Regional_events`, `Category:Real-world_events`, `Category:Japanese_events`),
  - la table **Serebii Real-Life Events** (`reallifeevents.shtml`) en complément.
  - Dédupliqué contre Leek Duck, cache 2 h, dégradation silencieuse en `[]` si une source est indisponible.
- **Spawns d’événements** (`eventSpawns.ts`), **Études de terrain** (`research.ts`, traduites via les textes officiels du jeu), **Codes promo** (`promo.ts`), **oEmbed X** (`oembed.ts`), **Classements & équipes PvPoke** (`pvpRankings.ts`).
- **Proxy d’assets CORS-safe** (`/api/game/asset`) : liste blanche stricte d’hôtes (`cdn.leekduck.com`, `raw.githubusercontent.com`, `trade.pokemongopro.com`, `static.wikia.nocookie.net`, `www.serebii.net`), vérification MIME image et taille max 3 Mo, utilisé pour composer les infographies PNG/PDF sur Canvas sans *taint*.

---

## 5. Base de données (PostgreSQL + Drizzle ORM)

Schéma source : [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts). Migrations dans `apps/api/drizzle/`.

| Domaine | Tables |
|---|---|
| **Auth & comptes** | `users`, `sessions`, `invite_codes`, `deleted_users` (corbeille 30 j) |
| **Collections** | `lists`, `list_entries` (clé composite `list_id, variant_key, shiny, tag, gender`), `list_events` (journal + `undo_payload`), `list_offers` (« Je l’ai »), `list_unfollows`, `list_favorites`, `deleted_lists` (corbeille 30 j) |
| **Social & Prismillon** | `friend_requests`, `friendships` (2 lignes bidirectionnelles, flags `favorite` et `lucky`), `user_postcards` (18 motifs Vivillon) |
| **PvP** | `pvp_pokemon`, `pvp_teams` |
| **Notifications** | `notifications`, `push_subscriptions`, `raid_alerts` |
| **Modération & données** | `variant_overrides`, `feed_items`, `feed_cursors`, `posts`, `reports`, `announcements`, `app_settings`, `audit_log`, `client_errors` |

---

## 6. Routes API (`/api/*`)

Montées dans [`apps/api/src/index.ts`](../apps/api/src/index.ts) :

| Préfixe | Fichier | Responsabilité |
|---|---|---|
| `/api/health` | `index.ts` | Santé, version (`APP_VERSION`) et commit (`APP_COMMIT`) |
| `/api/auth` | `routes/auth.ts` | Inscription, connexion (cookie `HttpOnly` + hash SHA-256 en base, Argon2id pour les mots de passe), déconnexion, code de réinitialisation, changement mot de passe/code ami, profil & cartes postales |
| `/api/lists` & `/api/shared` | `routes/lists.ts` | CRUD collections, entrées en masse, import, réorganisation, historique & `POST /:id/events/:eventId/undo`, offres « Je l’ai », partage par lien public |
| `/api/friends` | `routes/friends.ts` | Demandes d’ami, liste d’amis, favori/Chanceux, profil ami, correspondance d’échanges, annuaire Prismillon |
| `/api/data`, `/api/overrides`, `/api/users` | `routes/data.ts` | `pokedex.json`, `tools.json`, `events-archive.json`, statut des sources, corrections de gérant, liste utilisateurs |
| `/api/game` | `routes/game.ts` | `/events`, `/events/:id`, `/event-spawns`, `/research`, `/promo-codes`, `/posts`, `/pvp-rankings`, `/pvp-battle/:dex`, `/pvp-teams/:league`, `/asset` |
| `/api/feed` | `routes/feed.ts` | File « À confirmer » des signaux issus des news officielles |
| `/api/notifications`, `/api/push`, `/api/stream` | `routes/notify.ts` | Boîte de réception, préférences push, abonnement VAPID, flux temps réel **SSE** (`/api/stream`) |
| `/api/pvp-pokemon`, `/api/pvp-teams` | `routes/pvpPokemon.ts`, `routes/pvpTeams.ts` | Pokémon PvP sauvegardés et équipes de 3 |
| `/api/admin`, `/api/announcements`, `/api/reports` | `routes/admin.ts` | Tableau de bord, santé/test push, gestion comptes, invitations, audit, corbeilles 30 j, annonces globales, signalements |
| `/api/client-errors` | `routes/clientErrors.ts` | Collecte dédupliquée des erreurs JS côté navigateur |

---

## 7. Points clés du Front-end (`apps/web`) & `packages/shared`

### Clés de variantes & recherche dans le jeu (`packages/shared`)
- Une variante est identifiée par une clé neutre (`keys.ts`), ex. `25`, `25.cFALL_2019`, `105.fALOLA`, `6.mY`, `818.gmax`.
- Le compilateur de recherche [`packages/shared/src/search.ts`](../packages/shared/src/search.ts) transforme une collection en **une unique chaîne Pokémon GO** en respectant la priorité de `,` / `&` / `!` du jeu et ses mots-clés FR/EN. La suite property-based [`search.semantics.test.ts`](../packages/shared/src/search.semantics.test.ts) valide ces règles sur des centaines de collections aléatoires.
- **Matching de chasses** ([`huntMatch.ts`](../packages/shared/src/huntMatch.ts)) : correspondance stricte par forme, costume, Méga, Gigamax et Obscur + résolution sûre des pré-évolutions quand `alertPreEvolutions` est actif.
- **Traductions live FR** ([`eventNames.ts`](../packages/shared/src/eventNames.ts)) : dictionnaire partagé Web + Export + Push pour titres d’événements, bonus, attaques, coupes GBL, objets, météo et tâches d’étude.

### Front-end (`apps/web/src/`)
- **Cache hors-ligne** : `pokedex.json` est conservé dans IndexedDB (`idb-keyval`) avec revalidation silencieuse par ETag (`lib/dataset.ts`).
- **Infographies & Calendrier** :
  - `components/EventInfographic.tsx` : `WeeklySchedule` (*Ma semaine*), `EventFeed`, `EventInfographicSheet`, `EventDetailModal`.
  - `lib/eventInfographicExport.ts` : rendu Canvas haute résolution → PNG & PDF multi-pages A4 (évite les limites de polices PDF pour le français et les sprites).
  - `lib/eventIcal.ts` : générateur **RFC 5545 (`.ics`)** en heures locales flottantes + rappel 15 min (`VALARM`).
- **Audio & retours haptiques** (`lib/feedback.ts`) : déverrouillage Web Audio sur geste utilisateur + récupération automatique de l’état iOS Safari `interrupted` + fallback des cris PokeAPI (`latest` → `legacy`).
- **Modales (`Sheet`)** (`components/ui.tsx`) : basées sur `<dialog>`, avec verrouillage du scroll arrière-plan (`html:has(dialog[open])` + compteur JS pour modales imbriquées), `overscroll-contain` et focus automatique sur la zone défilable.

---

## 8. Tests, Versioning & CI/CD

### Batterie complète (`pnpm test:all`)
[`scripts/test-all.sh`](../scripts/test-all.sh) exécute 5 étapes isolées :
1. `pnpm -r typecheck`, `pnpm -r test` (tests unitaires Vitest), `pnpm --filter @mydexpogo/web build` ;
2. Démarrage d’une API jetable (`PORT=3100`, `PUSH_DRY_RUN=1`) sur une base Postgres temporaire `mydex_test` ;
3. Tests d’intégration API (`pnpm --filter @mydexpogo/api test:int`) ;
4. Tests navigateur **Playwright** (`e2e/tests/app`) contre `vite preview` (port `4173`, mobile `360px` & desktop `1280px`) ;
5. Contrôles lecture seule contre un serveur déployé si `DEPLOY_URL` est défini (`e2e/tests/deploy`).

### Versioning (`VERSION` + `scripts/version.sh`)
- Le fichier [`VERSION`](../VERSION) porte la version courante :
  - Format `X.Y` (ex. `1.4`) → `scripts/version.sh` calcule automatiquement `X.Y.<nb_commits_depuis_VERSION>` (`1.4.0`, puis `1.4.1`, `1.4.2`…).
  - Format `X.Y.Z` (ex. `1.3.2`) → version épinglée telle quelle.
- Pour une mise à jour visible des joueurs, ajouter une entrée en tête de [`apps/web/src/lib/changelog.ts`](../apps/web/src/lib/changelog.ts).

### CI / CD (`.github/workflows/`)
Chaque push sur `main` lance la batterie de tests complète, publie les images Docker `ghcr.io/vulkreon/pokedex-go-api` et `pokedex-go-web`, puis déploie automatiquement avec sauvegarde préalable et rollback si `/api/health` ne répond pas avec la nouvelle version (détails dans [`deploy/README.md`](../deploy/README.md)).
