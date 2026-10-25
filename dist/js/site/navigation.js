export function initNavigation() {
  const page = document.documentElement;
  page.classList.add('js-enabled');

  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('#main-nav');
  const siteHeader = document.querySelector('.site-header');
  const menuLabel = navToggle?.querySelector('.nav-toggle__label');

  const setMenuOpen = (open) => {
    if (!navToggle || !mainNav) return;
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (menuLabel) menuLabel.textContent = open ? 'Fermer' : 'Menu';
    mainNav.classList.toggle('is-open', open);
  };

  navToggle?.addEventListener('click', () => {
    setMenuOpen(navToggle.getAttribute('aria-expanded') !== 'true');
  });

  mainNav?.querySelectorAll('a, button').forEach((item) => {
    item.addEventListener('click', () => setMenuOpen(false));
  });

  document.addEventListener('pointerdown', (event) => {
    if (mainNav?.classList.contains('is-open') && !siteHeader?.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navToggle?.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      navToggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 600) setMenuOpen(false);
  });
}
