import { api } from '../api.js';
import { h, mount, loading, errorState, field, input, textarea, select, toast, toastError, showFieldErrors, badge } from '../ui.js';

const FIELDS = [['household', 'Household (size, children, elderly)'], ['helper_type', 'Helper type (new / transfer)'], ['start_timing', 'When they want to start'], ['budget_notes', 'Budget considerations']];

export default async function assistant(root, ctx) {
  mount(root, loading());
  try {
    const [s, health, ch] = await Promise.all([api.get('/app/settings'), api.get('/app/overview?days=7'), api.get('/app/channels')]);
    const ai = s.ai; const hh = health.health;
    const enabled = h('input', { type: 'checkbox', checked: ai.enabled });
    const f = { greeting: field('Greeting', textarea({ rows: 2, value: ai.greeting, maxlength: 400 })), handoffMessage: field('Message when handing over to a person', textarea({ rows: 2, value: ai.handoffMessage, maxlength: 400 })),
      escalationKeywords: field('Always hand over to a person when the customer mentions', textarea({ rows: 2, value: ai.escalationKeywords.join(', ') }), 'Comma-separated words or phrases, e.g. refund, complaint, lawyer. Matches whole words only.') };
    const collect = Object.fromEntries(FIELDS.map(([k]) => [k, h('input', { type: 'checkbox', checked: ai.collectFields.includes(k) })]));
    const frame = h('iframe', { class: 'preview-frame', title: 'Widget preview', src: `/widget/frame?k=${ch.web.publicKey}&preview=1` });
    mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'AI Assistant'), h('p', {}, 'How the assistant behaves, and a live preview of what customers see.'))),
      h('div', { class: 'grid eq' },
        h('div', { class: 'stack' },
          h('div', { class: `alert ${hh.ok ? 'ok' : 'warn'}` }, hh.ok ? 'Working normally.' : h('div', {}, h('strong', {}, 'Needs attention'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, hh.issues.map((i) => h('li', {}, i))))),
          h('div', { class: 'card card-pad small stack tight' }, h('div', {}, 'Model: ', ch.ai.configured ? badge('ready', 'Configured') : badge('not_configured', 'Not configured — quoting approved sources only')), h('div', {}, `AI calls this month: ${hh.aiCallsThisMonth} of ${hh.aiCallLimit}`), h('div', {}, `Last 24h: ${hh.last24h.calls} calls, ${hh.last24h.failures} failures`)),
          h('form', { class: 'card card-pad stack', onsubmit: async (e) => {
            e.preventDefault();
            const val = (x) => x.querySelector('textarea').value.trim();
            try { await api.put('/app/settings/ai', { enabled: enabled.checked, greeting: val(f.greeting), handoffMessage: val(f.handoffMessage), escalationKeywords: val(f.escalationKeywords).split(',').map((x) => x.trim()).filter(Boolean), collectFields: FIELDS.map(([k]) => k).filter((k) => collect[k].checked) }); toast('Assistant settings saved', 'ok'); }
            catch (ex) { if (!showFieldErrors(ex, f)) toastError(ex); }
          } },
            h('label', { class: 'check' }, enabled, h('span', {}, h('strong', {}, 'Assistant is on'), h('div', { class: 'small muted' }, 'When off, enquiries are still recorded but nobody gets an automatic reply.'))),
            f.greeting, f.handoffMessage, f.escalationKeywords,
            h('div', {}, h('div', { class: 'section-title' }, 'Details to collect from interested customers'), h('div', { class: 'stack tight' }, FIELDS.map(([k, t]) => h('label', { class: 'check' }, collect[k], h('span', {}, t)))), h('p', { class: 'small muted' }, 'Asked one at a time, only after the customer has shared contact details. The assistant never asks for NRIC/FIN or passport numbers.')),
            h('div', { class: 'alert info small' }, 'Fixed safety rules (not editable): answers come only from published knowledge; no promises about fees, availability, eligibility, refunds or approvals; bookings are only confirmed by the booking system; unsure questions go to a person.'),
            h('button', { class: 'btn primary', style: { alignSelf: 'flex-start' }, type: 'submit' }, 'Save settings'))),
        h('div', { class: 'stack tight' }, h('div', { class: 'alert info small' }, 'Preview mode: test chats are labelled as tests, excluded from reports, and cannot take real consultation slots.'), frame)));
  } catch (e) { mount(root, errorState(e, () => assistant(root, ctx))); }
}
