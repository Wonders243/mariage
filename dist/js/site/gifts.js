import { connectSupabase, isSupabaseConfigured } from '../shared/supabase-client.js';
import { hashInvitationCode } from '../shared/invitation-code.js';

const section = document.querySelector('#liste-mariage');
const navigationLink = document.querySelector('.nav-gifts');
const giftGrid = document.querySelector('#gift-grid');
const giftStatus = document.querySelector('#gift-list-status');
const fundPanel = document.querySelector('#gift-fund');
const fundTitle = document.querySelector('#gift-fund-title');
const fundDescription = document.querySelector('#gift-fund-description');
const fundLink = document.querySelector('#gift-fund-link');

const reservationStoragePrefix = 'wedding-gift-reservation:';
const state = { supabase: null, code: '', codeHash: '', gifts: [] };

const text = (value) => typeof value === 'string' ? value.trim() : '';
const setStatus = (message, isError = false) => {
  if (!giftStatus) return;
  giftStatus.textContent = message;
  giftStatus.dataset.error = String(isError);
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

function renderGifts() {
  if (!giftGrid) return;
  const fragment = document.createDocumentFragment();

  state.gifts.forEach((gift) => {
    const article = document.createElement('article');
    article.className = 'gift-card';

    const top = document.createElement('div');
    top.className = 'gift-card__top';
    const title = document.createElement('h3');
    title.textContent = text(gift.title) || 'Cadeau';
    const badge = document.createElement('span');
    badge.className = 'gift-card__status' + (gift.reserved ? ' is-reserved' : '');
    badge.textContent = gift.reserved ? 'Déjà choisi' : 'Disponible';
    top.append(title, badge);
    article.append(top);

    const description = text(gift.description);
    if (description) {
      const paragraph = document.createElement('p');
      paragraph.className = 'gift-card__description';
      paragraph.textContent = description;
      article.append(paragraph);
    }

    const price = formatPrice(gift.price_cents);
    if (price) {
      const priceElement = document.createElement('p');
      priceElement.className = 'gift-card__price';
      priceElement.textContent = price;
      article.append(priceElement);
    }

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

    article.append(actions);
    fragment.append(article);
  });

  giftGrid.replaceChildren(fragment);
}

async function refreshGiftList() {
  if (!state.supabase || !state.code) return;
  try {
    const data = await callGiftAction({ action: 'site_data', code: state.code });
    state.gifts = Array.isArray(data.gifts) ? data.gifts : [];
    renderGifts();
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
    renderGifts();
    if (!siteData.giftsAvailable || !state.gifts.length) setStatus('La liste de cadeaux sera bientôt disponible.');
    else setStatus('Chaque cadeau ne peut être choisi qu’une fois. Les choix restent anonymes.');
  } catch {
    setStatus('La liste de cadeaux n’est pas disponible pour le moment.', true);
  }
}
