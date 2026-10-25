# Site du mariage de Merveilles & Megan

Site en français, responsive, hébergé comme site statique sur Vercel. Les informations éditables sont chargées depuis Supabase. Une page d’administration permet de modifier les textes, les rendez-vous, les liens et les photos sans modifier les fichiers du site.

## Organisation du projet

- `dist/index.html` et `dist/admin.html` sont les deux pages publiées.
- `dist/css/base.css` contient les couleurs et les règles communes ; `site.css` gère la mise en page publique, `interactions.css` les menus et animations, et `admin.css` l’éditeur.
- `dist/js/site/` regroupe les modules du site public : navigation, animations, compte à rebours, chargement et affichage des contenus.
- `dist/js/admin/` regroupe l’éditeur, la connexion d’administration et le téléversement des photos.
- `dist/js/shared/supabase-client.js` centralise la connexion Supabase ; `dist/js/supabase-config.js` reçoit l’URL et la clé publique du projet.
- `supabase/setup.sql` prépare le contenu, les règles d’accès et le stockage photo.
- `supabase/rsvp-setup.sql` ajoute les invitations privées, les réponses de présence et les petits mots modérés.
- `supabase/functions/wedding-rsvp/` contient la fonction serveur qui vérifie les codes et enregistre les réponses.

Le site reste sans compilation : Vercel sert directement `dist`.

## Mise en place de Supabase

1. Créer un projet Supabase.
2. Créer le compte d’administration dans **Authentication > Users**. Les inscriptions publiques doivent rester désactivées.
3. Ouvrir `supabase/setup.sql`, remplacer chaque `YOUR_ADMIN_EMAIL` par l’adresse du compte d’administration, puis exécuter le fichier dans **SQL Editor**.
4. Dans **Project Settings > API**, copier l’URL du projet et sa clé **publishable** (ou l’ancienne clé publique `anon`) dans `dist/js/supabase-config.js`.
5. Ne jamais mettre la clé `service_role` ou une clé secrète dans le site.
6. Dans Vercel, utiliser `dist` comme dossier de sortie. Après le premier déploiement, ouvrir `/admin.html` et se connecter avec le compte d’administration.

La page publique peut lire les informations du mariage. Les règles RLS de Supabase limitent les modifications et les téléversements de photos à l’adresse d’administration définie dans `setup.sql`. Le dossier photo Supabase est public pour permettre l’affichage des images sur le site.

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
