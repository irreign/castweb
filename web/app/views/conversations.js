import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, fmtDateTime, fmtRelative, phoneFmt, select, input, field, modal, toast, toastError, textarea, localInputToIso, isoToLocalInput, confirmDialog } from '../ui.js';
import { openLead } from '../components/lead-drawer.js';

const CH = { web: 'Website', whatsapp: 'WhatsApp', voice: 'Voice', staff: 'Test' };

export default async function conversations(root, ctx) {
  let selected = ctx.params[0] || null; const f = { status: '', channel: '', assigned: '' };
  const listHost = h('section', {}), threadHost = h('section', {}), sideHost = h('section', {});
  const filters = h('div', { class: 'toolbar' },
    select([['', 'All'], ['handoff', 'Needs a person'], ['open', 'Open'], ['resolved', 'Resolved']], '', { 'aria-label': 'Status', onchange: (e) => { f.status = e.target.value; loadList(); } }),
    select([['', 'All channels'], ['web', 'Website'], ['whatsapp', 'WhatsApp']], '', { 'aria-label': 'Channel', onchange: (e) => { f.channel = e.target.value; loadList(); } }),
    select([['', 'Anyone'], ['me', 'Mine'], ['unassigned', 'Unassigned']], '', { 'aria-label': 'Assignee', onchange: (e) => { f.assigned = e.target.value; loadList(); } }));
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Conversations'), h('p', {}, 'Chat and WhatsApp history with each prospect.'))), h('div', { class: 'card' }, filters, h('div', { class: 'split' }, listHost, threadHost, sideHost)));

  async function loadList(quiet) {
    if (!quiet) mount(listHost, loading());
    try {
      const r = await api.get('/app/conversations' + api.qs({ ...f, pageSize: 60 }));
      if (!r.items.length) return mount(listHost, empty('No conversations', 'They appear when a visitor chats on your site or messages your WhatsApp number.'));
      mount(listHost, r.items.map((c) => h('div', { class: `conv-item ${c.id === selected ? 'active' : ''}`, tabindex: 0, onclick: () => { selected = c.id; history.replaceState(null, '', `#/conversations/${c.id}`); loadList(true); loadThread(); }, onkeydown: (e) => e.key === 'Enter' && e.currentTarget.click() },
        h('div', { class: 'row spread' }, h('strong', {}, c.contact_name || phoneFmt(c.contact_phone) || 'Anonymous visitor'), h('span', { class: 'small faint' }, fmtRelative(c.last_message_at))),
        h('div', { class: 'small muted', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, c.last_message || '—'),
        h('div', { class: 'row', style: { marginTop: '4px' } }, badge('new', CH[c.channel] || c.channel), c.status !== 'open' && badge(c.status, c.status === 'handoff' ? 'Needs a person' : undefined), c.assigned_name && h('span', { class: 'small muted' }, c.assigned_name)))));
    } catch (e) { mount(listHost, errorState(e, loadList)); }
  }

  async function loadThread(quiet) {
    if (!selected) { mount(threadHost, empty('Select a conversation')); mount(sideHost, ''); return; }
    if (!quiet) { mount(threadHost, loading()); mount(sideHost, ''); }
    try { const d = await api.get(`/app/conversations/${selected}`); renderThread(d); renderSide(d); }
    catch (e) { mount(threadHost, errorState(e, loadThread)); }
  }

  function renderThread(d) {
    const msgs = h('div', { class: 'msgs', 'aria-live': 'polite' }, d.messages.length ? d.messages.map((m) => {
      const who = m.direction === 'internal' ? 'internal' : m.sender_type;
      return h('div', { class: `msg ${who}` }, m.body,
        who !== 'internal' && h('div', { class: 'meta' }, who === 'customer' ? 'Customer' : who === 'ai' ? 'Assistant' : who === 'staff' ? (m.sender_name || 'Staff') : 'System', ' · ', fmtDateTime(m.created_at),
          m.direction === 'outbound' && m.delivery_status !== 'n/a' && badge(m.delivery_status), m.delivery_status === 'failed' && h('span', { style: { color: 'var(--bad)' } }, m.error_detail || 'Delivery failed')),
        m.citations && m.citations.length > 0 && h('div', { class: 'cite' }, 'Source: ', m.citations.map((c) => c.title).join('; ')));
    }) : empty('No messages'));
    const box = textarea({ placeholder: d.conversation.channel === 'whatsapp' ? 'Reply on WhatsApp…' : 'Reply to the visitor…', rows: 2, 'aria-label': 'Reply', style: { minHeight: '44px' } });
    const send = async (template) => {
      if (!box.value.trim()) return;
      try { await api.post(`/app/conversations/${selected}/messages`, { text: box.value.trim(), template }); box.value = ''; toast('Sent', 'ok'); loadThread(true); loadList(true); }
      catch (e) {
        if (e.code === 'template_required') return templateDialog(box.value.trim());
        toastError(e); loadThread(true);
      }
    };
    const canReply = ['web', 'whatsapp'].includes(d.conversation.channel);
    mount(threadHost, h('div', { class: 'thread' }, msgs,
      canReply ? h('div', { class: 'composer' }, box, h('button', { class: 'btn primary', onclick: () => send() }, 'Send')) : h('div', { class: 'composer muted' }, 'Replies are not available on this channel.')));
    msgs.scrollTop = msgs.scrollHeight;
    function templateDialog(text) {
      const name = field('Approved template name', input({ placeholder: 'e.g. follow_up_v1' }), 'The 24-hour WhatsApp reply window has closed. Use a template approved in your WhatsApp Business account.');
      const param = field('Template variable {{1}} (optional)', input({ placeholder: 'Customer first name' }));
      modal({ title: 'Send a template message', body: h('div', { class: 'stack' }, name, param), actions: [{ label: 'Cancel', close: true }, { label: 'Send template', kind: 'primary', run: async (m) => {
        const n = name.querySelector('input').value.trim(); if (!n) return toast('Template name required', 'bad');
        const p = param.querySelector('input').value.trim();
        try { await api.post(`/app/conversations/${selected}/messages`, { text, template: { name: n, params: p ? [p] : undefined } }); box.value = ''; toast('Template sent', 'ok'); m.close(); loadThread(true); } catch (e) { toastError(e); }
      } }] });
    }
  }

  function renderSide(d) {
    const { conversation: c, contact, lead } = d;
    const sel = select([['', 'Unassigned']], c.assigned_to || '');
    api.get('/app/team').then((r) => mount(sel, [h('option', { value: '' }, 'Unassigned'), ...r.items.filter((m) => m.active).map((m) => h('option', { value: m.id, selected: m.id === c.assigned_to }, m.name))])).catch(() => {});
    sel.addEventListener('change', async () => { try { await api.post(`/app/conversations/${selected}/assign`, { userId: sel.value || null }); toast('Assigned', 'ok'); loadList(true); } catch (e) { toastError(e); } });
    mount(sideHost, h('div', { class: 'card-pad stack' },
      h('div', {}, h('div', { class: 'section-title' }, 'Contact'), contact ? h('div', {}, h('strong', {}, contact.name || 'Unnamed'), h('div', { class: 'muted' }, phoneFmt(contact.phone)), h('div', { class: 'muted' }, contact.email || '')) : h('p', { class: 'muted' }, 'Not identified yet — the visitor has not shared contact details.')),
      lead && h('div', {}, h('div', { class: 'section-title' }, 'Lead'), h('div', { class: 'row' }, badge(lead.status), h('button', { class: 'btn sm', onclick: () => openLead(lead.id, () => loadThread(true)) }, 'Open lead')), lead.summary && h('p', { class: 'small muted' }, lead.summary)),
      d.recommendation && h('div', { class: 'alert info small' }, h('strong', {}, 'Suggested next step: '), d.recommendation),
      h('div', {}, h('div', { class: 'section-title' }, 'Assigned consultant'), sel),
      h('div', { class: 'stack tight' },
        h('button', { class: 'btn', onclick: followUp }, 'Create follow-up'),
        c.status !== 'handoff' && h('button', { class: 'btn', onclick: async () => { try { await api.post(`/app/conversations/${selected}/handoff`, { reason: 'staff recorded' }); toast('Handoff recorded and follow-up created', 'ok'); loadThread(true); loadList(true); ctx.refreshBadges(); } catch (e) { toastError(e); } } }, 'Record handoff to a person'),
        c.status !== 'resolved' ? h('button', { class: 'btn', onclick: async () => { try { await api.post(`/app/conversations/${selected}/resolve`); toast('Marked resolved', 'ok'); loadThread(true); loadList(true); ctx.refreshBadges(); } catch (e) { toastError(e); } } }, 'Mark resolved') : badge('resolved'),
        ctx.me.user.role !== 'consultant' && h('button', { class: 'btn ghost sm', onclick: async () => { try { await api.post(`/app/conversations/${selected}/ai`, { enabled: !c.ai_enabled }); toast(c.ai_enabled ? 'Assistant paused for this conversation' : 'Assistant resumed', 'ok'); loadThread(true); } catch (e) { toastError(e); } } }, c.ai_enabled ? 'Pause assistant here' : 'Resume assistant here'))));
    function followUp() {
      const title = field('What needs to happen?', input({ maxlength: 200, value: d.recommendation ? '' : '' }));
      const due = field('Due', input({ type: 'datetime-local', value: isoToLocalInput(new Date(Date.now() + 24 * 3600e3).toISOString()) }));
      modal({ title: 'Create follow-up', body: h('div', { class: 'stack' }, title, due), actions: [{ label: 'Cancel', close: true }, { label: 'Create', kind: 'primary', run: async (m) => {
        const t = title.querySelector('input').value.trim(); if (t.length < 2) return toast('Describe the follow-up', 'bad');
        try { await api.post(`/app/conversations/${selected}/followup`, { title: t, dueAt: localInputToIso(due.querySelector('input').value) }); toast('Follow-up created', 'ok'); m.close(); ctx.refreshBadges(); } catch (e) { toastError(e); }
      } }] });
    }
  }

  loadList(); loadThread();
  const timer = setInterval(() => { loadList(true); if (selected && !document.querySelector('.overlay')) loadThread(true); }, 8000);
  return () => clearInterval(timer);
}
