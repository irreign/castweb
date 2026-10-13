import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, fmtDateTime, fmtTime, fmtDayLong, dayKey, select, input, field, modal, toast, toastError, debounce } from '../ui.js';
import { openLead } from '../components/lead-drawer.js';
import { openBookingModal, openRescheduleModal, openCancelModal, slotPicker } from '../components/booking.js';

export default async function bookings(root, ctx) {
  let view = 'calendar'; let weekStart = mondayOf(new Date()); const host = h('div', {}); let cons = '';
  const team = (await api.get('/app/team')).items.filter((m) => m.active);
  const toggle = h('div', { class: 'tabs' }, [['calendar', 'Calendar'], ['list', 'List']].map(([k, t]) => h('button', { class: k === view ? 'active' : '', onclick: (e) => { view = k; toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); load(); } }, t)));
  const consSel = select([['', 'All consultants'], ...team.map((m) => [m.id, m.name])], '', { 'aria-label': 'Consultant', onchange: (e) => { cons = e.target.value; load(); } });
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Bookings'), h('p', {}, 'Consultations, with availability checked by the server.')), h('button', { class: 'btn primary', onclick: newBooking }, '+ New booking')),
    h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, toggle, h('span', { class: 'grow' }), h('div', { style: { width: '200px' } }, consSel)), host);

  function mondayOf(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }

  async function load() {
    mount(host, loading());
    try {
      if (view === 'list') {
        const { items } = await api.get('/app/bookings' + api.qs({ from: new Date(Date.now() - 7 * 864e5).toISOString(), consultantId: cons }));
        if (!items.length) return mount(host, h('div', { class: 'card' }, empty('No bookings', 'Consultations booked from the website chat or by your team appear here.', h('button', { class: 'btn primary', onclick: newBooking }, '+ New booking'))));
        return mount(host, h('div', { class: 'card table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'Customer', 'Consultant', 'Status', 'Notified', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, items.map((b) => h('tr', {}, h('td', { class: 'nowrap' }, h('strong', {}, fmtDateTime(b.start_utc)), h('div', { class: 'small muted' }, `${fmtTime(b.start_utc)}–${fmtTime(b.end_utc)}`)),
            h('td', {}, b.lead_id ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); openLead(b.lead_id, load); } }, b.contact_name || 'Customer') : (b.contact_name || '—'), h('div', { class: 'small muted' }, b.contact_phone || b.contact_email || '')),
            h('td', {}, b.consultant_name), h('td', {}, badge(b.status)), h('td', {}, badge(b.notification_status, b.notification_status === 'not_configured' ? 'Email off' : undefined)), h('td', { class: 'nowrap' }, actions(b))))))));
      }
      const end = new Date(weekStart.getTime() + 7 * 864e5);
      const { items } = await api.get('/app/bookings' + api.qs({ from: weekStart.toISOString(), to: end.toISOString(), consultantId: cons }));
      mount(host, calendar(items));
    } catch (e) { mount(host, errorState(e, load)); }
  }

  function actions(b) {
    return b.status === 'confirmed' ? [
      h('button', { class: 'btn sm', onclick: () => openRescheduleModal({ booking: b, onDone: load }) }, 'Reschedule'), ' ',
      h('button', { class: 'btn sm danger', onclick: () => openCancelModal({ booking: b, onDone: load }) }, 'Cancel'), ' ',
      Date.parse(b.start_utc) < Date.now() && [h('button', { class: 'btn sm', onclick: () => outcome(b, 'completed') }, 'Held'), ' ', h('button', { class: 'btn sm', onclick: () => outcome(b, 'no_show') }, 'No-show')]] : '';
  }
  async function outcome(b, o) { try { await api.post(`/app/bookings/${b.id}/outcome`, { outcome: o }); toast('Updated', 'ok'); load(); } catch (e) { toastError(e); } }

  function calendar(items) {
    const START = 8, END = 20; const days = [...Array(7)].map((_, i) => new Date(weekStart.getTime() + i * 864e5));
    const todayKey = dayKey(new Date().toISOString());
    const nav = h('div', { class: 'row', style: { marginBottom: '8px' } }, h('button', { class: 'btn sm', onclick: () => { weekStart = new Date(weekStart.getTime() - 7 * 864e5); load(); } }, '‹'), h('button', { class: 'btn sm', onclick: () => { weekStart = mondayOf(new Date()); load(); } }, 'This week'), h('button', { class: 'btn sm', onclick: () => { weekStart = new Date(weekStart.getTime() + 7 * 864e5); load(); } }, '›'),
      h('strong', {}, `${days[0].toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`));
    const minOfDay = (iso) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).split(':').map(Number); return p[0] * 60 + p[1]; };
    const cal = h('div', { class: 'cal' }, h('div', { class: 'hd' }, ''), ...days.map((d) => h('div', { class: `hd ${dayKey(d.toISOString()) === todayKey ? 'today' : ''}` }, d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric' }))),
      h('div', { class: 'hours' }, [...Array(END - START)].map((_, i) => h('div', {}, `${((START + i + 11) % 12) + 1}${START + i < 12 ? 'am' : 'pm'}`))),
      ...days.map((d) => { const key = dayKey(new Date(d.getTime() + 12 * 3600e3).toISOString());
        const col = h('div', { class: 'col', style: { height: `${(END - START) * 48}px` } });
        for (const b of items.filter((x) => dayKey(x.start_utc) === key)) {
          const top = ((minOfDay(b.start_utc) - START * 60) / 60) * 48; const hgt = Math.max(22, ((Date.parse(b.end_utc) - Date.parse(b.start_utc)) / 3600e3) * 48 - 2);
          col.append(h('div', { class: `ev ${b.status}`, style: { top: `${top}px`, height: `${hgt}px` }, tabindex: 0, title: `${b.contact_name || 'Customer'} · ${b.consultant_name}`, onclick: () => details(b), onkeydown: (e) => e.key === 'Enter' && details(b) }, h('strong', {}, fmtTime(b.start_utc)), ' ', b.contact_name || 'Customer'));
        }
        return col; }));
    return h('div', { class: 'card card-pad', style: { overflowX: 'auto' } }, nav, cal, items.length === 0 && h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'No consultations this week.'));
  }

  function details(b) {
    modal({ title: 'Consultation', body: h('div', { class: 'stack' }, h('dl', { class: 'kv' }, h('dt', {}, 'When'), h('dd', {}, `${fmtDayLong(b.start_utc)}, ${fmtTime(b.start_utc)}–${fmtTime(b.end_utc)}`), h('dt', {}, 'Customer'), h('dd', {}, b.contact_name || '—'), h('dt', {}, 'Contact'), h('dd', {}, b.contact_phone || b.contact_email || '—'), h('dt', {}, 'Consultant'), h('dd', {}, b.consultant_name), h('dt', {}, 'Status'), h('dd', {}, badge(b.status)), h('dt', {}, 'Notifications'), h('dd', {}, badge(b.notification_status)), b.notes && [h('dt', {}, 'Notes'), h('dd', {}, b.notes)]),
      h('div', { class: 'row wrap' }, b.lead_id && h('button', { class: 'btn sm', onclick: () => openLead(b.lead_id, load) }, 'Open lead'), actions(b))), actions: [{ label: 'Close', close: true }] });
  }

  async function newBooking() {
    const search = input({ type: 'search', placeholder: 'Search lead by name or phone…', 'aria-label': 'Search leads' });
    const results = h('div', { class: 'list card', style: { maxHeight: '260px', overflowY: 'auto' } });
    let m;
    const doSearch = async () => {
      try { const r = await api.get('/app/leads' + api.qs({ q: search.value.trim(), pageSize: 8 }));
        mount(results, r.items.length ? r.items.filter((l) => !['closed', 'converted'].includes(l.status)).map((l) => h('div', { class: 'row item click', onclick: () => { m.close(); openBookingModal({ lead: l, onDone: load }); } }, h('div', { class: 'grow' }, h('strong', {}, l.name || 'Unnamed'), h('div', { class: 'small muted' }, l.phone || l.email || '')), badge(l.status))) : empty('No matching leads', 'Create the lead first from the Leads screen.')); } catch (e) { toastError(e); }
    };
    search.addEventListener('input', debounce(doSearch));
    m = modal({ title: 'New booking — choose a lead', body: h('div', { class: 'stack' }, search, results), actions: [{ label: 'Cancel', close: true }] });
    doSearch();
  }
  load();
}
