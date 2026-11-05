import { loadSiteContent } from './content.js';
import { initGifts } from './gifts.js';
import { initNavigation } from './navigation.js';

initNavigation();

document.querySelector('#site-lock')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Fermeture…';
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  window.location.replace('/access.html');
});

const siteData = await loadSiteContent();
if (!siteData || !['guest', 'admin'].includes(siteData.role)) {
  window.location.replace('/access.html');
} else {
  const adminLink = document.querySelector('#gifts-admin-link');
  if (adminLink) adminLink.hidden = siteData.role !== 'admin';
  await initGifts(siteData);
}
