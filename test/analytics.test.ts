import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { client, loginCookie, makeEnv, seedMember, seedTenant, startWidget, type TenantFx } from './helpers/env';
import { METRIC_DEFINITIONS } from '../src/services/analytics';

let env: Env; let T: TenantFx; let c: ReturnType<typeof client>;
const raw = () => (env.DB as any).raw;
const metrics = async (days = 30) => (await c.get(`/api/app/reports?days=${days}`)).json;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
  env = makeEnv(); T = await seedTenant(env, 'alpha'); c = client(env, await loginCookie(env, T.ownerEmail));
});
afterEach(() => vi.useRealTimers());

describe('metrics are computed from the database and defined precisely', () => {
  it('reports zeros (not fake numbers) for an empty agency, and no revenue', async () => {
    const r = await metrics();
    expect(r.metrics).toMatchObject({ enquiries: 0, newLeads: 0, awaitingFirstContact: 0, qualified: 0, confirmedUpcoming: 0, overdueFollowUps: 0, leadToConsultationRate: null, medianFirstResponseMin: null });
    expect(r.revenue).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/revenue.*\d/i);
    for (const k of Object.keys(r.metrics).filter((k) => !['handoffs', 'aiAttempts', 'aiFailures'].includes(k))) expect(METRIC_DEFINITIONS[k], k).toBeTruthy();
  });

  it('distinguishes enquiries, unique leads, bookings, completed consultations and converted customers', async () => {
    // 3 web enquiries from 2 people; the third visitor never shares contact details.
    const w1 = await startWidget(env, T.publicKey); await w1.say('hello'); await w1.contact({ name: 'P One', phone: '91230001', consent: true });
    const w2 = await startWidget(env, T.publicKey); await w2.say('hello'); await w2.contact({ name: 'P One again', phone: '91230001', consent: true });
    const w3 = await startWidget(env, T.publicKey); await w3.say('just browsing');
    const w4 = await startWidget(env, T.publicKey); await w4.say('hello'); await w4.contact({ name: 'P Two', phone: '91230002', consent: true });
    // bookings
    const leads = (await c.get('/api/app/leads')).json.items; const l1 = leads.find((l: any) => l.phone === '6591230001'); const l2 = leads.find((l: any) => l.phone === '6591230002');
    const b1 = (await c.post('/api/app/bookings', { leadId: l1.id, start: '2026-10-12T03:00:00Z', idempotencyKey: 'analytics-b1' })).json;
    const b2 = (await c.post('/api/app/bookings', { leadId: l2.id, start: '2026-10-12T04:00:00Z', idempotencyKey: 'analytics-b2' })).json;
    await c.post(`/api/app/bookings/${b2.id}/cancel`, {});
    vi.setSystemTime(new Date('2026-10-12T06:00:00Z'));
    await c.post(`/api/app/bookings/${b1.id}/outcome`, { outcome: 'completed' });
    await c.patch(`/api/app/leads/${l1.id}`, { status: 'converted' });
    const m = (await metrics()).metrics;
    expect(m.enquiries).toBe(4);                    // conversations with a customer message
    expect(m.newLeads).toBe(2);                     // unique people, not conversations
    expect(m.consultationsBooked).toBe(1);          // cancelled booking excluded
    expect(m.consultationsCompleted).toBe(1);
    expect(m.converted).toBe(1);
    expect(m.confirmedUpcoming).toBe(0);            // the only live booking has been held
    expect(m.leadToConsultationRate).toBe(50);      // 1 of 2 leads
    expect((await metrics()).revenue).toBeNull();
  });

  it('computes response times and awaiting-first-contact from real timestamps', async () => {
    const w = await startWidget(env, T.publicKey); await w.contact({ name: 'Fast', phone: '91230003', consent: true });
    raw().prepare(`UPDATE leads SET created_at = '2026-10-11T23:50:00.000Z', first_response_at = '2026-10-11T23:55:00.000Z'`).run(); // 5 min
    const l2 = (await c.post('/api/app/leads', { name: 'Slow', phone: '91230004' })).json;
    raw().prepare(`UPDATE leads SET created_at = '2026-10-11T22:00:00.000Z', first_response_at = '2026-10-12T00:00:00.000Z', first_human_contact_at = '2026-10-12T00:00:00.000Z' WHERE id = ?`).run(l2.id); // 120 min
    await c.post('/api/app/leads', { name: 'Waiting', phone: '91230005' });
    const m = (await metrics()).metrics;
    expect(m.medianFirstResponseMin).toBe(62.5);
    expect(m.medianHumanResponseMin).toBe(120);
    expect(m.awaitingFirstContact).toBe(2); // 'Fast' only got an automated reply; 'Waiting' got nothing
  });

  it('counts handoffs and AI failures, and breaks conversation volume down by channel', async () => {
    const w = await startWidget(env, T.publicKey); await w.say('I want a refund');
    const w2 = await startWidget(env, T.publicKey); await w2.say('hello');
    raw().prepare(`INSERT INTO usage_records (id, tenant_id, kind, quantity, day, created_at) VALUES ('u1', ?, 'ai_call', 9, '2026-10-12', '2026-10-12T00:00:00.000Z'), ('u2', ?, 'ai_failure', 1, '2026-10-12', '2026-10-12T00:00:00.000Z')`).run(T.tenantId, T.tenantId);
    const r = await metrics();
    expect(r.metrics.handoffs).toBe(1);
    expect(r.metrics.handoffRate).toBe(50);
    expect(r.metrics.aiFailureRate).toBe(10);
    expect(r.byChannel).toEqual([expect.objectContaining({ channel: 'web', conversations: 2 })]);
  });

  it('excludes admin preview conversations from every report', async () => {
    const p = await c.post(`/api/public/${T.publicKey}/conversations`, { preview: true });
    const base = `/api/public/${T.publicKey}/conversations/${p.json.conversationId}`; const h = { 'x-conversation-token': p.json.token };
    await client(env).post(`${base}/messages`, { text: 'testing the widget', clientMessageId: 'preview-msg-1' }, h);
    await client(env).post(`${base}/contact`, { name: 'Admin Test', phone: '91239998', consent: true }, h);
    const m = (await metrics()).metrics;
    expect(m.enquiries).toBe(0); expect(m.newLeads).toBe(0); expect(m.awaitingFirstContact).toBe(0);
    expect((await c.get('/api/app/leads')).json.total).toBe(0);
  });

  it('the overview answers "what needs attention now" with real rows', async () => {
    await c.post('/api/app/leads', { name: 'Needs reply', phone: '91230006' });
    const l = (await c.post('/api/app/leads', { name: 'Overdue', phone: '91230007' })).json;
    await c.patch(`/api/app/leads/${l.id}`, { status: 'contacted' });
    await c.post(`/api/app/leads/${l.id}/next-action`, { title: 'Call', dueAt: '2026-10-11T00:00:00Z' });
    const o = (await c.get('/api/app/overview')).json;
    expect(o.attention.map((x: any) => x.reason).sort()).toEqual(['awaiting_first_contact', 'follow_up_overdue']);
    expect(o.metrics.overdueFollowUps).toBe(1);
    expect(o.health.ok).toBe(false);
    expect(o.health.issues.join(' ')).toMatch(/No published knowledge/);
    expect(o.health.issues.join(' ')).toMatch(/No AI model configured/);
  });

  it('usage is metered per tenant for cost tracking', async () => {
    const w = await startWidget(env, T.publicKey); await w.say('hello there');
    const u = (await c.get('/api/app/usage')).json.usage;
    expect(u.msg_in).toBe(1); expect(u.msg_out).toBe(1);
    const other = await seedTenant(env, 'bravo'); const co = client(env, await loginCookie(env, other.ownerEmail));
    expect((await co.get('/api/app/usage')).json.usage.msg_in ?? 0).toBe(0);
  });

  it('consultants cannot open reports', async () => {
    await seedMember(env, T.tenantId, 'c@alpha.test', 'consultant', T.ownerId);
    const cc = client(env, await loginCookie(env, 'c@alpha.test'));
    expect((await cc.get('/api/app/reports')).status).toBe(403);
    expect((await cc.get('/api/app/overview')).status).toBe(200);
  });
});

describe('demo data labelling', () => {
  it('flags demo agencies so the UI can never present them as production', async () => {
    const res = await client(env).post('/api/platform/tenants', { agencyName: 'DEMO Agency', slug: 'demo-x', ownerName: 'D', ownerEmail: 'd@demo-x.test', demo: true }, { authorization: 'Bearer op-token' });
    expect(res.status).toBe(201);
    const token = new URL(res.json.inviteUrl.replace('#/', '')).searchParams.get('token')!;
    const login = await client(env).post('/api/auth/accept-invite', { token, password: 'long enough pass' });
    const me = await client(env, (login.headers.get('set-cookie') ?? '').split(';')[0]).get('/api/auth/me');
    expect(me.json.tenant.isDemo).toBe(true);
    expect((await c.get('/api/auth/me')).json.tenant.isDemo).toBe(false);
  });
  it('greets by first name, not title', async () => {
    const w = await startWidget(env, T.publicKey);
    const r = await w.contact({ name: 'Mrs Tan Mei', phone: '91230010', consent: true });
    expect(r.json.reply.text).toMatch(/^Thanks Tan,/);
  });
});
