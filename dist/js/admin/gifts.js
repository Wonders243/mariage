const giftForm = document.querySelector('#gift-create-form');
const giftList = document.querySelector('#gift-admin-list');
const giftListStatus = document.querySelector('#gift-list-admin-status');
const fundForm = document.querySelector('#gift-fund-form');
const fundTitleInput = document.querySelector('#gift-fund-title-input');
const fundDescriptionInput = document.querySelector('#gift-fund-description-input');
const fundUrlInput = document.querySelector('#gift-fund-url-input');
const fundStatus = document.querySelector('#gift-fund-status');

let initialized = false;
let giftSupabase;
let getCurrentContent;
let setCurrentContent;
let currentGifts = [];
let reservationsByGiftId = new Map();

const setStatus = (element, message, isError = false) => {
  if (!element) return;
  element.textContent = message;
  element.dataset.error = String(isError);
};

const parsePrice = (value) => {
  const trimmed = String(value || '').trim().replace(',', '.');
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return undefined;
  return Math.round(amount * 100);
};

const normalizeHttpsUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

const formatPrice = (priceCents) => Number.isInteger(priceCents)
  ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(priceCents / 100)
  : '';

function renderGifts() {
  if (!giftList) return;
  const fragment = document.createDocumentFragment();

  currentGifts.forEach((gift) => {
    const reservedAt = reservationsByGiftId.get(gift.id);
    const article = document.createElement('article');
    article.className = 'admin-gift';

    const heading = document.createElement('div');
    heading.className = 'admin-gift__heading';
    const headingText = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = gift.title;
    const status = document.createElement('p');
    status.className = 'admin-gift__status' + (reservedAt ? ' is-reserved' : '');
    status.textContent = reservedAt ? 'Réservé anonymement' : 'Pas encore choisi';
    headingText.append(title, status);

    const activeLabel = document.createElement('label');
    activeLabel.className = 'admin-gift__active';
    const activeInput = document.createElement('input');
    activeInput.type = 'checkbox';
    activeInput.checked = gift.is_active;
    const activeText = document.createElement('span');
    activeText.textContent = 'Visible';
    activeLabel.append(activeInput, activeText);
    heading.append(headingText, activeLabel);

    const fields = document.createElement('div');
    fields.className = 'admin-gift__fields';
    const titleLabel = document.createElement('label');
    titleLabel.className = 'admin-field';
    const titleCaption = document.createElement('span');
    titleCaption.textContent = 'Nom du cadeau';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.maxLength = 120;
    titleInput.value = gift.title;
    titleLabel.append(titleCaption, titleInput);

    const descriptionLabel = document.createElement('label');
    descriptionLabel.className = 'admin-field admin-field--full';
    const descriptionCaption = document.createElement('span');
    descriptionCaption.textContent = 'Description';
    const descriptionInput = document.createElement('textarea');
    descriptionInput.rows = 2;
    descriptionInput.maxLength = 800;
    descriptionInput.value = gift.description || '';
    descriptionLabel.append(descriptionCaption, descriptionInput);

    const priceLabel = document.createElement('label');
    priceLabel.className = 'admin-field';
    const priceCaption = document.createElement('span');
    priceCaption.textContent = 'Prix indicatif';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.inputMode = 'decimal';
    priceInput.value = formatPrice(gift.price_cents).replace(/[^0-9,.]/g, '').replace(',', '.');
    priceLabel.append(priceCaption, priceInput);

    const urlLabel = document.createElement('label');
    urlLabel.className = 'admin-field';
    const urlCaption = document.createElement('span');
    urlCaption.textContent = 'Lien HTTPS du cadeau';
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.inputMode = 'url';
    urlInput.value = gift.product_url || '';
    urlInput.placeholder = 'https://…';
    urlLabel.append(urlCaption, urlInput);
    fields.append(titleLabel, priceLabel, descriptionLabel, urlLabel);

    const actions = document.createElement('div');
    actions.className = 'admin-gift__actions';
    const saveButton = document.createElement('button');
    saveButton.className = 'admin-secondary-button';
    saveButton.type = 'button';
    saveButton.textContent = 'Enregistrer';
    saveButton.addEventListener('click', async () => {
      const titleValue = titleInput.value.trim();
      const descriptionValue = descriptionInput.value.trim();
      const priceCents = parsePrice(priceInput.value);
      const productUrl = normalizeHttpsUrl(urlInput.value);
      if (!titleValue || titleValue.length > 120) {
        setStatus(giftListStatus, 'Le nom du cadeau doit contenir de 1 à 120 caractères.', true);
        return;
      }
      if (descriptionValue.length > 800 || priceCents === undefined) {
        setStatus(giftListStatus, 'Vérifie la description et le prix indicatif.', true);
        return;
      }
      if (urlInput.value.trim() && !productUrl) {
        setStatus(giftListStatus, 'Le lien du cadeau doit commencer par https://.', true);
        return;
      }

      saveButton.disabled = true;
      setStatus(giftListStatus, 'Enregistrement du cadeau…');
      try {
        const { error } = await giftSupabase.from('wedding_gifts').update({
          title: titleValue,
          description: descriptionValue,
          price_cents: priceCents,
          product_url: productUrl,
          is_active: activeInput.checked,
          updated_at: new Date().toISOString()
        }).eq('id', gift.id);
        if (error) throw error;
        setStatus(giftListStatus, 'Le cadeau a été enregistré.');
        await loadGifts();
      } catch (error) {
        setStatus(giftListStatus, error.message || 'Le cadeau n’a pas pu être enregistré.', true);
      } finally {
        saveButton.disabled = false;
      }
    });
    actions.append(saveButton);

    if (reservedAt) {
      const releaseButton = document.createElement('button');
      releaseButton.className = 'admin-quiet-button';
      releaseButton.type = 'button';
      releaseButton.textContent = 'Rendre disponible';
      releaseButton.addEventListener('click', async () => {
        if (!window.confirm('Rendre ce cadeau disponible à nouveau ? Le nom de la personne qui l’avait choisi reste inconnu.')) return;
        releaseButton.disabled = true;
        try {
          const { error } = await giftSupabase.from('wedding_gift_reservations').delete().eq('gift_id', gift.id);
          if (error) throw error;
          setStatus(giftListStatus, 'Le cadeau est de nouveau disponible.');
          await loadGifts();
        } catch (error) {
          setStatus(giftListStatus, error.message || 'La réservation n’a pas pu être supprimée.', true);
          releaseButton.disabled = false;
        }
      });
      actions.append(releaseButton);
    }

    const deleteButton = document.createElement('button');
    deleteButton.className = 'admin-quiet-button admin-gift__delete';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Supprimer';
    deleteButton.addEventListener('click', async () => {
      const warning = reservedAt
        ? 'Supprimer ce cadeau et libérer sa réservation anonyme ?'
        : 'Supprimer ce cadeau de la liste ?';
      if (!window.confirm(warning)) return;
      deleteButton.disabled = true;
      try {
        const { error } = await giftSupabase.from('wedding_gifts').delete().eq('id', gift.id);
        if (error) throw error;
        setStatus(giftListStatus, 'Le cadeau a été supprimé.');
        await loadGifts();
      } catch (error) {
        setStatus(giftListStatus, error.message || 'Le cadeau n’a pas pu être supprimé.', true);
        deleteButton.disabled = false;
      }
    });
    actions.append(deleteButton);

    article.append(heading, fields, actions);
    fragment.append(article);
  });

  giftList.replaceChildren(fragment);
  document.querySelector('#gift-count').textContent = String(currentGifts.length);
  if (!currentGifts.length) setStatus(giftListStatus, 'Ajoute les cadeaux que les invités pourront choisir.');
}

async function loadGifts() {
  if (!giftSupabase) return;
  setStatus(giftListStatus, 'Chargement de la liste…');
  const { data: gifts, error: giftsError } = await giftSupabase
    .from('wedding_gifts')
    .select('id, title, description, price_cents, product_url, sort_order, is_active, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (giftsError) {
    currentGifts = [];
    giftList.replaceChildren();
    document.querySelector('#gift-count').textContent = '0';
    const missingTable = giftsError.code === '42P01' || giftsError.code === 'PGRST205';
    setStatus(giftListStatus, missingTable
      ? 'Prépare la liste dans Supabase en exécutant supabase/wedding-gifts-setup.sql.'
      : 'Impossible de charger les cadeaux. Vérifie les droits admin du script SQL.', true);
    return;
  }

  const { data: reservations, error: reservationsError } = await giftSupabase
    .from('wedding_gift_reservations')
    .select('gift_id, reserved_at');
  if (reservationsError) {
    currentGifts = [];
    giftList.replaceChildren();
    const missingTable = reservationsError.code === '42P01' || reservationsError.code === 'PGRST205';
    setStatus(giftListStatus, missingTable
      ? 'Prépare la liste dans Supabase en exécutant supabase/wedding-gifts-setup.sql.'
      : 'Impossible de charger les réservations anonymes. Vérifie les droits admin du script SQL.', true);
    return;
  }

  currentGifts = Array.isArray(gifts) ? gifts : [];
  reservationsByGiftId = new Map((reservations || []).map((reservation) => [reservation.gift_id, reservation.reserved_at]));
  renderGifts();
  if (currentGifts.length) setStatus(giftListStatus, 'Les invités ne verront jamais le nom des personnes qui choisissent un cadeau.');
}

export async function initGiftAdminPanel({ supabase, getContent, setContent }) {
  if (initialized || !giftForm || !supabase) return;
  initialized = true;
  giftSupabase = supabase;
  getCurrentContent = getContent;
  setCurrentContent = setContent;

  const content = getCurrentContent() || {};
  fundTitleInput.value = content.giftFundTitle || '';
  fundDescriptionInput.value = content.giftFundDescription || '';
  fundUrlInput.value = content.giftFundUrl || '';

  fundForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const urlValue = fundUrlInput.value.trim();
    const fundUrl = normalizeHttpsUrl(urlValue);
    if (urlValue && !fundUrl) {
      setStatus(fundStatus, 'Le lien doit commencer par https://.', true);
      return;
    }

    const saveButton = document.querySelector('#save-gift-fund');
    saveButton.disabled = true;
    setStatus(fundStatus, 'Enregistrement du lien…');
    try {
      const nextContent = {
        ...(getCurrentContent() || {}),
        giftFundTitle: fundTitleInput.value.trim(),
        giftFundDescription: fundDescriptionInput.value.trim(),
        giftFundUrl: fundUrl
      };
      const { error } = await giftSupabase.from('wedding_site_content')
        .update({ content: nextContent, updated_at: new Date().toISOString() })
        .eq('id', 'main')
        .select('id')
        .single();
      if (error) throw error;
      setCurrentContent(nextContent);
      setStatus(fundStatus, fundUrl ? 'Le lien de cagnotte est enregistré.' : 'Le lien a été retiré.');
    } catch (error) {
      setStatus(fundStatus, error.message || 'Le lien de cagnotte n’a pas pu être enregistré.', true);
    } finally {
      saveButton.disabled = false;
    }
  });

  giftForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.querySelector('#gift-title-input').value.trim();
    const description = document.querySelector('#gift-description-input').value.trim();
    const priceCents = parsePrice(document.querySelector('#gift-price-input').value);
    const productUrlInput = document.querySelector('#gift-product-url-input');
    const productUrl = normalizeHttpsUrl(productUrlInput.value);
    if (!title || title.length > 120) {
      setStatus(giftListStatus, 'Le nom du cadeau doit contenir de 1 à 120 caractères.', true);
      return;
    }
    if (description.length > 800 || priceCents === undefined) {
      setStatus(giftListStatus, 'Vérifie la description et le prix indicatif.', true);
      return;
    }
    if (productUrlInput.value.trim() && !productUrl) {
      setStatus(giftListStatus, 'Le lien du cadeau doit commencer par https://.', true);
      return;
    }

    const createButton = document.querySelector('#create-gift');
    createButton.disabled = true;
    setStatus(giftListStatus, 'Ajout du cadeau…');
    try {
      const nextSort = currentGifts.reduce((maximum, gift) => Math.max(maximum, Number(gift.sort_order) || 0), -1) + 1;
      const { error } = await giftSupabase.from('wedding_gifts').insert({
        title,
        description,
        price_cents: priceCents,
        product_url: productUrl,
        sort_order: nextSort
      });
      if (error) throw error;
      giftForm.reset();
      setStatus(giftListStatus, 'Le cadeau a été ajouté à la liste.');
      await loadGifts();
    } catch (error) {
      setStatus(giftListStatus, error.message || 'Le cadeau n’a pas pu être ajouté.', true);
    } finally {
      createButton.disabled = false;
    }
  });

  document.querySelector('#refresh-gifts')?.addEventListener('click', loadGifts);
  await loadGifts();
}
