import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, fmtDateTime, select, input, field, modal, toast, toastError, localInputToIso, isoToLocalInput, showFieldErrors } from '../ui.js';
import { openLead } from '../components/lead-drawer.js';

export default async function followups(root, ctx) {
  let tab = 'open'; const host = h('div', {});
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['open', 'Open'], ['overdue', 'Overdue'], ['done', 'Completed']].map(([k, t]) => h('button', { role: 'tab', class: k === tab ? 'active' : '', 'data-tab': k, onclick: (e) => { tab = k; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); load(); } }, t)));
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Follow-ups'), h('p', {}, 'Tasks that keep serious prospects moving.')), h('button', { class: 'btn primary', onclick: addTask }, '+ New follow-up')), tabs, h('div', { class: 'card' }, host));

  async function load() {
    mount(host, loading());
    try {
      const qs = tab === 'overdue' ? '?overdue=1' : tab === 'done' ? '?status=done' : '?status=open';
      const { items } = await api.get('/app/tasks' + qs);
      if (!items.length) return mount(host, empty(tab === 'done' ? 'Nothing completed yet' : tab === 'overdue' ? 'No overdue follow-ups' : 'No open follow-ups', tab === 'open' ? 'Create one from a lead or conversation, or use “New follow-up”.' : undefined));
      mount(host, h('div', { class: 'table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Task', 'Lead', 'Owner', 'Due', 'Priority', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, items.map((t) => h('tr', {}, h('td', {}, h('strong', {}, t.title), h('div', { class: 'small muted' }, t.origin === 'handoff' ? 'Created by a human-handoff' : t.origin === 'manual' ? '' : t.origin)),
          h('td', {}, t.lead_id ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); openLead(t.lead_id, load); } }, t.lead_name || 'Open lead') : h('span', { class: 'faint' }, '—')),
          h('td', {}, t.owner_name || h('span', { class: 'faint' }, 'Unassigned')), h('td', { class: 'nowrap' }, fmtDateTime(t.due_at), t.overdue ? [' ', badge('overdue', 'Overdue')] : ''), h('td', {}, badge(t.priority)),
          h('td', { class: 'nowrap' }, t.status === 'open' ? h('button', { class: 'btn sm', onclick: async () => { try { await api.patch(`/app/tasks/${t.id}`, { status: 'done' }); toast('Marked done', 'ok'); load(); ctx.refreshBadges(); } catch (e) { toastError(e); } } }, 'Mark done') : h('button', { class: 'btn sm ghost', onclick: async () => { try { await api.patch(`/app/tasks/${t.id}`, { status: 'open' }); load(); } catch (e) { toastError(e); } } }, 'Reopen'))))))));
    } catch (e) { mount(host, errorState(e, load)); }
  }

  function addTask() {
    const team = select([['', 'Me']], '');
    api.get('/app/team').then((r) => mount(team, [h('option', { value: '' }, 'Me'), ...r.items.filter((m) => m.active).map((m) => h('option', { value: m.id }, m.name))])).catch(() => {});
    const f = { title: field('What needs to happen?', input({ maxlength: 200, required: true })), dueAt: field('Due', input({ type: 'datetime-local', value: isoToLocalInput(new Date(Date.now() + 24 * 3600e3).toISOString()) })), priority: field('Priority', select([['normal', 'Normal'], ['high', 'High'], ['low', 'Low']], 'normal')), ownerId: field('Owner', team) };
    modal({ title: 'New follow-up', body: h('div', { class: 'form-grid' }, h('div', { class: 'full' }, f.title), f.dueAt, f.priority, h('div', { class: 'full' }, f.ownerId)), actions: [
      { label: 'Cancel', close: true },
      { label: 'Create', kind: 'primary', run: async (m) => {
        const v = (k) => f[k].querySelector('input,select').value;
        try { await api.post('/app/tasks', { title: v('title').trim(), dueAt: localInputToIso(v('dueAt')), priority: v('priority'), ownerId: v('ownerId') || undefined }); toast('Follow-up created', 'ok'); m.close(); load(); ctx.refreshBadges(); }
        catch (e) { if (!showFieldErrors(e, f)) toastError(e); }
      } }] });
  }
  load();
}
