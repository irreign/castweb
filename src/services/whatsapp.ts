import type { Env } from '../env';
import { first, isUniqueViolation, newId, nowIso, run, type DB } from '../db';
import { parseWebhook, sendMessage, type InboundMessage, type StatusUpdate, type WhatsAppEvent } from '../providers/whatsapp';
import { decryptSecret } from '../crypto';
import { addMessage, createConversation } from './conversations';
import { findOrCreateLead, markFirstResponse, upsertContact } from './leads';
import { recordConsent } from './consent';
import { handleCustomerMessage } from './engine';
import { audit } from './audit';

export { parseWebhook };

const OPT_OUT = /^\s*(stop|stop all|unsubscribe|cancel|opt[ -]?out|quit|end)\s*[.!]*\s*$/i;
const OPT_IN = /^\s*(start|subscribe|opt[ -]?in|unstop)\s*[.!]*\s*$/i;

/** Exact-match keywords only, so a sentence containing "stop" is not treated as an opt-out. */
export function handleOptKeywords(text: string): 'out' | 'in' | null {
  if (OPT_OUT.test(text)) return 'out';
  if (OPT_IN.test(text)) return 'in';
  return null;
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 9 };
const MAX_ATTEMPTS = 5;

/** Stores the event exactly once (provider, event_id). Returns whether this call should process it. */
async function claimEvent(db: DB, ev: WhatsAppEvent, tenantId: string | null): Promise<{ id: string; process: boolean }> {
  const id = newId('evt');
  try {
    await run(db, `INSERT INTO provider_events (id, tenant_id, provider, event_id, kind, status, attempts, payload_json, created_at) VALUES (?,?,?,?,?,'received',0,?,?)`,
      id, tenantId, 'whatsapp', ev.eventId, ev.kind, JSON.stringify(ev), nowIso());
    return { id, process: true };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const ex = await first<{ id: string; status: string; attempts: number }>(db, 'SELECT id, status, attempts FROM provider_events WHERE provider = ? AND event_id = ?', 'whatsapp', ev.eventId);
    // Already handled -> duplicate delivery from Meta. Failed/received (interrupted) -> retry it.
    return { id: ex!.id, process: !!ex && (ex.status === 'failed' || ex.status === 'received') && ex.attempts < MAX_ATTEMPTS };
  }
}

export async function processWebhookPayload(env: Env, payload: unknown) {
  const events = parseWebhook(payload);
  const results = { received: events.length, processed: 0, duplicates: 0, failed: 0, ignored: 0 };
  for (const ev of events) {
    const tenant = await first<{ tenant_id: string }>(env.DB, `SELECT tenant_id FROM tenant_channels WHERE channel = 'whatsapp' AND external_id = ? AND enabled = 1`, ev.phoneNumberId);
    const claim = await claimEvent(env.DB, ev, tenant?.tenant_id ?? null);
    if (!claim.process) { results.duplicates++; continue; }
    const outcome = await runEvent(env, claim.id, ev, tenant?.tenant_id ?? null);
    results[outcome]++;
  }
  return results;
}

async function runEvent(env: Env, eventRowId: string, ev: WhatsAppEvent, tenantId: string | null): Promise<'processed' | 'failed' | 'ignored'> {
  const db = env.DB;
  await run(db, 'UPDATE provider_events SET attempts = attempts + 1 WHERE id = ?', eventRowId);
  try {
    if (!tenantId) { await finish(db, eventRowId, 'ignored', 'No agency is connected to this WhatsApp number'); return 'ignored'; }
    if (ev.kind === 'status') await applyStatus(db, tenantId, ev);
    else await applyInbound(env, tenantId, ev);
    await finish(db, eventRowId, 'processed');
    return 'processed';
  } catch (e) {
    // Never log message content. Record only a short, non-sensitive reason so the event can be retried by cron.
    await run(db, `UPDATE provider_events SET status = 'failed', error = ? WHERE id = ?`, String((e as Error)?.message ?? 'error').slice(0, 200), eventRowId);
    return 'failed';
  }
}

async function finish(db: DB, id: string, status: 'processed' | 'ignored', note?: string) {
  await run(db, 'UPDATE provider_events SET status = ?, error = ?, payload_json = NULL, processed_at = ? WHERE id = ?', status, note ?? null, nowIso(), id);
}

async function applyStatus(db: DB, tenantId: string, ev: StatusUpdate) {
  const m = await first<{ id: string; delivery_status: string }>(db, `SELECT id, delivery_status FROM messages WHERE tenant_id = ? AND provider = 'whatsapp' AND provider_message_id = ?`, tenantId, ev.messageId);
  if (!m) return; // status for a message we never stored (e.g. sent from another tool): nothing to update
  if (ev.status === 'failed') {
    await run(db, `UPDATE messages SET delivery_status = 'failed', error_code = ?, error_detail = ? WHERE id = ? AND tenant_id = ?`, ev.errorCode ?? 'delivery_failed', ev.errorDetail ?? 'WhatsApp could not deliver this message', m.id, tenantId);
  } else if ((RANK[ev.status] ?? 0) > (RANK[m.delivery_status] ?? 0) && m.delivery_status !== 'failed') {
    await run(db, 'UPDATE messages SET delivery_status = ? WHERE id = ? AND tenant_id = ?', ev.status, m.id, tenantId);
  }
}

async function applyInbound(env: Env, tenantId: string, ev: InboundMessage) {
  const db = env.DB;
  const phone = ev.from.replace(/\D/g, '');
  const contactId = await upsertContact(db, tenantId, { phone, name: ev.name ?? null });
  const lead = await findOrCreateLead(db, tenantId, contactId, 'whatsapp', { type: 'webhook' });
  let conv = await first<{ id: string }>(db, `SELECT id FROM conversations WHERE tenant_id = ? AND channel = 'whatsapp' AND external_ref = ? AND status <> 'resolved'`, tenantId, phone);
  if (!conv) {
    try { conv = await createConversation(db, tenantId, { channel: 'whatsapp', externalRef: phone, contactId, leadId: lead.id }); }
    catch (e) { if (!isUniqueViolation(e)) throw e; conv = await first<{ id: string }>(db, `SELECT id FROM conversations WHERE tenant_id = ? AND channel = 'whatsapp' AND external_ref = ? AND status <> 'resolved'`, tenantId, phone); }
  }
  if (!conv) throw new Error('conversation unavailable');
  await run(db, 'UPDATE conversations SET contact_id = ?, lead_id = COALESCE(lead_id, ?) WHERE id = ? AND tenant_id = ?', contactId, lead.id, conv.id, tenantId);

  const text = ev.type === 'text' ? (ev.text ?? '') : `[${ev.type} message — not shown]`;
  const msg = await addMessage(db, tenantId, conv.id, { direction: 'inbound', senderType: 'customer', body: text, provider: 'whatsapp', providerMessageId: ev.eventId });
  if (msg.duplicate) {
    // Retry of an interrupted event: the inbound row exists. Only continue if no reply has actually gone out yet.
    const replied = await first(db, `SELECT 1 AS x FROM messages WHERE tenant_id = ? AND conversation_id = ? AND direction = 'outbound' AND delivery_status <> 'failed'
      AND created_at >= (SELECT created_at FROM messages WHERE id = ?)`, tenantId, conv.id, msg.id);
    if (replied) return;
  } else {
    // Customer-initiated contact is the legal basis for replying to this enquiry; it is recorded explicitly.
    await recordConsent(db, tenantId, contactId, 'enquiry_processing', true, 'whatsapp', 'Customer initiated WhatsApp conversation');
  }

  const opt = handleOptKeywords(text);
  let reply: string | null = null;
  if (opt === 'out') {
    await recordConsent(db, tenantId, contactId, 'follow_up_messages', false, 'whatsapp', 'Customer sent an opt-out keyword');
    await audit(db, tenantId, { type: 'customer', id: contactId }, 'consent.opted_out', 'contact', contactId);
    reply = 'You have been unsubscribed and will not receive further messages from us. Send START if you change your mind.';
  } else if (opt === 'in') {
    await recordConsent(db, tenantId, contactId, 'follow_up_messages', true, 'whatsapp', 'Customer sent an opt-in keyword');
    reply = 'Thanks — you are subscribed to follow-up messages again.';
  } else if (ev.type !== 'text') {
    reply = 'Thanks for your message. I can only read text messages here — could you type your question? A consultant can also help if you prefer.';
  } else {
    const out = await handleCustomerMessage(env, tenantId, conv.id, text);
    reply = out.reply;
    if (out.reply) await sendAndStore(env, tenantId, conv.id, phone, out.reply, out.citations, true);
    return;
  }
  if (reply) await sendAndStore(env, tenantId, conv.id, phone, reply, [], false);
}

async function sendAndStore(env: Env, tenantId: string, conversationId: string, to: string, text: string, citations: unknown, ai: boolean) {
  const db = env.DB;
  const m = await addMessage(db, tenantId, conversationId, { direction: 'outbound', senderType: ai ? 'ai' : 'system', body: text, provider: 'whatsapp', deliveryStatus: 'queued', citations: citations && (citations as unknown[]).length ? citations : undefined });
  const cfg = await first<{ external_id: string; token_enc: string | null }>(db, `SELECT external_id, token_enc FROM tenant_channels WHERE tenant_id = ? AND channel = 'whatsapp'`, tenantId);
  try {
    const token = env.WHATSAPP_MODE === 'test' || !cfg?.token_enc ? null : await decryptSecret(cfg.token_enc, env.ENCRYPTION_KEY);
    const out = await sendMessage(env, { phoneNumberId: cfg!.external_id, token }, to, { text });
    await run(db, `UPDATE messages SET provider_message_id = ?, delivery_status = 'sent' WHERE id = ? AND tenant_id = ?`, out.providerMessageId, m.id, tenantId);
    const lead = await first<{ lead_id: string | null }>(db, 'SELECT lead_id FROM conversations WHERE id = ? AND tenant_id = ?', conversationId, tenantId);
    if (lead?.lead_id && ai) await markFirstResponse(db, tenantId, lead.lead_id, false);
  } catch (e) {
    await run(db, `UPDATE messages SET delivery_status = 'failed', error_code = ?, error_detail = ? WHERE id = ? AND tenant_id = ?`, (e as any)?.code ?? 'send_failed', String((e as Error).message).slice(0, 200), m.id, tenantId);
    throw e; // marks the webhook event failed so cron can retry the whole step safely (inbound message insert is idempotent)
  }
}

/** Cron recovery: replay events that failed or were interrupted mid-processing. */
export async function retryFailedEvents(env: Env): Promise<number> {
  const rows = await (await env.DB.prepare(`SELECT id, payload_json FROM provider_events WHERE provider = 'whatsapp' AND status IN ('failed','received') AND attempts < ? AND payload_json IS NOT NULL ORDER BY created_at LIMIT 25`).bind(MAX_ATTEMPTS).all<{ id: string; payload_json: string }>()).results ?? [];
  let n = 0;
  for (const r of rows) {
    const ev = JSON.parse(r.payload_json) as WhatsAppEvent;
    const tenant = await first<{ tenant_id: string }>(env.DB, `SELECT tenant_id FROM tenant_channels WHERE channel = 'whatsapp' AND external_id = ? AND enabled = 1`, ev.phoneNumberId);
    await runEvent(env, r.id, ev, tenant?.tenant_id ?? null); n++;
  }
  return n;
}
