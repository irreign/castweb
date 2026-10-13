import { z } from 'zod';
import { all, first, isUniqueViolation, newId, nowIso, run, type DB } from '../db';
import { badRequest, conflict, notFound, unprocessable } from '../http';
import { addDays, hhmmToMin, iso, localParts, zonedToUtcMs } from '../time';
import { getTenantSettings } from '../settings';
import { audit, type Actor } from './audit';
import { getLead, updateLead } from './leads';

export interface Slot { start: string; end: string; consultantId: string; consultantName: string }

type Window = [number, number];

async function bookableConsultants(db: DB, tenantId: string, only?: string) {
  return all<{ id: string; name: string }>(db,
    `SELECT DISTINCT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id AND u.disabled = 0
       JOIN consultant_availability a ON a.user_id = u.id AND a.tenant_id = m.tenant_id
      WHERE m.tenant_id = ? AND m.active = 1 AND (? IS NULL OR u.id = ?) ORDER BY u.name`, tenantId, only ?? null, only ?? null);
}

function intersect(a: Window[], b: Window[]): Window[] {
  const out: Window[] = [];
  for (const [s1, e1] of a) for (const [s2, e2] of b) { const s = Math.max(s1, s2), e = Math.min(e1, e2); if (e > s) out.push([s, e]); }
  return out;
}

/**
 * Computes bookable slots. Used both to display options AND, again, to re-validate immediately before a booking is written.
 * A slot is [start, start+duration); the consultant is then blocked until start+duration+buffer.
 */
export async function availableSlots(db: DB, tenantId: string, opts: { fromDate?: string; days?: number; consultantId?: string; ignoreBookingId?: string; now?: number } = {}): Promise<Slot[]> {
  const { settings, timezone: tz } = await getTenantSettings(db, tenantId);
  const c = settings.consultation;
  const now = opts.now ?? Date.now();
  const today = localParts(now, tz).date;
  const from = opts.fromDate && opts.fromDate > today ? opts.fromDate : today;
  const maxDate = addDays(today, c.maxDaysAhead);
  const days = Math.min(opts.days ?? 7, 31);
  const consultants = await bookableConsultants(db, tenantId, opts.consultantId);
  if (!consultants.length) return [];
  const earliest = now + c.minNoticeHours * 3600e3;

  const avail = await all<{ user_id: string; weekday: number; start_min: number; end_min: number }>(db, 'SELECT user_id, weekday, start_min, end_min FROM consultant_availability WHERE tenant_id = ?', tenantId);
  const rangeStart = iso(zonedToUtcMs(from, 0, tz));
  const rangeEnd = iso(zonedToUtcMs(addDays(from, days + 1), 0, tz));
  const busy = await all<{ id: string; consultant_id: string; start_utc: string; block_end_utc: string }>(db,
    `SELECT id, consultant_id, start_utc, block_end_utc FROM bookings WHERE tenant_id = ? AND status = 'confirmed' AND block_end_utc > ? AND start_utc < ?`, tenantId, rangeStart, rangeEnd);

  const slots: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (date > maxDate) break;
    const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
    const h = settings.hours[String(weekday) as '0'];
    if (!h) continue;
    const bizWindow: Window[] = [[hhmmToMin(h.open), hhmmToMin(h.close)]];
    for (const u of consultants) {
      const own: Window[] = avail.filter((a) => a.user_id === u.id && a.weekday === weekday).map((a) => [a.start_min, a.end_min]);
      for (const [ws, we] of intersect(bizWindow, own)) {
        for (let m = ws; m + c.durationMin <= we; m += c.slotStepMin) {
          const s = zonedToUtcMs(date, m, tz);
          if (s < earliest) continue;
          const e = s + c.durationMin * 60000;
          const blockEnd = e + c.bufferMin * 60000;
          const clash = busy.some((b) => b.consultant_id === u.id && b.id !== opts.ignoreBookingId && Date.parse(b.start_utc) < blockEnd && Date.parse(b.block_end_utc) > s);
          if (!clash) slots.push({ start: iso(s), end: iso(e), consultantId: u.id, consultantName: u.name });
        }
      }
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start) || a.consultantName.localeCompare(b.consultantName));
}

export const bookingInputSchema = z.object({
  leadId: z.string().max(60),
  start: z.string().datetime({ offset: true }),
  consultantId: z.string().max(60).nullable().optional(),   // omit to auto-assign
  idempotencyKey: z.string().min(8).max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export interface BookingResult { id: string; start: string; end: string; consultantId: string; consultantName: string; duplicate: boolean }

const INSERT_IF_FREE = `
  INSERT INTO bookings (id, tenant_id, lead_id, contact_id, consultant_id, start_utc, end_utc, block_end_utc, status, channel, notes, idempotency_key, rescheduled_from, created_by, created_at, updated_at)
  SELECT ?,?,?,?,?,?,?,?, 'confirmed', ?,?,?,?,?,?,?
   WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE tenant_id = ? AND consultant_id = ? AND status = 'confirmed' AND id <> ? AND start_utc < ? AND block_end_utc > ?)`;

async function pickConsultants(db: DB, tenantId: string, startIso: string, requested: string | null | undefined, ignoreBookingId?: string): Promise<Slot[]> {
  const { timezone: tz } = await getTenantSettings(db, tenantId);
  const date = localParts(Date.parse(startIso), tz).date;
  // Authoritative availability check, performed right before writing.
  const slots = await availableSlots(db, tenantId, { fromDate: date, days: 1, consultantId: requested ?? undefined, ignoreBookingId });
  const matching = slots.filter((s) => s.start === new Date(startIso).toISOString());
  if (!matching.length) throw conflict('That time is no longer available. Please choose another slot.', 'slot_unavailable');
  if (requested) return matching;
  // Auto-assign: the consultant with the fewest confirmed bookings in the next 7 days goes first.
  const load = await all<{ consultant_id: string; n: number }>(db, `SELECT consultant_id, COUNT(*) AS n FROM bookings WHERE tenant_id = ? AND status = 'confirmed' AND start_utc >= ? GROUP BY consultant_id`, tenantId, nowIso());
  const n = (id: string) => load.find((l) => l.consultant_id === id)?.n ?? 0;
  return matching.sort((a, b) => n(a.consultantId) - n(b.consultantId));
}

async function findByIdempotencyKey(db: DB, tenantId: string, input: z.infer<typeof bookingInputSchema>): Promise<BookingResult | null> {
  if (!input.idempotencyKey) return null;
  const dup = await first<{ id: string; start_utc: string; end_utc: string; consultant_id: string; lead_id: string; name: string }>(db,
    `SELECT b.id, b.start_utc, b.end_utc, b.consultant_id, b.lead_id, u.name FROM bookings b JOIN users u ON u.id = b.consultant_id WHERE b.tenant_id = ? AND b.idempotency_key = ?`, tenantId, input.idempotencyKey);
  if (!dup) return null;
  if (dup.lead_id !== input.leadId) throw conflict('This idempotency key was already used for a different request', 'idempotency_mismatch');
  return { id: dup.id, start: dup.start_utc, end: dup.end_utc, consultantId: dup.consultant_id, consultantName: dup.name, duplicate: true };
}

export async function createBooking(db: DB, tenantId: string, actor: Actor, input: z.infer<typeof bookingInputSchema>, channel = 'web'): Promise<BookingResult> {
  const prior = await findByIdempotencyKey(db, tenantId, input);
  if (prior) return prior;
  const lead = await getLead(db, tenantId, input.leadId) as Record<string, any>;
  if (lead.status === 'closed' || lead.status === 'converted') throw conflict('This lead is closed. Reopen it before booking.');
  const { settings } = await getTenantSettings(db, tenantId);
  const c = settings.consultation;
  const start = new Date(input.start).toISOString();
  const candidates = await pickConsultants(db, tenantId, start, input.consultantId);

  const startMs = Date.parse(start);
  const end = iso(startMs + c.durationMin * 60000);
  const blockEnd = iso(startMs + (c.durationMin + c.bufferMin) * 60000);
  const id = newId('bkg');
  const t = nowIso();

  for (const cand of candidates) {
    let results: D1Result[];
    try {
      results = await db.batch([
        db.prepare(INSERT_IF_FREE).bind(id, tenantId, lead.id, lead.contact_id, cand.consultantId, start, end, blockEnd, channel, input.notes ?? null, input.idempotencyKey ?? null, null, actor.id ?? actor.type, t, t,
          tenantId, cand.consultantId, '', blockEnd, start),
        db.prepare(`UPDATE leads SET status = CASE WHEN status IN ('closed','converted') THEN status ELSE 'consultation_booked' END,
                           assigned_to = COALESCE(assigned_to, ?), updated_at = ? WHERE id = ? AND tenant_id = ? AND EXISTS (SELECT 1 FROM bookings WHERE id = ? AND tenant_id = ?)`)
          .bind(cand.consultantId, t, lead.id, tenantId, id, tenantId),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Either the same instant was just taken, or a concurrent identical request won with our idempotency key.
        const winner = await findByIdempotencyKey(db, tenantId, input);
        if (winner) return winner;
        continue;
      }
      throw e;
    }
    if ((results[0].meta?.changes ?? 0) === 1) {
      await audit(db, tenantId, actor, 'booking.created', 'booking', id, { leadId: lead.id, start, consultantId: cand.consultantId });
      await audit(db, tenantId, actor, 'lead.booked', 'lead', lead.id, { bookingId: id, start });
      return { id, start, end, consultantId: cand.consultantId, consultantName: cand.consultantName, duplicate: false };
    }
  }
  // Lost every race. If a concurrent identical request (same key) is the one that won, return its booking instead of an error.
  const winner = await findByIdempotencyKey(db, tenantId, input);
  if (winner) return winner;
  throw conflict('That time was just taken. Please choose another slot.', 'slot_unavailable');
}

export async function getBooking(db: DB, tenantId: string, bookingId: string) {
  const b = await first<Record<string, any>>(db, `SELECT b.*, u.name AS consultant_name, c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
    FROM bookings b JOIN users u ON u.id = b.consultant_id LEFT JOIN contacts c ON c.id = b.contact_id WHERE b.tenant_id = ? AND b.id = ?`, tenantId, bookingId);
  if (!b) throw notFound('Booking not found');
  return b;
}

async function relaxLeadAfterCancel(db: DB, tenantId: string, leadId: string | null, actor: Actor) {
  if (!leadId) return;
  const other = await first(db, `SELECT 1 AS x FROM bookings WHERE tenant_id = ? AND lead_id = ? AND status = 'confirmed' AND start_utc > ?`, tenantId, leadId, nowIso());
  const lead = await getLead(db, tenantId, leadId) as Record<string, any>;
  if (!other && lead.status === 'consultation_booked') await updateLead(db, tenantId, leadId, actor, { status: 'qualified' }, { system: true });
}

export async function cancelBooking(db: DB, tenantId: string, actor: Actor, bookingId: string, reason?: string) {
  const b = await getBooking(db, tenantId, bookingId);
  if (b.status === 'cancelled') return b; // idempotent
  if (b.status !== 'confirmed') throw conflict(`A ${b.status} booking cannot be cancelled`);
  const r = await run(db, `UPDATE bookings SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'confirmed'`, reason ?? null, nowIso(), bookingId, tenantId);
  if ((r.meta?.changes ?? 0) === 1) {
    await audit(db, tenantId, actor, 'booking.cancelled', 'booking', bookingId, { reason });
    await relaxLeadAfterCancel(db, tenantId, b.lead_id, actor);
  }
  return getBooking(db, tenantId, bookingId);
}

export async function rescheduleBooking(db: DB, tenantId: string, actor: Actor, bookingId: string, newStart: string, consultantId?: string | null) {
  const old = await getBooking(db, tenantId, bookingId);
  if (old.status !== 'confirmed') throw conflict(`A ${old.status} booking cannot be rescheduled`);
  const { settings } = await getTenantSettings(db, tenantId);
  const c = settings.consultation;
  const start = new Date(newStart).toISOString();
  if (start === old.start_utc && (!consultantId || consultantId === old.consultant_id)) throw badRequest('Choose a different time or consultant');
  const candidates = await pickConsultants(db, tenantId, start, consultantId ?? old.consultant_id, bookingId);
  const startMs = Date.parse(start);
  const end = iso(startMs + c.durationMin * 60000), blockEnd = iso(startMs + (c.durationMin + c.bufferMin) * 60000);
  const id = newId('bkg'); const t = nowIso();
  const cand = candidates[0];
  let results: D1Result[];
  try {
    results = await db.batch([
      // Insert the replacement first, ignoring the booking being replaced when checking for overlap...
      db.prepare(INSERT_IF_FREE).bind(id, tenantId, old.lead_id, old.contact_id, cand.consultantId, start, end, blockEnd, old.channel, old.notes, null, bookingId, actor.id ?? actor.type, t, t,
        tenantId, cand.consultantId, bookingId, blockEnd, start),
      // ...and cancel the old one only if the replacement actually exists. Both run in one transaction.
      db.prepare(`UPDATE bookings SET status = 'cancelled', cancel_reason = 'rescheduled', updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'confirmed' AND EXISTS (SELECT 1 FROM bookings WHERE id = ? AND tenant_id = ?)`)
        .bind(t, bookingId, tenantId, id, tenantId),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('That time was just taken. Please choose another slot.', 'slot_unavailable');
    throw e;
  }
  if ((results[0].meta?.changes ?? 0) !== 1) throw conflict('That time was just taken. Please choose another slot.', 'slot_unavailable');
  await audit(db, tenantId, actor, 'booking.rescheduled', 'booking', id, { from: bookingId, start });
  return getBooking(db, tenantId, id);
}

export async function setBookingOutcome(db: DB, tenantId: string, actor: Actor, bookingId: string, outcome: 'completed' | 'no_show') {
  const b = await getBooking(db, tenantId, bookingId);
  if (b.status !== 'confirmed' && b.status !== outcome) throw conflict(`A ${b.status} booking cannot be marked ${outcome}`);
  if (Date.parse(b.start_utc) > Date.now()) throw unprocessable('A consultation cannot be marked as held before it starts');
  await run(db, 'UPDATE bookings SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?', outcome, nowIso(), bookingId, tenantId);
  await audit(db, tenantId, actor, `booking.${outcome}`, 'booking', bookingId);
  return getBooking(db, tenantId, bookingId);
}

export async function listBookings(db: DB, tenantId: string, opts: { from?: string; to?: string; status?: string; consultantId?: string; leadId?: string }) {
  const where = ['b.tenant_id = ?']; const args: unknown[] = [tenantId];
  if (opts.from) { where.push('b.start_utc >= ?'); args.push(opts.from); }
  if (opts.to) { where.push('b.start_utc < ?'); args.push(opts.to); }
  if (opts.status) { where.push('b.status = ?'); args.push(opts.status); }
  if (opts.consultantId) { where.push('b.consultant_id = ?'); args.push(opts.consultantId); }
  if (opts.leadId) { where.push('b.lead_id = ?'); args.push(opts.leadId); }
  return all(db, `SELECT b.id, b.lead_id, b.start_utc, b.end_utc, b.status, b.channel, b.notes, b.notification_status, b.consultant_id, u.name AS consultant_name,
                         c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
                    FROM bookings b JOIN users u ON u.id = b.consultant_id LEFT JOIN contacts c ON c.id = b.contact_id
                   WHERE ${where.join(' AND ')} ORDER BY b.start_utc LIMIT 500`, ...args);
}

export const availabilitySchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/),
}).refine((w) => hhmmToMin(w.end) > hhmmToMin(w.start), 'End must be after start')).max(28);

export async function setAvailability(db: DB, tenantId: string, userId: string, windows: z.infer<typeof availabilitySchema>) {
  const m = await first(db, 'SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND user_id = ? AND active = 1', tenantId, userId);
  if (!m) throw notFound('Team member not found');
  await db.batch([
    db.prepare('DELETE FROM consultant_availability WHERE tenant_id = ? AND user_id = ?').bind(tenantId, userId),
    ...windows.map((w) => db.prepare('INSERT INTO consultant_availability (id, tenant_id, user_id, weekday, start_min, end_min) VALUES (?,?,?,?,?,?)').bind(newId('av'), tenantId, userId, w.weekday, hhmmToMin(w.start), hhmmToMin(w.end))),
  ]);
}

export async function getAvailability(db: DB, tenantId: string, userId: string) {
  const rows = await all<{ weekday: number; start_min: number; end_min: number }>(db, 'SELECT weekday, start_min, end_min FROM consultant_availability WHERE tenant_id = ? AND user_id = ? ORDER BY weekday, start_min', tenantId, userId);
  const f = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  return rows.map((r) => ({ weekday: r.weekday, start: f(r.start_min), end: f(r.end_min) }));
}

/** Seed a member's weekly availability from the agency business hours (used for owners/new consultants so onboarding works out of the box). */
export async function seedAvailabilityFromHours(db: DB, tenantId: string, userId: string) {
  const { settings } = await getTenantSettings(db, tenantId);
  const windows = Object.entries(settings.hours).filter(([, v]) => v).map(([k, v]) => ({ weekday: Number(k), start: v!.open, end: v!.close }));
  await setAvailability(db, tenantId, userId, windows);
}
