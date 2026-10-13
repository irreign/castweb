import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { resolveSession } from '../auth';
import { all, first, nowIso, parseJson } from '../db';
import { badRequest, body, conflict, HttpError, notFound, parse } from '../http';
import { clientIp, rateLimit } from '../ratelimit';
import { getTenantSettings } from '../settings';
import { addMessage, attachContact, authenticateWebConversation, contactCaptureSchema, createConversation, loadState, recordHandoff, saveState } from '../services/conversations';
import { handleCustomerMessage, nextQuestion } from '../services/engine';
import { availableSlots, createBooking, getBooking } from '../services/bookings';
import { getLead, markFirstResponse } from '../services/leads';
import { notifyBooking } from '../services/notifications';
import { monthlyUsage } from '../services/audit';
import { NOTICE_VERSION } from '../services/consent';
import { formatLocal, localParts } from '../time';
import { defer } from './app';

type PubEnv = AppEnv & { Variables: { tenantId: string; tenantName: string } };
export const publicRoutes = new Hono<PubEnv>();

const MAX_MSG = 1000;

// Resolve the tenant from the public widget key. The key identifies an agency for public chat only; it unlocks no private route.
publicRoutes.use('/:key/*', async (c, next) => {
  const t = await first<{ id: string; name: string }>(c.env.DB, `SELECT id, name FROM tenants WHERE public_key = ? AND status = 'active'`, c.req.param('key'));
  if (!t) throw notFound('This chat is not available');
  c.set('tenantId', t.id); c.set('tenantName', t.name);
  await next();
});

const convToken = (c: Context) => c.req.header('x-conversation-token');

function openNow(settings: Awaited<ReturnType<typeof getTenantSettings>>['settings'], tz: string): boolean {
  const p = localParts(Date.now(), tz);
  const h = settings.hours[String(p.weekday) as '0'];
  if (!h) return false;
  const mm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return p.minutes >= mm(h.open) && p.minutes < mm(h.close);
}

publicRoutes.get('/:key/config', async (c) => {
  await rateLimit(c.env.DB, `pub-config:${clientIp(c.req.raw)}`, 120, 300);
  const { settings, timezone, name } = await getTenantSettings(c.env.DB, c.get('tenantId'));
  const b = settings.branding;
  return c.json({
    agencyName: b.displayName ?? name,
    primaryColor: b.primaryColor,
    welcome: b.welcomeMessage ?? settings.ai.greeting,
    suggestedPrompts: b.suggestedPrompts,
    aiEnabled: settings.ai.enabled,
    disclosure: 'You are chatting with an AI assistant. A human consultant can take over at any time — just ask.',
    consentNotice: `By sharing your details you agree that ${b.displayName ?? name} may contact you about your enquiry and store your messages for that purpose. Please do not share NRIC/FIN, passport or other ID numbers in this chat.`,
    noticeVersion: NOTICE_VERSION,
    privacyUrl: b.privacyUrl,
    contact: { phone: settings.profile.contactPhone, email: settings.profile.contactEmail },
    openNow: openNow(settings, timezone),
    timezone,
  });
});

publicRoutes.post('/:key/conversations', async (c) => {
  await rateLimit(c.env.DB, `pub-conv:${clientIp(c.req.raw)}`, 15, 600);
  const tenantId = c.get('tenantId');
  const { preview } = await body(c, z.object({ preview: z.boolean().optional() }).default({}));
  let channel: 'web' | 'staff' = 'web';
  if (preview) {
    // Preview conversations are admin-only, labelled as tests, and excluded from reports.
    const u = await resolveSession(c);
    if (!u || u.tenantId !== tenantId || u.role === 'consultant') throw new HttpError(403, 'forbidden', 'Preview is only available to agency administrators');
    channel = 'staff';
  }
  const conv = await createConversation(c.env.DB, tenantId, { channel });
  return c.json({ conversationId: conv.id, token: conv.token, preview: channel === 'staff' }, 201);
});

const publicMessage = (m: Record<string, any>) => ({ id: m.id, from: m.sender_type, text: m.body, citations: parseJson(m.citations_json, []), createdAt: m.created_at });

publicRoutes.get('/:key/conversations/:id/messages', async (c) => {
  await rateLimit(c.env.DB, `pub-poll:${clientIp(c.req.raw)}`, 240, 300);
  const t = c.get('tenantId');
  await authenticateWebConversation(c.env.DB, t, c.req.param('id'), convToken(c));
  const after = c.req.query('after') ?? '';
  const rows = await all(c.env.DB, `SELECT id, sender_type, body, citations_json, created_at FROM messages WHERE tenant_id = ? AND conversation_id = ? AND direction <> 'internal' AND created_at > ? ORDER BY created_at, rowid LIMIT 100`, t, c.req.param('id'), after);
  const conv = await first<{ status: string }>(c.env.DB, 'SELECT status FROM conversations WHERE id = ? AND tenant_id = ?', c.req.param('id'), t);
  return c.json({ messages: rows.map(publicMessage), status: conv?.status });
});

publicRoutes.post('/:key/conversations/:id/messages', async (c) => {
  const t = c.get('tenantId');
  await rateLimit(c.env.DB, `pub-msg:${clientIp(c.req.raw)}`, 40, 300);
  const conv = await authenticateWebConversation(c.env.DB, t, c.req.param('id'), convToken(c));
  await rateLimit(c.env.DB, `pub-msg-conv:${conv.id}`, 80, 3600);
  const { text, clientMessageId } = await body(c, z.object({ text: z.string().trim().min(1).max(MAX_MSG), clientMessageId: z.string().min(8).max(80) }));
  const { settings, name } = await getTenantSettings(c.env.DB, t);
  if (await monthlyUsage(c.env.DB, t, 'msg_in') >= settings.limits.messagesPerMonth) {
    throw new HttpError(503, 'capacity', `${name} is not able to take chat messages right now. Please contact them directly${settings.profile.contactPhone ? ` on ${settings.profile.contactPhone}` : ''}.`);
  }
  const inbound = await addMessage(c.env.DB, t, conv.id, { direction: 'inbound', senderType: 'customer', body: text, provider: 'web', clientMessageId });
  const lastReplyAfter = async () => (await all(c.env.DB, `SELECT id, sender_type, body, citations_json, created_at FROM messages WHERE tenant_id = ? AND conversation_id = ? AND direction = 'outbound' AND created_at >= (SELECT created_at FROM messages WHERE id = ?) ORDER BY created_at, rowid`, t, conv.id, inbound.id)).map(publicMessage);
  if (inbound.duplicate) {
    const existing = await lastReplyAfter();
    if (existing.length) return c.json({ replies: existing, ui: { action: 'none' }, handoff: false, duplicate: true });
    // The earlier attempt was interrupted before a reply was stored: fall through and produce it now.
  }
  let outcome;
  try {
    outcome = await handleCustomerMessage(c.env, t, conv.id, text);
  } catch (e) {
    console.error('engine_error', (e as Error)?.message?.slice(0, 200));
    throw new HttpError(502, 'assistant_error', 'Sorry, something went wrong on our side. Your message was saved — please try again.');
  }
  const replies = [];
  if (outcome.reply) {
    const m = await addMessage(c.env.DB, t, conv.id, { direction: 'outbound', senderType: 'ai', body: outcome.reply, provider: 'web', deliveryStatus: 'delivered', citations: outcome.citations.length ? outcome.citations : undefined });
    replies.push({ id: m.id, from: 'ai', text: outcome.reply, citations: outcome.citations, createdAt: nowIso() });
    const fresh = await first<{ lead_id: string | null }>(c.env.DB, 'SELECT lead_id FROM conversations WHERE id = ? AND tenant_id = ?', conv.id, t);
    if (fresh?.lead_id) await markFirstResponse(c.env.DB, t, fresh.lead_id, false);
  }
  return c.json({ replies, ui: outcome.ui, handoff: outcome.handoff, humanHandling: outcome.mode === 'human' });
});

publicRoutes.post('/:key/conversations/:id/contact', async (c) => {
  const t = c.get('tenantId');
  await rateLimit(c.env.DB, `pub-contact:${clientIp(c.req.raw)}`, 10, 600);
  const conv = await authenticateWebConversation(c.env.DB, t, c.req.param('id'), convToken(c));
  const input = await body(c, contactCaptureSchema);
  const r = await attachContact(c.env.DB, t, conv, input, `Widget consent (${NOTICE_VERSION})`, conv.channel === 'staff' ? 'preview' : 'web_chat');
  const fresh = await first<any>(c.env.DB, 'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?', conv.id, t);
  const state = loadState(fresh);
  const { settings } = await getTenantSettings(c.env.DB, t);
  const lead = await getLead(c.env.DB, t, r.leadId) as Record<string, any>;
  const given = input.name.split(/\s+/).filter((w) => !/^(mr|mrs|ms|miss|mdm|madam|dr)\.?$/i.test(w))[0] ?? input.name.split(/\s+/)[0];
  let text = `Thanks ${given}, I've noted your details.`;
  let ui: { action: string } = { action: 'none' };
  if (fresh.status === 'handoff') text += ' A consultant will follow up with you.';
  else if (state.consultationRequested) { text += ' Please pick a time for your consultation below.'; ui = { action: 'show_slots' }; }
  else {
    const q = nextQuestion(settings.ai.collectFields, lead.requirements ?? {}, state.asked);
    if (q) { text += ` ${q.ask}`; await saveState(c.env.DB, t, conv.id, { ...state, asked: [...state.asked, q.key] }); }
  }
  const m = await addMessage(c.env.DB, t, conv.id, { direction: 'outbound', senderType: 'system', body: text, provider: 'web', deliveryStatus: 'delivered' });
  await markFirstResponse(c.env.DB, t, r.leadId, false);
  return c.json({ ok: true, reply: { id: m.id, from: 'system', text, createdAt: nowIso() }, ui });
});

publicRoutes.post('/:key/conversations/:id/handoff', async (c) => {
  const t = c.get('tenantId');
  await rateLimit(c.env.DB, `pub-handoff:${clientIp(c.req.raw)}`, 10, 600);
  const conv = await authenticateWebConversation(c.env.DB, t, c.req.param('id'), convToken(c));
  await recordHandoff(c.env, t, conv.id, 'customer_requested', { type: 'customer' });
  const { settings } = await getTenantSettings(c.env.DB, t);
  const text = settings.ai.handoffMessage + (conv.lead_id ? '' : ' Please share your name and phone number or email so they can reach you.');
  const m = await addMessage(c.env.DB, t, conv.id, { direction: 'outbound', senderType: 'system', body: text, provider: 'web', deliveryStatus: 'delivered' });
  return c.json({ reply: { id: m.id, from: 'system', text, createdAt: nowIso() }, ui: { action: conv.lead_id ? 'handoff_done' : 'request_contact' } });
});

publicRoutes.get('/:key/slots', async (c) => {
  await rateLimit(c.env.DB, `pub-slots:${clientIp(c.req.raw)}`, 60, 300);
  const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), days: z.coerce.number().int().min(1).max(14).default(7) }), c.req.query());
  const t = c.get('tenantId');
  const { timezone } = await getTenantSettings(c.env.DB, t);
  const slots = await availableSlots(c.env.DB, t, { fromDate: q.from, days: q.days });
  const seen = new Set<string>();
  // Public view: times only, de-duplicated across consultants. No consultant identities are exposed.
  return c.json({ timezone, slots: slots.filter((s) => !seen.has(s.start) && !!seen.add(s.start)).map((s) => ({ start: s.start, end: s.end, label: formatLocal(s.start, timezone) })) });
});

publicRoutes.post('/:key/conversations/:id/book', async (c) => {
  const t = c.get('tenantId');
  await rateLimit(c.env.DB, `pub-book:${clientIp(c.req.raw)}`, 10, 600);
  const conv = await authenticateWebConversation(c.env.DB, t, c.req.param('id'), convToken(c));
  const { start, idempotencyKey } = await body(c, z.object({ start: z.string().datetime({ offset: true }), idempotencyKey: z.string().min(8).max(100) }));
  if (conv.channel === 'staff') throw conflict('Booking is disabled in preview mode so test chats cannot take real consultation slots.', 'preview_booking_disabled');
  if (!conv.lead_id) throw badRequest('Please share your contact details before booking');
  const r = await createBooking(c.env.DB, t, { type: 'customer', id: conv.contact_id }, { leadId: conv.lead_id, start, idempotencyKey: `${conv.id}:${idempotencyKey}` }, 'web');
  const { timezone } = await getTenantSettings(c.env.DB, t);
  const label = formatLocal(r.start, timezone);
  // Only now that the booking row is persisted do we tell the customer it is confirmed.
  if (!r.duplicate) {
    await addMessage(c.env.DB, t, conv.id, { direction: 'outbound', senderType: 'system', body: `Your consultation is confirmed for ${label} (${timezone}).`, provider: 'web', deliveryStatus: 'delivered' });
    defer(c, notifyBooking(c.env, t, r.id, 'confirmed'));
  }
  const b = await getBooking(c.env.DB, t, r.id);
  return c.json({ booking: { id: r.id, start: r.start, end: r.end, label, timezone, status: b.status }, duplicate: r.duplicate }, r.duplicate ? 200 : 201);
});
