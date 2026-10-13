import { first, newId, nowIso, run, type DB } from '../db';

export type Purpose = 'enquiry_processing' | 'follow_up_messages';
export const NOTICE_VERSION = '2026-10-v1';

export async function recordConsent(db: DB, tenantId: string, contactId: string, purpose: Purpose, granted: boolean, channel: string, evidence: string) {
  await run(db, 'INSERT INTO consent_records (id, tenant_id, contact_id, purpose, granted, channel, notice_version, evidence, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    newId('cns'), tenantId, contactId, purpose, granted ? 1 : 0, channel, NOTICE_VERSION, evidence, nowIso());
}

/** Latest record wins. No record = no consent. */
export async function hasConsent(db: DB, tenantId: string, contactId: string, purpose: Purpose): Promise<boolean> {
  const r = await first<{ granted: number }>(db, 'SELECT granted FROM consent_records WHERE tenant_id = ? AND contact_id = ? AND purpose = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', tenantId, contactId, purpose);
  return r?.granted === 1;
}

/** An opt-out ("STOP") blocks outbound proactive messaging; a plain absence of consent does not block replies to a customer who messaged first. */
export async function hasOptedOut(db: DB, tenantId: string, contactId: string): Promise<boolean> {
  const r = await first<{ granted: number }>(db, 'SELECT granted FROM consent_records WHERE tenant_id = ? AND contact_id = ? AND purpose = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', tenantId, contactId, 'follow_up_messages');
  return r?.granted === 0;
}
