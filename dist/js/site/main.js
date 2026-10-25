import { initCountdown } from './countdown.js';
import { loadSiteContent } from './content.js';
import { initNavigation } from './navigation.js';
import { initScrollReveals } from './reveal.js';
import { initRsvp } from './rsvp.js';

initNavigation();
initScrollReveals();
initCountdown();
document.querySelector('#site-lock')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Fermeture…';
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  window.location.replace('/access.html');
});
const siteData = await loadSiteContent();
initRsvp(siteData);
