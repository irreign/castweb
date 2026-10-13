'use strict';

// Live season countdown.
function startCountdowns() {
  const boxes = document.querySelectorAll('.countdown[data-ends]');
  if (!boxes.length) return;
  const tick = () => {
    const now = Date.now();
    boxes.forEach((box) => {
      const left = Math.max(0, Number(box.dataset.ends) - now);
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

// Keep the active tab visible when the tab bar scrolls sideways on phones.
function revealActiveTab() {
  const active = document.querySelector('.tabbar [aria-current="page"]');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// Close the language menu when tapping elsewhere.
function setupLangMenu() {
  const menu = document.querySelector('.lang-menu');
  if (!menu) return;
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
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

// Shrink screenshots in the browser before upload: phone screenshots are often several MB,
// and the server only accepts images under 1.8 MB. Also shows a preview.
const MAX_SIDE = 1600;

function shrinkImage(file) {
  return new Promise((resolve) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && file.size < 900000) return resolve(file);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function setupImageInputs() {
  document.querySelectorAll('input[type="file"][data-shrink-image]').forEach((input) => {
    const preview = input.parentElement.querySelector('.upload-preview');
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const smaller = await shrinkImage(file);
      if (smaller !== file && typeof DataTransfer === 'function') {
        const transfer = new DataTransfer();
        transfer.items.add(smaller);
        input.files = transfer.files;
      }
      if (preview) {
        preview.src = URL.createObjectURL(smaller);
        preview.hidden = false;
      }
    });
  });
}

// Show local times on hover for <time> elements.
function localiseTimes() {
  document.querySelectorAll('time[datetime]').forEach((el) => {
    const d = new Date(el.getAttribute('datetime'));
    if (!Number.isNaN(d.getTime())) el.title = d.toLocaleString(document.documentElement.lang || undefined);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  startCountdowns();
  revealActiveTab();
  setupLangMenu();
  setupConfirm();
  setupImageInputs();
  localiseTimes();
});
