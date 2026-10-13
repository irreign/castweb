import { api } from '../api.js';
import { h, mount, loading, errorState, empty, select, label } from '../ui.js';

const mins = (m) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);
const pct = (v) => (v == null ? '—' : `${v}%`);

export default async function reports(root) {
  let days = 30; const body = h('div', {});
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Reports'), h('p', {}, 'Every number is calculated live from your records. Definitions are shown beside each metric.')),
    h('div', { style: { width: '170px' } }, select([[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']], days, { 'aria-label': 'Period', onchange: (e) => { days = Number(e.target.value); load(); } }))), body);
  async function load() {
    mount(body, loading());
    try {
      const r = await api.get(`/app/reports?days=${days}`); const m = r.metrics; const d = r.definitions;
      const rows = [['Enquiries', m.enquiries, 'enquiries'], ['Unique leads', m.newLeads, 'newLeads'], ['Awaiting first contact (now)', m.awaitingFirstContact, 'awaitingFirstContact'], ['Qualified', m.qualified, 'qualified'], ['Consultations booked', m.consultationsBooked, 'consultationsBooked'], ['Confirmed upcoming (now)', m.confirmedUpcoming, 'confirmedUpcoming'],
        ['Consultations completed', m.consultationsCompleted, 'consultationsCompleted'], ['Converted (pipeline status)', m.converted, 'converted'], ['Lead → consultation rate', pct(m.leadToConsultationRate), 'leadToConsultationRate'], ['Overdue follow-ups (now)', m.overdueFollowUps, 'overdueFollowUps'],
        ['Median first reply', mins(m.medianFirstResponseMin), 'medianFirstResponseMin'], ['Median first human contact', mins(m.medianHumanResponseMin), 'medianHumanResponseMin'], ['Handoff rate', `${pct(m.handoffRate)} (${m.handoffs})`, 'handoffRate'], ['AI failure rate', `${pct(m.aiFailureRate)} (${m.aiFailures} of ${m.aiAttempts})`, 'aiFailureRate']];
      const max = Math.max(1, ...r.daily.map((x) => x.leads));
      mount(body, h('div', { class: 'stack', style: { gap: '16px' } },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Metrics')), h('div', { class: 'table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Metric', 'Value', 'Definition'].map((x) => h('th', {}, x)))), h('tbody', {}, rows.map(([t, v, k]) => h('tr', {}, h('td', {}, h('strong', {}, t)), h('td', { style: { fontWeight: 700, color: 'var(--navy)' } }, String(v)), h('td', { class: 'small muted' }, d[k])))))),
          h('div', { class: 'card-pad small muted' }, 'Revenue is not shown: this product does not receive verified sales data, and a “converted” lead is a pipeline status set by your team, not a payment.')),
        h('div', { class: 'grid eq' },
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Conversations by channel')), r.byChannel.length ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Channel', 'Conversations', 'Messages'].map((x) => h('th', {}, x)))), h('tbody', {}, r.byChannel.map((c) => h('tr', {}, h('td', {}, c.channel === 'web' ? 'Website chat' : c.channel === 'whatsapp' ? 'WhatsApp' : c.channel), h('td', {}, c.conversations), h('td', {}, c.messages))))) : empty('No conversations in this period')),
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Leads by current status (all time)')), r.byStatus.length ? h('table', { class: 't' }, h('tbody', {}, r.byStatus.map((s) => h('tr', {}, h('td', {}, label(s.status)), h('td', {}, s.n))))) : empty('No leads yet'))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'New leads per day')), r.daily.length ? h('div', { class: 'card-pad' }, h('div', { class: 'bars', role: 'img', 'aria-label': 'New leads per day' }, r.daily.map((x) => h('i', { title: `${x.day}: ${x.leads}`, style: { height: `${(x.leads / max) * 100}%` } }))), h('div', { class: 'small muted' }, `${r.daily[0].day} → ${r.daily[r.daily.length - 1].day}`)) : empty('No leads in this period'))));
    } catch (e) { mount(body, errorState(e, load)); }
  }
  load();
}
