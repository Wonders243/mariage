import { connectSupabase, isSupabaseConfigured } from './shared/supabase-client.js';
import { normalizeInvitationCode } from './shared/invitation-code.js';

const guestForm = document.querySelector('#guest-access-form');
const adminForm = document.querySelector('#admin-access-form');
const codeInput = document.querySelector('#invitation-code');
const guestStatus = document.querySelector('#guest-status');
const adminStatus = document.querySelector('#admin-status');
const guestSubmit = document.querySelector('#guest-submit');
const adminSubmit = document.querySelector('#admin-submit');

const setStatus = (element, message, isError = false) => {
  element.textContent = message;
  element.dataset.error = String(isError);
};

const tabs = [...document.querySelectorAll('.access-tab')];
const activateTab = (tab, focus = false) => {
  tabs.forEach((candidate) => {
    const active = candidate === tab;
    candidate.setAttribute('aria-selected', String(active));
    candidate.tabIndex = active ? 0 : -1;
    document.getElementById(candidate.getAttribute('aria-controls')).hidden = !active;
  });
  if (focus) tab.focus();
};

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activateTab(tabs[next], true);
  });
});

codeInput?.addEventListener('input', () => {
  const cleaned = normalizeInvitationCode(codeInput.value)
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '')
    .slice(0, 12);
  codeInput.value = cleaned.match(/.{1,4}/g)?.join('-') || '';
});

guestForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  guestSubmit.disabled = true;
  setStatus(guestStatus, 'Vérification du code…');

  try {
    const response = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mode: 'guest', code: normalizeInvitationCode(codeInput.value) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || 'Le code n’a pas pu être vérifié.');
    window.location.replace(result.redirect || '/');
  } catch (error) {
    setStatus(guestStatus, error.message || 'Le code n’a pas pu être vérifié. Réessaie.', true);
  } finally {
    guestSubmit.disabled = false;
  }
});

adminForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminSubmit.disabled = true;
  setStatus(adminStatus, 'Connexion en cours…');

  try {
    if (!isSupabaseConfigured) throw new Error('La connexion Supabase n’est pas configurée.');
    const supabase = await connectSupabase();
    const values = new FormData(adminForm);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(values.get('email') || '').trim(),
      password: String(values.get('password') || ''),
    });
    if (error || !data?.session?.access_token) throw new Error('Adresse e-mail ou mot de passe incorrect.');

    const response = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mode: 'admin', accessToken: data.session.access_token }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      await supabase.auth.signOut();
      throw new Error(result?.message || 'Ce compte ne peut pas ouvrir l’administration.');
    }
    window.location.replace(result.redirect || '/admin.html');
  } catch (error) {
    setStatus(adminStatus, error.message || 'La connexion n’a pas pu aboutir. Réessaie.', true);
  } finally {
    adminSubmit.disabled = false;
  }
});

const requestedMode = new URLSearchParams(window.location.search).get('mode');
if (requestedMode === 'admin') activateTab(document.querySelector('#tab-admin'));

fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
  .then((response) => response.json())
  .then(({ role }) => {
    if (role === 'admin') window.location.replace('/admin.html');
    else if (role === 'guest') window.location.replace('/');
  })
  .catch(() => {});
