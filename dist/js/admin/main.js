import { connectSupabase, isSupabaseConfigured } from '../shared/supabase-client.js';
import {
  collectContentFields,
  collectGalleryPhotos,
  getHeroPhoto,
  initContentEditor,
  populateEditor
} from './editor.js';
import { removeStoredPhotos, uploadPhoto } from './photo-storage.js';
import { createInvitationCode, hashInvitationCode } from '../shared/invitation-code.js';

const setupNotice = document.querySelector('#setup-notice');
const loginPanel = document.querySelector('#login-panel');
const editorPanel = document.querySelector('#editor-panel');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const saveStatus = document.querySelector('#save-status');
const contentForm = document.querySelector('#content-form');
const saveButton = document.querySelector('#save-content');
const invitationList = document.querySelector('#invitation-list');
const invitationListStatus = document.querySelector('#invitation-list-status');
const invitationCreateStatus = document.querySelector('#invitation-create-status');
const invitationCodeResult = document.querySelector('#invitation-code-result');
const invitationCodeValue = document.querySelector('#invitation-code-value');
const guestMessagesList = document.querySelector('#guest-messages-admin-list');
const guestMessagesStatus = document.querySelector('#guest-messages-admin-status');

initContentEditor({
  form: contentForm,
  eventsEditor: document.querySelector('#events-editor'),
  photosEditor: document.querySelector('#photos-editor'),
  heroFileInput: document.querySelector('#hero-photo-file'),
  heroPreview: document.querySelector('#hero-preview'),
  heroPreviewWrap: document.querySelector('#hero-preview-wrap')
});

let supabase;
let currentContent;
let activeUserId = '';
let currentInvitations = [];
let currentGuestMessages = [];

const setStatus = (element, message, isError = false) => {
  if (!element) return;
  element.textContent = message;
  element.dataset.error = String(isError);
};

const loadContent = async () => {
  setStatus(saveStatus, 'Chargement des informations…');
  const { data, error } = await supabase
    .from('wedding_site_content')
    .select('content')
    .eq('id', 'main')
    .single();

  if (error) throw error;
  currentContent = data.content;
  populateEditor(currentContent);
  setStatus(saveStatus, '');
};

async function showSession(session) {
  if (!session) {
    activeUserId = '';
    editorPanel.hidden = true;
    loginPanel.hidden = false;
    document.querySelector('#signed-in-email').textContent = '';
    return;
  }

  loginPanel.hidden = true;
  editorPanel.hidden = false;
  document.querySelector('#signed-in-email').textContent = session.user.email || '';
  if (activeUserId === session.user.id) return;

  activeUserId = session.user.id;
  try {
    await loadContent();
  } catch (error) {
    setStatus(saveStatus, error.message || 'Impossible de charger les informations.', true);
  }
  try {
    await loadInvitations();
  } catch (error) {
    setStatus(invitationListStatus, 'La gestion des invitations doit encore être préparée dans Supabase. Exécute le fichier supabase/rsvp-setup.sql.', true);
    console.error('Les invitations ne sont pas disponibles.', error);
  }
  try {
    await loadGuestMessages();
  } catch (error) {
    setStatus(guestMessagesStatus, 'La modération des petits mots doit être préparée dans Supabase. Exécute le fichier supabase/rsvp-setup.sql.', true);
    console.error('Les petits mots ne sont pas disponibles.', error);
  }
}

const storedPhotoPaths = (content) => [
  content?.heroStoragePath,
  ...(Array.isArray(content?.galleryImages) ? content.galleryImages.map((photo) => photo.storagePath) : [])
].filter(Boolean);

const responseLabel = (attending) => attending === true
  ? 'Présent(e)'
  : attending === false ? 'Absent(e)' : 'En attente';

const renderInvitations = () => {
  if (!invitationList) return;
  const fragment = document.createDocumentFragment();

  if (!currentInvitations.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-invitation-empty';
    empty.textContent = 'Aucun faire-part pour le moment. Les réponses apparaîtront ici.';
    invitationList.replaceChildren(empty);
    return;
  }

  currentInvitations.forEach((invitation) => {
    const card = document.createElement('article');
    card.className = 'admin-invitation';
    const guests = Array.isArray(invitation.guests) ? invitation.guests : [];
    const present = guests.filter((guest) => guest.attending === true).length;
    const absent = guests.filter((guest) => guest.attending === false).length;
    const waiting = guests.length - present - absent;

    const heading = document.createElement('div');
    heading.className = 'admin-invitation__heading';
    const title = document.createElement('h3');
    title.textContent = invitation.invitation_label || 'Faire-part';
    const summary = document.createElement('p');
    summary.textContent = `${present} présent(s) · ${absent} absent(s) · ${waiting} réponse(s) attendue(s)`;
    const renewCode = document.createElement('button');
    renewCode.className = 'admin-invitation__renew';
    renewCode.type = 'button';
    renewCode.textContent = 'Renouveler le code';
    renewCode.addEventListener('click', async () => {
      const confirmed = window.confirm('L’ancien code cessera de fonctionner. Il faudra communiquer le nouveau code aux invités. Continuer ?');
      if (!confirmed) return;
      renewCode.disabled = true;
      try {
        const newCode = createInvitationCode();
        const newHash = await hashInvitationCode(newCode);
        const { error } = await supabase
          .from('wedding_rsvp_invitations')
          .update({ code_hash: newHash, updated_at: new Date().toISOString() })
          .eq('id', invitation.id);
        if (error) throw error;
        invitationCodeValue.textContent = newCode;
        invitationCodeResult.hidden = false;
        setStatus(invitationCreateStatus, 'Nouveau code créé. L’ancien code ne fonctionne plus.');
        await loadInvitations();
      } catch (error) {
        setStatus(invitationCreateStatus, error.message || 'Le code n’a pas pu être renouvelé.', true);
      } finally {
        renewCode.disabled = false;
      }
    });
    heading.append(title, summary, renewCode);

    const list = document.createElement('ul');
    list.className = 'admin-invitation__guests';
    guests.forEach((guest) => {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = guest.name || 'Invité';
      const response = document.createElement('span');
      response.className = `admin-invitation__response${typeof guest.attending === 'boolean' ? ' is-answered' : ''}`;
      response.textContent = responseLabel(guest.attending);
      row.append(name, response);
      list.append(row);
    });

    card.append(heading, list);
    fragment.append(card);
  });

  invitationList.replaceChildren(fragment);
};

async function loadInvitations() {
  if (!supabase) return;
  setStatus(invitationListStatus, 'Chargement des réponses…');
  const { data, error } = await supabase
    .from('wedding_rsvp_invitations')
    .select('id, invitation_label, guests, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  currentInvitations = Array.isArray(data) ? data : [];
  renderInvitations();
  setStatus(invitationListStatus, '');
}

const guestMessageStatusLabel = (status) => ({
  pending: 'À valider',
  approved: 'Publié',
  hidden: 'Masqué'
}[status] || 'À valider');

const renderGuestMessages = () => {
  if (!guestMessagesList) return;
  if (!currentGuestMessages.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-invitation-empty';
    empty.textContent = 'Aucun petit mot reçu pour le moment.';
    guestMessagesList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  currentGuestMessages.forEach((message) => {
    const card = document.createElement('article');
    card.className = 'admin-guest-message';
    const heading = document.createElement('div');
    heading.className = 'admin-guest-message__heading';
    const name = document.createElement('h3');
    name.textContent = message.guest_name || 'Invité';
    const status = document.createElement('span');
    status.className = `admin-guest-message__status is-${message.status}`;
    status.textContent = guestMessageStatusLabel(message.status);
    heading.append(name, status);
    if (message.is_anonymous) {
      const privacy = document.createElement('span');
      privacy.className = 'admin-guest-message__privacy';
      privacy.textContent = 'Sera publié comme Anonyme';
      heading.append(privacy);
    }

    const body = document.createElement('p');
    body.className = 'admin-guest-message__body';
    body.textContent = message.message || '';
    const date = document.createElement('time');
    date.className = 'admin-guest-message__date';
    if (message.created_at) {
      const createdAt = new Date(message.created_at);
      if (!Number.isNaN(createdAt.getTime())) {
        date.dateTime = createdAt.toISOString();
        date.textContent = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(createdAt);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'admin-guest-message__actions';
    const publish = document.createElement('button');
    publish.className = 'admin-quiet-button';
    publish.type = 'button';
    publish.textContent = message.status === 'approved' ? 'Déjà publié' : 'Publier';
    publish.disabled = message.status === 'approved';
    publish.addEventListener('click', () => updateGuestMessageStatus(message.id, 'approved', publish));
    const hide = document.createElement('button');
    hide.className = 'admin-quiet-button';
    hide.type = 'button';
    hide.textContent = message.status === 'hidden' ? 'Déjà masqué' : 'Masquer';
    hide.disabled = message.status === 'hidden';
    hide.addEventListener('click', () => updateGuestMessageStatus(message.id, 'hidden', hide));
    actions.append(publish, hide);
    card.append(heading, body);
    if (date.textContent) card.append(date);
    card.append(actions);
    fragment.append(card);
  });
  guestMessagesList.replaceChildren(fragment);
};

async function loadGuestMessages() {
  if (!supabase) return;
  setStatus(guestMessagesStatus, 'Chargement des petits mots…');
  const { data, error } = await supabase
    .from('wedding_rsvp_messages')
    .select('id, guest_name, is_anonymous, message, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  currentGuestMessages = Array.isArray(data) ? data : [];
  renderGuestMessages();
  setStatus(guestMessagesStatus, '');
}

async function updateGuestMessageStatus(id, status, button) {
  button.disabled = true;
  setStatus(guestMessagesStatus, 'Mise à jour du message…');
  try {
    const { error } = await supabase
      .from('wedding_rsvp_messages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await loadGuestMessages();
  } catch (error) {
    setStatus(guestMessagesStatus, error.message || 'Le message n’a pas pu être modifié.', true);
    button.disabled = false;
  }
}

const downloadInvitationsCsv = () => {
  const rows = [['Faire-part', 'Invité', 'Réponse', 'Dernière mise à jour']];
  currentInvitations.forEach((invitation) => {
    (Array.isArray(invitation.guests) ? invitation.guests : []).forEach((guest) => {
      rows.push([
        invitation.invitation_label || '',
        guest.name || '',
        responseLabel(guest.attending),
        invitation.updated_at || ''
      ]);
    });
  });
  const escapeCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `reponses-mariage-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;

  const button = loginForm.querySelector('button[type="submit"]');
  const values = new FormData(loginForm);
  button.disabled = true;
  setStatus(loginStatus, 'Connexion…');

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: values.get('email'),
      password: values.get('password')
    });
    if (error) throw error;
    setStatus(loginStatus, '');
  } catch (error) {
    const loginMessages = {
      invalid_credentials: 'Adresse e-mail ou mot de passe incorrects.',
      email_not_confirmed: 'Cette adresse e-mail n’est pas encore confirmée dans Supabase.',
      user_banned: 'Ce compte est désactivé dans Supabase.'
    };
    const message = loginMessages[error?.code]
      || (error?.message === 'Failed to fetch'
        ? 'Supabase ne répond pas. Vérifie ta connexion et la configuration du projet.'
        : 'Connexion impossible. Vérifie le compte dans Authentication → Users.');
    setStatus(loginStatus, message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#sign-out').addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
});

document.querySelector('#create-invitation').addEventListener('click', async () => {
  const button = document.querySelector('#create-invitation');
  const labelInput = document.querySelector('#invitation-label');
  const guestsInput = document.querySelector('#invitation-guests');
  const names = guestsInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);

  invitationCodeResult.hidden = true;
  if (!names.length) {
    setStatus(invitationCreateStatus, 'Ajoute au moins une personne, une par ligne.', true);
    guestsInput.focus();
    return;
  }
  if (names.some((name) => name.length > 80)) {
    setStatus(invitationCreateStatus, 'Chaque nom doit faire moins de 80 caractères.', true);
    return;
  }
  if (!supabase) {
    setStatus(invitationCreateStatus, 'Connecte-toi pour créer une invitation.', true);
    return;
  }

  button.disabled = true;
  setStatus(invitationCreateStatus, 'Création du code…');
  try {
    const code = createInvitationCode();
    const codeHash = await hashInvitationCode(code);
    const guests = names.map((name) => ({ id: crypto.randomUUID(), name, attending: null }));
    const invitationLabel = labelInput.value.trim() || names.join(', ');
    const { error } = await supabase.from('wedding_rsvp_invitations').insert({
      code_hash: codeHash,
      invitation_label: invitationLabel,
      guests
    });
    if (error) throw error;

    invitationCodeValue.textContent = code;
    invitationCodeResult.hidden = false;
    labelInput.value = '';
    guestsInput.value = '';
    setStatus(invitationCreateStatus, 'Invitation créée. Copie le code ci-dessous pour le faire-part.');
    try {
      await loadInvitations();
    } catch (error) {
      setStatus(invitationListStatus, 'Le code est créé, mais la liste n’a pas pu être actualisée.', true);
      console.error('Impossible d’actualiser les invitations.', error);
    }
  } catch (error) {
    const message = error?.code === '42501'
      ? 'Ce compte ne peut pas gérer les invitations. Vérifie l’adresse indiquée dans rsvp-setup.sql.'
      : error.message || 'Le code n’a pas pu être créé. Réessaie.';
    setStatus(invitationCreateStatus, message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#copy-invitation-code').addEventListener('click', async () => {
  const code = invitationCodeValue.textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    setStatus(invitationCreateStatus, 'Code copié. Pense à le garder pour le faire-part.');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(invitationCodeValue);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setStatus(invitationCreateStatus, 'Sélectionne le code pour le copier.');
  }
});

document.querySelector('#refresh-invitations').addEventListener('click', async () => {
  try {
    await loadInvitations();
  } catch (error) {
    setStatus(invitationListStatus, 'Les réponses n’ont pas pu être actualisées.', true);
  }
});

document.querySelector('#refresh-guest-messages').addEventListener('click', async () => {
  try {
    await loadGuestMessages();
  } catch (error) {
    setStatus(guestMessagesStatus, 'Les petits mots n’ont pas pu être actualisés.', true);
  }
});

document.querySelector('#export-invitations').addEventListener('click', () => {
  if (!currentInvitations.length) {
    setStatus(invitationListStatus, 'Il n’y a aucune réponse à exporter.', true);
    return;
  }
  downloadInvitationsCsv();
  setStatus(invitationListStatus, 'Le fichier CSV des réponses a été téléchargé.');
});

contentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !currentContent) return;

  const uploadedPaths = [];
  saveButton.disabled = true;
  setStatus(saveStatus, 'Enregistrement…');

  try {
    const nextContent = {
      ...currentContent,
      ...collectContentFields(contentForm),
      galleryImages: []
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextContent.weddingDate)) {
      throw new Error('Choisis une date de mariage valide.');
    }

    const heroPhoto = getHeroPhoto();
    if (heroPhoto.file) {
      const uploaded = await uploadPhoto(supabase, heroPhoto.file);
      uploadedPaths.push(uploaded.storagePath);
      nextContent.heroImageUrl = uploaded.url;
      nextContent.heroStoragePath = uploaded.storagePath;
    } else {
      nextContent.heroImageUrl = heroPhoto.url;
      nextContent.heroStoragePath = heroPhoto.storagePath;
    }

    for (const photo of collectGalleryPhotos()) {
      if (photo.file) {
        const uploaded = await uploadPhoto(supabase, photo.file);
        uploadedPaths.push(uploaded.storagePath);
        nextContent.galleryImages.push({
          url: uploaded.url,
          storagePath: uploaded.storagePath,
          alt: photo.alt,
          caption: photo.caption
        });
      } else {
        nextContent.galleryImages.push({
          url: photo.url,
          storagePath: photo.storagePath,
          alt: photo.alt,
          caption: photo.caption
        });
      }
    }

    const { error } = await supabase
      .from('wedding_site_content')
      .update({ content: nextContent, updated_at: new Date().toISOString() })
      .eq('id', 'main')
      .select('id')
      .single();

    if (error?.code === '42501') {
      throw new Error('Ce compte ne peut pas modifier le site. Vérifie l’adresse indiquée dans setup.sql.');
    }
    if (error) throw error;

    const retainedPaths = new Set(storedPhotoPaths(nextContent));
    const oldPaths = storedPhotoPaths(currentContent);

    currentContent = nextContent;
    populateEditor(nextContent);

    const unusedPaths = [...new Set(oldPaths)].filter((path) => !retainedPaths.has(path));
    try {
      await removeStoredPhotos(supabase, unusedPaths);
    } catch (cleanupError) {
      console.warn('Une ancienne photo n’a pas pu être supprimée.', cleanupError);
    }

    setStatus(saveStatus, 'C’est enregistré. Les invités verront les changements au prochain chargement du site.');
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await removeStoredPhotos(supabase, uploadedPaths);
      } catch (cleanupError) {
        console.warn('Une photo non utilisée n’a pas pu être supprimée.', cleanupError);
      }
    }
    setStatus(saveStatus, error.message || 'Une erreur est survenue. Réessaie dans un instant.', true);
  } finally {
    saveButton.disabled = false;
  }
});

if (!isSupabaseConfigured) {
  setupNotice.hidden = false;
} else {
  try {
    supabase = await connectSupabase();
    loginPanel.hidden = false;
    supabase.auth.onAuthStateChange((_event, session) => {
      showSession(session);
    });
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    await showSession(session);
  } catch (error) {
    setupNotice.hidden = false;
    setupNotice.querySelector('p').textContent = `La connexion à Supabase n’a pas pu démarrer : ${error.message}`;
  }
}
