import { api } from '../api.js';
import { h, mount, field, input, showFieldErrors } from '../ui.js';

function shell(title, sub, body) {
  return h('div', { class: 'auth' }, h('div', {}, h('div', { class: 'brand' }, h('span', { class: 'mark' }, 'N'), 'Nexus Logic'),
    h('div', { class: 'card auth-card' }, h('h1', {}, title), h('p', { class: 'muted', style: { margin: '4px 0 18px' } }, sub), body)));
}

export function renderLogin(root, onDone) {
  const email = field('Email', input({ type: 'email', autocomplete: 'username', required: true }));
  const pw = field('Password', input({ type: 'password', autocomplete: 'current-password', required: true }));
  const err = h('div', { class: 'alert bad hidden', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit', style: { width: '100%' } }, 'Sign in');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.classList.add('hidden'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { await api.post('/auth/login', { email: email.querySelector('input').value.trim(), password: pw.querySelector('input').value }, { quiet401: true }); await onDone(); }
    catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Sign in'; }
  } }, email, pw, err, btn);
  mount(root, shell('Sign in', 'Agency workspace for enquiries, consultations and follow-ups.', form));
}

export function renderAcceptInvite(root, token, onDone) {
  if (!token) return mount(root, shell('Invitation link incomplete', 'Open the full link from your invitation message.', h('a', { href: '#/' }, 'Back to sign in')));
  const pw = field('Choose a password', input({ type: 'password', autocomplete: 'new-password', minlength: 10, required: true }), 'At least 10 characters. A passphrase of a few words works well.');
  const pw2 = field('Confirm password', input({ type: 'password', autocomplete: 'new-password', required: true }));
  const err = h('div', { class: 'alert bad hidden', role: 'alert' });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.classList.add('hidden'); showFieldErrors(null, { password: pw });
    const a = pw.querySelector('input').value, b = pw2.querySelector('input').value;
    if (a !== b) { pw2.setError('Passwords do not match'); return; }
    try { await api.post('/auth/accept-invite', { token, password: a }, { quiet401: true }); location.hash = '#/overview'; await onDone(); }
    catch (ex) { if (!showFieldErrors(ex, { password: pw })) { err.textContent = ex.message; err.classList.remove('hidden'); } }
  } }, pw, pw2, err, h('button', { class: 'btn primary', type: 'submit' }, 'Set password and continue'));
  mount(root, shell('Welcome to Nexus Logic', 'Set a password to activate your account.', form));
}
