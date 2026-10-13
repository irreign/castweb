import { api } from '../api.js';
import { h, mount, loading, empty, errorState, modal, toast, toastError, fmtDayLong, fmtTime, dayKey, field, textarea, input } from '../ui.js';

/** Grouped-by-day slot chooser backed by the server's availability calculation. */
export function slotPicker({ consultantId, onSelect }) {
  const host = h('div', {});
  let selected = null;
  async function load() {
    mount(host, loading('Finding available times…'));
    try {
      const { slots } = await api.get('/app/slots' + api.qs({ days: 14, consultantId }));
      if (!slots.length) return mount(host, empty('No available times', 'Check business hours, consultant availability and the booking window in Settings.'));
      const names = new Set(slots.map((s) => s.consultantId));
      const days = new Map();
      for (const s of slots) { const k = dayKey(s.start); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
      mount(host, [...days.entries()].map(([, list]) => h('div', {}, h('div', { class: 'slot-day' }, fmtDayLong(list[0].start)),
        h('div', { class: 'slot-grid' }, list.map((s) => {
          const b = h('button', { type: 'button', class: 'btn sm slot-btn', title: names.size > 1 ? s.consultantName : '', onclick: () => {
            host.querySelectorAll('.slot-btn.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); selected = s; onSelect && onSelect(s);
          } }, fmtTime(s.start), names.size > 1 ? ` · ${s.consultantName.split(' ')[0]}` : '');
          return b;
        })))));
    } catch (e) { mount(host, errorState(e, load)); }
  }
  load();
  return { el: host, get selected() { return selected; } };
}

export function openBookingModal({ lead, onDone }) {
  const notes = field('Notes for the consultant (optional)', textarea({ maxlength: 500 }));
  const info = h('div', { class: 'alert info small' }, 'The time is re-checked on the server when you confirm. The booking only shows as confirmed once it has been saved.');
  const picker = slotPicker({});
  const key = crypto.randomUUID();
  modal({ title: `Book consultation — ${lead.name || 'lead'}`, wide: true, body: h('div', { class: 'stack' }, info, picker.el, notes), actions: [
    { label: 'Cancel', close: true },
    { label: 'Confirm booking', kind: 'primary', run: async (m) => {
      const s = picker.selected; if (!s) return toast('Choose a time first', 'bad');
      try {
        await api.post('/app/bookings', { leadId: lead.id, start: s.start, consultantId: s.consultantId, idempotencyKey: key, notes: notes.querySelector('textarea').value.trim() || undefined });
        toast('Consultation confirmed', 'ok'); m.close(); onDone && onDone();
      } catch (e) { toastError(e); if (e.code === 'slot_unavailable') { m.close(); openBookingModal({ lead, onDone }); } }
    } }] });
}

export function openRescheduleModal({ booking, onDone }) {
  const picker = slotPicker({ consultantId: booking.consultant_id });
  modal({ title: 'Reschedule consultation', wide: true, body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, `Currently ${fmtDayLong(booking.start_utc)} at ${fmtTime(booking.start_utc)} with ${booking.consultant_name}. Pick a new time with the same consultant.`), picker.el), actions: [
    { label: 'Cancel', close: true },
    { label: 'Reschedule', kind: 'primary', run: async (m) => {
      const s = picker.selected; if (!s) return toast('Choose a new time first', 'bad');
      try { await api.post(`/app/bookings/${booking.id}/reschedule`, { start: s.start, consultantId: booking.consultant_id }); toast('Consultation rescheduled', 'ok'); m.close(); onDone && onDone(); }
      catch (e) { toastError(e); }
    } }] });
}

export function openCancelModal({ booking, onDone }) {
  const reason = field('Reason (optional)', input({ maxlength: 300, placeholder: 'e.g. customer asked to cancel' }));
  modal({ title: 'Cancel consultation', body: h('div', { class: 'stack' }, h('p', {}, `Cancel the consultation on ${fmtDayLong(booking.start_utc)} at ${fmtTime(booking.start_utc)}? The customer is emailed if an address is on file and email is configured.`), reason), actions: [
    { label: 'Keep it', close: true },
    { label: 'Cancel consultation', kind: 'danger', run: async (m) => {
      try { await api.post(`/app/bookings/${booking.id}/cancel`, { reason: reason.querySelector('input').value.trim() || undefined }); toast('Consultation cancelled', 'ok'); m.close(); onDone && onDone(); } catch (e) { toastError(e); }
    } }] });
}
