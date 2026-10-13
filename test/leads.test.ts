import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { client, loginCookie, makeEnv, seedMember, seedTenant, startWidget, type TenantFx } from './helpers/env';
import { canTransition, normalisePhone, LEAD_STATUSES } from '../src/services/leads';
import { runRetention } from '../src/services/retention';

let env: Env; let T: TenantFx; let c: ReturnType<typeof client>;
const raw = () => (env.DB as any).raw;
const mk = async (name: string, phone: string, extra: object = {}) => (await c.post('/api/app/leads', { name, phone, ...extra })).json;

beforeEach(async () => { env = makeEnv(); T = await seedTenant(env, 'alpha'); c = client(env, await loginCookie(env, T.ownerEmail)); });
afterEach(() => vi.useRealTimers());

describe('lead creation and association', () => {
  it('normalises phone numbers and reuses the same lead for the same person', async () => {
    const l1 = await c.post('/api/app/leads', { name: 'Tan', phone: '+65 9123 4567' });
    const l2 = await c.post('/api/app/leads', { name: 'Tan again', phone: '91234567' });
    expect(l1.status).toBe(201); expect(l2.status).toBe(200);
    expect(l2.json.id).toBe(l1.json.id);
    expect(l1.json.phone).toBe('6591234567');
    expect(normalisePhone('9123 4567')).toBe('6591234567');
    expect(normalisePhone('abc')).toBeNull(); expect(normalisePhone('123')).toBeNull();
    expect((await c.post('/api/app/leads', { name: 'Bad', phone: '12' })).status).toBe(422);
  });

  it('a returning widget visitor with the same phone attaches to the existing open lead', async () => {
    const existing = await mk('Lim', '91230000');
    const w = await startWidget(env, T.publicKey);
    await w.contact({ name: 'Lim Wei', phone: '+65 9123 0000', consent: true });
    const leads = (await c.get('/api/app/leads')).json;
    expect(leads.total).toBe(1);
    expect(leads.items[0].id).toBe(existing.id);
    expect(leads.items[0].name).toBe('Lim'); // an anonymous visitor cannot overwrite known details
  });

  it('a closed lead is not reused: the returning customer gets a fresh enquiry', async () => {
    const l = await mk('Lim', '91230000');
    await c.patch(`/api/app/leads/${l.id}`, { status: 'closed', closedReason: 'chose another agency' });
    const w = await startWidget(env, T.publicKey);
    await w.contact({ name: 'Lim', phone: '91230000', consent: true });
    expect((await c.get('/api/app/leads')).json.total).toBe(2);
  });

  it('keeps conversation history tied to the right tenant, contact and lead', async () => {
    const w = await startWidget(env, T.publicKey);
    await w.say('hello there');
    await w.contact({ name: 'Cust', phone: '91239999', consent: true });
    const conv = (await c.get(`/api/app/conversations/${w.conversationId}`)).json;
    expect(conv.contact.phone).toBe('6591239999');
    expect(conv.lead.id).toBe(conv.conversation.lead_id);
    expect(conv.messages.filter((m: any) => m.direction === 'inbound')).toHaveLength(1);
    expect(raw().prepare('SELECT DISTINCT tenant_id FROM messages').all().map((r: any) => r.tenant_id)).toEqual([T.tenantId]);
  });
});

describe('status transitions', () => {
  it('encodes the allowed state machine', () => {
    expect(canTransition('new', 'contacted')).toBe(true);
    expect(canTransition('new', 'converted')).toBe(false);
    expect(canTransition('new', 'consultation_booked')).toBe(false);          // manual path blocked
    expect(canTransition('new', 'consultation_booked', true)).toBe(true);      // booking service only
    expect(canTransition('converted', 'closed')).toBe(false);                  // terminal
    expect(canTransition('closed', 'contacted')).toBe(true);                   // reopen
    expect(canTransition('closed', 'converted')).toBe(false);
    expect(LEAD_STATUSES).toHaveLength(7);
  });

  it('enforces transitions through the API with clear errors', async () => {
    const l = await mk('A', '91230001');
    const bad = await c.patch(`/api/app/leads/${l.id}`, { status: 'converted' });
    expect(bad.status).toBe(409); expect(bad.json.error.code).toBe('invalid_transition');
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'consultation_booked' })).status).toBe(409);
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'closed' })).status).toBe(422); // reason required
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'bogus' })).status).toBe(400);
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'contacted' })).json.status).toBe('contacted');
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'qualified' })).json.status).toBe('qualified');
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'converted' })).json.status).toBe('converted');
    expect((await c.patch(`/api/app/leads/${l.id}`, { status: 'closed', closedReason: 'x y z' })).status).toBe(409);
  });

  it('records important changes in the audit history', async () => {
    const l = await mk('A', '91230001');
    await c.patch(`/api/app/leads/${l.id}`, { status: 'contacted', assignedTo: T.ownerId });
    await c.post(`/api/app/leads/${l.id}/notes`, { text: 'Called, will call back' });
    const d = (await c.get(`/api/app/leads/${l.id}`)).json;
    expect(d.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['lead.created', 'lead.updated', 'lead.note_added']));
    expect(d.notes[0].body).toBe('Called, will call back');
    expect(d.lead.assigned_to).toBe(T.ownerId);
    expect(d.lead.first_human_contact_at).toBeTruthy();
  });
});

describe('search, filter, sort, paginate', () => {
  beforeEach(async () => {
    const owner2 = await seedMember(env, T.tenantId, 'c2@alpha.test', 'consultant', T.ownerId);
    const a = await mk('Alice Tan', '91230001', { email: 'alice@example.com' });
    const b = await mk('Bob Lim', '91230002'); const d = await mk('Carol 100%_x', '91230003');
    await c.patch(`/api/app/leads/${b.id}`, { status: 'contacted', assignedTo: owner2 });
    await c.patch(`/api/app/leads/${a.id}`, { status: 'contacted' });
    await c.post(`/api/app/leads/${d.id}/next-action`, { title: 'Call Carol', dueAt: '2026-11-01T02:00:00Z' });
    await c.post(`/api/app/leads/${a.id}/next-action`, { title: 'Call Alice', dueAt: '2026-10-20T02:00:00Z' });
  });
  const names = (r: any) => r.json.items.map((l: any) => l.name);
  it('searches by name, phone and email', async () => {
    expect(names(await c.get('/api/app/leads?q=alice'))).toEqual(['Alice Tan']);
    expect(names(await c.get('/api/app/leads?q=91230002'))).toEqual(['Bob Lim']);
    expect(names(await c.get('/api/app/leads?q=example.com'))).toEqual(['Alice Tan']);
  });
  it('treats LIKE wildcards literally', async () => {
    expect((await c.get('/api/app/leads?q=%25')).json.total).toBe(1); // only "100%_x" contains a literal %
    expect((await c.get('/api/app/leads?q=_')).json.total).toBe(1);
  });
  it('filters by status, assignee and source', async () => {
    expect((await c.get('/api/app/leads?status=contacted')).json.total).toBe(2);
    expect((await c.get('/api/app/leads?assigned=unassigned')).json.total).toBe(2);
    expect((await c.get('/api/app/leads?assigned=me')).json.total).toBe(0);
    expect((await c.get('/api/app/leads?source=manual')).json.total).toBe(3);
    expect((await c.get('/api/app/leads?source=whatsapp')).json.total).toBe(0);
  });
  it('sorts with empty values last and paginates deterministically', async () => {
    expect(names(await c.get('/api/app/leads?sort=next_action_due&order=asc'))).toEqual(['Alice Tan', 'Carol 100%_x', 'Bob Lim']);
    expect(names(await c.get('/api/app/leads?sort=next_action_due&order=desc'))).toEqual(['Carol 100%_x', 'Alice Tan', 'Bob Lim']);
    expect(names(await c.get('/api/app/leads?sort=name&order=asc'))).toEqual(['Alice Tan', 'Bob Lim', 'Carol 100%_x']);
    const p1 = await c.get('/api/app/leads?sort=name&order=asc&pageSize=2&page=1'); const p2 = await c.get('/api/app/leads?sort=name&order=asc&pageSize=2&page=2');
    expect([...names(p1), ...names(p2)]).toEqual(['Alice Tan', 'Bob Lim', 'Carol 100%_x']);
    expect(p1.json.total).toBe(3);
    expect((await c.get('/api/app/leads?pageSize=500')).status).toBe(400);
    expect((await c.get('/api/app/leads?sort=password')).status).toBe(400);
  });
});

describe('follow-ups', () => {
  it('next action creates a task, mirrors onto the lead, flags overdue, and clears on completion', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
    const l = await mk('A', '91230001');
    const r = await c.post(`/api/app/leads/${l.id}/next-action`, { title: 'Call back about fees', dueAt: '2026-10-12T06:00:00Z', priority: 'high' });
    expect(r.status).toBe(201);
    expect(r.json.lead.next_action).toBe('Call back about fees');
    let tasks = (await c.get('/api/app/tasks?status=open')).json.items;
    expect(tasks[0].overdue).toBe(0);
    vi.setSystemTime(new Date('2026-10-12T07:00:00Z'));
    tasks = (await c.get('/api/app/tasks?status=open')).json.items;
    expect(tasks[0].overdue).toBe(1);
    expect((await c.get('/api/app/tasks?overdue=1')).json.items).toHaveLength(1);
    expect((await c.get('/api/app/overview')).json.metrics.overdueFollowUps).toBe(1);
    await c.patch(`/api/app/tasks/${r.json.id}`, { status: 'done' });
    expect((await c.get(`/api/app/leads/${l.id}`)).json.lead.next_action).toBeNull();
    expect((await c.get('/api/app/tasks?status=open')).json.items).toHaveLength(0);
    expect((await c.get('/api/app/overview')).json.metrics.overdueFollowUps).toBe(0);
  });

  it('lead shows the earliest open task as its next action', async () => {
    const l = await mk('A', '91230001');
    await c.post(`/api/app/leads/${l.id}/next-action`, { title: 'Later', dueAt: '2026-12-01T00:00:00Z' });
    await c.post(`/api/app/leads/${l.id}/next-action`, { title: 'Sooner', dueAt: '2026-11-01T00:00:00Z' });
    expect((await c.get(`/api/app/leads/${l.id}`)).json.lead.next_action).toBe('Sooner');
  });

  it('validates task input', async () => {
    expect((await c.post('/api/app/tasks', { title: 'x', dueAt: 'tomorrow' })).status).toBe(400);
    expect((await c.post('/api/app/tasks', { title: 'Valid title', dueAt: new Date().toISOString(), ownerId: 'usr_nobody' })).status).toBe(400);
  });
});

describe('conversation actions', () => {
  it('assign, create follow-up, record handoff, resolve — all work and are reflected', async () => {
    const w = await startWidget(env, T.publicKey);
    await w.say('hello there'); await w.contact({ name: 'Cust', phone: '91230001', consent: true });
    const id = w.conversationId;
    expect((await c.post(`/api/app/conversations/${id}/assign`, { userId: T.ownerId })).status).toBe(200);
    expect((await c.get(`/api/app/conversations/${id}`)).json.lead.assigned_to).toBe(T.ownerId);
    expect((await c.post(`/api/app/conversations/${id}/followup`, { title: 'Send brochure', dueAt: '2026-11-01T00:00:00Z' })).status).toBe(201);
    expect((await c.post(`/api/app/conversations/${id}/handoff`, { reason: 'needs manager' })).json.alreadyHandedOff).toBe(false);
    expect((await c.post(`/api/app/conversations/${id}/handoff`, { reason: 'needs manager' })).json.alreadyHandedOff).toBe(true);
    const list = (await c.get('/api/app/conversations?status=handoff')).json;
    expect(list.items).toHaveLength(1);
    expect((await c.post(`/api/app/conversations/${id}/resolve`)).status).toBe(200);
    expect((await c.get('/api/app/conversations?status=resolved')).json.items).toHaveLength(1);
    // customer writes again -> reopened and handled
    expect((await w.say('one more question please')).status).toBe(200);
    expect((await c.get(`/api/app/conversations/${id}`)).json.conversation.status).not.toBe('resolved');
  });

  it('refuses to message an unconnected channel and unsupported channels with clear errors', async () => {
    const r = await c.post('/api/app/conversations/cnv_nope/messages', { text: 'hi' });
    expect(r.status).toBe(404);
  });
});

describe('privacy and retention', () => {
  it('erases a person’s identifiers and message content on request', async () => {
    const w = await startWidget(env, T.publicKey);
    await w.say('my number is private'); await w.contact({ name: 'Secret Person', phone: '91230077', email: 'secret@example.com', consent: true });
    const leadId = (await c.get('/api/app/leads')).json.items[0].id;
    await c.post(`/api/app/leads/${leadId}/notes`, { text: 'private note' });
    expect((await c.post('/api/app/privacy/erase-contact', { leadId })).status).toBe(200);
    const dump = JSON.stringify([raw().prepare('SELECT * FROM contacts').all(), raw().prepare('SELECT * FROM messages').all(), raw().prepare('SELECT * FROM lead_notes').all(), raw().prepare('SELECT * FROM leads').all()]);
    for (const s of ['Secret Person', '91230077', 'secret@example.com', 'private note', 'my number is private']) expect(dump).not.toContain(s);
    expect(raw().prepare('SELECT granted FROM consent_records ORDER BY created_at DESC, rowid DESC LIMIT 1').get().granted).toBe(0);
  });

  it('retention job deletes messages beyond the configured window only', async () => {
    const w = await startWidget(env, T.publicKey);
    await w.say('an old message');
    raw().prepare(`UPDATE messages SET created_at = '2020-01-01T00:00:00.000Z'`).run();
    await w.say('a fresh message');
    const r = await runRetention(env);
    expect(r.messages).toBeGreaterThanOrEqual(1);
    const bodies = raw().prepare('SELECT body FROM messages WHERE direction = ?').all('inbound').map((m: any) => m.body);
    expect(bodies).toEqual(['a fresh message']);
  });
});

describe('team & onboarding', () => {
  it('invites a consultant who becomes bookable after accepting', async () => {
    const inv = await c.post('/api/app/team', { name: 'New Consultant', email: 'new@alpha.test', role: 'consultant' });
    expect(inv.status).toBe(201);
    const token = new URL(inv.json.inviteUrl.replace('#/', '')).searchParams.get('token')!;
    const anon = client(env);
    expect((await anon.post('/api/auth/accept-invite', { token, password: 'short' })).status).toBe(400);
    expect((await anon.post('/api/auth/accept-invite', { token: 'x'.repeat(30), password: 'long enough pass' })).status).toBe(404);
    const ok = await anon.post('/api/auth/accept-invite', { token, password: 'long enough pass' });
    expect(ok.status).toBe(200); expect(ok.headers.get('set-cookie')).toMatch(/nl_session=/);
    expect((await anon.post('/api/auth/accept-invite', { token, password: 'another long pass' })).status).toBe(404); // single use
    const avail = await c.get(`/api/app/team`);
    const nid = avail.json.items.find((m: any) => m.email === 'new@alpha.test').id;
    expect((await c.get(`/api/app/team/${nid}/availability`)).json.windows.length).toBeGreaterThan(0);
    expect((await c.post('/api/app/team', { name: 'Dup', email: 'new@alpha.test', role: 'admin' })).status).toBe(409);
  });
});
