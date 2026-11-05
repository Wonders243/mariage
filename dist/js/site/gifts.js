import { connectSupabase, isSupabaseConfigured } from '../shared/supabase-client.js';
import { hashInvitationCode } from '../shared/invitation-code.js';

const section = document.querySelector('#liste-mariage');
const navigationLink = document.querySelector('.nav-gifts');
const giftBrowser = document.querySelector('#gift-browser');
const giftGrid = document.querySelector('#gift-grid');
const giftStatus = document.querySelector('#gift-list-status');
const giftHint = document.querySelector('#gift-list-hint');
const giftPagination = document.querySelector('#gift-pagination');
const previousPageButton = document.querySelector('#gift-page-previous');
const nextPageButton = document.querySelector('#gift-page-next');
const pageIndicator = document.querySelector('#gift-page-indicator');
const giftDetail = document.querySelector('#gift-detail');
const giftDetailBack = document.querySelector('#gift-detail-back');
const giftDetailTitle = document.querySelector('#gift-detail-title');
const giftDetailAvailability = document.querySelector('#gift-detail-availability');
const giftDetailPrice = document.querySelector('#gift-detail-price');
const giftDetailDescription = document.querySelector('#gift-detail-description');
const giftDetailFeedback = document.querySelector('#gift-detail-feedback');
const giftDetailActions = document.querySelector('#gift-detail-actions');
const fundPanel = document.querySelector('#gift-fund');
const fundTitle = document.querySelector('#gift-fund-title');
const fundDescription = document.querySelector('#gift-fund-description');
const fundLink = document.querySelector('#gift-fund-link');

const reservationStoragePrefix = 'wedding-gift-reservation:';
const giftsPerPage = 10;
const defaultDocumentTitle = document.title;
const state = { supabase: null, code: '', codeHash: '', gifts: [], listPage: 1, focusGiftId: '', navigationReady: false };

const text = (value) => typeof value === 'string' ? value.trim() : '';
const setStatus = (message, isError = false) => {
  [giftStatus, giftDetailFeedback].forEach((element) => {
    if (!element) return;
    element.textContent = message;
    element.dataset.error = String(isError);
  });
};

const safeHttpsUrl = (value) => {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

const reservationStorageKey = (giftId) => reservationStoragePrefix + state.codeHash + ':' + giftId;
const readReservationToken = (giftId) => {
  try { return localStorage.getItem(reservationStorageKey(giftId)) || ''; } catch { return ''; }
};
const saveReservationToken = (giftId, token) => {
  try { localStorage.setItem(reservationStorageKey(giftId), token); } catch { /* The reservation still succeeds on the server. */ }
};
const clearReservationToken = (giftId) => {
  try { localStorage.removeItem(reservationStorageKey(giftId)); } catch { /* The reservation still remains anonymous. */ }
};

const errorMessage = (code) => ({
  gift_already_reserved: 'Quelqu’un vient de choisir ce cadeau. La liste a été actualisée.',
  gift_unavailable: 'Ce cadeau n’est plus disponible.',
  gift_list_not_ready: 'La liste de mariage doit encore être préparée dans Supabase.',
  reservation_not_found: 'Cette réservation n’est plus active. La liste a été actualisée.',
  invalid_reservation: 'Cette réservation ne peut pas être annulée depuis ce navigateur.'
}[code] || 'Une erreur est survenue. Réessaie dans un instant.');

async function callGiftAction(body) {
  const { data, error } = await state.supabase.functions.invoke('wedding-rsvp', { body });
  if (error) {
    if (error.context?.status === 429) throw new Error('Trop de demandes. Réessaie dans quelques minutes.');
    if (error.context?.status >= 500) throw new Error('La liste de mariage n’est pas disponible pour le moment.');
    throw new Error('Le service de la liste n’est pas disponible pour le moment.');
  }
  if (!data?.ok) throw new Error(errorMessage(data?.error));
  return data;
}

function formatPrice(priceCents) {
  if (!Number.isInteger(priceCents) || priceCents < 0) return '';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(priceCents / 100);
}

function createGiftActions(gift) {
  const actions = document.createElement('div');
  actions.className = 'gift-card__actions';
  const productUrl = safeHttpsUrl(gift.product_url);
  if (productUrl) {
    const productLink = document.createElement('a');
    productLink.className = 'gift-card__link';
    productLink.href = productUrl;
    productLink.target = '_blank';
    productLink.rel = 'noreferrer';
    productLink.textContent = 'Voir le cadeau';
    actions.append(productLink);
  }

  const token = readReservationToken(gift.id);
  if (gift.reserved) {
    if (token) {
      const cancel = document.createElement('button');
      cancel.className = 'gift-card__cancel';
      cancel.type = 'button';
      cancel.textContent = 'Annuler mon choix';
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        setStatus('Annulation de la réservation…');
        try {
          await callGiftAction({ action: 'cancel_gift', code: state.code, giftId: gift.id, reservationToken: token });
          clearReservationToken(gift.id);
          await refreshGiftList();
          setStatus('Ton choix a été annulé.');
        } catch (error) {
          if (error.message.includes('n’est plus active')) clearReservationToken(gift.id);
          setStatus(error.message, true);
          await refreshGiftList();
        }
      });
      actions.append(cancel);
    }
  } else {
    const reserve = document.createElement('button');
    reserve.className = 'button button--dark';
    reserve.type = 'button';
    reserve.textContent = 'Je choisis ce cadeau';
    reserve.addEventListener('click', async () => {
      reserve.disabled = true;
      reserve.textContent = 'Enregistrement…';
      setStatus('Enregistrement de ton choix…');
      try {
        const result = await callGiftAction({ action: 'reserve_gift', code: state.code, giftId: gift.id });
        saveReservationToken(gift.id, result.reservationToken);
        await refreshGiftList();
        setStatus('C’est réservé. Ton nom ne sera pas affiché.');
      } catch (error) {
        setStatus(error.message, true);
        await refreshGiftList();
      }
    });
    actions.append(reserve);
  }

  return actions;
}

function renderGiftList() {
  if (!giftGrid) return;
  if (giftHint) giftHint.hidden = !state.gifts.length;
  const pageCount = Math.max(1, Math.ceil(state.gifts.length / giftsPerPage));
  state.listPage = Math.min(Math.max(1, state.listPage), pageCount);
  const firstGiftIndex = (state.listPage - 1) * giftsPerPage;
  const visibleGifts = state.gifts.slice(firstGiftIndex, firstGiftIndex + giftsPerPage);
  const fragment = document.createDocumentFragment();

  visibleGifts.forEach((gift) => {
    const article = document.createElement('article');
    article.className = 'gift-card';
    const button = document.createElement('a');
    button.className = 'gift-card__open';
    button.href = `#cadeau/${encodeURIComponent(gift.id)}`;
    button.dataset.giftId = String(gift.id);
    const title = document.createElement('span');
    title.className = 'gift-card__title';
    title.textContent = text(gift.title) || 'Cadeau';
    const badge = document.createElement('span');
    badge.className = 'gift-card__status' + (gift.reserved ? ' is-reserved' : '');
    badge.textContent = gift.reserved ? 'Déjà choisi' : 'Disponible';
    button.setAttribute('aria-label', `Voir les détails de ${title.textContent}`);
    button.append(title, badge);

    const price = formatPrice(gift.price_cents);
    if (price) {
      const priceElement = document.createElement('span');
      priceElement.className = 'gift-card__price';
      priceElement.textContent = price;
      button.append(priceElement);
    }
    button.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openGift(gift.id);
    });
    article.append(button);
    fragment.append(article);
  });

  giftGrid.replaceChildren(fragment);
  renderGiftPagination(pageCount, firstGiftIndex, visibleGifts.length);
}

function renderGiftPagination(pageCount, firstGiftIndex, visibleCount) {
  if (!giftPagination || !previousPageButton || !nextPageButton || !pageIndicator) return;
  giftPagination.hidden = pageCount <= 1;
  previousPageButton.disabled = state.listPage <= 1;
  nextPageButton.disabled = state.listPage >= pageCount;
  pageIndicator.textContent = state.gifts.length
    ? `Page ${state.listPage} sur ${pageCount} · cadeaux ${firstGiftIndex + 1}–${firstGiftIndex + visibleCount} sur ${state.gifts.length}`
    : '';
}

function renderGiftDetail(gift, focus = false) {
  if (!giftDetail) return;
  const title = text(gift.title) || 'Cadeau';
  if (focus && giftDetailFeedback) {
    giftDetailFeedback.textContent = '';
    giftDetailFeedback.dataset.error = 'false';
  }
  giftDetailTitle.textContent = title;
  giftDetailAvailability.className = 'gift-card__status' + (gift.reserved ? ' is-reserved' : '');
  giftDetailAvailability.textContent = gift.reserved ? 'Déjà choisi' : 'Disponible';
  const price = formatPrice(gift.price_cents);
  giftDetailPrice.textContent = price;
  giftDetailPrice.hidden = !price;
  const description = text(gift.description);
  giftDetailDescription.textContent = description;
  giftDetailDescription.hidden = !description;
  giftDetailActions.replaceChildren(createGiftActions(gift));
  giftDetail.hidden = false;
  if (giftBrowser) giftBrowser.hidden = true;
  document.title = `${title} — La liste de mariage | Merveilles & Megan`;

  if (focus) {
    giftDetailTitle.focus({ preventScroll: true });
    giftDetail.scrollIntoView({ block: 'start' });
  }
}

function renderCurrentGiftView({ focus = false, restoreFocus = false } = {}) {
  const match = window.location.hash.match(/^#cadeau\/(.+)$/);
  let giftId = '';
  if (match) {
    try { giftId = decodeURIComponent(match[1]); } catch { giftId = ''; }
  }
  const gift = state.gifts.find((item) => String(item.id) === giftId);
  if (gift) {
    renderGiftDetail(gift, focus);
    return;
  }

  if (giftDetail) giftDetail.hidden = true;
  if (giftBrowser) giftBrowser.hidden = false;
  document.title = defaultDocumentTitle;
  renderGiftList();

  if (restoreFocus && state.focusGiftId) {
    const button = [...giftGrid.querySelectorAll('[data-gift-id]')]
      .find((item) => item.dataset.giftId === state.focusGiftId);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest' });
    state.focusGiftId = '';
  }
}

function openGift(giftId) {
  state.focusGiftId = String(giftId);
  window.history.pushState({ giftDetailRoute: true }, '', `#cadeau/${encodeURIComponent(giftId)}`);
  renderCurrentGiftView({ focus: true });
}

function returnToGiftList() {
  if (window.history.state?.giftDetailRoute) {
    window.history.back();
    return;
  }
  window.history.replaceState({ giftListRoute: true }, '', '#liste-mariage');
  renderCurrentGiftView({ restoreFocus: true });
}

let routeRenderScheduled = false;
let restoreGiftFocus = false;
function scheduleGiftRouteRender(restoreFocus = false) {
  restoreGiftFocus ||= restoreFocus;
  if (routeRenderScheduled) return;
  routeRenderScheduled = true;
  requestAnimationFrame(() => {
    routeRenderScheduled = false;
    renderCurrentGiftView({ restoreFocus: restoreGiftFocus });
    restoreGiftFocus = false;
  });
}

function initializeGiftNavigation() {
  if (state.navigationReady) return;
  previousPageButton?.addEventListener('click', () => {
    state.listPage -= 1;
    renderGiftList();
    giftBrowser?.scrollIntoView({ block: 'start' });
  });
  nextPageButton?.addEventListener('click', () => {
    state.listPage += 1;
    renderGiftList();
    giftBrowser?.scrollIntoView({ block: 'start' });
  });
  giftDetailBack?.addEventListener('click', returnToGiftList);
  window.addEventListener('popstate', () => scheduleGiftRouteRender(true));
  window.addEventListener('hashchange', () => scheduleGiftRouteRender());
  state.navigationReady = true;
}

async function refreshGiftList() {
  if (!state.supabase || !state.code) return;
  try {
    const data = await callGiftAction({ action: 'site_data', code: state.code });
    state.gifts = Array.isArray(data.gifts) ? data.gifts : [];
    renderCurrentGiftView();
    if (!data.giftsAvailable) setStatus('La liste de cadeaux sera bientôt disponible.');
    else if (!state.gifts.length) setStatus('La liste de cadeaux sera bientôt disponible.');
  } catch (error) {
    setStatus(error.message, true);
  }
}

export async function initGifts(siteData) {
  if (!section || !navigationLink) return;
  const isGuest = siteData?.role === 'guest' && typeof siteData.code === 'string';
  section.hidden = !isGuest;
  navigationLink.hidden = !isGuest;
  if (!isGuest) return;
  initializeGiftNavigation();

  const fundUrl = safeHttpsUrl(siteData.content?.giftFundUrl);
  if (fundUrl && fundPanel && fundLink) {
    fundTitle.textContent = text(siteData.content?.giftFundTitle) || 'La cagnotte';
    fundDescription.textContent = text(siteData.content?.giftFundDescription) || 'Si tu préfères, tu peux aussi participer librement à notre cagnotte.';
    fundLink.href = fundUrl;
    fundPanel.hidden = false;
  } else if (fundPanel) {
    fundPanel.hidden = true;
  }

  if (!isSupabaseConfigured) {
    setStatus('La liste de cadeaux n’est pas encore disponible.', true);
    return;
  }

  try {
    state.supabase = await connectSupabase();
    state.code = siteData.code;
    state.codeHash = await hashInvitationCode(state.code);
    state.gifts = Array.isArray(siteData.gifts) ? siteData.gifts : [];
    renderCurrentGiftView({ focus: true });
    if (!siteData.giftsAvailable || !state.gifts.length) setStatus('La liste de cadeaux sera bientôt disponible.');
    else setStatus('Chaque cadeau ne peut être choisi qu’une fois. Les choix restent anonymes.');
  } catch {
    setStatus('La liste de cadeaux n’est pas disponible pour le moment.', true);
  }
}

