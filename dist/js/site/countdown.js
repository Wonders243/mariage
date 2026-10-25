const initialWeddingDate = '2027-01-16';

export function initCountdown() {
  let weddingDate = new Date(`${initialWeddingDate}T00:00:00`);
  const daysDisplay = document.querySelector('[data-unit="days"]');
  const countdown = document.querySelector('.countdown');
  const countdownTitle = document.querySelector('#countdown-title');

  const update = () => {
    if (!daysDisplay || !countdown || !countdownTitle) return;

    const remaining = weddingDate.getTime() - Date.now();
    if (remaining <= 0) {
      countdown.hidden = true;
      countdownTitle.textContent = 'C’est aujourd’hui !';
      return;
    }

    countdown.hidden = false;
    daysDisplay.textContent = String(Math.ceil(remaining / 86_400_000));
  };

  window.addEventListener('wedding:content-loaded', (event) => {
    const date = event.detail?.weddingDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;

    const updatedDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(updatedDate.getTime())) return;

    weddingDate = updatedDate;
    update();
  });

  update();
  window.setInterval(update, 60_000);
}
