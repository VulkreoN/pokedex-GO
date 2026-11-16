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

## Exploitation

### Secrets

Tout passe par le fichier `.env` à la racine (copié depuis `.env.example`), lu par Docker Compose et jamais commité (`.gitignore`). Sur le serveur : `chmod 600 .env`. Il contient le mot de passe Postgres, éventuellement un `GITHUB_TOKEN` (lecture seule, dépôts publics) et `ADMIN_USERNAMES`. Les sessions n'ont pas besoin de secret : ce sont des jetons aléatoires stockés hachés en base.

### Base de données à la main

Postgres n'est pas exposé hors du réseau Docker. Pour y entrer :

```bash
docker compose exec db psql -U mydex -d mydex
```

```sql
select username, role, created_at from users order by created_at;
update users set role = 'admin'   where username = 'hakim';   -- ou 'manager' / 'user'
select * from variant_overrides;                               -- corrections des gérants
delete from sessions where user_id = (select id from users where username = 'hakim');  -- déconnecter partout
```

Sauvegarde / restauration :

```bash
docker compose exec -T db pg_dump -U mydex mydex | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-11-14.sql.gz | docker compose exec -T db psql -U mydex -d mydex
```

Le volume `appdata` (dataset, archive d'événements, cache des sources) se régénère tout seul, pas besoin de le sauvegarder.

### Logs

```bash
docker compose logs -f api     # job de données, requêtes
docker compose logs -f web     # Caddy, certificats
docker compose logs -f db
```

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
- trade.pokemongopro.com (liste et images des Pokémon : miroir des icônes PokeMiners, costumes dataminés inclus, servi par Cloudflare ; un seul fichier texte à lire, pas d'API GitHub),
- PokeMiners `pogo_assets` (textes du jeu pour les noms FR/EN et libellés de formes, et images des Méga que le miroir n'a pas),
- WatWowMap `pogo-data-api` (noms des costumes historiques),
- pogoapi.net (liste des espèces sorties, shinies sortis par espèce ; en retard de plusieurs mois, complétée par les espèces vues sur Leek Duck et les overrides),
- trade.pokemongopro.com (fonds spéciaux : quel Pokémon peut porter quel fond d'évènement ou de lieu).

Une espèce est « sortie » si elle est dans la liste pogoapi, ou vue sur Leek Duck (raids, œufs, études, évènements, mémorisé dans le volume), ou forcée par un override ; avoir une image chez PokeMiners ne suffit pas (Arceus, Manaphy… ont des images depuis des années).

Une variante est marquée « pas encore sortie » quand elle existe dans les fichiers du jeu mais pas encore dans le game master. Le game master publié par PokeMiners a parfois des semaines de retard : un gérant corrige ça en deux taps depuis l'app, et `packages/data/src/overrides.json` garde les corrections permanentes.

Les images sont servies depuis pokemongopro (Méga depuis GitHub PokeMiners) et mises en cache par le service worker.

L'onglet « Jeu » (raids en cours et à venir, événements, études de terrain, œufs) lit en direct les JSON de [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck), qui scrape Leek Duck toutes les heures. Leek Duck ne garde que le présent et le futur : le job archive chaque événement vu (volume `appdata`), ce qui alimente l'onglet « Passés ».

Une entrée de liste = une variante (forme/costume, sexe) × normal ou shiny × une particularité optionnelle (chanceux, fond spécial précis ou non, obscur, purifié, Dynamax, XXL, XXS). Chaque combinaison compte comme un Pokémon à part, et se retrouve dans les chaînes de recherche (`&shiny&lucky`...).

## Signaux de sortie

Le statut « sorti » automatique dépend du game master publié sur GitHub par PokeMiners, qui a souvent des semaines de retard. Pour aller plus vite, l'API relève des signaux et les met dans une file « À confirmer » (« Moi » → « À confirmer », rôle gérant) :

- **News officielles** (`NEWS_LOCALES=fr`) : chaque article de pokemongo.com/news est lu ; s'il cite un Pokémon avec un mot de costume, ses variantes non sorties sont proposées. Un gérant coche et valide.
- C'est volontairement la seule source de signaux : légère, officielle, sans bot ni compte tiers.

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
