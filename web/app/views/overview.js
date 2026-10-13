import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, fmtDateTime, fmtRelative, phoneFmt, select, toast, toastError, label } from '../ui.js';
import { openLead } from '../components/lead-drawer.js';

const REASON = { awaiting_first_contact: ['New — no reply from a person yet', 'new'], follow_up_overdue: ['Follow-up overdue', 'overdue'], follow_up_required: ['Follow-up required', 'follow_up_required'] };
const mins = (m) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);

export default async function overview(root, ctx) {
  let days = 30;
  const body = h('div', {});
  const period = select([[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], days, { 'aria-label': 'Period', onchange: (e) => { days = Number(e.target.value); load(); } });
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Overview'), h('p', {}, 'What needs attention right now.')), h('div', { style: { width: '170px' } }, period)), body);

  async function load() {
    mount(body, loading());
    try { mount(body, view(await api.get(`/app/overview?days=${days}`), load)); } catch (e) { mount(body, errorState(e, load)); }
  }
  function view(o, reload) {
    const m = o.metrics;
    const kpi = (labelText, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, labelText), h('div', { class: 'value' }, value), sub && h('div', { class: 'sub' }, sub));
    const health = o.health;
    return h('div', { class: 'stack', style: { gap: '16px' } },
      health.ok ? h('div', { class: 'alert ok' }, `Assistant is working: ${health.publishedSources} published source(s), ${health.aiCallsThisMonth}/${health.aiCallLimit} AI calls used this month${health.aiConfigured ? '' : ' (extractive mode)'}.`)
        : h('div', { class: 'alert warn' }, h('strong', {}, 'Assistant needs attention'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, health.issues.map((i) => h('li', {}, i))), ctx.me.user.role !== 'consultant' && h('div', { style: { marginTop: '6px' } }, h('a', { href: '#/knowledge' }, 'Open Knowledge Base'), ' · ', h('a', { href: '#/assistant' }, 'AI Assistant settings'))),
      h('div', { class: 'grid kpis' },
        kpi('New enquiries', m.enquiries, `${m.newLeads} unique lead${m.newLeads === 1 ? '' : 's'}`),
        kpi('Awaiting first contact', m.awaitingFirstContact, 'No person has replied yet', m.awaitingFirstContact ? 'alert' : ''),
        kpi('Qualified', m.qualified, 'Qualified or further along'),
        kpi('Confirmed consultations', m.confirmedUpcoming, 'Upcoming', 'good'),
        kpi('Overdue follow-ups', m.overdueFollowUps, 'Open tasks past due', m.overdueFollowUps ? 'alert' : ''),
        kpi('Median first reply', mins(m.medianFirstResponseMin), 'Lead created → first reply')),
      h('div', { class: 'grid two' },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Leads that need attention'), h('a', { href: '#/leads' }, 'All leads')),
          o.attention.length ? h('div', { class: 'list' }, o.attention.map((l) => h('div', { class: 'row item click', tabindex: 0, onclick: () => openLead(l.id, reload), onkeydown: (e) => e.key === 'Enter' && openLead(l.id, reload) },
            h('div', { class: 'grow' }, h('strong', {}, l.name || 'Unnamed'), h('div', { class: 'small muted' }, `${phoneFmt(l.phone)} · enquired ${fmtRelative(l.created_at)}${l.next_action ? ' · ' + l.next_action : ''}`)), badge(REASON[l.reason][1], REASON[l.reason][0]))))
            : empty('Nothing needs attention', 'New enquiries and overdue follow-ups will show up here.')),
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Upcoming consultations'), h('a', { href: '#/bookings' }, 'Calendar')),
            o.upcoming.length ? h('div', { class: 'list' }, o.upcoming.map((b) => h('div', { class: 'item click', onclick: () => b.lead_id && openLead(b.lead_id, reload) }, h('strong', {}, fmtDateTime(b.start_utc)), h('div', { class: 'small muted' }, `${b.contact_name || 'Customer'} · with ${b.consultant_name}`)))) : empty('No upcoming consultations')),
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Open follow-ups'), h('a', { href: '#/followups' }, 'All')),
            o.tasks.length ? h('div', { class: 'list' }, o.tasks.map((t) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', {}, t.title), h('div', { class: 'small muted' }, `${t.lead_name || 'General'} · due ${fmtDateTime(t.due_at)}`)), t.overdue ? badge('overdue', 'Overdue') : null,
              h('button', { class: 'btn sm', onclick: async () => { try { await api.patch(`/app/tasks/${t.id}`, { status: 'done' }); toast('Marked done', 'ok'); reload(); ctx.refreshBadges(); } catch (e) { toastError(e); } } }, 'Done')))) : empty('All caught up')))),
    );
  }
  load();
}
