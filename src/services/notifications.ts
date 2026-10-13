import type { Env } from '../env';
import { all, first, newId, nowIso, run, type DB } from '../db';
import { sendEmail } from '../providers/email';
import { getTenantSettings } from '../settings';
import { formatLocal } from '../time';
import { recordUsage } from './audit';

const MAX_ATTEMPTS = 5;

export async function enqueue(db: DB, tenantId: string, n: { kind: string; recipient: string; subject: string; body: string; refType?: string; refId?: string }) {
  const id = newId('ntf');
  await run(db, 'INSERT INTO notifications (id, tenant_id, kind, channel, recipient, subject, body, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, tenantId, n.kind, 'email', n.recipient, n.subject, n.body, n.refType ?? null, n.refId ?? null, nowIso());
  return id;
}

/** Attempts delivery. A notification is only ever marked `sent` when the provider accepted it. */
export async function deliver(env: Env, notificationId: string) {
  const n = await first<{ id: string; tenant_id: string; recipient: string; subject: string; body: string; status: string; attempts: number; ref_type: string | null; ref_id: string | null }>(env.DB, 'SELECT * FROM notifications WHERE id = ?', notificationId);
  if (!n || n.status === 'sent') return;
  const r = await sendEmail(env, { to: n.recipient, subject: n.subject, text: n.body });
  if (r.ok) {
    await run(env.DB, `UPDATE notifications SET status = 'sent', attempts = attempts + 1, sent_at = ?, error = NULL WHERE id = ?`, nowIso(), n.id);
    await recordUsage(env.DB, n.tenant_id, 'email', 1);
  } else {
    await run(env.DB, 'UPDATE notifications SET status = ?, attempts = attempts + 1, error = ? WHERE id = ?', r.notConfigured ? 'not_configured' : 'failed', r.error, n.id);
  }
  if (n.ref_type === 'booking' && n.ref_id) await refreshBookingNotificationStatus(env.DB, n.tenant_id, n.ref_id);
}

export async function refreshBookingNotificationStatus(db: DB, tenantId: string, bookingId: string) {
  const rows = await all<{ status: string }>(db, `SELECT status FROM notifications WHERE tenant_id = ? AND ref_type = 'booking' AND ref_id = ?`, tenantId, bookingId);
  if (!rows.length) return;
  const s = rows.some((r) => r.status === 'failed') ? 'failed'
    : rows.every((r) => r.status === 'sent') ? 'sent'
    : rows.some((r) => r.status === 'not_configured') ? 'not_configured' : 'pending';
  await run(db, 'UPDATE bookings SET notification_status = ? WHERE id = ? AND tenant_id = ?', s, bookingId, tenantId);
}

export async function notifyBooking(env: Env, tenantId: string, bookingId: string, kind: 'confirmed' | 'cancelled' | 'rescheduled') {
  const b = await first<{ start_utc: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; consultant_name: string; consultant_email: string }>(env.DB,
    `SELECT b.start_utc, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone, u.name AS consultant_name, u.email AS consultant_email
       FROM bookings b JOIN users u ON u.id = b.consultant_id LEFT JOIN contacts c ON c.id = b.contact_id WHERE b.id = ? AND b.tenant_id = ?`, bookingId, tenantId);
  if (!b) return;
  const { settings, timezone, name: agency } = await getTenantSettings(env.DB, tenantId);
  const when = formatLocal(b.start_utc, timezone);
  const verb = kind === 'confirmed' ? 'confirmed' : kind === 'cancelled' ? 'cancelled' : 'rescheduled';
  const ids: string[] = [];
  ids.push(await enqueue(env.DB, tenantId, {
    kind: `booking_${kind}`, recipient: b.consultant_email, refType: 'booking', refId: bookingId,
    subject: `Consultation ${verb}: ${b.contact_name ?? 'New enquiry'} on ${when}`,
    body: `Consultation ${verb}.\n\nCustomer: ${b.contact_name ?? '-'}\nPhone: ${b.contact_phone ?? '-'}\nEmail: ${b.contact_email ?? '-'}\nWhen: ${when} (${timezone})\nConsultant: ${b.consultant_name}`,
  }));
  if (settings.notifications.agencyEmail && settings.notifications.agencyEmail !== b.consultant_email) {
    ids.push(await enqueue(env.DB, tenantId, { kind: `booking_${kind}`, recipient: settings.notifications.agencyEmail, refType: 'booking', refId: bookingId,
      subject: `Consultation ${verb}: ${b.contact_name ?? 'New enquiry'} on ${when}`, body: `Consultation ${verb} for ${b.contact_name ?? 'a new enquiry'} on ${when} with ${b.consultant_name}.` }));
  }
  if (b.contact_email && settings.notifications.emailCustomers) {
    ids.push(await enqueue(env.DB, tenantId, { kind: `booking_${kind}`, recipient: b.contact_email, refType: 'booking', refId: bookingId,
      subject: `Your consultation with ${agency} is ${verb}`,
      body: `Hi ${b.contact_name ?? 'there'},\n\nYour consultation with ${agency} is ${verb}.\nWhen: ${when} (${timezone})\n${settings.consultation.locationNote ? `Where: ${settings.consultation.locationNote}\n` : ''}\nIf you need to change this, please reply to this email or contact us${settings.profile.contactPhone ? ` on ${settings.profile.contactPhone}` : ''}.\n\n— ${agency}` }));
  }
  for (const id of ids) await deliver(env, id);
}

export async function notifyAgency(env: Env, tenantId: string, subject: string, body: string, refType?: string, refId?: string) {
  const { settings } = await getTenantSettings(env.DB, tenantId);
  if (!settings.notifications.agencyEmail) return;
  const id = await enqueue(env.DB, tenantId, { kind: 'agency_alert', recipient: settings.notifications.agencyEmail, subject, body, refType, refId });
  await deliver(env, id);
}

/** Cron: retry anything that was accepted but not delivered. */
export async function retryPending(env: Env) {
  const rows = await all<{ id: string }>(env.DB, `SELECT id FROM notifications WHERE status IN ('pending','failed') AND attempts < ? ORDER BY created_at LIMIT 50`, MAX_ATTEMPTS);
  for (const r of rows) await deliver(env, r.id);
  return rows.length;
}
