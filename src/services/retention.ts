import type { Env } from '../env';
import { all, nowIso, run } from '../db';
import { normaliseSettings } from '../settings';

/**
 * Scheduled data hygiene. Per tenant: delete conversation messages past the retention window and anonymise long-closed leads.
 * Platform-wide: expire sessions, rate-limit rows, processed provider events, delivered notifications.
 */
export async function runRetention(env: Env) {
  const db = env.DB;
  const tenants = await all<{ id: string; settings_json: string }>(db, `SELECT id, settings_json FROM tenants WHERE status = 'active'`);
  let messages = 0, leads = 0;
  for (const t of tenants) {
    const s = normaliseSettings(t.settings_json).retention;
    const msgCut = new Date(Date.now() - s.conversationDays * 864e5).toISOString();
    const leadCut = new Date(Date.now() - s.closedLeadDays * 864e5).toISOString();
    const r1 = await run(db, 'DELETE FROM messages WHERE tenant_id = ? AND created_at < ?', t.id, msgCut);
    messages += r1.meta?.changes ?? 0;
    const old = await all<{ id: string; contact_id: string }>(db, `SELECT id, contact_id FROM leads WHERE tenant_id = ? AND status IN ('closed','converted') AND updated_at < ? LIMIT 200`, t.id, leadCut);
    for (const l of old) {
      await db.batch([
        db.prepare(`UPDATE contacts SET name = 'Erased contact', phone = NULL, email = NULL, updated_at = ? WHERE tenant_id = ? AND id = ?`).bind(nowIso(), t.id, l.contact_id),
        db.prepare(`UPDATE leads SET summary = NULL, requirements_json = '{}', preferred_time_text = NULL WHERE tenant_id = ? AND id = ?`).bind(t.id, l.id),
        db.prepare('DELETE FROM lead_notes WHERE tenant_id = ? AND lead_id = ?').bind(t.id, l.id),
      ]);
      leads++;
    }
  }
  const now = nowIso();
  await run(db, 'DELETE FROM sessions WHERE expires_at < ?', now);
  await run(db, 'DELETE FROM invites WHERE expires_at < ? AND accepted_at IS NULL', now);
  await run(db, 'DELETE FROM rate_limits WHERE window_start < ?', Math.floor(Date.now() / 1000) - 7200);
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString();
  await run(db, `DELETE FROM provider_events WHERE status IN ('processed','ignored') AND created_at < ?`, d30);
  await run(db, `DELETE FROM notifications WHERE status = 'sent' AND created_at < ?`, d30);
  return { messages, leads };
}
