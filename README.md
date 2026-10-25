# Site du mariage de Merveilles & Megan

Site en français, responsive, hébergé comme site statique sur Vercel. Les informations éditables sont chargées depuis Supabase. Une page d’administration permet de modifier les textes, les rendez-vous, les liens et les photos sans modifier les fichiers du site.

## Organisation du projet

- `dist/index.html` et `dist/admin.html` sont les deux pages publiées.
- `dist/css/base.css` contient les couleurs et les règles communes ; `site.css` gère la mise en page publique, `interactions.css` les menus et animations, et `admin.css` l’éditeur.
- `dist/js/site/` regroupe les modules du site public : navigation, animations, compte à rebours, chargement et affichage des contenus.
- `dist/js/admin/` regroupe l’éditeur, la connexion d’administration et le téléversement des photos.
- `dist/js/shared/supabase-client.js` centralise la connexion Supabase ; `dist/js/supabase-config.js` reçoit l’URL et la clé publique du projet.
- `supabase/setup.sql` prépare le contenu, les règles d’accès et le stockage photo.
- `supabase/access-gate-setup.sql` rend privés le contenu et les photos déjà en place.
- `supabase/rsvp-setup.sql` ajoute les invitations privées, les réponses de présence et les petits mots modérés.
- `supabase/functions/wedding-rsvp/` contient la fonction serveur qui vérifie les codes et enregistre les réponses.
- `api/`, `lib/site-access.js` et `proxy.js` protègent le site avec une session serveur signée.

Le site reste sans compilation : Vercel sert directement `dist`.

## Mise en place de Supabase

1. Créer un projet Supabase.
2. Créer le compte d’administration dans **Authentication > Users**. Les inscriptions publiques doivent rester désactivées.
3. Ouvrir `supabase/setup.sql`, remplacer chaque `YOUR_ADMIN_EMAIL` par l’adresse du compte d’administration, puis exécuter le fichier dans **SQL Editor**.
4. Dans **Project Settings > API**, copier l’URL du projet et sa clé **publishable** (ou l’ancienne clé publique `anon`) dans `dist/js/supabase-config.js`.
5. Ne jamais mettre la clé `service_role` ou une clé secrète dans le site.
6. Dans Vercel, utiliser `dist` comme dossier de sortie. L’accès au site se fait ensuite depuis `/access.html`, avec un code d’invitation ou le compte d’administration.

Le contenu du mariage et les photos du bucket sont privés. Les invités reçoivent le contenu par la fonction Supabase après vérification de leur code ; les photos stockées dans Supabase sont servies avec des liens temporaires. Le compte d’administration conserve son accès direct grâce aux règles RLS.

## Porte d’accès du site

Le contrôle d’accès s’exécute sur Vercel avant la distribution des pages et de leurs fichiers. Il pose un cookie de session `HttpOnly` après vérification du code d’invitation, ou après connexion Supabase Auth avec l’adresse d’administration autorisée. Les sessions invités durent 30 jours ; celles de l’administration durent 8 heures.

Dans les variables d’environnement Vercel, configurer :

- `SITE_ACCESS_SECRET` : secret aléatoire d’au moins 32 caractères, généré localement (par exemple avec `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"`).
- `WEDDING_ADMIN_EMAIL` : la même adresse que dans les règles SQL Supabase.
- `SUPABASE_URL` : l’URL du projet Supabase.
- `SUPABASE_PUBLISHABLE_KEY` : la clé publishable du projet. La configuration accepte aussi `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou l’ancienne clé publique `SUPABASE_ANON_KEY`.

Ne mets aucune clé `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, aucun mot de passe PostgreSQL ni secret JWT dans Vercel ou dans le navigateur. La fonction Edge RSVP continue d’utiliser sa clé serveur fournie par Supabase.

Pour appliquer la protection à un projet déjà configuré, remplace `YOUR_ADMIN_EMAIL` dans `supabase/access-gate-setup.sql` par l’adresse admin et exécute ce fichier dans **Supabase > SQL Editor**. Il retire la lecture publique du contenu et rend privé le bucket photo existant. Déploie d’abord la fonction `wedding-rsvp` mise à jour, puis déploie cette version du site sur Vercel après avoir ajouté les variables d’environnement. Exécute ensuite le script SQL de migration afin que le nouveau site puisse prendre le relais avant la fermeture des anciennes lectures publiques. Les photos téléversées restent modifiables dans l’administration.

Le projet sert désormais les endpoints `/api/access`, `/api/session`, `/api/site-data` et `/api/logout`. Pour que ce contrôle s’applique en local, utiliser Vercel CLI (`vercel dev`) avec les mêmes variables ; un simple serveur de fichiers ne lance ni les fonctions API ni le contrôle d’accès.

## Confirmation de présence

1. Dans `supabase/rsvp-setup.sql`, remplace `YOUR_ADMIN_EMAIL` par la même adresse que dans `setup.sql`, puis exécute ce fichier dans **SQL Editor**. Il crée les tables privées des invitations et des petits mots, accessibles uniquement au compte admin et à la fonction serveur.
2. Installe la CLI Supabase si nécessaire, connecte ce dossier au projet, puis déploie la fonction :

   ```powershell
   supabase login
   supabase link --project-ref <référence-du-projet>
   supabase functions deploy wedding-rsvp
   ```

   La référence est la partie située entre `https://` et `.supabase.co` dans l’URL Supabase. La fonction utilise la clé secrète fournie par l’environnement Supabase ; aucune clé secrète ne doit être ajoutée au site ou à Vercel.
3. Dans `/admin.html`, crée un code par faire-part et ajoute les personnes invitées, une par ligne. Copie le code affiché une seule fois pour l’imprimer. Seule son empreinte est conservée dans la base.
4. Les invités saisissent ce code sur le site, répondent pour chaque personne du faire-part, et peuvent corriger leur réponse avant la date limite configurée. L’administration affiche les réponses et permet leur export CSV.
5. Avec le même code, chaque personne invitée peut envoyer un petit mot sans avoir répondu au RSVP. Elle choisit si son prénom apparaît sur le site ou si le message est affiché comme anonyme. Le prénom reste visible dans l’administration pour la modération. Le message reste privé jusqu’à sa publication dans `/admin.html` ; seuls les messages publiés apparaissent sur le site. Un seul message est conservé par personne et par faire-part : un nouvel envoi remplace le précédent et repasse en attente de validation.

Les codes comportent 12 caractères aléatoires. La table des invités n’est jamais lisible depuis le site public ; les demandes passent par la fonction Supabase, avec une limite d’essais.

## Modifier le contenu

Ouvrir `/admin.html`, se connecter, modifier les champs, puis choisir **Enregistrer les changements**. Les invités verront la nouvelle version au prochain chargement du site. Les photos se téléversent dans Supabase Storage ; les fichiers JPG, PNG, WebP et GIF jusqu’à 8 Mo sont acceptés.

## Prévisualiser en local

Depuis PowerShell, lancer un serveur dans le dossier `dist` :

```powershell
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`. Pour utiliser les informations Supabase en local, compléter d’abord `dist/js/supabase-config.js`.
