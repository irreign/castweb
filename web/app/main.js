import { api } from './api.js';
import { h, mount, loading, errorState, toast, setTimezone } from './ui.js';
import { renderLogin, renderAcceptInvite } from './views/auth.js';

const ROUTES = [
  { path: 'overview', label: 'Overview', icon: '◧', load: () => import('./views/overview.js') },
  { path: 'leads', label: 'Leads', icon: '☰', load: () => import('./views/leads.js') },
  { path: 'conversations', label: 'Conversations', icon: '✉', load: () => import('./views/conversations.js'), badge: 'handoffs' },
  { path: 'bookings', label: 'Bookings', icon: '▦', load: () => import('./views/bookings.js') },
  { path: 'followups', label: 'Follow-ups', icon: '✓', load: () => import('./views/followups.js'), badge: 'overdue' },
  { path: 'knowledge', label: 'Knowledge Base', icon: '❏', load: () => import('./views/knowledge.js'), admin: true },
  { path: 'assistant', label: 'AI Assistant', icon: '✦', load: () => import('./views/assistant.js'), admin: true },
  { path: 'reports', label: 'Reports', icon: '▤', load: () => import('./views/reports.js'), admin: true },
  { path: 'settings', label: 'Settings', icon: '⚙', load: () => import('./views/settings.js'), admin: true },
];

export const state = { me: null };
let cleanup = null; let badgeTimer = null;

export function navigate(hash) { location.hash = hash; }
const parseHash = () => {
  const [pathPart, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...params] = pathPart.split('/').filter(Boolean);
  return { name, params, query: new URLSearchParams(query) };
};

async function boot() {
  window.addEventListener('hashchange', route);
  window.addEventListener('nl:unauthorized', () => { if (state.me) { state.me = null; toast('Your session has expired. Please sign in again.', 'bad'); } route(); });
  route();
}

async function route() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  clearInterval(badgeTimer);
  document.querySelectorAll('.drawer-overlay, .overlay').forEach((n) => n.remove()); // drawers/dialogs belong to the page being left
  const root = document.getElementById('root');
  const r = parseHash();
  if (r.name === 'accept-invite') return renderAcceptInvite(root, r.query.get('token') || '', async () => { state.me = null; navigate('#/overview'); });
  if (!state.me) {
    mount(root, loading('Loading…'));
    try { state.me = await api.get('/auth/me', { quiet401: true }); }
    catch (e) { if (e.status === 401) return renderLogin(root, async () => { state.me = null; route(); }); return mount(root, errorState(e, route)); }
  }
  setTimezone(state.me.tenant.timezone);
  const allowed = ROUTES.filter((x) => !x.admin || state.me.user.role !== 'consultant');
  const current = ROUTES.find((x) => x.path === r.name);
  if (!current) return navigate('#/overview');
  const shell = renderShell(allowed, current);
  mount(root, shell.el);
  if (current.admin && state.me.user.role === 'consultant') return mount(shell.content, errorState({ status: 403, message: 'Your role does not include this area. Ask an agency owner if you need access.' }));
  mount(shell.content, loading());
  try {
    const mod = await current.load();
    const page = h('div', { class: 'page' }); mount(shell.content, page);
    cleanup = (await mod.default(page, { me: state.me, params: r.params, query: r.query, navigate, refreshBadges })) || null;
  } catch (e) {
    mount(shell.content, errorState(e, route));
  }
  refreshBadges(); badgeTimer = setInterval(refreshBadges, 60000);
}

function renderShell(routes, current) {
  const me = state.me;
  const sidebar = h('nav', { class: 'sidebar', 'aria-label': 'Main' },
    h('div', { class: 'brand' }, h('span', { class: 'mark' }, 'N'), 'Nexus Logic'),
    h('div', { class: 'nav' }, routes.map((x) => h('a', { href: `#/${x.path}`, class: x.path === current.path ? 'active' : '', 'data-route': x.path, onclick: () => sidebar.classList.remove('open') },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, x.icon), x.label, x.badge && h('span', { class: 'count hidden', 'data-badge': x.badge })))),
    h('div', { class: 'foot' }, h('div', {}, me.user.name), h('div', {}, `${me.user.role === 'owner' ? 'Owner' : me.user.role === 'admin' ? 'Admin' : 'Consultant'} · ${me.tenant.name}`),
      h('button', { class: 'btn sm', style: { marginTop: '10px', width: '100%' }, onclick: async () => { try { await api.post('/auth/logout'); } finally { state.me = null; navigate('#/'); route(); } } }, 'Sign out')));
  const content = h('div', {});
  const el = h('div', {}, me.tenant.isDemo && h('div', { class: 'demo-banner', role: 'status' }, 'DEMO DATA — this agency contains sample records for demonstration. Nothing here is real production data.'),
    h('div', { class: 'shell' }, sidebar, h('div', { class: 'main' },
      h('header', { class: 'topbar' }, h('button', { class: 'btn ghost burger', 'aria-label': 'Open menu', onclick: () => sidebar.classList.toggle('open') }, '☰'), h('strong', {}, me.tenant.name), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, me.user.email)),
      content)));
  return { el, content };
}

async function refreshBadges() {
  try {
    const [tasks, convs] = await Promise.all([api.get('/app/tasks?overdue=1'), api.get('/app/conversations?status=handoff&pageSize=1')]);
    const set = (k, n) => { const b = document.querySelector(`[data-badge="${k}"]`); if (b) { b.textContent = String(n); b.classList.toggle('hidden', !n); } };
    set('overdue', tasks.items.length); set('handoffs', convs.total);
  } catch { /* badges are best effort */ }
}

boot();
