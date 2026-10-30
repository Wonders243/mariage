import { initCountdown } from './countdown.js';
import { loadSiteContent } from './content.js';
import { initNavigation } from './navigation.js';
import { initScrollReveals } from './reveal.js';
import { initRsvp } from './rsvp.js';
import { initGifts } from './gifts.js';

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
await initGifts(siteData);

let lastContentRefresh = Date.now();
let contentRefreshInFlight = false;
const refreshContentWhenVisible = async () => {
  if (document.hidden || contentRefreshInFlight || Date.now() - lastContentRefresh < 2500) return;
  lastContentRefresh = Date.now();
  contentRefreshInFlight = true;
  try {
    const data = await loadSiteContent();
    await initGifts(data);
  } finally {
    contentRefreshInFlight = false;
  }
};

window.addEventListener('pageshow', refreshContentWhenVisible);
document.addEventListener('visibilitychange', refreshContentWhenVisible);
