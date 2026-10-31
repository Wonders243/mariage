const textOrEmpty = (value) => typeof value === 'string' ? value.trim() : '';

const safeWebUrl = (value) => {
  const url = textOrEmpty(value);
  if (!url) return '';

  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return '';
  }

  return '';
};

const safeImageUrl = (value) => {
  const url = textOrEmpty(value);
  if (!url || url.startsWith('//')) return '';
  if (/^https?:\/\//i.test(url)) return safeWebUrl(url);
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return '';
  return url;
};

const formatFrenchDate = (dateValue) => {
  const value = textOrEmpty(dateValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';

  const date = new Date(`${value}T12:00:00`);
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris'
  }).format(date);

  return formatted.charAt(0).toLocaleUpperCase('fr-FR') + formatted.slice(1);
};

const setText = (key, value) => {
  const text = textOrEmpty(value);
  document.querySelectorAll(`[data-content="${key}"]`).forEach((element) => {
    element.textContent = text;
  });
};

const renderEvents = (events) => {
  const list = document.querySelector('#programme-list');
  if (!list || !Array.isArray(events)) return;

  const fragment = document.createDocumentFragment();
  events.forEach((event, index) => {
    if (!event || !textOrEmpty(event.title)) return;

    const article = document.createElement('article');
    article.className = `programme-item${index ? ' programme-item--second' : ''}`;

    const time = document.createElement('p');
    time.className = 'programme-item__time';
    time.textContent = textOrEmpty(event.time);

    const content = document.createElement('div');
    content.className = 'programme-item__content';

    const title = document.createElement('h3');
    title.textContent = textOrEmpty(event.title);
    content.append(title);

    const description = textOrEmpty(event.description);
    if (description) {
      const paragraph = document.createElement('p');
      paragraph.textContent = description;
      content.append(paragraph);
    }

    const mapUrl = safeWebUrl(event.mapUrl);
    if (mapUrl) {
      const mapLink = document.createElement('a');
      mapLink.className = 'text-link';
      mapLink.href = mapUrl;
      mapLink.target = '_blank';
      mapLink.rel = 'noreferrer';
      mapLink.textContent = 'Ouvrir la carte';
      content.append(mapLink);
    }

    article.append(time, content);
    fragment.append(article);
  });

  list.replaceChildren(fragment);
};

const renderGallery = (photos) => {
  const viewport = document.querySelector('#gallery-viewport');
  const motionToggle = document.querySelector('#gallery-motion-toggle');
  const gallerySection = document.querySelector('.gallery-section');
  const galleryLink = document.querySelector('.nav-gallery');
  if (!viewport) return;

  const validPhotos = Array.isArray(photos) ? photos.filter((photo) => photo && safeImageUrl(photo.url)) : [];
  const hasPhotos = validPhotos.length > 0;
  if (gallerySection) gallerySection.hidden = !hasPhotos;
  if (galleryLink) galleryLink.hidden = !hasPhotos;
  if (!Array.isArray(photos)) {
    viewport.replaceChildren();
    if (motionToggle) motionToggle.hidden = true;
    return;
  }
  const track = document.createElement('div');
  track.className = 'gallery-track';
  track.style.setProperty('--gallery-duration', `${Math.max(32, validPhotos.length * 9)}s`);

  const group = document.createElement('div');
  group.className = 'gallery-track__group';
  validPhotos.forEach((photo) => {
    const figure = document.createElement('figure');
    figure.className = 'gallery-photo';

    const image = document.createElement('img');
    image.src = safeImageUrl(photo.url);
    image.alt = textOrEmpty(photo.alt);
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.append(image);

    const caption = textOrEmpty(photo.caption);
    if (caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = caption;
      figure.append(figcaption);
    }

    group.append(figure);
  });

  track.append(group);

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = validPhotos.length >= 3 && !reducedMotion;
  if (shouldAnimate) {
    track.classList.add('gallery-track--animated');
    const duplicate = group.cloneNode(true);
    duplicate.setAttribute('aria-hidden', 'true');
    duplicate.querySelectorAll('img').forEach((image) => { image.alt = ''; });
    track.append(duplicate);
  }

  viewport.classList.remove('is-paused');
  viewport.replaceChildren(track);

  if (motionToggle) {
    motionToggle.hidden = !shouldAnimate;
    motionToggle.textContent = 'Mettre en pause';
    motionToggle.setAttribute('aria-pressed', 'false');
    motionToggle.onclick = () => {
      const paused = viewport.classList.toggle('is-paused');
      motionToggle.textContent = paused ? 'Reprendre' : 'Mettre en pause';
      motionToggle.setAttribute('aria-pressed', String(paused));
    };
  }
};

export function renderSiteContent(content) {
  if (!content || typeof content !== 'object') return;

  [
    'nameOne', 'nameTwo', 'heroEyebrow', 'heroIntro', 'countdownTitle',
    'programmeTitle', 'dressLabel', 'dressNote', 'rsvpTitle', 'rsvpMessage',
    'galleryEyebrow', 'galleryTitle'
  ].forEach((key) => setText(key, content[key]));

  const weddingDate = textOrEmpty(content.weddingDate);
  const weddingDateElement = document.querySelector('[data-content="weddingDate"]');
  const formattedDate = formatFrenchDate(weddingDate);
  if (weddingDateElement && formattedDate) {
    weddingDateElement.textContent = formattedDate;
    weddingDateElement.dateTime = weddingDate;
  }

  const names = [textOrEmpty(content.nameOne), textOrEmpty(content.nameTwo)].filter(Boolean).join(' et ');
  const titleDate = formattedDate ? ` — ${formattedDate}` : '';
  if (names) {
    document.title = `${names.replace(' et ', ' & ')}${titleDate}`;
    document.querySelector('#hero-title')?.setAttribute('aria-label', names);
    document.querySelector('.wordmark')?.setAttribute('aria-label', `${names}, accueil`);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  }

  const description = names && formattedDate
    ? `Le mariage de ${names} le ${formattedDate} à Alès.`
    : '';
  if (description) {
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }

  const heroImage = document.querySelector('#hero-image');
  const heroImageUrl = safeImageUrl(content.heroImageUrl);
  if (heroImage && heroImageUrl) heroImage.src = heroImageUrl;
  if (heroImage && textOrEmpty(content.heroImageAlt)) heroImage.alt = textOrEmpty(content.heroImageAlt);
  if (heroImageUrl) {
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', new URL(heroImageUrl, window.location.href).href);
  }
  const heroCaption = document.querySelector('.hero__portrait figcaption');
  if (heroCaption) heroCaption.textContent = textOrEmpty(content.heroCaption);

  const deadline = textOrEmpty(content.rsvpDeadline);
  const deadlineElement = document.querySelector('[data-content="rsvpDeadline"]');
  if (deadlineElement) deadlineElement.textContent = formatFrenchDate(deadline) || deadline;

  renderEvents(content.events);
  renderGallery(content.galleryImages);

  window.dispatchEvent(new CustomEvent('wedding:content-loaded', { detail: { weddingDate } }));
}
