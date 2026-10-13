import { api } from '../api.js';
import { h, mount, drawer, loading, errorState, badge, label, fmtDateTime, fmtRelative, phoneFmt, input, select, textarea, toast, toastError, confirmDialog, localInputToIso, isoToLocalInput, STATUS_LABEL, modal, field } from '../ui.js';
import { openBookingModal, openRescheduleModal, openCancelModal } from './booking.js';
import { state, navigate } from '../main.js';

const REQ_LABELS = { householdSize: 'Household size', hasChildren: 'Young children', hasElderly: 'Elderly family', hasPets: 'Pets', helperType: 'Helper type', startTiming: 'Start timing', languagePreference: 'Language', budgetNotes: 'Budget notes', notes: 'Other notes' };
const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : v);

export function openLead(id, onChange = () => {}) {
  const d = drawer({ title: 'Lead', body: loading() });
  const refresh = async () => {
    try {
      const data = await api.get(`/app/leads/${id}`);
      mount(d.content, render(data, async () => { await refresh(); onChange(); }, d));
      d.setTitle(data.lead.name || 'Unnamed lead', `${phoneFmt(data.lead.phone)}${data.lead.email ? ' · ' + data.lead.email : ''}`);
    } catch (e) { mount(d.content, errorState(e, refresh)); }
  };
  refresh();
  return d;
}

function closeReason(onSubmit) {
  const reason = field('Reason', input({ maxlength: 300, placeholder: 'e.g. chose another agency' }));
  modal({ title: 'Close lead', body: h('div', { class: 'stack' }, h('p', {}, 'Record why this lead is not proceeding. You can reopen it later.'), reason), actions: [
    { label: 'Cancel', close: true },
    { label: 'Close lead', kind: 'primary', run: async (m) => { const v = reason.querySelector('input').value.trim(); if (!v) return toast('A reason is required', 'bad'); await onSubmit(v); m.close(); } }] });
}

function render({ lead, notes, tasks, bookings, conversations, consent, history }, reload, d) {
  const me = state.me; const isAdmin = me.user.role !== 'consultant'; const nowIso = new Date().toISOString();
  const assignSel = select([['', 'Unassigned']], lead.assigned_to || '');
  api.get('/app/team').then((r) => mount(assignSel, [h('option', { value: '' }, 'Unassigned'), ...r.items.filter((m) => m.active).map((m) => h('option', { value: m.id, selected: m.id === lead.assigned_to }, m.name))])).catch(() => {});
  assignSel.addEventListener('change', async () => { try { await api.patch(`/app/leads/${lead.id}`, { assignedTo: assignSel.value || null }); toast('Assignment updated', 'ok'); reload(); } catch (e) { toastError(e); } });

  const statusSel = select(Object.entries(STATUS_LABEL).filter(([k]) => k !== 'consultation_booked' || lead.status === 'consultation_booked'), lead.status);
  statusSel.addEventListener('change', async () => {
    const to = statusSel.value;
    const apply = async (patch) => { try { await api.patch(`/app/leads/${lead.id}`, patch); toast(`Status: ${label(to)}`, 'ok'); reload(); } catch (e) { statusSel.value = lead.status; toastError(e); } };
    if (to === 'closed') { statusSel.value = lead.status; closeReason((r) => apply({ status: 'closed', closedReason: r })); } else apply({ status: to });
  });

  const title = input({ placeholder: 'e.g. Call back about fees', maxlength: 200, 'aria-label': 'Next action' });
  const due = input({ type: 'datetime-local', value: isoToLocalInput(new Date(Date.now() + 24 * 3600e3).toISOString()), 'aria-label': 'Due' });
  const prio = select([['normal', 'Normal priority'], ['high', 'High priority'], ['low', 'Low priority']], 'normal');
  const nextForm = h('form', { class: 'stack tight', onsubmit: async (e) => {
    e.preventDefault(); if (!title.value.trim()) return toast('Describe the next action', 'bad');
    try { await api.post(`/app/leads/${lead.id}/next-action`, { title: title.value.trim(), dueAt: localInputToIso(due.value), priority: prio.value }); toast('Next action saved', 'ok'); reload(); } catch (ex) { toastError(ex); }
  } }, h('div', { class: 'form-grid' }, h('div', { class: 'full' }, title), due, prio), h('button', { class: 'btn primary sm', type: 'submit', style: { alignSelf: 'flex-start' } }, 'Save next action'));

  const noteBox = textarea({ placeholder: 'Add an internal note (never shown to the customer)', maxlength: 2000, 'aria-label': 'Internal note' });
  const req = Object.entries(lead.requirements || {});
  const overdue = (t) => t.status === 'open' && t.due_at < nowIso;
  return h('div', { class: 'stack', style: { gap: '20px' } },
    h('div', { class: 'row wrap' }, badge(lead.status), h('span', { class: 'muted small' }, `Source: ${lead.source.replace(/_/g, ' ')} · created ${fmtRelative(lead.created_at)}`), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: async () => { try { await api.post(`/app/leads/${lead.id}/contacted`); toast('Contact logged', 'ok'); reload(); } catch (e) { toastError(e); } } }, 'Log contact'),
      !['closed', 'converted'].includes(lead.status) && h('button', { class: 'btn primary sm', onclick: () => openBookingModal({ lead, onDone: reload }) }, 'Book consultation')),
    h('section', {}, h('div', { class: 'section-title' }, 'Customer'), h('dl', { class: 'kv' },
      h('dt', {}, 'Phone'), h('dd', {}, phoneFmt(lead.phone) || '—'), h('dt', {}, 'Email'), h('dd', {}, lead.email || '—'),
      h('dt', {}, 'Status'), h('dd', {}, statusSel), h('dt', {}, 'Assigned to'), h('dd', {}, assignSel),
      h('dt', {}, 'Last contacted'), h('dd', {}, lead.last_contacted_at ? fmtDateTime(lead.last_contacted_at) : 'Not yet'),
      h('dt', {}, 'First reply'), h('dd', {}, lead.first_response_at ? fmtDateTime(lead.first_response_at) : 'None yet'))),
    h('section', {}, h('div', { class: 'section-title' }, 'Qualification'),
      lead.summary && h('div', { class: 'alert info', style: { marginBottom: '8px' } }, h('strong', {}, 'Summary: '), lead.summary, h('div', { class: 'small', style: { marginTop: '4px' } }, 'Drafted automatically from what the customer said — verify before relying on it.')),
      req.length ? h('dl', { class: 'kv' }, req.flatMap(([k, v]) => [h('dt', {}, REQ_LABELS[k] || k), h('dd', {}, String(yn(v)))])) : h('p', { class: 'muted' }, 'No qualification answers captured yet.')),
    h('section', {}, h('div', { class: 'section-title' }, 'Next action'),
      lead.next_action ? h('p', {}, h('strong', {}, lead.next_action), ' — due ', fmtDateTime(lead.next_action_due), lead.next_action_due < nowIso && h('span', { style: { marginLeft: '6px' } }, badge('overdue', 'Overdue'))) : h('p', { class: 'muted' }, 'Nothing scheduled.'), nextForm),
    h('section', {}, h('div', { class: 'section-title' }, `Follow-up tasks (${tasks.filter((t) => t.status === 'open').length} open)`),
      tasks.length ? h('div', { class: 'list card' }, tasks.map((t) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', {}, t.title), h('div', { class: 'small muted' }, `Due ${fmtDateTime(t.due_at)}${t.owner_name ? ' · ' + t.owner_name : ''}`)), overdue(t) ? badge('overdue', 'Overdue') : badge(t.status),
        t.status === 'open' && h('button', { class: 'btn sm', onclick: async () => { try { await api.patch(`/app/tasks/${t.id}`, { status: 'done' }); reload(); } catch (e) { toastError(e); } } }, 'Done')))) : h('p', { class: 'muted' }, 'No tasks.')),
    h('section', {}, h('div', { class: 'section-title' }, 'Consultations'),
      bookings.length ? h('div', { class: 'list card' }, bookings.map((b) => h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, h('div', {}, fmtDateTime(b.start_utc)), h('div', { class: 'small muted' }, `${b.consultant_name} · notifications: ${b.notification_status.replace('_', ' ')}`)), badge(b.status),
        b.status === 'confirmed' && [h('button', { class: 'btn sm', onclick: () => openRescheduleModal({ booking: b, onDone: reload }) }, 'Reschedule'), h('button', { class: 'btn sm danger', onclick: () => openCancelModal({ booking: b, onDone: reload }) }, 'Cancel')]))) : h('p', { class: 'muted' }, 'No consultations booked.')),
    h('section', {}, h('div', { class: 'section-title' }, 'Conversations'),
      conversations.length ? h('div', { class: 'list card' }, conversations.map((c) => h('div', { class: 'row item click', onclick: () => { d.close(); navigate(`#/conversations/${c.id}`); } }, h('div', { class: 'grow' }, c.channel === 'web' ? 'Website chat' : c.channel === 'whatsapp' ? 'WhatsApp' : c.channel, h('div', { class: 'small muted' }, `Last message ${fmtRelative(c.last_message_at)}`)), badge(c.status)))) : h('p', { class: 'muted' }, 'No conversations.')),
    h('section', {}, h('div', { class: 'section-title' }, 'Internal notes'),
      h('div', { class: 'stack tight' }, noteBox, h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: async () => { if (!noteBox.value.trim()) return; try { await api.post(`/app/leads/${lead.id}/notes`, { text: noteBox.value.trim() }); reload(); } catch (e) { toastError(e); } } }, 'Add note')),
      notes.length > 0 && h('div', { class: 'list card', style: { marginTop: '10px' } }, notes.map((n) => h('div', {}, h('div', { style: { whiteSpace: 'pre-wrap' } }, n.body), h('div', { class: 'small muted' }, `${n.author || 'Unknown'} · ${fmtDateTime(n.created_at)}`))))),
    h('section', {}, h('div', { class: 'section-title' }, 'Consent & communication'),
      consent.length ? h('div', { class: 'list card' }, consent.map((c) => h('div', { class: 'row' }, h('div', { class: 'grow' }, c.purpose === 'enquiry_processing' ? 'Contact about this enquiry' : 'Follow-up messages', h('div', { class: 'small muted' }, `${c.evidence || c.channel} · ${fmtDateTime(c.created_at)}`)), badge(c.granted ? 'ready' : 'failed', c.granted ? 'Granted' : 'Withdrawn')))) : h('p', { class: 'muted' }, 'No consent records (manually entered lead). Confirm consent before contacting.')),
    h('section', {}, h('div', { class: 'section-title' }, 'History'),
      h('div', { class: 'list card' }, history.slice(0, 15).map((e) => h('div', { class: 'small' }, h('strong', {}, e.action.replace(/[._]/g, ' ')), ` · ${e.actor_name || e.actor_type} · ${fmtDateTime(e.created_at)}`)))),
    isAdmin && h('section', {}, h('div', { class: 'section-title' }, 'Privacy'), h('button', { class: 'btn danger sm', onclick: async () => {
      if (!(await confirmDialog({ title: 'Erase this person’s data?', text: 'This removes their name, phone, email, messages, notes and qualification answers and closes the lead. It cannot be undone. Use it for a data-deletion request.', confirmLabel: 'Erase data', danger: true }))) return;
      try { await api.post('/app/privacy/erase-contact', { leadId: lead.id }); toast('Data erased', 'ok'); reload(); } catch (e) { toastError(e); } } }, 'Erase personal data')));
}
