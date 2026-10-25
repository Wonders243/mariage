import { createPhotoPreviewUrl } from './photo-storage.js';

let editorState = {};

const safeImageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const url = value.trim();
  if (url.startsWith('//') || (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:\/\//i.test(url))) return '';
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).href;
    } catch {
      return '';
    }
  }
  return url;
};

const appendField = (container, labelText, value, options = {}) => {
  const label = document.createElement('label');
  label.className = `admin-field${options.full ? ' admin-field--full' : ''}`;

  const caption = document.createElement('span');
  caption.textContent = labelText;

  const input = document.createElement(options.multiline ? 'textarea' : 'input');
  if (options.multiline) input.rows = options.rows || 3;
  else input.type = options.type || 'text';
  if (input.type !== 'file') input.value = value || '';
  if (options.field) input.dataset[options.datasetName || 'field'] = options.field;
  if (options.required) input.required = true;

  label.append(caption, input);
  container.append(label);
  return input;
};

const createRepeatItem = (title, removeLabel, onRemove) => {
  const item = document.createElement('div');
  item.className = 'admin-repeat-item';
  item.setAttribute('aria-label', title);

  const fields = document.createElement('div');
  fields.className = 'admin-repeat-item__fields';

  const remove = document.createElement('button');
  remove.className = 'admin-repeat-item__remove';
  remove.type = 'button';
  remove.textContent = 'Supprimer';
  remove.setAttribute('aria-label', removeLabel);
  remove.addEventListener('click', onRemove);

  item.append(fields, remove);
  return { item, fields };
};

const readEvents = (container) => Array.from(container.querySelectorAll('.event-editor'))
  .map((item) => {
    const value = (field) => item.querySelector(`[data-event-field="${field}"]`)?.value.trim() || '';
    return { time: value('time'), title: value('title'), description: value('description'), mapUrl: value('mapUrl') };
  });

const addEventEditor = (container, event = {}, index = container.children.length) => {
  const { item, fields } = createRepeatItem(`Rendez-vous ${index + 1}`, `Supprimer le rendez-vous ${index + 1}`, () => item.remove());
  item.classList.add('event-editor');
  appendField(fields, 'Repère ou heure', event.time, { field: 'time', datasetName: 'eventField' });
  appendField(fields, 'Titre', event.title, { field: 'title', datasetName: 'eventField', required: true });
  appendField(fields, 'Description', event.description, { field: 'description', datasetName: 'eventField', full: true });
  appendField(fields, 'Lien de la carte', event.mapUrl, { field: 'mapUrl', datasetName: 'eventField', full: true, type: 'url' });
  container.append(item);
};

const addPhotoEditor = (container, photo = {}, index = container.children.length) => {
  const item = document.createElement('div');
  item.className = 'admin-photo-card photo-editor';
  item.dataset.url = safeImageUrl(photo.url);
  item.dataset.storagePath = photo.storagePath || '';
  item.selectedFile = photo.file || null;

  const preview = document.createElement('img');
  preview.className = 'admin-photo-card__preview';
  preview.alt = '';
  const previewSource = item.selectedFile ? URL.createObjectURL(item.selectedFile) : item.dataset.url;
  if (previewSource) preview.src = previewSource;
  else preview.removeAttribute('src');
  preview.hidden = !previewSource;

  const fields = document.createElement('div');
  fields.className = 'admin-photo-card__fields';
  const fileField = appendField(fields, 'Choisir ou remplacer cette photo', '', { type: 'file' });
  fileField.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileField.dataset.photoFile = 'true';
  fileField.addEventListener('change', () => {
    const file = fileField.files?.[0];
    if (!file) return;
    item.selectedFile = file;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  appendField(fields, 'Description de la photo', photo.alt, { field: 'alt', datasetName: 'photoField', required: true });
  appendField(fields, 'Légende facultative', photo.caption, { field: 'caption', datasetName: 'photoField' });

  const remove = document.createElement('button');
  remove.className = 'admin-repeat-item__remove admin-photo-card__remove';
  remove.type = 'button';
  remove.textContent = 'Supprimer';
  remove.setAttribute('aria-label', `Supprimer la photo ${index + 1}`);
  remove.addEventListener('click', () => {
    item.remove();
  });

  item.append(preview, fields, remove);
  container.append(item);
};

const readPhotos = (container) => Array.from(container.querySelectorAll('.photo-editor'))
  .map((item) => ({
    url: item.dataset.url || '',
    storagePath: item.dataset.storagePath || '',
    alt: item.querySelector('[data-photo-field="alt"]')?.value.trim() || '',
    caption: item.querySelector('[data-photo-field="caption"]')?.value.trim() || '',
    file: item.selectedFile || item.querySelector('[data-photo-file]')?.files?.[0] || null
  }))
  .filter((photo) => photo.url || photo.file);

export function initContentEditor({ form, eventsEditor, photosEditor, heroFileInput, heroPreview, heroPreviewWrap }) {
  editorState = { form, eventsEditor, photosEditor, heroFileInput, heroPreview, heroPreviewWrap };
  document.querySelector('#add-event').addEventListener('click', () => {
    const events = readEvents(eventsEditor);
    events.push({ time: '', title: '', description: '', mapUrl: '' });
    renderEvents(events);
  });

  document.querySelector('#add-photo').addEventListener('click', () => {
    addPhotoEditor(photosEditor);
  });

  heroFileInput.addEventListener('change', () => {
    const file = heroFileInput.files?.[0];
    if (!file) return;
    heroPreview.src = URL.createObjectURL(file);
    heroPreviewWrap.hidden = false;
  });
}

const renderEvents = (events) => {
  const { eventsEditor } = editorState;
  eventsEditor.replaceChildren();
  events.forEach((event, index) => addEventEditor(eventsEditor, event, index));
};

export async function populateEditor(content, supabase) {
  const { form, eventsEditor, photosEditor, heroFileInput, heroPreview, heroPreviewWrap } = editorState;
  Object.entries(content).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field && typeof value === 'string') field.value = value;
  });

  editorState.heroImageUrl = safeImageUrl(content.heroImageUrl);
  editorState.heroStoragePath = content.heroStoragePath || '';
  if (editorState.heroStoragePath && supabase) {
    try {
      editorState.heroImageUrl = await createPhotoPreviewUrl(supabase, editorState.heroStoragePath);
    } catch (error) {
      console.warn('La photo d’accueil n’a pas pu être prévisualisée.', error);
    }
  }
  if (editorState.heroImageUrl) heroPreview.src = editorState.heroImageUrl;
  else heroPreview.removeAttribute('src');
  heroPreviewWrap.hidden = !editorState.heroImageUrl;
  heroFileInput.value = '';

  eventsEditor.replaceChildren();
  (Array.isArray(content.events) ? content.events : []).forEach((event, index) => addEventEditor(eventsEditor, event, index));

  photosEditor.replaceChildren();
  const galleryImages = await Promise.all((Array.isArray(content.galleryImages) ? content.galleryImages : []).map(async (photo) => {
    if (!photo?.storagePath) return photo;
    try {
      return { ...photo, url: await createPhotoPreviewUrl(supabase, photo.storagePath) };
    } catch (error) {
      console.warn('Une photo de la galerie n’a pas pu être prévisualisée.', error);
      return photo;
    }
  }));
  galleryImages.forEach((photo, index) => addPhotoEditor(photosEditor, photo, index));
}

export function collectContentFields(form) {
  const values = new FormData(form);
  const text = (key) => String(values.get(key) || '').trim();

  return {
    nameOne: text('nameOne'),
    nameTwo: text('nameTwo'),
    heroEyebrow: text('heroEyebrow'),
    heroIntro: text('heroIntro'),
    weddingDate: text('weddingDate'),
    countdownTitle: text('countdownTitle'),
    heroImageAlt: text('heroImageAlt'),
    heroCaption: text('heroCaption'),
    programmeTitle: text('programmeTitle'),
    events: readEvents(editorState.eventsEditor).filter((event) => event.title),
    dressLabel: text('dressLabel'),
    dressNote: text('dressNote'),
    rsvpTitle: text('rsvpTitle'),
    rsvpMessage: text('rsvpMessage'),
    rsvpDeadline: text('rsvpDeadline'),
    galleryEyebrow: text('galleryEyebrow'),
    galleryTitle: text('galleryTitle')
  };
}

export function getHeroPhoto() {
  return {
    url: editorState.heroImageUrl || '',
    storagePath: editorState.heroStoragePath || '',
    file: editorState.heroFileInput.files?.[0] || null
  };
}

export function collectGalleryPhotos() {
  return readPhotos(editorState.photosEditor);
}
