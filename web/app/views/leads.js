import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, fmtDateTime, fmtRelative, phoneFmt, select, input, field, modal, toast, toastError, debounce, STATUS_LABEL, showFieldErrors } from '../ui.js';
import { openLead } from '../components/lead-drawer.js';

export default async function leads(root, ctx) {
  const q = { q: '', status: '', assigned: '', source: '', sort: 'created_at', order: 'desc', page: 1, pageSize: 25 };
  const tableHost = h('div', {});
  const search = input({ type: 'search', placeholder: 'Search name, phone, email…', 'aria-label': 'Search leads', oninput: debounce((e) => { q.q = e.target.value.trim(); q.page = 1; load(); }) });
  const status = select([['', 'All statuses'], ...Object.entries(STATUS_LABEL)], '', { 'aria-label': 'Status', onchange: (e) => { q.status = e.target.value; q.page = 1; load(); } });
  const assigned = select([['', 'Anyone'], ['me', 'Assigned to me'], ['unassigned', 'Unassigned']], '', { 'aria-label': 'Assignee', onchange: (e) => { q.assigned = e.target.value; q.page = 1; load(); } });
  const source = select([['', 'All sources'], ['web_chat', 'Website chat'], ['whatsapp', 'WhatsApp'], ['manual', 'Manual'], ['phone', 'Phone'], ['walk_in', 'Walk-in'], ['referral', 'Referral']], '', { 'aria-label': 'Source', onchange: (e) => { q.source = e.target.value; q.page = 1; load(); } });
  const sort = select([['created_at:desc', 'Newest first'], ['created_at:asc', 'Oldest first'], ['next_action_due:asc', 'Next action due soonest'], ['last_contacted_at:asc', 'Least recently contacted'], ['name:asc', 'Name A–Z']], 'created_at:desc', { 'aria-label': 'Sort', onchange: (e) => { [q.sort, q.order] = e.target.value.split(':'); load(); } });

  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Leads'), h('p', {}, 'Every enquiry, from first message to consultation.')), h('button', { class: 'btn primary', onclick: newLead }, '+ New lead')),
    h('div', { class: 'card' }, h('div', { class: 'toolbar' }, search, status, assigned, source, sort), tableHost));

  async function load() {
    mount(tableHost, loading());
    try {
      const r = await api.get('/app/leads' + api.qs(q));
      if (!r.items.length) return mount(tableHost, q.q || q.status || q.assigned || q.source ? empty('No leads match these filters', 'Try clearing a filter or search term.') : empty('No leads yet', 'Leads appear here when someone enquires through your website chat or WhatsApp — or add one yourself.', h('button', { class: 'btn primary', onclick: newLead }, '+ New lead')));
      const now = new Date().toISOString();
      mount(tableHost, h('div', { class: 'table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Name', 'Source', 'Status', 'Assigned', 'Last contact', 'Next action', 'Due'].map((x) => h('th', {}, x)))),
        h('tbody', {}, r.items.map((l) => h('tr', { class: 'click', tabindex: 0, onclick: () => openLead(l.id, load), onkeydown: (e) => e.key === 'Enter' && openLead(l.id, load) },
          h('td', {}, h('strong', {}, l.name || 'Unnamed'), h('div', { class: 'small muted' }, phoneFmt(l.phone) || l.email || '')),
          h('td', {}, l.source.replace(/_/g, ' ')), h('td', {}, badge(l.status)), h('td', {}, l.assigned_name || h('span', { class: 'faint' }, 'Unassigned')),
          h('td', {}, l.last_contacted_at ? fmtRelative(l.last_contacted_at) : h('span', { class: 'faint' }, 'Never')),
          h('td', {}, l.next_action || h('span', { class: 'faint' }, '—')),
          h('td', { class: 'nowrap' }, l.next_action_due ? [fmtDateTime(l.next_action_due), l.next_action_due < now && ' ', l.next_action_due < now && badge('overdue', 'Overdue')] : '—')))))),
        h('div', { class: 'pager' }, h('span', {}, `${(q.page - 1) * q.pageSize + 1}–${Math.min(q.page * q.pageSize, r.total)} of ${r.total}`),
          h('div', { class: 'row' }, h('button', { class: 'btn sm', disabled: q.page <= 1, onclick: () => { q.page--; load(); } }, '‹ Previous'), h('button', { class: 'btn sm', disabled: q.page * q.pageSize >= r.total, onclick: () => { q.page++; load(); } }, 'Next ›'))));
    } catch (e) { mount(tableHost, errorState(e, load)); }
  }

  function newLead() {
    const f = { name: field('Name', input({ required: true, maxlength: 120 })), phone: field('Phone', input({ type: 'tel', placeholder: '9123 4567' })), email: field('Email', input({ type: 'email' })),
      source: field('Source', select([['manual', 'Manual entry'], ['phone', 'Phone call'], ['walk_in', 'Walk-in'], ['referral', 'Referral']], 'manual')), notes: field('Note (optional)', h('textarea', { class: 'textarea', maxlength: 1000 })) };
    const val = (k) => f[k].querySelector('input,select,textarea').value.trim();
    modal({ title: 'New lead', body: h('div', { class: 'stack' }, h('div', { class: 'alert info small' }, 'Only add people who have asked to be contacted. Do not record NRIC/FIN or passport numbers.'), h('div', { class: 'form-grid' }, f.name, f.source, f.phone, f.email, h('div', { class: 'full' }, f.notes))), actions: [
      { label: 'Cancel', close: true },
      { label: 'Create lead', kind: 'primary', run: async (m) => {
        try { const l = await api.post('/app/leads', { name: val('name'), phone: val('phone') || undefined, email: val('email') || undefined, source: val('source'), notes: val('notes') || undefined }); toast('Lead saved', 'ok'); m.close(); load(); openLead(l.id, load); }
        catch (e) { if (!showFieldErrors(e, f)) toastError(e); }
      } }] });
  }
  load();
  if (ctx.params[0]) openLead(ctx.params[0], load);
}
