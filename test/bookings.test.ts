import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { client, loginCookie, makeEnv, seedMember, seedTenant, startWidget, type TenantFx } from './helpers/env';
import { availableSlots, cancelBooking, createBooking, rescheduleBooking } from '../src/services/bookings';
import { notifyBooking } from '../src/services/notifications';
import { saveSettingsSection } from '../src/settings';
import { formatLocal, localParts, zonedToUtcMs } from '../src/time';

let env: Env; let T: TenantFx; let c: ReturnType<typeof client>; let leadId: string; let lead2: string;
const actor = { type: 'system' as const };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T00:00:00Z')); // Monday 08:00 Singapore time
  env = makeEnv();
  T = await seedTenant(env, 'alpha');
  c = client(env, await loginCookie(env, T.ownerEmail));
  leadId = (await c.post('/api/app/leads', { name: 'Lead One', phone: '91234561', email: 'one@example.com' })).json.id;
  lead2 = (await c.post('/api/app/leads', { name: 'Lead Two', phone: '91234562' })).json.id;
});
afterEach(() => vi.useRealTimers());

describe('availability', () => {
  it('generates slots inside business hours, in Singapore time, respecting minimum notice', async () => {
    const slots = await availableSlots(env.DB, T.tenantId, { days: 3 });
    expect(slots.length).toBeGreaterThan(10);
    const first = slots[0];
    expect(first.start).toBe('2026-10-12T02:00:00.000Z'); // 10:00 SGT: 08:00 now + 2h notice, aligned to the 30-min grid
    for (const s of slots) {
      const p = localParts(Date.parse(s.start), 'Asia/Singapore');
      expect(p.minutes).toBeGreaterThanOrEqual(9 * 60);
      expect(p.minutes + 30).toBeLessThanOrEqual(18 * 60 + (p.weekday === 6 ? -300 : 0));
      expect(p.weekday).not.toBe(0); // Sunday closed
    }
  });

  it('removes slots blocked by an existing booking including its buffer', async () => {
    const b = await createBooking(env.DB, T.tenantId, actor, { leadId, start: '2026-10-12T02:00:00Z', idempotencyKey: 'key-aaaaaaa1' });
    const after = (await availableSlots(env.DB, T.tenantId, { days: 1 })).filter((s) => s.consultantId === b.consultantId).map((s) => s.start);
    expect(after).not.toContain('2026-10-12T02:00:00.000Z');
    expect(after).not.toContain('2026-10-12T02:30:00.000Z'); // 30-min consult + 10-min buffer blocks the next 30-min grid slot too
    expect(after).toContain('2026-10-12T03:00:00.000Z');
  });

  it('honours configured duration, buffer and consultant availability', async () => {
    await saveSettingsSection(env.DB, T.tenantId, 'consultation', { durationMin: 60, bufferMin: 0, slotStepMin: 60, minNoticeHours: 0, maxDaysAhead: 7, locationNote: null });
    await c.put(`/api/app/team/${T.ownerId}/availability`, { windows: [{ weekday: 2, start: '14:00', end: '16:00' }] });
    const slots = await availableSlots(env.DB, T.tenantId, { days: 7 });
    expect(slots.map((s) => formatLocal(s.start, 'Asia/Singapore').replace(/^\w+, /, ''))).toEqual([
      expect.stringContaining('2:00'), expect.stringContaining('3:00'),
    ]);
    expect(slots.every((s) => localParts(Date.parse(s.start), 'Asia/Singapore').weekday === 2)).toBe(true);
  });

  it('converts wall-clock time to UTC correctly for a non-Singapore zone with DST', () => {
    // 2026-03-08 02:30 does not exist in New York (spring forward); 2026-07-01 12:00 is UTC-4.
    expect(new Date(zonedToUtcMs('2026-07-01', 12 * 60, 'America/New_York')).toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(new Date(zonedToUtcMs('2026-01-15', 12 * 60, 'America/New_York')).toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(new Date(zonedToUtcMs('2026-10-12', 9 * 60, 'Asia/Singapore')).toISOString()).toBe('2026-10-12T01:00:00.000Z');
  });
});

describe('creating bookings', () => {
  it('creates a valid booking, marks the lead as consultation booked and audits it', async () => {
    const r = await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-valid-001' });
    expect(r.status).toBe(201);
    expect(r.json.status).toBe('confirmed');
    const lead = (await c.get(`/api/app/leads/${leadId}`)).json;
    expect(lead.lead.status).toBe('consultation_booked');
    expect(lead.bookings).toHaveLength(1);
    expect(lead.history.map((h: any) => h.action)).toContain('lead.booked');
  });

  it('rejects an off-grid, out-of-hours, past, or too-soon time', async () => {
    for (const start of ['2026-10-12T03:07:00Z', '2026-10-12T16:00:00Z', '2026-10-11T03:00:00Z', '2026-10-12T00:30:00Z', '2026-10-18T03:00:00Z' /* Sunday */]) {
      const r = await c.post('/api/app/bookings', { leadId, start, idempotencyKey: 'key-' + start });
      expect(r.status, start).toBe(409);
      expect(r.json.error.code).toBe('slot_unavailable');
    }
    expect((await c.get(`/api/app/leads/${leadId}`)).json.bookings).toHaveLength(0);
  });

  it('rejects a slot that is already taken (single consultant)', async () => {
    expect((await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-first-01' })).status).toBe(201);
    const second = await c.post('/api/app/bookings', { leadId: lead2, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-second-1' });
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe('slot_unavailable');
  });

  it('rejects an overlapping start that does not coincide with an existing booking start', async () => {
    await saveSettingsSection(env.DB, T.tenantId, 'consultation', { durationMin: 60, bufferMin: 0, slotStepMin: 30, minNoticeHours: 0, maxDaysAhead: 7, locationNote: null });
    expect((await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-ovl-0001' })).status).toBe(201);
    // 03:30Z overlaps the 03:00–04:00Z booking even though start instants differ
    const r = await c.post('/api/app/bookings', { leadId: lead2, start: '2026-10-12T03:30:00Z', idempotencyKey: 'key-ovl-0002' });
    expect(r.status).toBe(409);
  });

  it('allows two bookings at the same time with two different consultants', async () => {
    await seedMember(env, T.tenantId, 'c2@alpha.test', 'consultant', T.ownerId);
    const r1 = await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-two-0001' });
    const r2 = await c.post('/api/app/bookings', { leadId: lead2, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-two-0002' });
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r1.json.consultant_id).not.toBe(r2.json.consultant_id);
    const r3 = await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-two-0003' });
    expect(r3.status).toBe(409); // both consultants are now busy
  });

  it('two concurrent attempts cannot book the same exclusive slot', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) =>
      createBooking(env.DB, T.tenantId, actor, { leadId: i % 2 ? leadId : lead2, start: '2026-10-12T03:00:00Z', idempotencyKey: `race-key-${i}-xxxx` })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r: any) => r.reason.code === 'slot_unavailable')).toBe(true);
    const rows = (env.DB as any).raw.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND start_utc = '2026-10-12T03:00:00.000Z'`).get();
    expect(rows.n).toBe(1);
  });

  it('the database itself refuses two confirmed bookings for the same consultant and instant', () => {
    const raw = (env.DB as any).raw;
    const ins = (id: string) => raw.prepare(`INSERT INTO bookings (id, tenant_id, lead_id, contact_id, consultant_id, start_utc, end_utc, block_end_utc, status, channel, created_at, updated_at)
      VALUES (?, ?, NULL, NULL, ?, '2026-10-13T03:00:00.000Z', '2026-10-13T03:30:00.000Z', '2026-10-13T03:40:00.000Z', 'confirmed', 'web', 'x', 'x')`).run(id, T.tenantId, T.ownerId);
    ins('bkg_one');
    expect(() => ins('bkg_two')).toThrow(/UNIQUE/);
  });

  it('is idempotent: the same key returns the same booking and does not double-book or double-notify', async () => {
    const body = { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'idem-key-0001' };
    const a = await c.post('/api/app/bookings', body); const b = await c.post('/api/app/bookings', body);
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.json.id).toBe(a.json.id);
    const n = (env.DB as any).raw.prepare('SELECT COUNT(*) AS n FROM bookings').get().n;
    expect(n).toBe(1);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => createBooking(env.DB, T.tenantId, actor, { leadId: lead2, start: '2026-10-12T04:00:00Z', idempotencyKey: 'idem-key-0002' })));
    expect(new Set(concurrent.map((x) => x.id)).size).toBe(1);
  });

  it('refuses to reuse an idempotency key for a different lead', async () => {
    await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'idem-key-0003' });
    const r = await c.post('/api/app/bookings', { leadId: lead2, start: '2026-10-12T04:00:00Z', idempotencyKey: 'idem-key-0003' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('idempotency_mismatch');
  });

  it('refuses to book a closed lead', async () => {
    await c.patch(`/api/app/leads/${leadId}`, { status: 'closed', closedReason: 'not proceeding' });
    expect((await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-closed-01' })).status).toBe(409);
  });
});

describe('cancel & reschedule', () => {
  it('cancelling frees the slot and returns the lead to qualified; cancelling twice is harmless', async () => {
    const b = (await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-cancel-01' })).json;
    const x = await c.post(`/api/app/bookings/${b.id}/cancel`, { reason: 'customer asked' });
    expect(x.status).toBe(200); expect(x.json.status).toBe('cancelled');
    expect((await c.post(`/api/app/bookings/${b.id}/cancel`, {})).json.status).toBe('cancelled');
    expect((await c.get(`/api/app/leads/${leadId}`)).json.lead.status).toBe('qualified');
    expect((await c.post('/api/app/bookings', { leadId: lead2, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-cancel-02' })).status).toBe(201);
  });

  it('reschedules atomically: new booking created, old one cancelled, history linked', async () => {
    const b = (await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-resch-01' })).json;
    const r = await c.post(`/api/app/bookings/${b.id}/reschedule`, { start: '2026-10-12T05:00:00Z' });
    expect(r.status).toBe(200);
    expect(r.json.start_utc).toBe('2026-10-12T05:00:00.000Z');
    expect(r.json.rescheduled_from).toBe(b.id);
    const list = (await c.get('/api/app/bookings')).json.items;
    expect(list.find((x: any) => x.id === b.id).status).toBe('cancelled');
    expect(list.filter((x: any) => x.status === 'confirmed')).toHaveLength(1);
    expect((await c.get(`/api/app/leads/${leadId}`)).json.lead.status).toBe('consultation_booked');
  });

  it('a failed reschedule leaves the original booking confirmed', async () => {
    const b1 = (await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-resch-02' })).json;
    await c.post('/api/app/bookings', { leadId: lead2, start: '2026-10-12T05:00:00Z', idempotencyKey: 'key-resch-03' });
    const r = await c.post(`/api/app/bookings/${b1.id}/reschedule`, { start: '2026-10-12T05:00:00Z' });
    expect(r.status).toBe(409);
    expect((await c.get('/api/app/bookings?status=confirmed')).json.items.map((x: any) => x.id)).toContain(b1.id);
  });

  it('can reschedule into a time that overlaps its own old slot', async () => {
    await saveSettingsSection(env.DB, T.tenantId, 'consultation', { durationMin: 60, bufferMin: 0, slotStepMin: 30, minNoticeHours: 0, maxDaysAhead: 7, locationNote: null });
    const b = await createBooking(env.DB, T.tenantId, actor, { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-resch-04' });
    const r = await rescheduleBooking(env.DB, T.tenantId, actor, b.id, '2026-10-12T03:30:00Z');
    expect(r.start_utc).toBe('2026-10-12T03:30:00.000Z');
  });

  it('cannot reschedule or cancel a booking that is not confirmed; outcomes only after the start time', async () => {
    const b = (await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-out-0001' })).json;
    expect((await c.post(`/api/app/bookings/${b.id}/outcome`, { outcome: 'completed' })).status).toBe(422); // not yet held
    vi.setSystemTime(new Date('2026-10-12T05:00:00Z'));
    expect((await c.post(`/api/app/bookings/${b.id}/outcome`, { outcome: 'completed' })).json.status).toBe('completed');
    expect((await c.post(`/api/app/bookings/${b.id}/cancel`, {})).status).toBe(409);
    expect((await c.post(`/api/app/bookings/${b.id}/reschedule`, { start: '2026-10-13T03:00:00Z' })).status).toBe(409);
  });

  it('cancelBooking service is tenant scoped', async () => {
    const b = await createBooking(env.DB, T.tenantId, actor, { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-scope-01' });
    await expect(cancelBooking(env.DB, 'ten_other', actor, b.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('notifications never overstate success', () => {
  it('marks a booking as not_configured when no email provider exists — never "sent"', async () => {
    const b = (await c.post('/api/app/bookings', { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-ntf-0001' })).json;
    await vi.waitFor(async () => { expect((await c.get('/api/app/bookings')).json.items[0].notification_status).toBe('not_configured'); });
    const rows = (env.DB as any).raw.prepare('SELECT status FROM notifications WHERE ref_id = ?').all(b.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => r.status === 'not_configured')).toBe(true);
  });

  it('marks failed when the provider errors, and sent only when the provider accepts', async () => {
    const e2 = { ...env, RESEND_API_KEY: 'rk', EMAIL_FROM: 'a@b.test' } as Env;
    const b = await createBooking(e2.DB, T.tenantId, actor, { leadId, start: '2026-10-12T03:00:00Z', idempotencyKey: 'key-ntf-0002' });
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response('boom', { status: 500 })) as any;
      await notifyBooking(e2, T.tenantId, b.id, 'confirmed');
      expect((env.DB as any).raw.prepare('SELECT notification_status s FROM bookings WHERE id = ?').get(b.id).s).toBe('failed');
      globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 })) as any;
      const { retryPending } = await import('../src/services/notifications');
      await retryPending(e2);
      expect((env.DB as any).raw.prepare('SELECT notification_status s FROM bookings WHERE id = ?').get(b.id).s).toBe('sent');
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('widget booking journey', () => {
  it('only reports a confirmed consultation after it is persisted, and handles the slot race', async () => {
    const w = await startWidget(env, T.publicKey);
    expect((await w.book('2026-10-12T03:00:00Z')).status).toBe(400); // no contact details yet
    await w.contact({ name: 'Cust One', phone: '91230001', consent: true });
    const slots = (await w.slots()).json.slots;
    const ok = await w.book(slots[2].start, 'widget-key-0001');
    expect(ok.status).toBe(201);
    expect(ok.json.booking.status).toBe('confirmed');
    const msgs = (await w.poll()).json.messages.map((m: any) => m.text);
    expect(msgs.some((t: string) => /consultation is confirmed/.test(t))).toBe(true);
    // retry with the same key = same booking, no extra "confirmed" message
    const again = await w.book(slots[2].start, 'widget-key-0001');
    expect(again.status).toBe(200); expect(again.json.duplicate).toBe(true);
    expect((await w.poll()).json.messages.filter((m: any) => /consultation is confirmed/.test(m.text))).toHaveLength(1);
    // another customer grabbing the same slot is told it's gone and nothing is confirmed
    const w2 = await startWidget(env, T.publicKey);
    await w2.contact({ name: 'Cust Two', phone: '91230002', consent: true });
    const lost = await w2.book(slots[2].start);
    expect(lost.status).toBe(409);
    expect((await w2.poll()).json.messages.some((m: any) => /confirmed for/.test(m.text))).toBe(false);
  });

  it('is disabled in admin preview so test chats cannot take real slots', async () => {
    const r = await c.post(`/api/public/${T.publicKey}/conversations`, { preview: true });
    const h = { 'x-conversation-token': r.json.token };
    const base = `/api/public/${T.publicKey}/conversations/${r.json.conversationId}`;
    await client(env).post(`${base}/contact`, { name: 'Tester', phone: '91230009', consent: true }, h);
    const b = await client(env).post(`${base}/book`, { start: '2026-10-12T03:00:00Z', idempotencyKey: 'preview-key-1' }, h);
    expect(b.status).toBe(409);
    expect(b.json.error.code).toBe('preview_booking_disabled');
  });
});
