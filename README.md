# Site du mariage de Merveilles & Megan

Première version statique en français, réalisée en HTML, CSS et JavaScript sans dépendances. Le site est responsive et conçu pour être simple à modifier.

## Modifier le site

- `dist/index.html` contient les textes, les sections, les liens vers les cartes et les informations du mariage.
- `dist/styles.css` contient les couleurs, la mise en page et les adaptations pour téléphone.
- `dist/script.js` gère le compte à rebours.
- `dist/assets/` contient les photos et illustrations utilisées.

Le formulaire RSVP est volontairement désactivé et indiqué « à connecter » tant qu’un lien ou une adresse de réponse n’a pas été choisi. Aucun horaire supplémentaire ni lieu de réception n’a été ajouté.

## Prévisualiser

Ouvrir `dist/index.html` dans un navigateur, ou lancer un serveur local depuis le dossier `dist` :

```powershell
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.
