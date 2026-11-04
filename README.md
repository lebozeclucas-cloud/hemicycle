# Hémicycle

Appli mobile gratuite et neutre pour suivre l'Assemblée nationale : derniers votes, parcours des lois, votes par groupe et par député. Uniquement des faits, tirés de l'open data officiel (data.assemblee-nationale.fr).

## Ce qu'il y a dedans

- **Actu** : derniers scrutins (votes finaux, amendements, articles), filtre par thème
- **Détail d'un vote** : pour / contre / abstention, répartition par groupe, liste nominative des députés
- **Textes** : projets et propositions de loi, frise de la navette, votes liés
- **Députés** : recherche par nom ou code postal, leurs derniers votes
- **Favoris** : textes et députés suivis (stockés sur le téléphone uniquement)
- **Recherche** globale, **lexique** (mots soulignés en pointillés), mode sombre automatique, fonctionne hors ligne, installable sur l'écran d'accueil

## Mise en ligne (une seule fois, ~10 minutes)

1. Crée un compte sur **github.com** (gratuit).
2. Clique sur **+ → New repository**. Nom : `hemicycle`. Laisse-le **Public**. Crée-le.
3. Sur la page du dépôt : **uploading an existing file** → glisse **tout le contenu** du dossier `hemicycle` (les dossiers `app`, `scripts`, `.github` et ce README). Clique **Commit changes**.
   - Le dossier `.github` est caché sur Mac/Windows : affiche les fichiers cachés (Mac : `Cmd + Maj + .`) pour pouvoir le glisser.
   - Plan B si ça ne passe pas : **Add file → Create new file**, tape comme nom `.github/workflows/update.yml`, colle le contenu du fichier `update.yml`, puis **Commit**.
4. Va dans **Settings → Pages** → *Source* : **GitHub Actions**.
5. Va dans l'onglet **Actions** → *Mise à jour des données et mise en ligne* → **Run workflow**.
6. Après 2 à 5 minutes, ton appli est en ligne à l'adresse : `https://TON-PSEUDO.github.io/hemicycle/`

## L'installer sur ton téléphone

- **iPhone** : ouvre l'adresse dans Safari → bouton Partager → **Sur l'écran d'accueil**.
- **Android** : ouvre l'adresse dans Chrome → menu ⋮ → **Installer l'application**.

## Mise à jour des données

Automatique, 3 fois par jour. L'Assemblée publie ses données environ une fois par jour, donc l'appli a au pire quelques heures de décalage.
Pour forcer une mise à jour : onglet **Actions → Run workflow**. Dans l'appli : **tire la liste vers le bas**.

⚠️ GitHub met en pause les tâches planifiées d'un dépôt sans activité depuis 60 jours. Si les données ne bougent plus, va dans **Actions** et réactive le workflow (un clic).

## Tester sur ton ordi (optionnel)

```bash
python scripts/make_sample.py sample_zips          # fausses données de démo
python scripts/build_data.py --local sample_zips --out app/data
cd app && python -m http.server 8000                # puis ouvre http://localhost:8000
```

Sans `--local`, le script télécharge les vraies données de l'Assemblée.

## Neutralité

- Aucun commentaire, aucun classement, aucune note.
- Les groupes sont classés par nombre de sièges.
- Les thèmes sont attribués automatiquement à partir de mots du titre officiel (liste visible dans `scripts/build_data.py`).
- Chaque vote et chaque texte renvoie vers sa page officielle.

Appli indépendante, non affiliée à l'Assemblée nationale. Données sous Licence Ouverte.
