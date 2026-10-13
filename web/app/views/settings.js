import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, field, input, textarea, select, toast, toastError, showFieldErrors, modal, copyText, fmtDateTime, confirmDialog } from '../ui.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TABS = [['profile', 'Agency profile'], ['hours', 'Hours & consultations'], ['team', 'Team & roles'], ['widget', 'Branding & website chat'], ['channels', 'Communication channels'], ['privacy', 'Privacy & limits'], ['usage', 'Usage & integrations'], ['audit', 'Activity log']];

export default async function settings(root, ctx) {
  let tab = ctx.params[0] || 'profile'; const body = h('div', {});
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, t]) => h('button', { role: 'tab', 'data-tab': k, class: k === tab ? 'active' : '', onclick: () => { tab = k; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === k)); show(); } }, t)));
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Settings'))), tabs, body);
  const isOwner = ctx.me.user.role === 'owner';
  async function show() {
    mount(body, loading());
    try { const s = await api.get('/app/settings'); mount(body, await ({ profile, hours, team, widget, channels, privacy, usage, audit })[tab](s)); }
    catch (e) { mount(body, errorState(e, show)); }
  }
  const save = (section, fields, build, msg = 'Saved') => async (e) => {
    e.preventDefault();
    try { await api.put(`/app/settings/${section}`, build()); toast(msg, 'ok'); } catch (ex) { if (!showFieldErrors(ex, fields)) toastError(ex); }
  };
  const v = (f) => f.querySelector('input,textarea,select').value.trim();
  const nul = (x) => x || null;
  const saveBtn = () => h('button', { class: 'btn primary', type: 'submit', style: { alignSelf: 'flex-start' } }, 'Save changes');

  function profile(s) {
    const p = s.profile; const name = field('Agency name', input({ value: s.name, maxlength: 120 }));
    const f = { contactEmail: field('Public contact email', input({ type: 'email', value: p.contactEmail || '' }), 'Shown to customers in the chat if set.'), contactPhone: field('Public contact phone', input({ value: p.contactPhone || '' })), address: field('Address', input({ value: p.address || '' })),
      website: field('Website', input({ type: 'url', value: p.website || '' })), licenceNo: field('EA licence number', input({ value: p.licenceNo || '' })), description: field('Short description', textarea({ rows: 3, value: p.description || '' })) };
    const n = s.notifications; const nf = { agencyEmail: field('Alert email', input({ type: 'email', value: n.agencyEmail || '' }), 'Receives booking and human-handoff alerts.') };
    const emailCust = h('input', { type: 'checkbox', checked: n.emailCustomers });
    return h('div', { class: 'stack', style: { maxWidth: '720px' } },
      h('form', { class: 'card card-pad stack', onsubmit: async (e) => { e.preventDefault(); try { await api.put('/app/settings/profile-name', { name: v(name) }); await api.put('/app/settings/profile', { contactEmail: nul(v(f.contactEmail)), contactPhone: nul(v(f.contactPhone)), address: nul(v(f.address)), website: nul(v(f.website)), licenceNo: nul(v(f.licenceNo)), description: nul(v(f.description)) }); toast('Profile saved', 'ok'); } catch (ex) { if (!showFieldErrors(ex, f)) toastError(ex); } } },
        h('h2', {}, 'Agency profile'), name, h('div', { class: 'form-grid' }, f.contactEmail, f.contactPhone, f.website, f.licenceNo, h('div', { class: 'full' }, f.address), h('div', { class: 'full' }, f.description)), saveBtn()),
      h('form', { class: 'card card-pad stack', onsubmit: save('notifications', nf, () => ({ agencyEmail: nul(v(nf.agencyEmail)), emailCustomers: emailCust.checked })) },
        h('h2', {}, 'Notifications'), nf.agencyEmail, h('label', { class: 'check' }, emailCust, h('span', {}, 'Email booking confirmations to customers who gave an email address')), saveBtn()));
  }

  function hours(s) {
    const rows = DAYS.map((d, i) => { const w = s.hours[String(i)]; return { open: input({ type: 'time', value: w?.open || '09:00', 'aria-label': `${d} opens` }), close: input({ type: 'time', value: w?.close || '18:00', 'aria-label': `${d} closes` }), on: h('input', { type: 'checkbox', checked: !!w, 'aria-label': `${d} open` }) }; });
    const c = s.consultation; const num = (x, o = {}) => input({ type: 'number', value: x, ...o });
    const cf = { durationMin: field('Consultation length (minutes)', num(c.durationMin, { min: 10, max: 180 })), bufferMin: field('Buffer after each consultation (minutes)', num(c.bufferMin, { min: 0, max: 60 })), slotStepMin: field('Offer a start time every (minutes)', num(c.slotStepMin, { min: 10, max: 120 })), minNoticeHours: field('Minimum notice (hours)', num(c.minNoticeHours, { min: 0, max: 168 })), maxDaysAhead: field('Bookable up to (days ahead)', num(c.maxDaysAhead, { min: 1, max: 90 })), locationNote: field('Where consultations happen', input({ value: c.locationNote || '', placeholder: 'e.g. Our office at … or by video call' })) };
    return h('div', { class: 'stack', style: { maxWidth: '720px' } },
      h('form', { class: 'card card-pad stack', onsubmit: save('hours', {}, () => Object.fromEntries(rows.map((r, i) => [String(i), r.on.checked ? { open: r.open.value, close: r.close.value } : null])), 'Business hours saved') },
        h('h2', {}, `Business hours (${s.timezone})`), h('p', { class: 'muted small' }, 'Consultations can only be booked inside these hours and inside each consultant’s own availability.'),
        h('div', { class: 'stack tight' }, DAYS.map((d, i) => h('div', { class: 'row' }, h('label', { class: 'check', style: { width: '140px' } }, rows[i].on, h('span', {}, d)), rows[i].open, h('span', {}, 'to'), rows[i].close))), saveBtn()),
      h('form', { class: 'card card-pad stack', onsubmit: save('consultation', cf, () => ({ durationMin: +v(cf.durationMin), bufferMin: +v(cf.bufferMin), slotStepMin: +v(cf.slotStepMin), minNoticeHours: +v(cf.minNoticeHours), maxDaysAhead: +v(cf.maxDaysAhead), locationNote: nul(v(cf.locationNote)) }), 'Consultation settings saved') },
        h('h2', {}, 'Consultation settings'), h('div', { class: 'form-grid' }, Object.values(cf).map((x, i) => (i === 5 ? h('div', { class: 'full' }, x) : x))), saveBtn()));
  }

  async function team() {
    const { items } = await api.get('/app/team'); const host = h('div', {});
    const draw = (list) => mount(host, h('div', { class: 'card table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Name', 'Email', 'Role', 'Status', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, list.map((m) => {
        const roleSel = select([['owner', 'Owner'], ['admin', 'Admin'], ['consultant', 'Consultant']], m.role, { 'aria-label': `Role for ${m.name}`, disabled: !isOwner && m.role === 'owner', onchange: async (e) => { try { await api.patch(`/app/team/${m.id}`, { role: e.target.value }); toast('Role updated', 'ok'); } catch (ex) { e.target.value = m.role; toastError(ex); } } });
        return h('tr', {}, h('td', {}, h('strong', {}, m.name)), h('td', {}, m.email), h('td', {}, roleSel), h('td', {}, m.active ? (m.activated ? badge('ready', 'Active') : badge('pending', 'Invite pending')) : badge('closed', 'Deactivated')),
          h('td', { class: 'nowrap' }, h('button', { class: 'btn sm', onclick: () => availability(m) }, 'Availability'), ' ', h('button', { class: 'btn sm', onclick: async () => { try { await api.patch(`/app/team/${m.id}`, { active: !m.active }); toast(m.active ? 'Deactivated' : 'Reactivated', 'ok'); team().then((n) => mount(body, n)); } catch (ex) { toastError(ex); } } }, m.active ? 'Deactivate' : 'Reactivate')));
      })))));
    draw(items);
    return h('div', { class: 'stack' }, h('div', { class: 'row spread' }, h('p', { class: 'muted' }, 'Owners and admins manage settings and knowledge. Consultants work leads, conversations and bookings.'), h('button', { class: 'btn primary', onclick: invite }, '+ Invite teammate')), host);
  }
  function invite() {
    const f = { name: field('Name', input({ maxlength: 120 })), email: field('Email', input({ type: 'email' })), role: field('Role', select([['consultant', 'Consultant'], ['admin', 'Admin']], 'consultant')) };
    modal({ title: 'Invite a teammate', body: h('div', { class: 'stack' }, f.name, f.email, f.role), actions: [{ label: 'Cancel', close: true }, { label: 'Create invitation', kind: 'primary', run: async (m) => {
      try { const r = await api.post('/app/team', { name: v(f.name), email: v(f.email), role: v(f.role) }); m.close();
        modal({ title: 'Invitation ready', body: h('div', { class: 'stack' }, h('p', {}, 'Send this link to your teammate. It works once and expires in 7 days.'), h('pre', { class: 'code' }, r.inviteUrl)), actions: [{ label: 'Copy link', kind: 'primary', run: async () => copyText(r.inviteUrl) }, { label: 'Done', close: true }] }); show(); }
      catch (e) { if (!showFieldErrors(e, f)) toastError(e); } } }] });
  }
  async function availability(m) {
    let r; try { r = await api.get(`/app/team/${m.id}/availability`); } catch (e) { return toastError(e); }
    const rows = DAYS.map((d, i) => { const w = r.windows.find((x) => x.weekday === i); return { on: h('input', { type: 'checkbox', checked: !!w, 'aria-label': `${d}` }), s: input({ type: 'time', value: w?.start || '09:00' }), e: input({ type: 'time', value: w?.end || '18:00' }) }; });
    modal({ title: `Availability — ${m.name}`, body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Weekly hours when this person can take consultations (within agency business hours). Nobody with no hours set is bookable.'), DAYS.map((d, i) => h('div', { class: 'row' }, h('label', { class: 'check', style: { width: '140px' } }, rows[i].on, h('span', {}, d)), rows[i].s, h('span', {}, 'to'), rows[i].e))), actions: [{ label: 'Cancel', close: true },
      { label: 'Use business hours', run: async (mm) => { try { await api.put(`/app/team/${m.id}/availability`, { fromBusinessHours: true }); toast('Availability set from business hours', 'ok'); mm.close(); } catch (e) { toastError(e); } } },
      { label: 'Save', kind: 'primary', run: async (mm) => { try { await api.put(`/app/team/${m.id}/availability`, { windows: rows.map((x, i) => (x.on.checked ? { weekday: i, start: x.s.value, end: x.e.value } : null)).filter(Boolean) }); toast('Availability saved', 'ok'); mm.close(); } catch (e) { toastError(e); } } }] });
  }

  async function widget(s) {
    const ch = await api.get('/app/channels'); const b = s.branding;
    const f = { displayName: field('Name shown in the chat', input({ value: b.displayName || '', placeholder: s.name })), primaryColor: field('Brand colour', input({ type: 'color', value: b.primaryColor, style: { height: '38px', padding: '2px' } })), welcomeMessage: field('Welcome message', textarea({ rows: 2, value: b.welcomeMessage || '' }), 'Leave empty to use the assistant greeting.'),
      suggestedPrompts: field('Suggested questions (one per line, max 5)', textarea({ rows: 4, value: b.suggestedPrompts.join('\n') })), privacyUrl: field('Privacy policy link', input({ type: 'url', value: b.privacyUrl || '' })),
      allowedOrigins: field('Websites allowed to embed the chat (one per line)', textarea({ rows: 3, value: b.allowedOrigins.join('\n'), placeholder: 'https://www.youragency.sg' }), 'Strongly recommended. Leave empty to allow any website.') };
    const snippet = ch.web.embedSnippet;
    return h('div', { class: 'grid eq' }, h('div', { class: 'stack' },
      h('form', { class: 'card card-pad stack', onsubmit: save('branding', f, () => ({ displayName: nul(v(f.displayName)), primaryColor: v(f.primaryColor), welcomeMessage: nul(v(f.welcomeMessage)), suggestedPrompts: v(f.suggestedPrompts).split('\n').map((x) => x.trim()).filter(Boolean), privacyUrl: nul(v(f.privacyUrl)), allowedOrigins: v(f.allowedOrigins).split('\n').map((x) => x.trim()).filter(Boolean) }), 'Branding saved — reload the preview to see it') },
        h('h2', {}, 'Branding'), f.displayName, f.primaryColor, f.welcomeMessage, f.suggestedPrompts, f.privacyUrl, f.allowedOrigins, saveBtn()),
      h('div', { class: 'card card-pad stack' }, h('h2', {}, 'Add the chat to your website'), h('p', { class: 'muted small' }, 'Paste this just before </body> on every page where the chat should appear.'), h('pre', { class: 'code' }, snippet), h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: () => copyText(snippet) }, 'Copy snippet'),
        h('p', { class: 'small muted' }, 'Your widget ID identifies your agency for public chat only. It cannot read any private data.'))),
      h('div', { class: 'stack tight' }, h('div', { class: 'alert info small' }, 'Preview (test chats are excluded from reports; booking is disabled).'), h('iframe', { class: 'preview-frame', title: 'Widget preview', src: `/widget/frame?k=${ch.web.publicKey}&preview=1` })));
  }

  async function channels() {
    const ch = await api.get('/app/channels'); const wa = ch.whatsapp; const p = wa.platform;
    const f = { phoneNumberId: field('Phone number ID', input({ value: wa.phoneNumberId || '', inputmode: 'numeric' }), 'From Meta → WhatsApp → API setup. Digits only.'), accessToken: field('Access token', input({ type: 'password', autocomplete: 'off', placeholder: wa.hasToken ? '•••••••• (saved — leave blank to keep)' : '' }), 'Stored encrypted. Never shown again.'), displayPhone: field('Display number (optional)', input({ value: wa.displayPhone || '' })) };
    const item = (ok, text) => h('li', {}, badge(ok ? 'ready' : 'not_configured', ok ? 'OK' : 'Missing'), ' ', text);
    return h('div', { class: 'grid eq' }, h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack' }, h('div', { class: 'row spread' }, h('h2', {}, 'WhatsApp Business'), wa.connected ? badge('ready', 'Connected') : badge('closed', 'Not connected')),
        p.testMode && h('div', { class: 'alert warn small' }, 'Server is in WhatsApp TEST mode: messages are recorded but nothing is sent to WhatsApp.'),
        h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); try { await api.put('/app/channels/whatsapp', { phoneNumberId: v(f.phoneNumberId), accessToken: v(f.accessToken) || undefined, displayPhone: v(f.displayPhone) || undefined }); toast('WhatsApp saved', 'ok'); show(); } catch (ex) { if (!showFieldErrors(ex, f)) toastError(ex); } } }, f.phoneNumberId, f.accessToken, f.displayPhone, h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, wa.connected ? 'Update' : 'Connect'), wa.connected && h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Disconnect WhatsApp?', text: 'Incoming messages will no longer be received.', confirmLabel: 'Disconnect', danger: true })) { try { await api.del('/app/channels/whatsapp'); show(); } catch (e) { toastError(e); } } } }, 'Disconnect')))),
      h('div', { class: 'card card-pad stack' }, h('h2', {}, 'Server readiness'), h('ul', { class: 'stack tight', style: { margin: 0, paddingLeft: 0, listStyle: 'none' } }, item(p.appSecretConfigured, 'WhatsApp app secret (webhook signatures)'), item(p.verifyTokenConfigured, 'Webhook verify token'), item(p.encryptionKeyConfigured, 'Encryption key (token storage)'), item(ch.email.configured, 'Email provider (booking notifications)'), item(ch.ai.configured, 'AI model key')),
        h('p', { class: 'small muted' }, 'These are server secrets managed by Nexus Logic; see the deployment guide.'))),
      h('div', { class: 'stack' }, h('div', { class: 'card card-pad stack' }, h('h2', {}, 'Webhook'), h('p', { class: 'small muted' }, 'In Meta’s app dashboard set the callback URL below and subscribe to the “messages” field.'), h('pre', { class: 'code' }, wa.webhookUrl),
        h('p', { class: 'small muted' }, 'Replies outside the 24-hour window need an approved message template. Customers who send STOP are never messaged again until they send START.')),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Recent webhook events')), wa.recentEvents.length ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'Kind', 'Status', 'Tries'].map((x) => h('th', {}, x)))), h('tbody', {}, wa.recentEvents.map((e) => h('tr', {}, h('td', { class: 'small' }, fmtDateTime(e.created_at)), h('td', {}, e.kind), h('td', {}, badge(e.status), e.error && h('div', { class: 'small muted' }, e.error)), h('td', {}, e.attempts))))) : empty('No events yet', 'Events appear once WhatsApp starts delivering messages.'))));
  }

  function privacy(s) {
    const r = s.retention, l = s.limits; const rf = { conversationDays: field('Keep conversation messages for (days)', input({ type: 'number', value: r.conversationDays, min: 30, max: 1825, disabled: !isOwner })), closedLeadDays: field('Anonymise closed leads after (days)', input({ type: 'number', value: r.closedLeadDays, min: 30, max: 1825, disabled: !isOwner })) };
    const lf = { aiCallsPerMonth: field('AI replies per month', input({ type: 'number', value: l.aiCallsPerMonth, min: 0, disabled: !isOwner }), 'After this the assistant quotes approved sources without the AI model.'), messagesPerMonth: field('Chat messages per month', input({ type: 'number', value: l.messagesPerMonth, min: 0, disabled: !isOwner }), 'Protects against abuse and runaway cost.') };
    return h('div', { class: 'stack', style: { maxWidth: '720px' } }, !isOwner && h('div', { class: 'alert info small' }, 'Only the agency owner can change these settings.'),
      h('form', { class: 'card card-pad stack', onsubmit: save('retention', rf, () => ({ conversationDays: +v(rf.conversationDays), closedLeadDays: +v(rf.closedLeadDays) })) }, h('h2', {}, 'Data retention'), h('p', { class: 'muted small' }, 'A scheduled job deletes older messages and anonymises long-closed leads. To remove one person’s data immediately, open their lead and choose “Erase personal data”.'), h('div', { class: 'form-grid' }, rf.conversationDays, rf.closedLeadDays), isOwner && saveBtn()),
      h('form', { class: 'card card-pad stack', onsubmit: save('limits', lf, () => ({ aiCallsPerMonth: +v(lf.aiCallsPerMonth), messagesPerMonth: +v(lf.messagesPerMonth) })) }, h('h2', {}, 'Usage limits'), h('div', { class: 'form-grid' }, lf.aiCallsPerMonth, lf.messagesPerMonth), isOwner && saveBtn()),
      h('div', { class: 'card card-pad stack' }, h('h2', {}, 'How customer data is handled'), h('ul', { style: { margin: 0, paddingLeft: '18px' } }, h('li', {}, 'Customers see an AI disclosure and must tick consent before sharing contact details.'), h('li', {}, 'The assistant never asks for NRIC/FIN, passport numbers or identity documents.'), h('li', {}, 'Conversations are not used to train AI models.'), h('li', {}, 'Every change to a lead, booking and setting is recorded in the activity log.'))));
  }

  async function usage() {
    const [u, ch] = await Promise.all([api.get('/app/usage'), api.get('/app/channels')]);
    const L = { msg_in: 'Customer messages received', msg_out: 'Messages sent', ai_call: 'AI replies', ai_tokens_in: 'AI input tokens', ai_tokens_out: 'AI output tokens', ai_failure: 'AI provider errors', ai_invalid: 'AI invalid outputs', email: 'Emails sent', doc_processed: 'Documents processed', handoff: 'Human handoffs', voice_seconds: 'Voice seconds' };
    const e = Object.entries(u.usage);
    return h('div', { class: 'grid eq' }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, `Usage since ${u.monthStart}`)), e.length ? h('table', { class: 't' }, h('tbody', {}, e.map(([k, n]) => h('tr', {}, h('td', {}, L[k] || k), h('td', {}, n.toLocaleString()))))) : empty('No usage yet this month')),
      h('div', { class: 'card card-pad stack' }, h('h2', {}, 'Integration status'), h('dl', { class: 'kv' }, h('dt', {}, 'Website chat'), h('dd', {}, badge('ready', 'Available')), h('dt', {}, 'AI model'), h('dd', {}, ch.ai.configured ? badge('ready', 'Configured') : badge('not_configured', 'Not configured')), h('dt', {}, 'Email'), h('dd', {}, ch.email.configured ? badge('ready', 'Configured') : badge('not_configured', 'Not configured')), h('dt', {}, 'WhatsApp'), h('dd', {}, ch.whatsapp.connected ? badge('ready', 'Connected') : badge('closed', 'Not connected')), h('dt', {}, 'Voice'), h('dd', {}, badge('closed', 'Planned (phase 2)')))));
  }

  async function audit() {
    const { items } = await api.get('/app/audit');
    return h('div', { class: 'card' }, items.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'Who', 'What'].map((x) => h('th', {}, x)))), h('tbody', {}, items.map((a) => h('tr', {}, h('td', { class: 'small nowrap' }, fmtDateTime(a.created_at)), h('td', {}, a.actor_name || a.actor_type), h('td', {}, a.action.replace(/[._]/g, ' '), h('span', { class: 'small muted' }, ` · ${a.entity_type}`))))))) : empty('No activity yet'));
  }
  show();
}
