import { z } from 'zod';
import type { Env } from '../env';
import { all, first, isUniqueViolation, newId, nowIso, parseJson, run, type DB } from '../db';
import { randomToken, sha256Hex, decryptSecret } from '../crypto';
import { conflict, HttpError, notFound, notConfigured, unprocessable } from '../http';
import { sendMessage } from '../providers/whatsapp';
import { requirementsSchema } from './leads';
import { audit, recordUsage, type Actor } from './audit';
import { hasOptedOut, recordConsent } from './consent';
import { findOrCreateLead, markFirstResponse, updateLead, upsertContact, getLead } from './leads';
import { createTask, syncNextAction } from './tasks';
import { notifyAgency } from './notifications';
import { getTenantSettings } from '../settings';

export const stateSchema = z.object({
  asked: z.array(z.string()).max(10).default([]),
  uncertainCount: z.number().int().min(0).max(20).default(0),
  pendingFields: requirementsSchema.default({}),
  pendingName: z.string().max(80).nullable().default(null),
  recommendation: z.string().max(300).nullable().default(null),
  consultationRequested: z.boolean().default(false),
});
export type ConvState = z.infer<typeof stateSchema>;

export interface ConversationRow {
  id: string; tenant_id: string; contact_id: string | null; lead_id: string | null; channel: 'web' | 'whatsapp' | 'voice' | 'staff';
  external_ref: string | null; status: 'open' | 'handoff' | 'resolved'; assigned_to: string | null; ai_enabled: number; state_json: string; access_token_hash: string | null;
}

export const loadState = (c: ConversationRow): ConvState => {
  const r = stateSchema.safeParse(parseJson(c.state_json, {}));
  return r.success ? r.data : stateSchema.parse({});
};
export const saveState = (db: DB, tenantId: string, id: string, s: ConvState) =>
  run(db, 'UPDATE conversations SET state_json = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(s), id, tenantId);

export async function createConversation(db: DB, tenantId: string, o: { channel: ConversationRow['channel']; externalRef?: string; contactId?: string; leadId?: string }) {
  const id = newId('cnv'); const token = o.channel === 'web' || o.channel === 'staff' ? randomToken(24) : null; const t = nowIso();
  await run(db, 'INSERT INTO conversations (id, tenant_id, contact_id, lead_id, channel, external_ref, access_token_hash, last_message_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, tenantId, o.contactId ?? null, o.leadId ?? null, o.channel, o.externalRef ?? null, token ? await sha256Hex(token) : null, t, t);
  return { id, token };
}

export async function getConversation(db: DB, tenantId: string, id: string): Promise<ConversationRow> {
  const c = await first<ConversationRow>(db, 'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?', id, tenantId);
  if (!c) throw notFound('Conversation not found');
  return c;
}

export async function authenticateWebConversation(db: DB, tenantId: string, id: string, token: string | undefined): Promise<ConversationRow> {
  const c = await first<ConversationRow>(db, `SELECT * FROM conversations WHERE id = ? AND tenant_id = ? AND channel IN ('web','staff')`, id, tenantId);
  const ok = !!(c && token && c.access_token_hash && c.access_token_hash === await sha256Hex(token));
  if (!c || !ok) throw notFound('Conversation not found'); // same response for wrong id and wrong token
  return c;
}

export interface NewMessage {
  direction: 'inbound' | 'outbound' | 'internal'; senderType: 'customer' | 'ai' | 'staff' | 'system'; senderUserId?: string | null;
  body: string; provider?: string; providerMessageId?: string; clientMessageId?: string;
  deliveryStatus?: 'n/a' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed'; citations?: unknown; errorCode?: string; errorDetail?: string;
}

/** Idempotent insert. A repeated provider/client message id returns the original row instead of creating a duplicate. */
export async function addMessage(db: DB, tenantId: string, conversationId: string, m: NewMessage): Promise<{ id: string; duplicate: boolean }> {
  const id = newId('msg'); const t = nowIso();
  try {
    await db.batch([
      db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, sender_user_id, body, provider, provider_message_id, client_message_id, delivery_status, error_code, error_detail, citations_json, created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, tenantId, conversationId, m.direction, m.senderType, m.senderUserId ?? null, m.body, m.provider ?? null, m.providerMessageId ?? null, m.clientMessageId ?? null,
          m.deliveryStatus ?? 'n/a', m.errorCode ?? null, m.errorDetail ?? null, m.citations ? JSON.stringify(m.citations) : null, t),
      db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ? AND tenant_id = ?').bind(t, conversationId, tenantId),
    ]);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await first<{ id: string }>(db, `SELECT id FROM messages WHERE tenant_id = ? AND conversation_id = ? AND ((provider = ? AND provider_message_id = ?) OR client_message_id = ?)`,
      tenantId, conversationId, m.provider ?? '', m.providerMessageId ?? '', m.clientMessageId ?? '') ?? await first<{ id: string }>(db, 'SELECT id FROM messages WHERE tenant_id = ? AND provider = ? AND provider_message_id = ?', tenantId, m.provider ?? '', m.providerMessageId ?? '');
    if (!existing) throw e;
    return { id: existing.id, duplicate: true };
  }
  if (m.direction === 'inbound') await recordUsage(db, tenantId, 'msg_in', 1, m.provider ?? undefined);
  if (m.direction === 'outbound') await recordUsage(db, tenantId, 'msg_out', 1, m.provider ?? undefined);
  return { id, duplicate: false };
}

export const contactCaptureSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(200).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required so we can contact you about your enquiry' }) }),
  followUpConsent: z.boolean().optional(),
}).refine((v) => !!v.phone || !!v.email, { message: 'Please provide a phone number or an email address', path: ['phone'] });

/** Creates/links contact + lead for a conversation. Consent is recorded first-class and is a hard precondition. */
export async function attachContact(db: DB, tenantId: string, conv: ConversationRow, input: z.infer<typeof contactCaptureSchema>, evidence: string, source: string) {
  const contactId = await upsertContact(db, tenantId, input);
  const actor: Actor = { type: 'customer', id: contactId };
  const lead = await findOrCreateLead(db, tenantId, contactId, source, actor);
  await recordConsent(db, tenantId, contactId, 'enquiry_processing', true, conv.channel, evidence);
  if (input.followUpConsent !== undefined) await recordConsent(db, tenantId, contactId, 'follow_up_messages', input.followUpConsent, conv.channel, evidence);
  await run(db, 'UPDATE conversations SET contact_id = ?, lead_id = ? WHERE id = ? AND tenant_id = ?', contactId, lead.id, conv.id, tenantId);
  // A handoff recorded before we knew who the customer was now gets attached to their lead.
  await run(db, 'UPDATE follow_up_tasks SET lead_id = ? WHERE tenant_id = ? AND conversation_id = ? AND lead_id IS NULL', lead.id, tenantId, conv.id);
  if (conv.status === 'handoff') {
    const l = await getLead(db, tenantId, lead.id) as Record<string, any>;
    if (['new', 'contacted', 'qualified'].includes(l.status)) await updateLead(db, tenantId, lead.id, actor, { status: 'follow_up_required' }, { system: true });
  }
  await syncNextAction(db, tenantId, lead.id);
  const state = loadState(conv);
  if (Object.keys(state.pendingFields).length || state.pendingName) {
    await updateLead(db, tenantId, lead.id, actor, { requirements: state.pendingFields }, { system: true });
    await saveState(db, tenantId, conv.id, { ...state, pendingFields: {}, pendingName: null });
  }
  return { contactId, leadId: lead.id, createdLead: lead.created };
}

/**
 * Records that a human needs to take over. Idempotent: repeated calls on an already-handed-off conversation do not create more tasks.
 * Produces a visible follow-up task so the handoff cannot be silently lost.
 */
export async function recordHandoff(env: Env, tenantId: string, conversationId: string, reason: string, actor: Actor) {
  const db = env.DB;
  const conv = await getConversation(db, tenantId, conversationId);
  if (conv.status === 'handoff') return { alreadyHandedOff: true };
  const { settings } = await getTenantSettings(db, tenantId);
  await run(db, `UPDATE conversations SET status = 'handoff' WHERE id = ? AND tenant_id = ?`, conversationId, tenantId);
  if (conv.lead_id) {
    const lead = await getLead(db, tenantId, conv.lead_id) as Record<string, any>;
    if (['new', 'contacted', 'qualified'].includes(lead.status)) await updateLead(db, tenantId, conv.lead_id, actor, { status: 'follow_up_required' }, { system: true });
  }
  const owner = conv.assigned_to ?? (conv.lead_id ? (await getLead(db, tenantId, conv.lead_id) as any).assigned_to : null);
  await createTask(db, tenantId, actor, {
    leadId: conv.lead_id, conversationId, ownerId: owner, priority: 'high',
    title: `Human follow-up requested (${reason.replace(/_/g, ' ')})`, dueAt: new Date(Date.now() + 2 * 3600e3).toISOString(),
  }, 'handoff');
  await addMessage(db, tenantId, conversationId, { direction: 'internal', senderType: 'system', body: `Handed off to a human: ${reason.replace(/_/g, ' ')}` });
  await audit(db, tenantId, actor, 'conversation.handoff', 'conversation', conversationId, { reason });
  await recordUsage(db, tenantId, 'handoff', 1, conv.channel);
  try { await notifyAgency(env, tenantId, 'A customer needs a human follow-up', `A conversation needs attention (${reason.replace(/_/g, ' ')}). Open the Conversations screen to respond.`, 'conversation', conversationId); } catch { /* alerting must never block the handoff */ }
  void settings;
  return { alreadyHandedOff: false };
}

export async function resolveConversation(db: DB, tenantId: string, actor: Actor, id: string) {
  await getConversation(db, tenantId, id);
  await run(db, `UPDATE conversations SET status = 'resolved', resolved_at = ? WHERE id = ? AND tenant_id = ?`, nowIso(), id, tenantId);
  await audit(db, tenantId, actor, 'conversation.resolved', 'conversation', id);
}

export async function assignConversation(db: DB, tenantId: string, actor: Actor, id: string, userId: string | null) {
  const conv = await getConversation(db, tenantId, id);
  if (userId) {
    const m = await first(db, 'SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND user_id = ? AND active = 1', tenantId, userId);
    if (!m) throw unprocessable('That user is not an active member of your team');
  }
  await run(db, 'UPDATE conversations SET assigned_to = ? WHERE id = ? AND tenant_id = ?', userId, id, tenantId);
  if (conv.lead_id && userId) await updateLead(db, tenantId, conv.lead_id, actor, { assignedTo: userId });
  await audit(db, tenantId, actor, 'conversation.assigned', 'conversation', id, { userId });
}

export const staffMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  template: z.object({ name: z.string().min(1).max(100), language: z.string().max(10).optional(), params: z.array(z.string().max(200)).max(10).optional() }).optional(),
});

/** Sends a staff reply through the conversation's channel. The message is only shown as `sent` when the provider accepted it. */
export async function sendStaffMessage(env: Env, tenantId: string, userId: string, conversationId: string, input: z.infer<typeof staffMessageSchema>) {
  const db = env.DB;
  const conv = await getConversation(db, tenantId, conversationId);
  const actor: Actor = { type: 'user', id: userId };
  if (conv.channel === 'web') {
    const m = await addMessage(db, tenantId, conversationId, { direction: 'outbound', senderType: 'staff', senderUserId: userId, body: input.text, provider: 'web', deliveryStatus: 'sent' });
    await afterStaffReply(db, tenantId, conv, actor);
    return { id: m.id, deliveryStatus: 'sent' as const };
  }
  if (conv.channel !== 'whatsapp') throw unprocessable('Replies are not supported on this channel');
  if (!conv.contact_id) throw unprocessable('This conversation has no contact to reply to');
  if (await hasOptedOut(db, tenantId, conv.contact_id)) throw conflict('This customer has opted out of messages. You cannot send them a WhatsApp message.', 'opted_out');
  const contact = await first<{ phone: string | null }>(db, 'SELECT phone FROM contacts WHERE id = ? AND tenant_id = ?', conv.contact_id, tenantId);
  if (!contact?.phone) throw unprocessable('This contact has no phone number');
  const lastIn = await first<{ created_at: string }>(db, `SELECT created_at FROM messages WHERE tenant_id = ? AND conversation_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`, tenantId, conversationId);
  const windowOpen = !!lastIn && Date.now() - Date.parse(lastIn.created_at) < 24 * 3600e3;
  if (!windowOpen && !input.template) throw conflict('The 24-hour WhatsApp reply window has closed. Send an approved message template instead.', 'template_required');

  const cfgRow = await first<{ external_id: string; token_enc: string | null; enabled: number }>(db, `SELECT external_id, token_enc, enabled FROM tenant_channels WHERE tenant_id = ? AND channel = 'whatsapp'`, tenantId);
  if (!cfgRow || !cfgRow.enabled) throw notConfigured('WhatsApp is not connected for this agency. Add it under Settings → Communication channels.');
  const body = windowOpen || !input.template ? input.text : `[Template: ${input.template.name}] ${input.text}`;
  const m = await addMessage(db, tenantId, conversationId, { direction: 'outbound', senderType: 'staff', senderUserId: userId, body, provider: 'whatsapp', deliveryStatus: 'queued' });
  try {
    const token = env.WHATSAPP_MODE === 'test' ? null : cfgRow.token_enc ? await decryptSecret(cfgRow.token_enc, env.ENCRYPTION_KEY) : null;
    const out = await sendMessage(env, { phoneNumberId: cfgRow.external_id, token }, contact.phone, windowOpen ? { text: input.text } : { template: input.template!.name, language: input.template!.language, params: input.template!.params });
    await run(db, `UPDATE messages SET provider_message_id = ?, delivery_status = 'sent' WHERE id = ? AND tenant_id = ?`, out.providerMessageId, m.id, tenantId);
    await afterStaffReply(db, tenantId, conv, actor);
    return { id: m.id, deliveryStatus: 'sent' as const };
  } catch (e) {
    const he = e instanceof HttpError ? e : new HttpError(502, 'provider_error', 'The message could not be sent');
    await run(db, `UPDATE messages SET delivery_status = 'failed', error_code = ?, error_detail = ? WHERE id = ? AND tenant_id = ?`, he.code, he.message.slice(0, 200), m.id, tenantId);
    throw he;
  }
}

async function afterStaffReply(db: DB, tenantId: string, conv: ConversationRow, actor: Actor) {
  await run(db, 'UPDATE conversations SET ai_enabled = 0 WHERE id = ? AND tenant_id = ?', conv.id, tenantId); // a human has taken over
  if (conv.lead_id) {
    await markFirstResponse(db, tenantId, conv.lead_id, true);
    const lead = await getLead(db, tenantId, conv.lead_id) as Record<string, any>;
    if (lead.status === 'new') await updateLead(db, tenantId, conv.lead_id, actor, { status: 'contacted' });
  }
}

export async function listConversations(db: DB, tenantId: string, o: { status?: string; channel?: string; assigned?: string; userId: string; page: number; pageSize: number }) {
  const where = ['c.tenant_id = ?']; const args: unknown[] = [tenantId];
  if (o.status) { where.push('c.status = ?'); args.push(o.status); }
  if (o.channel) { where.push('c.channel = ?'); args.push(o.channel); }
  if (o.assigned === 'me') { where.push('c.assigned_to = ?'); args.push(o.userId); }
  else if (o.assigned === 'unassigned') where.push('c.assigned_to IS NULL');
  const total = (await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM conversations c WHERE ${where.join(' AND ')}`, ...args))?.n ?? 0;
  const items = await all(db, `SELECT c.id, c.channel, c.status, c.assigned_to, c.lead_id, c.last_message_at, c.ai_enabled, ct.name AS contact_name, ct.phone AS contact_phone, u.name AS assigned_name,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id AND m.direction <> 'internal' ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message
      FROM conversations c LEFT JOIN contacts ct ON ct.id = c.contact_id LEFT JOIN users u ON u.id = c.assigned_to
     WHERE ${where.join(' AND ')} ORDER BY c.status = 'handoff' DESC, c.last_message_at DESC LIMIT ? OFFSET ?`, ...args, o.pageSize, (o.page - 1) * o.pageSize);
  return { items, total, page: o.page, pageSize: o.pageSize };
}

export async function conversationDetail(db: DB, tenantId: string, id: string) {
  const conv = await getConversation(db, tenantId, id);
  const messages = (await all<Record<string, any>>(db, `SELECT m.id, m.direction, m.sender_type, m.body, m.delivery_status, m.error_code, m.error_detail, m.citations_json, m.created_at, u.name AS sender_name
    FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id WHERE m.tenant_id = ? AND m.conversation_id = ? ORDER BY m.created_at, m.rowid`, tenantId, id))
    .map(({ citations_json, ...r }) => ({ ...r, citations: parseJson(citations_json, null) }));
  const contact = conv.contact_id ? await first(db, 'SELECT id, name, phone, email FROM contacts WHERE id = ? AND tenant_id = ?', conv.contact_id, tenantId) : null;
  const lead = conv.lead_id ? await getLead(db, tenantId, conv.lead_id) : null;
  const state = loadState(conv);
  return {
    conversation: { id: conv.id, channel: conv.channel, status: conv.status, assigned_to: conv.assigned_to, lead_id: conv.lead_id, ai_enabled: conv.ai_enabled },
    messages, contact, lead, recommendation: state.recommendation, consultationRequested: state.consultationRequested,
  };
}

