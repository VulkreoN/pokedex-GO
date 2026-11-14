# MyDexPoGo

Listes de chasse Pokémon GO à partager entre amis : costumes, shinies, formes, ce que tu as et ce qu'il te manque, avec une recherche prête à coller dans le jeu.

Web app installable (PWA), API Node, Postgres, le tout dans Docker. Aucun service payant.

## Lancer en production (Docker)

```bash
cp .env.example .env            # change POSTGRES_PASSWORD
docker compose up -d --build
# http://localhost:8080
```

Trois conteneurs : `db` (Postgres 17), `api` (Hono + Drizzle, applique les migrations au démarrage), `web` (Caddy qui sert le front et proxifie `/api`).
Derrière HTTPS, mets `COOKIE_SECURE=true` dans `.env`.

## Développer

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres seul
pnpm db:migrate
pnpm dev                                          # API sur :3000, front sur :5173 (proxy /api)
```

Tests et typage : `pnpm test`, `pnpm typecheck`.

## Données

`pnpm data:build` régénère `apps/web/public/data/pokedex.json` à partir de :

- PokeMiners `game_masters` (espèces, formes, types, flag costume),
- PokeMiners `pogo_assets` (toutes les images, y compris les costumes dataminés pas encore sortis),
- PokeMiners textes du jeu (noms FR/EN, libellés de formes),
- WatWowMap `pogo-data-api` (noms des costumes historiques),
- pogoapi.net (shinies sortis par espèce).

Une variante est marquée `datamined` quand elle existe dans les fichiers du jeu mais pas encore dans le game master. Le game master publié par PokeMiners a parfois quelques semaines de retard : `packages/data/src/overrides.json` permet de forcer un statut ou un libellé.
Le workflow GitHub `Refresh dataset` relance la génération chaque nuit et commit s'il y a du nouveau.

Les images sont servies depuis GitHub (PokeMiners) et mises en cache par le service worker.

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
