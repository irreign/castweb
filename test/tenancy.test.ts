import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { client, loginCookie, makeEnv, seedMember, seedTenant, startWidget, type TenantFx } from './helpers/env';
import { createFaq } from '../src/services/knowledge';
import { app } from '../src/index';

let env: Env; let A: TenantFx; let B: TenantFx;
let a: ReturnType<typeof client>; let b: ReturnType<typeof client>;
let aLead: string, bLead: string, bConv: string, bSource: string, bBooking: string;

async function leadFor(c: ReturnType<typeof client>, name: string) {
  const r = await c.post('/api/app/leads', { name, phone: '91234567' + Math.floor(Math.random() * 9), source: 'manual' });
  expect(r.status).toBe(201);
  return r.json.id as string;
}

beforeEach(async () => {
  env = makeEnv();
  A = await seedTenant(env, 'alpha'); B = await seedTenant(env, 'bravo');
  a = client(env, await loginCookie(env, A.ownerEmail));
  b = client(env, await loginCookie(env, B.ownerEmail));
  aLead = await leadFor(a, 'Alice Alpha'); bLead = await leadFor(b, 'Bob Bravo');
  // Tenant B: a widget conversation with a lead, an FAQ source, and a booking.
  const w = await startWidget(env, B.publicKey);
  await w.say('hello there');
  await w.contact({ name: 'Bea', phone: '98887777', consent: true });
  bConv = w.conversationId;
  bSource = (await createFaq(env.DB, B.tenantId, { type: 'system' }, { question: 'What are your fees?', answer: 'Our service fee is 1 month salary.' })).id;
  const slot = (await b.get('/api/app/slots')).json.slots[0];
  const bk = await b.post('/api/app/bookings', { leadId: bLead, start: slot.start, idempotencyKey: 'bravo-booking-1' });
  expect(bk.status).toBe(201);
  bBooking = bk.json.id;
});

describe('authentication', () => {
  it('rejects unauthenticated access to every private endpoint', async () => {
    const anon = client(env);
    for (const p of ['/api/app/overview', '/api/app/leads', `/api/app/leads/${aLead}`, '/api/app/conversations', '/api/app/bookings', '/api/app/tasks', '/api/app/knowledge', '/api/app/settings', '/api/app/team', '/api/app/reports', '/api/app/audit', '/api/app/channels']) {
      const r = await anon.get(p);
      expect(r.status, p).toBe(401);
    }
  });

  it('rejects a forged or malformed session cookie', async () => {
    const r = await client(env, 'nl_session=deadbeef').get('/api/app/leads');
    expect(r.status).toBe(401);
  });

  it('refuses wrong passwords with a generic message and locks after repeated failures', async () => {
    const c = client(env);
    const bad = await c.post('/api/auth/login', { email: A.ownerEmail, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.json.error.message).toBe('Incorrect email or password');
    const unknown = await c.post('/api/auth/login', { email: 'nobody@nowhere.test', password: 'wrong-password' });
    expect(unknown.json.error.message).toBe(bad.json.error.message);
    for (let i = 0; i < 8; i++) await c.post('/api/auth/login', { email: A.ownerEmail, password: 'wrong-password' });
    const locked = await c.post('/api/auth/login', { email: A.ownerEmail, password: 'correct horse battery' });
    expect(locked.status).toBe(429);
  });

  it('blocks cross-origin and header-less state-changing requests (CSRF)', async () => {
    const cookie = await loginCookie(env, A.ownerEmail);
    const cross = await app.request('/api/app/leads', { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json', 'x-requested-with': 'nexus' }, body: JSON.stringify({ name: 'x', phone: '91234567' }) }, env);
    expect(cross.status).toBe(403);
    const noHeader = await app.request('/api/app/leads', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', phone: '91234567' }) }, env);
    expect(noHeader.status).toBe(403);
  });

  it('does not set a non-HttpOnly session cookie', async () => {
    const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'nexus' }, body: JSON.stringify({ email: A.ownerEmail, password: 'correct horse battery' }) }, env);
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
  });
});

describe('tenant isolation (tenant A cannot touch tenant B)', () => {
  it('cannot read or modify B’s leads', async () => {
    expect((await a.get(`/api/app/leads/${bLead}`)).status).toBe(404);
    expect((await a.patch(`/api/app/leads/${bLead}`, { status: 'contacted' })).status).toBe(404);
    expect((await a.post(`/api/app/leads/${bLead}/notes`, { text: 'pwn' })).status).toBe(404);
    expect((await a.post(`/api/app/leads/${bLead}/next-action`, { title: 'x y', dueAt: new Date().toISOString() })).status).toBe(404);
    const list = await a.get('/api/app/leads?pageSize=100');
    expect(list.json.items.map((l: any) => l.id)).not.toContain(bLead);
    expect((await b.get(`/api/app/leads/${bLead}`)).json.lead.status).toBe('consultation_booked'); // untouched by A's attempts
  });

  it('cannot read or modify B’s conversations and messages', async () => {
    expect((await a.get(`/api/app/conversations/${bConv}`)).status).toBe(404);
    expect((await a.post(`/api/app/conversations/${bConv}/messages`, { text: 'hi' })).status).toBe(404);
    expect((await a.post(`/api/app/conversations/${bConv}/resolve`)).status).toBe(404);
    expect((await a.post(`/api/app/conversations/${bConv}/assign`, { userId: A.ownerId })).status).toBe(404);
    expect((await a.post(`/api/app/conversations/${bConv}/handoff`, { reason: 'x y' })).status).toBe(404);
    expect((await a.get('/api/app/conversations')).json.items.map((c: any) => c.id)).not.toContain(bConv);
  });

  it('cannot read, cancel, reschedule or list B’s bookings', async () => {
    expect((await a.post(`/api/app/bookings/${bBooking}/cancel`, {})).status).toBe(404);
    expect((await a.post(`/api/app/bookings/${bBooking}/reschedule`, { start: new Date(Date.now() + 5 * 864e5).toISOString() })).status).toBe(404);
    expect((await a.post(`/api/app/bookings/${bBooking}/outcome`, { outcome: 'completed' })).status).toBe(404);
    expect((await a.get('/api/app/bookings')).json.items.map((x: any) => x.id)).not.toContain(bBooking);
    expect((await b.get('/api/app/bookings?status=confirmed')).json.items.length).toBe(1);
  });

  it('cannot use B’s lead when creating a booking, task or follow-up', async () => {
    const slot = (await a.get('/api/app/slots')).json.slots[0];
    expect((await a.post('/api/app/bookings', { leadId: bLead, start: slot.start, idempotencyKey: 'attack-booking-1' })).status).toBe(404);
    expect((await a.post('/api/app/tasks', { leadId: bLead, title: 'cross tenant', dueAt: new Date().toISOString() })).status).toBe(404);
  });

  it('cannot read or alter B’s knowledge sources', async () => {
    expect((await a.get(`/api/app/knowledge/${bSource}`)).status).toBe(404);
    expect((await a.patch(`/api/app/knowledge/${bSource}`, { published: true })).status).toBe(404);
    expect((await a.del(`/api/app/knowledge/${bSource}`)).status).toBe(404);
    expect((await a.post(`/api/app/knowledge/${bSource}/reprocess`, {})).status).toBe(404);
    expect((await a.get('/api/app/knowledge')).json.items.map((s: any) => s.id)).not.toContain(bSource);
    expect((await b.get('/api/app/knowledge')).json.items.length).toBe(1);
  });

  it('cannot assign B’s users or stamp B’s tenant via request payloads', async () => {
    // assigning to a user from another tenant is refused
    expect((await a.patch(`/api/app/leads/${aLead}`, { assignedTo: B.ownerId })).status).toBe(400);
    // a smuggled tenant_id is rejected by the strict schema, never honoured
    const r = await a.patch(`/api/app/leads/${aLead}`, { tenant_id: B.tenantId, summary: 'x' });
    expect(r.status).toBe(400);
    const create = await a.post('/api/app/leads', { name: 'Smuggler', phone: '91110000', tenantId: B.tenantId, tenant_id: B.tenantId });
    expect(create.status).toBe(201);
    const count = env.DB as any;
    const row = count.raw.prepare('SELECT tenant_id FROM leads WHERE id = ?').get(create.json.id);
    expect(row.tenant_id).toBe(A.tenantId);
  });

  it('keeps settings, team and channels separate', async () => {
    await a.put('/api/app/settings/ai', { greeting: 'Alpha greeting' });
    expect((await b.get('/api/app/settings')).json.ai.greeting).not.toBe('Alpha greeting');
    expect((await a.get('/api/app/team')).json.items.every((m: any) => m.email.endsWith('@alpha.test'))).toBe(true);
    expect((await a.patch(`/api/app/team/${B.ownerId}`, { active: false })).status).toBe(404);
    expect((await a.post('/api/app/tasks', { title: 'mine', dueAt: new Date().toISOString() })).status).toBe(201);
    expect((await b.get('/api/app/tasks')).json.items.some((t: any) => t.title === 'mine')).toBe(false);
  });

  it('analytics only count the caller’s own data', async () => {
    const ra = (await a.get('/api/app/reports?days=30')).json.metrics; const rb = (await b.get('/api/app/reports?days=30')).json.metrics;
    expect(ra.newLeads).toBe(1);
    expect(rb.newLeads).toBeGreaterThanOrEqual(2);
    expect(ra.confirmedUpcoming).toBe(0);
    expect(rb.confirmedUpcoming).toBe(1);
  });
});

describe('role-based access', () => {
  it('prevents consultants from administering the agency', async () => {
    const cid = await seedMember(env, A.tenantId, 'consultant@alpha.test', 'consultant', A.ownerId);
    const c = client(env, await loginCookie(env, 'consultant@alpha.test'));
    expect((await c.get('/api/app/leads')).status).toBe(200);
    for (const [m, p, body] of [
      ['get', '/api/app/knowledge'], ['post', '/api/app/knowledge/faq', { question: 'Q question?', answer: 'An answer here' }],
      ['put', '/api/app/settings/ai', { enabled: false }], ['post', '/api/app/team', { name: 'x', email: 'x@alpha.test', role: 'admin' }],
      ['get', '/api/app/reports'], ['get', '/api/app/audit'], ['get', '/api/app/channels'], ['put', '/api/app/channels/whatsapp', { phoneNumberId: '123456789' }],
      ['patch', `/api/app/team/${cid}`, { role: 'owner' }], ['post', '/api/app/privacy/erase-contact', { leadId: aLead }],
    ] as const) {
      const r = await (c as any)[m](p, body);
      expect(r.status, `${m} ${p}`).toBe(403);
    }
    // consultants cannot read other people's availability, but can read their own
    expect((await c.get(`/api/app/team/${A.ownerId}/availability`)).status).toBe(403);
    expect((await c.get(`/api/app/team/${cid}/availability`)).status).toBe(200);
  });

  it('cannot self-promote by changing request fields, and the last owner cannot be removed', async () => {
    const cid = await seedMember(env, A.tenantId, 'consultant@alpha.test', 'consultant', A.ownerId);
    const c = client(env, await loginCookie(env, 'consultant@alpha.test'));
    expect((await c.patch(`/api/app/team/${cid}`, { role: 'owner' })).status).toBe(403);
    expect((await c.get('/api/auth/me')).json.user.role).toBe('consultant');
    const adminId = await seedMember(env, A.tenantId, 'admin@alpha.test', 'admin', A.ownerId);
    const adm = client(env, await loginCookie(env, 'admin@alpha.test'));
    expect((await adm.patch(`/api/app/team/${adminId}`, { role: 'owner' })).status).toBe(403); // admin cannot self-promote
    expect((await adm.patch(`/api/app/team/${A.ownerId}`, { active: false })).status).toBe(403); // nor demote an owner
    expect((await a.patch(`/api/app/team/${A.ownerId}`, { role: 'admin' })).status).toBe(403); // owner cannot change own role
    expect((await a.put('/api/app/settings/limits', { aiCallsPerMonth: 5, messagesPerMonth: 5 })).status).toBe(200);
    expect((await adm.put('/api/app/settings/limits', { aiCallsPerMonth: 5, messagesPerMonth: 5 })).status).toBe(403); // owner-only
  });

  it('a deactivated user loses access immediately', async () => {
    const cid = await seedMember(env, A.tenantId, 'consultant@alpha.test', 'consultant', A.ownerId);
    const c = client(env, await loginCookie(env, 'consultant@alpha.test'));
    expect((await c.get('/api/app/leads')).status).toBe(200);
    expect((await a.patch(`/api/app/team/${cid}`, { active: false })).status).toBe(200);
    expect((await c.get('/api/app/leads')).status).toBe(401);
  });
});

describe('public widget surface', () => {
  it('exposes only branding and generic contact info, never tenant records', async () => {
    const r = await client(env).get(`/api/public/${A.publicKey}/config`);
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.json);
    expect(text).not.toContain(A.tenantId);
    expect(text).not.toContain(A.ownerEmail);
    expect(text).not.toContain('password');
    expect(Object.keys(r.json)).not.toContain('settings');
  });

  it('the widget key cannot be used as a credential on private routes', async () => {
    const c = client(env);
    for (const h of [{ authorization: `Bearer ${A.publicKey}` }, { 'x-api-key': A.publicKey }, { cookie: `nl_session=${A.publicKey}` }] as Record<string, string>[]) {
      expect((await c.get('/api/app/leads', h)).status).toBe(401);
    }
  });

  it('unknown or wrong-tenant keys behave identically (no existence leak)', async () => {
    const c = client(env);
    expect((await c.get('/api/public/pk_doesnotexist/config')).status).toBe(404);
    // A conversation from tenant B cannot be accessed through tenant A's key, with the right token
    const wb = await startWidget(env, B.publicKey);
    const via = await c.get(`/api/public/${A.publicKey}/conversations/${wb.conversationId}/messages`, { 'x-conversation-token': wb.token });
    expect(via.status).toBe(404);
  });

  it('conversation access requires its secret token', async () => {
    const w = await startWidget(env, A.publicKey);
    const c = client(env);
    const noTok = await c.get(`/api/public/${A.publicKey}/conversations/${w.conversationId}/messages`);
    const badTok = await c.get(`/api/public/${A.publicKey}/conversations/${w.conversationId}/messages`, { 'x-conversation-token': 'nope' });
    expect(noTok.status).toBe(404); expect(badTok.status).toBe(404);
    expect((await w.poll()).status).toBe(200);
  });

  it('public slots expose times only — no consultant identities', async () => {
    const w = await startWidget(env, A.publicKey);
    const s = await w.slots();
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.json)).not.toMatch(/consultant|owner@|usr_/i);
  });

  it('rejects preview mode without an admin session for that tenant', async () => {
    const anon = await client(env).post(`/api/public/${A.publicKey}/conversations`, { preview: true });
    expect(anon.status).toBe(403);
    const otherTenantAdmin = await client(env, await loginCookie(env, B.ownerEmail)).post(`/api/public/${A.publicKey}/conversations`, { preview: true });
    expect(otherTenantAdmin.status).toBe(403);
    const own = await client(env, await loginCookie(env, A.ownerEmail)).post(`/api/public/${A.publicKey}/conversations`, { preview: true });
    expect(own.status).toBe(201);
  });
});

describe('platform provisioning', () => {
  it('requires the operator token', async () => {
    const c = client(env);
    const body = { agencyName: 'Charlie Agency', slug: 'charlie', ownerName: 'C', ownerEmail: 'c@charlie.test' };
    expect((await c.post('/api/platform/tenants', body)).status).toBe(401);
    expect((await c.post('/api/platform/tenants', body, { authorization: 'Bearer wrong' })).status).toBe(401);
    const ok = await c.post('/api/platform/tenants', body, { authorization: 'Bearer op-token' });
    expect(ok.status).toBe(201);
    expect(ok.json.inviteUrl).toContain('accept-invite');
    expect((await c.post('/api/platform/tenants', body, { authorization: 'Bearer op-token' })).status).toBe(409); // slug taken
  });
  it('is disabled when no operator token is configured', async () => {
    const e2 = makeEnv({ PLATFORM_ADMIN_TOKEN: undefined });
    expect((await client(e2).post('/api/platform/tenants', {}, { authorization: 'Bearer anything' })).status).toBe(503);
  });
});
