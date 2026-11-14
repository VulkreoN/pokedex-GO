# MyDexPoGo

Listes de chasse Pokémon GO à partager entre amis : costumes, shinies, formes, ce que tu as et ce qu'il te manque, avec une recherche prête à coller dans le jeu.

Web app installable (PWA), API Node, Postgres, le tout dans Docker. Aucun service payant.

## Lancer en production (Docker)

```bash
cp .env.example .env            # change POSTGRES_PASSWORD
docker compose up -d --build
# http://localhost:8080
```

Trois conteneurs : `db` (Postgres 17), `api` (Hono + Drizzle, applique les migrations au démarrage et régénère les données toute seule), `web` (Caddy qui sert le front et proxifie `/api`).

### Sur un serveur avec un nom de domaine

Dans `.env` : `DOMAIN=dex.example.com`, `WEB_PORT=80`, `WEB_HTTPS_PORT=443`, `COOKIE_SECURE=true`. Pointe le DNS vers le serveur, `docker compose up -d --build`, Caddy obtient et renouvelle le certificat tout seul. Rien d'autre à planifier : le job de données tourne dans l'API.

Le premier compte créé est administrateur. Depuis « Moi », il peut promouvoir des gérants (qui marquent une variante « sortie » ou la renomment depuis la fiche Pokémon) et forcer un rafraîchissement des données.

## Développer

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres seul
pnpm db:migrate
pnpm dev                                          # API sur :3000, front sur :5173 (proxy /api)
```

Tests et typage : `pnpm test`, `pnpm typecheck`.

## Données

L'API reconstruit le dataset toutes les `DATA_REFRESH_HOURS` heures (6 par défaut) et le sert sur `/api/data/pokedex.json`, avec les corrections des gérants appliquées. « Moi » affiche la date de génération, la dernière modification de chaque source amont et la prochaine exécution. `pnpm data:build` fait la même chose en ligne de commande vers `packages/data/dist` pour déboguer.

Sources :

- PokeMiners `game_masters` (espèces, formes, types, flag costume),
- PokeMiners `pogo_assets` (toutes les images, y compris les costumes dataminés pas encore sortis),
- PokeMiners textes du jeu (noms FR/EN, libellés de formes),
- WatWowMap `pogo-data-api` (noms des costumes historiques),
- pogoapi.net (shinies sortis par espèce).

Une variante est marquée « pas encore sortie » quand elle existe dans les fichiers du jeu mais pas encore dans le game master. Le game master publié par PokeMiners a parfois des semaines de retard : un gérant corrige ça en deux taps depuis l'app, et `packages/data/src/overrides.json` garde les corrections permanentes.

Les images sont servies depuis GitHub (PokeMiners) et mises en cache par le service worker.

L'onglet « Jeu » (raids en cours et à venir, événements, études de terrain, œufs) lit en direct les JSON de [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck), qui scrape Leek Duck toutes les heures. Leek Duck ne garde que le présent et le futur : le job archive chaque événement vu (volume `appdata`), ce qui alimente l'onglet « Passés ».

Une entrée de liste = une variante (forme/costume, sexe) × normal ou shiny × une particularité optionnelle (chanceux, fond spécial, obscur, purifié, XXL, XXS). Chaque combinaison compte comme un Pokémon à part, et se retrouve dans les chaînes de recherche (`&shiny&lucky`...).

## Recherche dans le jeu

Depuis une liste, « Copier pour le jeu » génère des chaînes pour la barre de recherche du **stockage** Pokémon (la recherche de l'écran Pokédex n'accepte qu'un terme) : numéros compressés en plages, une chaîne par combinaison (`&shiny`, `&costume`, `&female`, `&alola`...), découpées à 200 caractères.

## Structure

```
apps/web        React + Vite + Tailwind, PWA
apps/api        Hono + Drizzle (Postgres), sessions cookie, amis, listes, partage par lien
packages/shared types, clés de variantes, générateur de chaînes de recherche
packages/data   pipeline de génération du dataset
```

L'ancienne version Flutter est conservée sous le tag git `flutter-legacy`.
