// Creates a clearly-flagged DEMO agency with sample data through the real HTTP API (so it exercises production code paths).
// Usage: BASE_URL=http://127.0.0.1:8787 PLATFORM_ADMIN_TOKEN=... node scripts/seed-demo.mjs
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const OP = process.env.PLATFORM_ADMIN_TOKEN;
if (!OP) { console.error('Set PLATFORM_ADMIN_TOKEN (the operator secret).'); process.exit(1); }
const H = { 'content-type': 'application/json', 'x-requested-with': 'nexus' };
const slug = process.env.DEMO_SLUG || 'demo-' + Math.random().toString(36).slice(2, 7);
const password = process.env.DEMO_PASSWORD || 'demo-password-' + Math.random().toString(36).slice(2, 8);
const email = `owner@${slug}.example`;

const prov = await (await fetch(`${BASE}/api/platform/tenants`, { method: 'POST', headers: { ...H, authorization: `Bearer ${OP}` }, body: JSON.stringify({ agencyName: 'DEMO — Sample Maid Agency', slug, ownerName: 'Demo Owner', ownerEmail: email, demo: true }) })).json();
if (!prov.inviteUrl) { console.error('Provisioning failed:', prov); process.exit(1); }
const token = new URL(prov.inviteUrl.replace('#/', '')).searchParams.get('token');
const r = await fetch(`${BASE}/api/auth/accept-invite`, { method: 'POST', headers: H, body: JSON.stringify({ token, password }) });
const cookie = r.headers.get('set-cookie').split(';')[0];
const A = { ...H, cookie };
const call = async (m, p, b) => (await fetch(`${BASE}/api${p}`, { method: m, headers: A, body: b ? JSON.stringify(b) : undefined })).json();

for (const [q, a] of [
  ['What are your office hours?', 'This is sample text. We are open Monday to Friday 9am to 6pm and Saturday 9am to 1pm.'],
  ['How does a consultation work?', 'This is sample text. A consultant spends about 30 minutes understanding your household needs and explaining our services.'],
]) { const s = await call('POST', '/app/knowledge/faq', { question: q, answer: a }); await call('PATCH', `/app/knowledge/${s.id}`, { published: true }); }
for (const [n, p, src] of [['Sample — Mrs Lim', '91230001', 'manual'], ['Sample — Mr Chen', '91230002', 'phone'], ['Sample — Ms Devi', '91230003', 'referral']]) await call('POST', '/app/leads', { name: n, phone: p, source: src });
console.log(JSON.stringify({ baseUrl: BASE, login: email, password, widgetKey: prov.widgetKey, note: 'DEMO tenant: the app shows a permanent demo banner. Delete or ignore; never use for real customers.' }, null, 2));
