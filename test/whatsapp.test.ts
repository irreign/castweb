import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { Env } from '../src/env';
import { hmacSha256Hex } from '../src/crypto';
import { client, loginCookie, makeEnv, seedTenant, type TenantFx } from './helpers/env';
import { retryFailedEvents, handleOptKeywords } from '../src/services/whatsapp';
import { parseWebhook, verifySignature } from '../src/providers/whatsapp';

let env: Env; let A: TenantFx; let B: TenantFx; let a: ReturnType<typeof client>;
const raw = () => (env.DB as any).raw;
const PNID_A = '100000000000001'; const PNID_B = '100000000000002';

function payload(opts: { pnid?: string; from?: string; id?: string; text?: string; type?: string; statuses?: any[] }) {
  const value: any = { messaging_product: 'whatsapp', metadata: { display_phone_number: '6560000000', phone_number_id: opts.pnid ?? PNID_A }, contacts: [{ profile: { name: 'Mrs Tan' }, wa_id: opts.from ?? '6591234567' }] };
  if (opts.id) value.messages = [{ from: opts.from ?? '6591234567', id: opts.id, timestamp: '1760000000', type: opts.type ?? 'text', ...(opts.type && opts.type !== 'text' ? {} : { text: { body: opts.text ?? 'hello' } }) }];
  if (opts.statuses) value.statuses = opts.statuses;
  return { object: 'whatsapp_business_account', entry: [{ id: 'waba1', changes: [{ field: 'messages', value }] }] };
}
async function post(body: unknown, opts: { secret?: string; sig?: string | null } = {}) {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const sig = opts.sig === undefined ? 'sha256=' + await hmacSha256Hex(opts.secret ?? 'wa-app-secret', text) : opts.sig;
  if (sig) headers['x-hub-signature-256'] = sig;
  const res = await app.request('/api/webhooks/whatsapp', { method: 'POST', headers, body: text }, env);
  return { status: res.status, json: await res.json().catch(() => null) as any };
}
const count = (sql: string, ...a: unknown[]) => raw().prepare(sql).get(...a).n as number;

beforeEach(async () => {
  env = makeEnv();
  A = await seedTenant(env, 'alpha'); B = await seedTenant(env, 'bravo');
  a = client(env, await loginCookie(env, A.ownerEmail));
  expect((await a.put('/api/app/channels/whatsapp', { phoneNumberId: PNID_A, accessToken: 'EAAG' + 'x'.repeat(40) })).status).toBe(200);
  const b = client(env, await loginCookie(env, B.ownerEmail));
  expect((await b.put('/api/app/channels/whatsapp', { phoneNumberId: PNID_B, accessToken: 'EAAG' + 'y'.repeat(40) })).status).toBe(200);
  // approved FAQ so the assistant has something to say
  const s = await a.post('/api/app/knowledge/faq', { question: 'What are your office hours?', answer: 'We are open Monday to Friday 9am to 6pm.' });
  await a.patch(`/api/app/knowledge/${s.json.id}`, { published: true });
});
afterEach(() => vi.restoreAllMocks());

describe('webhook verification', () => {
  it('rejects missing, malformed and wrongly-signed payloads', async () => {
    const body = payload({ id: 'wamid.1' });
    expect((await post(body, { sig: null })).status).toBe(401);
    expect((await post(body, { sig: 'sha256=' + '0'.repeat(64) })).status).toBe(401);
    expect((await post(body, { sig: 'md5=abc' })).status).toBe(401);
    expect((await post(body, { secret: 'attacker-secret' })).status).toBe(401);
    expect(count('SELECT COUNT(*) n FROM provider_events')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM messages')).toBe(0);
  });
  it('verifySignature signs the exact raw bytes', async () => {
    const bytes = new TextEncoder().encode('{"a": 1}');
    const good = 'sha256=' + await hmacSha256Hex('s', bytes);
    expect(await verifySignature('s', bytes, good)).toBe(true);
    expect(await verifySignature('s', new TextEncoder().encode('{"a":1}'), good)).toBe(false);
  });
  it('answers Meta’s subscription handshake only with the right token', async () => {
    const ok = await app.request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=12345', {}, env);
    expect(ok.status).toBe(200); expect(await ok.text()).toBe('12345');
    expect((await app.request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345', {}, env)).status).toBe(403);
  });
  it('fails closed with a configuration error when secrets are missing', async () => {
    const e2 = makeEnv({ WHATSAPP_APP_SECRET: undefined, WHATSAPP_VERIFY_TOKEN: undefined });
    const r = await app.request('/api/webhooks/whatsapp', { method: 'POST', body: '{}' }, e2);
    expect(r.status).toBe(503);
    expect((await r.json() as any).error.code).toBe('not_configured');
    expect((await app.request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1', {}, e2)).status).toBe(503);
  });
});

describe('inbound processing', () => {
  it('maps the number to the right tenant, creates contact + lead + conversation, records consent, and replies from approved knowledge', async () => {
    const r = await post(payload({ id: 'wamid.A1', text: 'What are your office hours?' }));
    expect(r.status).toBe(200); expect(r.json.processed).toBe(1);
    const leads = (await a.get('/api/app/leads')).json;
    expect(leads.total).toBe(1);
    expect(leads.items[0]).toMatchObject({ source: 'whatsapp', phone: '6591234567', name: 'Mrs Tan' });
    const convs = (await a.get('/api/app/conversations')).json.items;
    expect(convs).toHaveLength(1);
    const detail = (await a.get(`/api/app/conversations/${convs[0].id}`)).json;
    expect(detail.messages.map((m: any) => m.direction)).toEqual(['inbound', 'outbound']);
    expect(detail.messages[1].body).toContain('Monday to Friday 9am to 6pm');
    expect(detail.messages[1].delivery_status).toBe('sent');
    expect(detail.messages[1].citations[0].title).toBe('What are your office hours?');
    expect(raw().prepare(`SELECT purpose, granted FROM consent_records`).get()).toMatchObject({ purpose: 'enquiry_processing', granted: 1 });
    // tenant B sees nothing
    const b = client(env, await loginCookie(env, B.ownerEmail));
    expect((await b.get('/api/app/leads')).json.total).toBe(0);
  });

  it('routes a message to the tenant that owns the receiving number', async () => {
    await post(payload({ pnid: PNID_B, id: 'wamid.B1', from: '6598887777', text: 'hi' }));
    expect((await a.get('/api/app/leads')).json.total).toBe(0);
    expect(count('SELECT COUNT(*) n FROM leads WHERE tenant_id = ?', B.tenantId)).toBe(1);
  });

  it('ignores numbers that are not connected to any agency', async () => {
    const r = await post(payload({ pnid: '999999999999', id: 'wamid.X1' }));
    expect(r.json.ignored).toBe(1);
    expect(count('SELECT COUNT(*) n FROM leads')).toBe(0);
    expect(raw().prepare('SELECT status FROM provider_events').get().status).toBe('ignored');
  });

  it('is idempotent: duplicate deliveries create no duplicate messages, leads or replies', async () => {
    const body = payload({ id: 'wamid.D1', text: 'What are your office hours?' });
    const r1 = await post(body); const r2 = await post(body); const r3 = await post(body);
    expect(r1.json.processed).toBe(1); expect(r2.json.duplicates).toBe(1); expect(r3.json.duplicates).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'inbound'`)).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'outbound'`)).toBe(1);
    expect(count('SELECT COUNT(*) n FROM leads')).toBe(1);
    expect(count('SELECT COUNT(*) n FROM provider_events')).toBe(1);
  });

  it('concurrent duplicate deliveries still produce exactly one of everything', async () => {
    const body = payload({ id: 'wamid.C1', text: 'What are your office hours?' });
    await Promise.all(Array.from({ length: 6 }, () => post(body)));
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'inbound'`)).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'outbound'`)).toBe(1);
  });

  it('keeps a customer’s messages in one conversation and one lead', async () => {
    await post(payload({ id: 'wamid.M1', text: 'hello' })); await post(payload({ id: 'wamid.M2', text: 'What are your office hours?' }));
    expect(count('SELECT COUNT(*) n FROM conversations')).toBe(1);
    expect(count('SELECT COUNT(*) n FROM leads')).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'inbound'`)).toBe(2);
  });

  it('answers non-text messages politely without invoking the assistant', async () => {
    const r = await post(payload({ id: 'wamid.IMG', type: 'image' }));
    expect(r.json.processed).toBe(1);
    expect(raw().prepare(`SELECT body FROM messages WHERE direction='outbound'`).get().body).toMatch(/only read text/);
  });

  it('human handoff from WhatsApp creates the task and leaves the assistant silent afterwards', async () => {
    await post(payload({ id: 'wamid.H1', text: 'I want to talk to a real person' }));
    expect((await a.get('/api/app/tasks?status=open')).json.items[0].origin).toBe('handoff');
    await post(payload({ id: 'wamid.H2', text: 'hello??' }));
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'outbound' AND sender_type = 'ai'`)).toBe(1); // only the handoff acknowledgement
  });
});

describe('delivery status tracking', () => {
  it('moves forward through sent → delivered → read and never regresses; failures carry an error', async () => {
    await post(payload({ id: 'wamid.S0', text: 'What are your office hours?' }));
    const out = raw().prepare(`SELECT provider_message_id id FROM messages WHERE direction='outbound'`).get().id as string;
    const st = (status: string, extra: object = {}) => post(payload({ statuses: [{ id: out, status, recipient_id: '6591234567', ...extra }] }));
    const cur = () => raw().prepare(`SELECT delivery_status s FROM messages WHERE provider_message_id = ?`).get(out).s;
    await st('delivered'); expect(cur()).toBe('delivered');
    await st('read'); expect(cur()).toBe('read');
    await st('delivered'); expect(cur()).toBe('read');   // stale/out-of-order event ignored
    await st('sent'); expect(cur()).toBe('read');
    await st('failed', { errors: [{ code: 131026, title: 'Message undeliverable' }] });
    const row = raw().prepare(`SELECT delivery_status s, error_code c, error_detail d FROM messages WHERE provider_message_id = ?`).get(out);
    expect(row).toMatchObject({ s: 'failed', c: '131026', d: 'Message undeliverable' });
    // visible to staff
    const conv = (await a.get('/api/app/conversations')).json.items[0];
    const failed = (await a.get(`/api/app/conversations/${conv.id}`)).json.messages.find((m: any) => m.delivery_status === 'failed');
    expect(failed.error_detail).toBe('Message undeliverable');
  });
  it('ignores status events for messages we never stored', async () => {
    const r = await post(payload({ statuses: [{ id: 'wamid.unknown', status: 'delivered' }] }));
    expect(r.status).toBe(200);
  });
});

describe('opt-in / opt-out', () => {
  it('recognises exact keywords only', () => {
    expect(handleOptKeywords('STOP')).toBe('out'); expect(handleOptKeywords(' stop. ')).toBe('out'); expect(handleOptKeywords('Unsubscribe')).toBe('out');
    expect(handleOptKeywords('please do not stop the service')).toBeNull(); expect(handleOptKeywords('START')).toBe('in');
  });
  it('STOP records an opt-out, blocks staff messages, and START restores them', async () => {
    await post(payload({ id: 'wamid.O1', text: 'hello' }));
    const convId = (await a.get('/api/app/conversations')).json.items[0].id;
    expect((await a.post(`/api/app/conversations/${convId}/messages`, { text: 'Hi from staff' })).status).toBe(201);
    await post(payload({ id: 'wamid.O2', text: 'STOP' }));
    expect(raw().prepare(`SELECT granted FROM consent_records WHERE purpose = 'follow_up_messages' ORDER BY created_at DESC, rowid DESC`).get().granted).toBe(0);
    const blocked = await a.post(`/api/app/conversations/${convId}/messages`, { text: 'Hi again' });
    expect(blocked.status).toBe(409); expect(blocked.json.error.code).toBe('opted_out');
    expect(raw().prepare(`SELECT body FROM messages WHERE direction='outbound' ORDER BY created_at DESC, rowid DESC`).get().body).toMatch(/unsubscribed/);
    await post(payload({ id: 'wamid.O3', text: 'START' }));
    expect((await a.post(`/api/app/conversations/${convId}/messages`, { text: 'Welcome back' })).status).toBe(201);
  });
});

describe('outbound from staff', () => {
  it('sends inside the 24h window; outside it requires an approved template', async () => {
    await post(payload({ id: 'wamid.W1', text: 'hello' }));
    const convId = (await a.get('/api/app/conversations')).json.items[0].id;
    raw().prepare(`UPDATE messages SET created_at = ? WHERE direction = 'inbound'`).run(new Date(Date.now() - 30 * 3600e3).toISOString());
    const noTpl = await a.post(`/api/app/conversations/${convId}/messages`, { text: 'Following up' });
    expect(noTpl.status).toBe(409); expect(noTpl.json.error.code).toBe('template_required');
    const tpl = await a.post(`/api/app/conversations/${convId}/messages`, { text: 'Following up', template: { name: 'follow_up_v1', params: ['Mrs Tan'] } });
    expect(tpl.status).toBe(201); expect(tpl.json.deliveryStatus).toBe('sent');
  });
  it('reports a clear configuration error when WhatsApp is not connected — never a fake success', async () => {
    await a.del('/api/app/channels/whatsapp');
    await post(payload({ id: 'wamid.W2', text: 'hello' })).catch(() => null);
    const w = await client(env).post(`/api/public/${A.publicKey}/conversations`);
    // a WhatsApp conversation can only exist via the webhook, so create one directly to test the guard
    raw().prepare(`INSERT INTO contacts (id, tenant_id, phone, created_at, updated_at) VALUES ('con_t', ?, '6591110000', 'x', 'x')`).run(A.tenantId);
    raw().prepare(`INSERT INTO conversations (id, tenant_id, contact_id, channel, external_ref, last_message_at, created_at) VALUES ('cnv_t', ?, 'con_t', 'whatsapp', '6591110000', 'x', 'x')`).run(A.tenantId);
    raw().prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, created_at) VALUES ('msg_t', ?, 'cnv_t', 'inbound', 'customer', 'hi', ?)`).run(A.tenantId, new Date().toISOString());
    const r = await a.post('/api/app/conversations/cnv_t/messages', { text: 'hello' });
    expect(r.status).toBe(503); expect(r.json.error.code).toBe('not_configured'); expect(w.status).toBe(201);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE conversation_id = 'cnv_t' AND direction = 'outbound'`)).toBe(0);
  });
  it('records a failed send honestly when the provider rejects it', async () => {
    const live = { ...env, WHATSAPP_MODE: 'live' } as Env;
    await post(payload({ id: 'wamid.W3', text: 'hello' }));
    const convId = (await a.get('/api/app/conversations')).json.items[0].id;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 190, message: 'Invalid OAuth access token TOKEN-SECRET' } }), { status: 401 }));
    const ca = client(live, await loginCookie(live, A.ownerEmail));
    const r = await ca.post(`/api/app/conversations/${convId}/messages`, { text: 'Hello from staff' });
    expect(r.status).toBe(502);
    expect(r.text).not.toContain('TOKEN-SECRET');
    const m = raw().prepare(`SELECT delivery_status s, error_code c FROM messages WHERE body = 'Hello from staff'`).get();
    expect(m).toMatchObject({ s: 'failed', c: 'provider_error' });
  });
});

describe('failures are recoverable and safe', () => {
  it('a provider outage marks the event failed, keeps the inbound message, and a retry completes it without duplicates', async () => {
    const live = { ...env, WHATSAPP_MODE: 'live' } as Env;
    const origEnv = env; env = live;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    const logs: string[] = []; vi.spyOn(console, 'error').mockImplementation((...x) => { logs.push(x.join(' ')); });
    const r = await post(payload({ id: 'wamid.R1', text: 'What are your office hours?' }));
    expect(r.status).toBe(200); expect(r.json.failed).toBe(1);
    expect(raw().prepare('SELECT status, attempts FROM provider_events').get()).toMatchObject({ status: 'failed', attempts: 1 });
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'inbound'`)).toBe(1);
    expect(raw().prepare(`SELECT delivery_status s FROM messages WHERE direction='outbound'`).get().s).toBe('failed');
    expect(logs.join('\n')).not.toContain('office hours');
    // provider recovers
    vi.restoreAllMocks(); env = origEnv;
    expect(await retryFailedEvents(env)).toBe(1);
    expect(raw().prepare('SELECT status, payload_json FROM provider_events').get()).toMatchObject({ status: 'processed', payload_json: null });
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'inbound'`)).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE direction = 'outbound' AND delivery_status = 'sent'`)).toBe(1);
    expect(count('SELECT COUNT(*) n FROM leads')).toBe(1);
    expect(await retryFailedEvents(env)).toBe(0);
  });

  it('gives up after the maximum number of attempts', async () => {
    const live = { ...env, WHATSAPP_MODE: 'live' } as Env;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    const origEnv = env; env = live;
    await post(payload({ id: 'wamid.R2', text: 'hello' }));
    for (let i = 0; i < 8; i++) await retryFailedEvents(live);
    expect(raw().prepare('SELECT attempts FROM provider_events').get().attempts).toBe(5);
    env = origEnv;
  });

  it('survives garbage payloads', async () => {
    for (const body of [{}, { entry: 'x' }, { entry: [{ changes: [{ value: { metadata: {} } }] }] }, { entry: [{ changes: [{ value: { metadata: { phone_number_id: PNID_A }, messages: [{ nope: 1 }] } }] }] }]) {
      expect((await post(body)).status).toBe(200);
    }
    expect(parseWebhook(null)).toEqual([]);
  });
});

describe('channel configuration', () => {
  it('stores the token encrypted and never returns it', async () => {
    const stored = raw().prepare(`SELECT token_enc FROM tenant_channels WHERE tenant_id = ?`).get(A.tenantId).token_enc as string;
    expect(stored.startsWith('v1.')).toBe(true); expect(stored).not.toContain('EAAG');
    const ch = await a.get('/api/app/channels');
    expect(ch.json.whatsapp).toMatchObject({ connected: true, hasToken: true, phoneNumberId: PNID_A });
    expect(ch.text).not.toContain('EAAG'); expect(ch.text).not.toContain(stored);
    expect(ch.json.whatsapp.webhookUrl).toContain('/api/webhooks/whatsapp');
  });
  it('refuses to store a token without an encryption key and refuses another agency’s number', async () => {
    const e2 = makeEnv({ ENCRYPTION_KEY: undefined }); const t2 = await seedTenant(e2, 'solo');
    const c2 = client(e2, await loginCookie(e2, t2.ownerEmail));
    const r = await c2.put('/api/app/channels/whatsapp', { phoneNumberId: '123456789', accessToken: 'EAAG' + 'z'.repeat(40) });
    expect(r.status).toBe(503); expect(r.json.error.code).toBe('not_configured');
    const clash = await a.put('/api/app/channels/whatsapp', { phoneNumberId: PNID_B });
    expect(clash.status).toBe(409);
  });
});
