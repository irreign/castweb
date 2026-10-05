'use strict';

// Live season countdown.
function startCountdowns() {
  const boxes = document.querySelectorAll('.countdown[data-ends]');
  if (!boxes.length) return;
  const tick = () => {
    const now = Date.now();
    boxes.forEach((box) => {
      let left = Math.max(0, Number(box.dataset.ends) - now);
      const parts = {
        days: Math.floor(left / 86400000),
        hours: Math.floor((left % 86400000) / 3600000),
        minutes: Math.floor((left % 3600000) / 60000),
        seconds: Math.floor((left % 60000) / 1000),
      };
      for (const [unit, value] of Object.entries(parts)) {
        const el = box.querySelector(`[data-unit="${unit}"]`);
        if (el) el.textContent = unit === 'days' ? String(value) : String(value).padStart(2, '0');
      }
    });
  };
  tick();
  setInterval(tick, 1000);
}

// Mobile navigation toggle.
function setupNav() {
  const button = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!button || !nav) return;
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });
}

// Confirmation prompts for destructive forms and buttons (inline handlers are blocked by the CSP).
function setupConfirm() {
  document.addEventListener('submit', (event) => {
    const form = event.target;
    const submitter = event.submitter;
    const message = (submitter && submitter.dataset.confirm) || form.dataset.confirm;
    if (message && !window.confirm(message)) event.preventDefault();
  });
}

// Show local times on hover for <time> elements.
function localiseTimes() {
  document.querySelectorAll('time[datetime]').forEach((el) => {
    const d = new Date(el.getAttribute('datetime'));
    if (!Number.isNaN(d.getTime())) el.title = d.toLocaleString();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  startCountdowns();
  setupNav();
  setupConfirm();
  localiseTimes();
});
