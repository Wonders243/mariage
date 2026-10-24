(() => {
  const weddingDate = new Date('2027-01-16T15:30:00+01:00');
  const units = {
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]'),
  };
  const note = document.querySelector('[data-countdown-note]');

  const updateCountdown = () => {
    const remaining = weddingDate.getTime() - Date.now();

    if (remaining <= 0) {
      Object.values(units).forEach((element) => { element.textContent = '—'; });
      note.textContent = 'Le grand jour est arrivé.';
      return;
    }

    const seconds = Math.floor(remaining / 1000);
    units.days.textContent = String(Math.floor(seconds / 86_400)).padStart(2, '0');
    units.hours.textContent = String(Math.floor((seconds % 86_400) / 3_600)).padStart(2, '0');
    units.minutes.textContent = String(Math.floor((seconds % 3_600) / 60)).padStart(2, '0');
    units.seconds.textContent = String(seconds % 60).padStart(2, '0');
  };

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
})();
