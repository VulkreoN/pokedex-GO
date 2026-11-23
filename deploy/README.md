# Mise en production sur un VPS

> Sur un cluster Kubernetes avec ArgoCD : voir plutôt [`k8s/README.md`](k8s/README.md).

Chaque push sur `main` passe la batterie de tests complète sur GitHub Actions, construit les images Docker, les publie
sur le registre de GitHub (`ghcr.io/vulkreon/pokedex-go-api` et `-web`), puis les déploie sur le VPS. Le déploiement
sauvegarde la base, redémarre, attend que `https://<domaine>/api/health` annonce la nouvelle version et revient à la
précédente sinon. Des contrôles en lecture seule tournent ensuite contre le site en ligne.

## 1. Le VPS

N'importe quel VPS Ubuntu 24.04 ou Debian 12 avec 1 vCPU et 2 Go de RAM suffit (Hetzner CX22, OVH VPS-1, Scaleway...).

Sur ta machine, crée la clé que GitHub utilisera pour se connecter (sans mot de passe) :

```
ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f ~/.ssh/mydexpogo_deploy
```

Sur le VPS, en root, lis puis lance le script d'installation avec la clé publique :

```
curl -fsSL https://raw.githubusercontent.com/VulkreoN/pokedex-GO/main/deploy/bootstrap.sh -o bootstrap.sh
less bootstrap.sh
bash bootstrap.sh "$(cat mydexpogo_deploy.pub)"   # colle le contenu de ~/.ssh/mydexpogo_deploy.pub
```

Il installe Docker, un pare-feu (SSH, 80, 443), les mises à jour de sécurité automatiques, l'utilisateur `deploy`, le
dossier `/opt/mydexpogo` et la sauvegarde de 3 h 30.

Toujours sur le VPS, crée la configuration en partant de `deploy/.env.prod.example` :

```
sudo -u deploy nano /opt/mydexpogo/.env
chmod 600 /opt/mydexpogo/.env
```

`POSTGRES_PASSWORD` : une longue chaîne aléatoire, lettres et chiffres seulement (`openssl rand -hex 32`), à ne jamais changer ensuite.

## 2. Le domaine

Chez ton registrar, fais pointer le nom choisi (par exemple `dex.tondomaine.fr`) vers l'IP du VPS : un enregistrement
`A` (IPv4) et, si le VPS en a une, `AAAA` (IPv6). Caddy obtient et renouvelle le certificat HTTPS tout seul dès que le
nom répond.

## 3. GitHub

Dans le dépôt, Settings > Secrets and variables > Actions :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `VPS_HOST` | IP ou nom du VPS |
| Secret | `VPS_USER` | `deploy` |
| Secret | `VPS_SSH_KEY` | contenu de `~/.ssh/mydexpogo_deploy` (la clé privée) |
| Secret | `VPS_KNOWN_HOSTS` | sortie de `ssh-keyscan <IP du VPS>` |
| Secret (option) | `VPS_PORT` | si SSH n'écoute pas sur 22 |
| Variable | `DOMAIN` | `dex.tondomaine.fr` |

Settings > Environments > `production` : tu peux y exiger ton approbation avant chaque déploiement.

Au premier passage, va dans l'onglet Packages du profil GitHub et vérifie que `pokedex-go-api` et `pokedex-go-web`
sont publics (sinon le VPS ne peut pas les télécharger).

Ensuite, chaque push sur `main` déploie. Pour relancer à la main : onglet Actions > CI / CD > Run workflow.

## Exploitation

```
cd /opt/mydexpogo
docker compose -f docker-compose.prod.yml ps           # état
docker compose -f docker-compose.prod.yml logs -f api  # journaux
./backup.sh manual                                     # sauvegarde à la demande
cat .current-tag                                       # version en ligne (commit)
./deploy.sh <commit>                                   # (re)déployer une version précise
```

Restaurer une sauvegarde de la base :

```
gunzip -c backups/<fichier>.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U mydex -d mydex
```

Les sauvegardes restent sur le VPS (14 nocturnes, 10 avant déploiement) : copie-les ailleurs de temps en temps,
par exemple `scp -r deploy@<VPS>:/opt/mydexpogo/backups .`.

Pour reprendre les données de l'instance du réseau local : `pg_dump` sur l'ancienne machine, restauration comme
ci-dessus, et copie de `vapid.json` (clés push) dans le volume `appdata` si des appareils sont déjà abonnés.
