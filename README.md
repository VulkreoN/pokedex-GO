# MyDexPoGo

Application web installable (**PWA**) pour suivre ses collections **Pokémon GO**, planifier sa semaine d’événements, préparer ses équipes PvP et échanger entre amis — hébergeable facilement avec Docker, **sans aucun service payant**.

> **Version actuelle : `1.4`** · [Guide Utilisateur](docs/USER_GUIDE.md) · [Documentation Développeur](docs/DEVELOPER.md) · [Déploiement VPS](deploy/README.md) · [Déploiement Kubernetes](deploy/k8s/README.md)

---

## Fonctionnalités clés

- **Pokédex complet & à jour** : toutes les espèces, formes régionales, costumes, Méga, Gigamax, sexes (♂ / ♀ / asexué), shinies et fonds spéciaux, avec filtres avancés, mode *Ajout 1 clic*, cris des Pokémon et suivi des sorties récentes.
- **Collections de chasse partageables** : modèles prêts à l’emploi (*Living Dex*, *Shinys*, *Costumes*, *Chanceux*, *Gen 1 → 9*…), ajout rapide unifié, sélection groupée, historique avec **annulation (Undo)**, notes perso, **export image PNG / PDF** et générateur de **chaîne de recherche prête à coller dans Pokémon GO** (FR & EN).
- **Onglet Jeu & Calendrier « Ma semaine »** :
  - **Calendrier hebdo (Lun → Dim)** inspiré des infographies *GO Weekly* : *Rendez-vous hebdo* récurrents (Lundi Max, Mardi Concours, Heure de Raid, Jeudi Combat GO, Vendredi Amitié, Dimanche Balade), bande **Raids**, bande **Événements** unifiée (événements du jour, multi-jours mondiaux, GO Pass & études longues) et bande **Locaux & exclusifs** masquable en 1 clic.
  - **Fiches d’événements automatiques** traduites en français (Gigamax/Dynamax, Journée Communauté, Heure vedette, Journée de Raids, événements longs et événements régionaux/locaux avec drapeaux) exportables en **Image PNG**, **PDF** et **Calendrier iCal (`.ics`)**.
  - **Hub « Pour moi »** : toutes tes chasses actives en un seul écran (raids, pops sauvages, Combats Max, Team GO Rocket, études, œufs) avec case *Attrapé* directe, comptes à rebours et alertes pré-évolutions optionnelles.
  - **Raids & Contres**, **Combats Max**, **Team GO Rocket** (avec phrases d’accroche des sbires), **Études de terrain**, **Œufs**, **Codes promo** et **Capsules (Hyper Training)**.
- **PvP & Équipes** : calculateur de rangs d’IV (Super / Hyper / Master) et coûts exacts Poussières / Bonbons / XL, classements **PvPoke** (saison actuelle + aperçu saison suivante), programme **Ligue Combat GO**, **équipes de 3 sauvegardées** et **simulateur de combat 1v1**.
- **Amis, Échanges & Prismillon** : suivi des collections d’amis en temps réel (SSE), bouton *« Je l’ai »*, onglet **Échanges** automatique, **Amis Chanceux ✨**, **QR code ami**, profils complets, onglet dédié **🦋 Prismillon** (cartes postales) et notifications in-app + **Web Push**.
- **Profil, Médailles & Personnalisation** : **26 médailles** à paliers (*Bronze → Platine*) inspirées du jeu, **8 thèmes** (clair & sombre dont *Nuit OLED*), choix de la page au démarrage, sons & vibrations, guides interactifs (`?`) et panneau **Administration / Gérant** complet.

---

## Documentation

| Document | Contenu |
|---|---|
| **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** | Guide complet pour les dresseurs : prise en main, collections, recherche dans le jeu, calendrier *Ma semaine*, exports PNG/PDF/iCal, PvP, Prismillon, amis, médailles et installation PWA. |
| **[docs/DEVELOPER.md](docs/DEVELOPER.md)** | Architecture du monorepo, installation locale, pipeline de données et sources (PokeMiners, Leek Duck, Pokémon GO Wiki, Serebii, PvPoke), schéma Postgres/Drizzle, routes API, tests et CI/CD. |
| **[deploy/README.md](deploy/README.md)** | Mise en production clé en main sur un VPS (Docker Compose, Caddy HTTPS auto, sauvegardes, CI/CD GitHub Actions). |
| **[deploy/k8s/README.md](deploy/k8s/README.md)** | Déploiement sur cluster Kubernetes avec ArgoCD. |

---

## Démarrage rapide

### En production (Docker)

```bash
cp .env.example .env            # modifie POSTGRES_PASSWORD
docker compose up -d --build
# -> http://localhost:8080
```

Trois conteneurs tournent ensemble :
- **`db`** : PostgreSQL 17 ;
- **`api`** : serveur Node (Hono + Drizzle), applique les migrations au démarrage et maintient le dataset Pokédex automatiquement ;
- **`web`** : Caddy qui sert le front PWA et proxifie `/api`.

Pour exposer l’app sur un nom de domaine public en HTTPS automatique (Caddy + Let’s Encrypt), renseigne dans `.env` :

```dotenv
DOMAIN=dex.example.com
WEB_PORT=80
WEB_HTTPS_PORT=443
COOKIE_SECURE=true
```

> Le premier compte créé devient automatiquement **administrateur**. Consulte [deploy/README.md](deploy/README.md) pour la mise en production complète (sauvegardes, CI/CD, push HTTPS).

### En développement local

Prérequis : **Node >= 22**, **pnpm 10**, **Docker** (pour PostgreSQL).

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # démarre PostgreSQL seul
pnpm db:migrate                                   # applique les migrations Drizzle
pnpm dev                                          # API sur :3000, Web sur :5173 (proxy /api)
```

### Tests & qualité

```bash
pnpm typecheck     # vérification TypeScript de tous les workspaces
pnpm test          # tests unitaires (shared, data, api, web)
pnpm test:all      # batterie complète : typecheck + unitaires + build + API intégration + E2E Playwright
```

`scripts/test-all.sh` lance une API jetable (port `3100`), une base `mydex_test` isolée et `vite preview` (port `4173`), puis nettoie tout à la fin sans toucher aux données de dev ni de prod (`--no-e2e` saute Playwright, `--keep` garde les services ouverts pour déboguer).

---

## Structure du dépôt

```text
apps/web        Front React 19 + Vite 8 + Tailwind 4 (PWA)
apps/api        API Hono + Drizzle ORM (PostgreSQL), SSE, Web Push, jobs de données
packages/shared Types partagés, clés de variantes, recherche Pokémon GO, PvP, contres, médailles, traductions FR
packages/data   Pipeline de construction du dataset Pokédex et des outils de combat
e2e             Tests end-to-end Playwright (app + contrôles lecture seule en prod)
docs            Guides Utilisateur et Développeur complets
deploy          Configurations VPS (Docker Compose, Caddy, backups) et Kubernetes
scripts         Scripts de tests complets, smoke checks et versioning
```

> L’ancienne version Flutter est archivée sous le tag git `flutter-legacy`.
