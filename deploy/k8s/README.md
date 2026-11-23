# MyDexPoGo sur Kubernetes avec ArgoCD

Ce dossier décrit toute l'appli pour un cluster Kubernetes. ArgoCD le surveille dans le dépôt public
`VulkreoN/pokedex-GO` et applique chaque changement. À chaque push sur `main`, la CI teste, publie les images sur
`ghcr.io/vulkreon/pokedex-go-api` et `-web`, puis écrit le nouveau numéro de version dans `kustomization.yaml` :
ArgoCD déploie, et la CI vérifie ensuite le site en ligne.

## Ce que ça installe (namespace `mydexpogo`)

| Élément | Rôle |
|---|---|
| `db` (StatefulSet + volume 5 Go) | Postgres 17 |
| `api` (Deployment + volume 2 Go) | l'API ; applique ses migrations au démarrage, génère les données du Pokédex dans `/data` |
| `web` (Deployment) | Caddy en HTTP sur le port 80 : l'appli et le relais `/api` vers `api` |
| `mydexpogo` (Ingress) | le domaine en HTTPS, certificat par cert-manager |
| `db-backup` (CronJob + volume 2 Go) | sauvegarde de la base chaque nuit à 3 h 30, 14 gardées |

Ressources demandées au total : environ 0,2 CPU et 450 Mo de mémoire (plafonds : 2,2 Go).

## Mise en place (une seule fois)

### 1. Adapter au cluster

Dans `ingress.yaml`, les lignes marquées `À ADAPTER` :
- le domaine, deux fois (par exemple `dex.tondomaine.fr`) ;
- l'émetteur cert-manager (`kubectl get clusterissuer`) ;
- `ingressClassName` si le cluster n'a pas de classe par défaut (`kubectl get ingressclass`).

Dans `kustomization.yaml` : `VAPID_SUBJECT` (le même domaine en `https://...`, ou un `mailto:`).

Les volumes prennent la StorageClass par défaut du cluster (`kubectl get storageclass`). Pour en imposer une, ajouter
`storageClassName: <nom>` dans les trois demandes de volume (`postgres.yaml`, `api.yaml`, `backup.yaml`).

Ces changements se commitent dans le dépôt, comme le reste.

### 2. Le secret (jamais dans Git)

```
kubectl create namespace mydexpogo
kubectl -n mydexpogo create secret generic mydexpogo-secrets \
  --from-literal=postgres-password="$(openssl rand -hex 32)"
```

Le mot de passe doit rester en lettres et chiffres (il entre dans une URL) et ne plus jamais changer : la base le garde
dès sa création. Facultatif, pour la page « Fraîcheur des données » : ajouter
`--from-literal=github-token=<jeton GitHub sans droits>` à la commande.

### 3. L'application ArgoCD

```
kubectl apply -n argocd -f deploy/argocd/application.yaml
```

Ou dans l'interface ArgoCD : New App, dépôt `https://github.com/VulkreoN/pokedex-GO.git`, révision `main`, chemin
`deploy/k8s`, cluster `https://kubernetes.default.svc`, namespace `mydexpogo`, synchro automatique avec Prune et Self
Heal, option « Auto-create namespace ».

Le premier démarrage de l'API prend quelques minutes (génération des données du Pokédex).

### 4. Le domaine

Un enregistrement DNS `A` du domaine vers l'IP du cluster. cert-manager obtient le certificat dès qu'il répond.

### 5. GitHub (pour que chaque push déploie)

Dans le dépôt, Settings > Secrets and variables > Actions > Variables :

| Variable | Valeur |
|---|---|
| `K8S_RELEASE` | `true` |
| `DOMAIN` | le domaine, pour les vérifications après déploiement |

Si `main` est protégée, autoriser GitHub Actions à y pousser (les commits `release: <version>` ne touchent que
`deploy/k8s/kustomization.yaml`). En local, faire un `git pull --rebase` avant de pousser.

Les images `pokedex-go-api` et `pokedex-go-web` doivent être publiques (onglet Packages du profil GitHub), sinon le
cluster ne peut pas les télécharger.

## Exploitation

```
kubectl -n mydexpogo get pods
kubectl -n mydexpogo logs deploy/api -f
kubectl -n mydexpogo create job --from=cronjob/db-backup backup-manuel   # sauvegarde à la demande
```

Revenir à une version : dans ArgoCD, History and Rollback, ou remettre l'ancien commit dans les deux `newTag` de
`kustomization.yaml`.

Restaurer une sauvegarde :

```
kubectl -n mydexpogo run restore --rm -it --image=postgres:17-alpine --overrides='{"spec":{"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backups"}}],"containers":[{"name":"restore","image":"postgres:17-alpine","stdin":true,"tty":true,"command":["sh"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}'
# puis, dans le conteneur :
ls /backups
gunzip -c /backups/<fichier>.sql.gz | PGPASSWORD=<mot de passe> psql -h db -U mydex -d mydex
```

Les sauvegardes restent dans le cluster : en copier une ailleurs de temps en temps
(`kubectl -n mydexpogo cp <pod>:/backups/<fichier> .` depuis le pod de restauration).

Reprendre les données d'une ancienne instance : restaurer son `pg_dump` comme ci-dessus, et copier son `vapid.json`
(clés des notifications push) dans le volume `appdata` (`/data/vapid.json`) avant de redémarrer l'API, sinon les
appareils déjà abonnés devront se réabonner.
