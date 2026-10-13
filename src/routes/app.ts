import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { csrfGuard, requireAuth, requireRole } from '../auth';
import { badRequest, body, forbidden, HttpError, notConfigured, notFound, parse, unprocessable } from '../http';
import { all, first, nowIso, run } from '../db';
import { encryptSecret } from '../crypto';
import { sectionSchemas, getTenantSettings, saveSettingsSection, type SettingsSection } from '../settings';
import { addNote, findOrCreateLead, leadDetail, leadPatchSchema, listLeads, listQuerySchema, updateLead, upsertContact, getLead } from '../services/leads';
import { assignConversation, conversationDetail, listConversations, recordHandoff, resolveConversation, sendStaffMessage, staffMessageSchema } from '../services/conversations';
import { availabilitySchema, availableSlots, bookingInputSchema, cancelBooking, createBooking, getAvailability, getBooking, listBookings, rescheduleBooking, seedAvailabilityFromHours, setAvailability, setBookingOutcome } from '../services/bookings';
import { createTask, listTasks, setTaskStatus, taskSchema } from '../services/tasks';
import { createFaq, createTextSource, createUploadSource, createWebsiteSource, deleteSource, faqSchema, getSource, listSources, reprocessSource, SOURCE_TYPES, sourcePatchSchema, textSourceSchema, updateSource, urlSchema, MAX_UPLOAD_BYTES } from '../services/knowledge';
import { retrieve } from '../services/retrieval';
import { assistantHealth, overview, usageSummary } from '../services/analytics';
import { notifyBooking } from '../services/notifications';
import { inviteMember, listTeam } from '../services/tenants';
import { audit } from '../services/audit';
import { recordConsent } from '../services/consent';

export const appRoutes = new Hono<AppEnv>();
appRoutes.use('*', csrfGuard, requireAuth);

const admin = requireRole('admin');
const owner = requireRole('owner');
const actorOf = (c: Context<AppEnv>) => ({ type: 'user' as const, id: c.get('user').userId });
const tid = (c: Context<AppEnv>) => c.get('user').tenantId;

export function defer(c: Context, p: Promise<unknown>) {
  const safe = p.catch(() => { /* background work must never fail the request */ });
  try { c.executionCtx.waitUntil(safe); } catch { /* no ExecutionContext (tests): the promise still runs */ }
}

// ---------- Dashboard & reports ----------
const daysQ = z.coerce.number().int().min(1).max(365).default(30);

appRoutes.get('/overview', async (c) => {
  const t = tid(c);
  const days = daysQ.parse(c.req.query('days'));
  const [stats, health] = await Promise.all([overview(c.env.DB, t, days), assistantHealth(c.env.DB, t, c.env)]);
  const attention = await all(c.env.DB, `
    SELECT l.id, l.status, l.created_at, l.next_action, l.next_action_due, c.name, c.phone,
           CASE WHEN l.status = 'new' AND l.first_human_contact_at IS NULL THEN 'awaiting_first_contact'
                WHEN l.next_action_due IS NOT NULL AND l.next_action_due < ? THEN 'follow_up_overdue'
                WHEN l.status = 'follow_up_required' THEN 'follow_up_required' END AS reason
      FROM leads l JOIN contacts c ON c.id = l.contact_id
     WHERE l.tenant_id = ? AND l.status NOT IN ('closed','converted') AND l.source <> 'preview'
       AND ((l.status = 'new' AND l.first_human_contact_at IS NULL) OR (l.next_action_due IS NOT NULL AND l.next_action_due < ?) OR l.status = 'follow_up_required')
     ORDER BY l.created_at LIMIT 10`, nowIso(), t, nowIso());
  const upcoming = await listBookings(c.env.DB, t, { from: nowIso(), status: 'confirmed' });
  const tasks = await listTasks(c.env.DB, t, { status: 'open' });
  const { timezone, name } = await getTenantSettings(c.env.DB, t);
  return c.json({ ...stats, health, attention, upcoming: upcoming.slice(0, 6), tasks: tasks.slice(0, 8), tenant: { name, timezone } });
});

appRoutes.get('/reports', admin, async (c) => c.json(await overview(c.env.DB, tid(c), daysQ.parse(c.req.query('days')))));
appRoutes.get('/usage', admin, async (c) => c.json(await usageSummary(c.env.DB, tid(c))));
appRoutes.get('/audit', admin, async (c) => c.json({ items: await all(c.env.DB, `SELECT a.id, a.actor_type, a.action, a.entity_type, a.entity_id, a.detail_json, a.created_at, u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id AND a.actor_type = 'user' WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 200`, tid(c)) }));

// ---------- Leads ----------
appRoutes.get('/leads', async (c) => c.json(await listLeads(c.env.DB, tid(c), c.get('user').userId, parse(listQuerySchema, c.req.query()))));

appRoutes.post('/leads', async (c) => {
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(120), phone: z.string().max(30).optional(), email: z.string().email().max(200).optional(), source: z.enum(['manual', 'phone', 'walk_in', 'referral']).default('manual'), notes: z.string().max(1000).optional() })
    .refine((v) => v.phone || v.email, { message: 'Phone or email is required', path: ['phone'] }));
  const contactId = await upsertContact(c.env.DB, tid(c), input);
  const lead = await findOrCreateLead(c.env.DB, tid(c), contactId, input.source, actorOf(c));
  if (input.notes) await addNote(c.env.DB, tid(c), lead.id, c.get('user').userId, input.notes);
  return c.json(await getLead(c.env.DB, tid(c), lead.id), lead.created ? 201 : 200);
});

appRoutes.get('/leads/:id', async (c) => c.json(await leadDetail(c.env.DB, tid(c), c.req.param('id'))));
appRoutes.patch('/leads/:id', async (c) => c.json(await updateLead(c.env.DB, tid(c), c.req.param('id'), actorOf(c), await body(c, leadPatchSchema))));
appRoutes.post('/leads/:id/notes', async (c) => {
  const { text } = await body(c, z.object({ text: z.string().trim().min(1).max(2000) }));
  return c.json({ id: await addNote(c.env.DB, tid(c), c.req.param('id'), c.get('user').userId, text) }, 201);
});
appRoutes.post('/leads/:id/contacted', async (c) => {
  const t = tid(c), id = c.req.param('id');
  const lead = await getLead(c.env.DB, t, id) as Record<string, any>;
  await run(c.env.DB, 'UPDATE leads SET last_contacted_at = ?, first_human_contact_at = COALESCE(first_human_contact_at, ?), first_response_at = COALESCE(first_response_at, ?), updated_at = ? WHERE id = ? AND tenant_id = ?', nowIso(), nowIso(), nowIso(), nowIso(), id, t);
  if (lead.status === 'new') await updateLead(c.env.DB, t, id, actorOf(c), { status: 'contacted' });
  await audit(c.env.DB, t, actorOf(c), 'lead.contact_logged', 'lead', id);
  return c.json(await getLead(c.env.DB, t, id));
});
appRoutes.post('/leads/:id/next-action', async (c) => {
  const input = await body(c, z.object({ title: z.string().trim().min(2).max(200), dueAt: z.string().datetime({ offset: true }), priority: z.enum(['low', 'normal', 'high']).default('normal'), ownerId: z.string().max(60).nullable().optional() }));
  const taskId = await createTask(c.env.DB, tid(c), actorOf(c), { ...input, leadId: c.req.param('id'), ownerId: input.ownerId ?? c.get('user').userId });
  return c.json({ id: taskId, lead: await getLead(c.env.DB, tid(c), c.req.param('id')) }, 201);
});

// ---------- Conversations ----------
appRoutes.get('/conversations', async (c) => {
  const q = parse(z.object({ status: z.enum(['open', 'handoff', 'resolved']).optional(), channel: z.enum(['web', 'whatsapp', 'voice', 'staff']).optional(), assigned: z.string().max(30).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) }), c.req.query());
  return c.json(await listConversations(c.env.DB, tid(c), { ...q, userId: c.get('user').userId }));
});
appRoutes.get('/conversations/:id', async (c) => c.json(await conversationDetail(c.env.DB, tid(c), c.req.param('id'))));
appRoutes.post('/conversations/:id/messages', async (c) => {
  const r = await sendStaffMessage(c.env, tid(c), c.get('user').userId, c.req.param('id'), await body(c, staffMessageSchema));
  return c.json(r, 201);
});
appRoutes.post('/conversations/:id/assign', async (c) => {
  const { userId } = await body(c, z.object({ userId: z.string().max(60).nullable() }));
  await assignConversation(c.env.DB, tid(c), actorOf(c), c.req.param('id'), userId);
  return c.json({ ok: true });
});
appRoutes.post('/conversations/:id/resolve', async (c) => { await resolveConversation(c.env.DB, tid(c), actorOf(c), c.req.param('id')); return c.json({ ok: true }); });
appRoutes.post('/conversations/:id/handoff', async (c) => {
  const { reason } = await body(c, z.object({ reason: z.string().trim().min(2).max(100).default('staff_recorded') }));
  return c.json(await recordHandoff(c.env, tid(c), c.req.param('id'), reason.replace(/\s+/g, '_'), actorOf(c)));
});
appRoutes.post('/conversations/:id/followup', async (c) => {
  const t = tid(c);
  const conv = await first<{ lead_id: string | null }>(c.env.DB, 'SELECT lead_id FROM conversations WHERE id = ? AND tenant_id = ?', c.req.param('id'), t);
  if (!conv) throw notFound('Conversation not found');
  const input = await body(c, taskSchema.omit({ leadId: true, conversationId: true }));
  const id = await createTask(c.env.DB, t, actorOf(c), { ...input, leadId: conv.lead_id, conversationId: c.req.param('id'), ownerId: input.ownerId ?? c.get('user').userId });
  return c.json({ id }, 201);
});
appRoutes.post('/conversations/:id/ai', admin, async (c) => {
  const { enabled } = await body(c, z.object({ enabled: z.boolean() }));
  await run(c.env.DB, 'UPDATE conversations SET ai_enabled = ? WHERE id = ? AND tenant_id = ?', enabled ? 1 : 0, c.req.param('id'), tid(c));
  return c.json({ ok: true });
});

// ---------- Bookings ----------
appRoutes.get('/slots', async (c) => {
  const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), days: z.coerce.number().int().min(1).max(31).default(7), consultantId: z.string().max(60).optional() }), c.req.query());
  return c.json({ slots: await availableSlots(c.env.DB, tid(c), { fromDate: q.from, days: q.days, consultantId: q.consultantId }) });
});
appRoutes.get('/bookings', async (c) => {
  const q = parse(z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(), consultantId: z.string().max(60).optional(), leadId: z.string().max(60).optional() }), c.req.query());
  return c.json({ items: await listBookings(c.env.DB, tid(c), q) });
});
appRoutes.post('/bookings', async (c) => {
  const input = await body(c, bookingInputSchema.extend({ idempotencyKey: z.string().min(8).max(100) }));
  const r = await createBooking(c.env.DB, tid(c), actorOf(c), input, 'staff');
  if (!r.duplicate) defer(c, notifyBooking(c.env, tid(c), r.id, 'confirmed'));
  return c.json(await getBooking(c.env.DB, tid(c), r.id), r.duplicate ? 200 : 201);
});
appRoutes.post('/bookings/:id/cancel', async (c) => {
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(300).optional() }));
  const before = await getBooking(c.env.DB, tid(c), c.req.param('id'));
  const b = await cancelBooking(c.env.DB, tid(c), actorOf(c), c.req.param('id'), reason);
  if (before.status === 'confirmed') defer(c, notifyBooking(c.env, tid(c), b.id, 'cancelled'));
  return c.json(b);
});
appRoutes.post('/bookings/:id/reschedule', async (c) => {
  const { start, consultantId } = await body(c, z.object({ start: z.string().datetime({ offset: true }), consultantId: z.string().max(60).nullable().optional() }));
  const b = await rescheduleBooking(c.env.DB, tid(c), actorOf(c), c.req.param('id'), start, consultantId);
  defer(c, notifyBooking(c.env, tid(c), b.id, 'rescheduled'));
  return c.json(b);
});
appRoutes.post('/bookings/:id/outcome', async (c) => {
  const { outcome } = await body(c, z.object({ outcome: z.enum(['completed', 'no_show']) }));
  return c.json(await setBookingOutcome(c.env.DB, tid(c), actorOf(c), c.req.param('id'), outcome));
});

// ---------- Follow-ups ----------
appRoutes.get('/tasks', async (c) => {
  const q = parse(z.object({ status: z.enum(['open', 'done', 'cancelled']).optional(), mine: z.enum(['1', '0']).optional(), overdue: z.enum(['1', '0']).optional() }), c.req.query());
  return c.json({ items: await listTasks(c.env.DB, tid(c), { status: q.status, ownerId: q.mine === '1' ? c.get('user').userId : null, overdueOnly: q.overdue === '1' }) });
});
appRoutes.post('/tasks', async (c) => {
  const input = await body(c, taskSchema);
  return c.json({ id: await createTask(c.env.DB, tid(c), actorOf(c), { ...input, ownerId: input.ownerId ?? c.get('user').userId }) }, 201);
});
appRoutes.patch('/tasks/:id', async (c) => {
  const { status } = await body(c, z.object({ status: z.enum(['open', 'done', 'cancelled']) }));
  await setTaskStatus(c.env.DB, tid(c), actorOf(c), c.req.param('id'), status);
  return c.json({ ok: true });
});

// ---------- Knowledge base (admin) ----------
appRoutes.get('/knowledge', admin, async (c) => c.json({ items: await listSources(c.env.DB, tid(c)), types: SOURCE_TYPES }));
appRoutes.get('/knowledge/:id', admin, async (c) => c.json(await getSource(c.env.DB, tid(c), c.req.param('id'))));
appRoutes.post('/knowledge/faq', admin, async (c) => c.json(await createFaq(c.env.DB, tid(c), actorOf(c), await body(c, faqSchema)), 201));
appRoutes.post('/knowledge/text', admin, async (c) => c.json(await createTextSource(c.env.DB, tid(c), actorOf(c), await body(c, textSourceSchema)), 201));
appRoutes.post('/knowledge/url', admin, async (c) => c.json(await createWebsiteSource(c.env, tid(c), actorOf(c), await body(c, urlSchema)), 201));
appRoutes.post('/knowledge/upload', admin, async (c) => {
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > MAX_UPLOAD_BYTES + 50_000) throw new HttpError(413, 'too_large', 'That file is larger than 1 MB');
  let form: FormData;
  try { form = await c.req.formData(); } catch { throw badRequest('Expected a multipart file upload'); }
  const file = form.get('file') as unknown as (Blob & { name?: string }) | string | null;
  if (!file || typeof file === 'string') throw badRequest('Choose a file to upload');
  const type = parse(z.enum(SOURCE_TYPES), (form.get('type') as string) || 'document');
  const title = (form.get('title') as string | null) || undefined;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return c.json(await createUploadSource(c.env, tid(c), actorOf(c), { name: file.name ?? 'upload.txt', type: file.type, bytes }, { title, type }), 201);
});
appRoutes.patch('/knowledge/:id', admin, async (c) => c.json(await updateSource(c.env.DB, tid(c), actorOf(c), c.req.param('id'), await body(c, sourcePatchSchema))));
appRoutes.post('/knowledge/:id/reprocess', admin, async (c) => c.json(await reprocessSource(c.env, tid(c), actorOf(c), c.req.param('id'))));
appRoutes.delete('/knowledge/:id', admin, async (c) => { await deleteSource(c.env, tid(c), actorOf(c), c.req.param('id')); return c.json({ ok: true }); });

/** Dry-run of the live assistant against this tenant's knowledge. Writes nothing except usage accounting. */
appRoutes.post('/knowledge-test', admin, async (c) => {
  const { question, includeUnpublished } = await body(c, z.object({ question: z.string().trim().min(2).max(500), includeUnpublished: z.boolean().default(true) }));
  const hits = await retrieve(c.env.DB, tid(c), question, { includeUnpublished });
  return c.json({
    answerable: hits.length > 0,
    message: hits.length ? 'The assistant would answer using these sources.' : 'No reliable answer is available. The assistant would say it does not know and offer a human handoff.',
    hits: hits.map((h) => ({ sourceId: h.sourceId, title: h.title, snippet: h.text.slice(0, 400), coverage: Math.round(h.coverage * 100) })),
  });
});

// ---------- Settings, team, channels ----------
appRoutes.get('/settings', async (c) => {
  const { settings, timezone, name } = await getTenantSettings(c.env.DB, tid(c));
  const u = c.get('user');
  if (u.role === 'consultant') return c.json({ name, timezone, hours: settings.hours, consultation: settings.consultation });
  return c.json({ name, timezone, ...settings });
});
appRoutes.put('/settings/profile-name', admin, async (c) => {
  const { name } = await body(c, z.object({ name: z.string().trim().min(2).max(120) }));
  await run(c.env.DB, 'UPDATE tenants SET name = ? WHERE id = ?', name, tid(c));
  await audit(c.env.DB, tid(c), actorOf(c), 'settings.updated', 'tenant', tid(c), { section: 'name' });
  return c.json({ ok: true });
});
appRoutes.put('/settings/:section', admin, async (c) => {
  const section = c.req.param('section') as SettingsSection;
  if (!(section in sectionSchemas)) throw notFound('Unknown settings section');
  if ((section === 'limits' || section === 'retention') && c.get('user').role !== 'owner') throw forbidden('Only the agency owner can change this');
  const value = await body(c, sectionSchemas[section] as z.ZodTypeAny);
  const next = await saveSettingsSection(c.env.DB, tid(c), section, value);
  await audit(c.env.DB, tid(c), actorOf(c), 'settings.updated', 'tenant', tid(c), { section });
  return c.json(next);
});

appRoutes.get('/team', async (c) => c.json({ items: await listTeam(c.env.DB, tid(c)) }));
appRoutes.post('/team', admin, async (c) => {
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(120), email: z.string().email().max(200), role: z.enum(['admin', 'consultant']) }));
  const r = await inviteMember(c.env.DB, tid(c), c.get('user').userId, input);
  return c.json({ userId: r.userId, inviteUrl: `${new URL(c.req.url).origin}/app/#/accept-invite?token=${r.inviteToken}` }, 201);
});
appRoutes.patch('/team/:userId', admin, async (c) => {
  const t = tid(c), target = c.req.param('userId'), me = c.get('user');
  const input = await body(c, z.object({ role: z.enum(['owner', 'admin', 'consultant']).optional(), active: z.boolean().optional() }).strict());
  const m = await first<{ role: string; active: number }>(c.env.DB, 'SELECT role, active FROM memberships WHERE tenant_id = ? AND user_id = ?', t, target);
  if (!m) throw notFound('Team member not found');
  // Privilege rules: only owners can grant/remove owner; nobody can lock out the last owner; you cannot change your own role.
  if ((input.role === 'owner' || m.role === 'owner') && me.role !== 'owner') throw forbidden('Only an owner can change owner access');
  if (target === me.userId && input.role && input.role !== m.role) throw forbidden('You cannot change your own role');
  if (m.role === 'owner' && ((input.role && input.role !== 'owner') || input.active === false)) {
    const owners = (await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'owner' AND active = 1`, t))?.n ?? 0;
    if (owners <= 1) throw unprocessable('An agency must keep at least one active owner');
  }
  if (input.role) await run(c.env.DB, 'UPDATE memberships SET role = ? WHERE tenant_id = ? AND user_id = ?', input.role, t, target);
  if (input.active !== undefined) {
    await run(c.env.DB, 'UPDATE memberships SET active = ? WHERE tenant_id = ? AND user_id = ?', input.active ? 1 : 0, t, target);
    if (!input.active) await run(c.env.DB, 'DELETE FROM sessions WHERE user_id = ? AND tenant_id = ?', target, t);
  }
  await audit(c.env.DB, t, actorOf(c), 'member.updated', 'user', target, input);
  return c.json({ ok: true });
});
appRoutes.get('/team/:userId/availability', async (c) => {
  const me = c.get('user'), target = c.req.param('userId');
  if (me.role === 'consultant' && target !== me.userId) throw forbidden();
  return c.json({ windows: await getAvailability(c.env.DB, tid(c), target) });
});
appRoutes.put('/team/:userId/availability', async (c) => {
  const me = c.get('user'), target = c.req.param('userId');
  if (me.role === 'consultant' && target !== me.userId) throw forbidden();
  const { windows, fromBusinessHours } = await body(c, z.object({ windows: availabilitySchema.optional(), fromBusinessHours: z.boolean().optional() }));
  if (fromBusinessHours) await seedAvailabilityFromHours(c.env.DB, tid(c), target);
  else await setAvailability(c.env.DB, tid(c), target, windows ?? []);
  await audit(c.env.DB, tid(c), actorOf(c), 'availability.updated', 'user', target);
  return c.json({ windows: await getAvailability(c.env.DB, tid(c), target) });
});

appRoutes.get('/channels', admin, async (c) => {
  const wa = await first<{ external_id: string; display_phone: string | null; enabled: number; token_enc: string | null }>(c.env.DB, `SELECT external_id, display_phone, enabled, token_enc FROM tenant_channels WHERE tenant_id = ? AND channel = 'whatsapp'`, tid(c));
  const { settings } = await getTenantSettings(c.env.DB, tid(c));
  const origin = new URL(c.req.url).origin;
  const tenant = await first<{ public_key: string }>(c.env.DB, 'SELECT public_key FROM tenants WHERE id = ?', tid(c));
  const recent = await all(c.env.DB, `SELECT kind, status, attempts, error, created_at FROM provider_events WHERE tenant_id = ? AND provider = 'whatsapp' ORDER BY created_at DESC LIMIT 10`, tid(c));
  return c.json({
    web: { publicKey: tenant!.public_key, embedSnippet: `<script src="${origin}/widget/v1.js" data-agency="${tenant!.public_key}" async></script>`, allowedOrigins: settings.branding.allowedOrigins },
    whatsapp: {
      connected: !!wa?.enabled, phoneNumberId: wa?.external_id ?? null, displayPhone: wa?.display_phone ?? null, hasToken: !!wa?.token_enc,
      platform: { appSecretConfigured: !!c.env.WHATSAPP_APP_SECRET, verifyTokenConfigured: !!c.env.WHATSAPP_VERIFY_TOKEN, encryptionKeyConfigured: !!c.env.ENCRYPTION_KEY, testMode: c.env.WHATSAPP_MODE === 'test' },
      webhookUrl: `${origin}/api/webhooks/whatsapp`, recentEvents: recent,
    },
    email: { configured: !!(c.env.RESEND_API_KEY && c.env.EMAIL_FROM) },
    ai: { configured: !!c.env.ANTHROPIC_API_KEY },
  });
});
appRoutes.put('/channels/whatsapp', admin, async (c) => {
  const input = await body(c, z.object({ phoneNumberId: z.string().regex(/^\d{5,25}$/, 'The phone number ID is digits only'), accessToken: z.string().min(20).max(1000).optional(), displayPhone: z.string().max(30).optional() }));
  const existing = await first<{ token_enc: string | null }>(c.env.DB, `SELECT token_enc FROM tenant_channels WHERE tenant_id = ? AND channel = 'whatsapp'`, tid(c));
  if (!input.accessToken && !existing?.token_enc && c.env.WHATSAPP_MODE !== 'test') throw unprocessable('An access token is required to connect WhatsApp');
  if (input.accessToken && !c.env.ENCRYPTION_KEY) throw notConfigured('ENCRYPTION_KEY is not configured on the server, so provider tokens cannot be stored safely');
  const enc = input.accessToken ? await encryptSecret(input.accessToken, c.env.ENCRYPTION_KEY) : existing?.token_enc ?? null;
  try {
    await run(c.env.DB, `INSERT INTO tenant_channels (tenant_id, channel, external_id, token_enc, display_phone, enabled, created_at) VALUES (?,?,?,?,?,1,?)
      ON CONFLICT(tenant_id, channel) DO UPDATE SET external_id = excluded.external_id, token_enc = excluded.token_enc, display_phone = excluded.display_phone, enabled = 1`, tid(c), 'whatsapp', input.phoneNumberId, enc, input.displayPhone ?? null, nowIso());
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw new HttpError(409, 'conflict', 'That WhatsApp number is already connected to another agency');
    throw e;
  }
  await audit(c.env.DB, tid(c), actorOf(c), 'channel.whatsapp_connected', 'tenant', tid(c), { phoneNumberId: input.phoneNumberId });
  return c.json({ ok: true });
});
appRoutes.delete('/channels/whatsapp', admin, async (c) => {
  await run(c.env.DB, `DELETE FROM tenant_channels WHERE tenant_id = ? AND channel = 'whatsapp'`, tid(c));
  await audit(c.env.DB, tid(c), actorOf(c), 'channel.whatsapp_disconnected', 'tenant', tid(c));
  return c.json({ ok: true });
});

// ---------- Privacy ----------
/** PDPA data-erasure: removes a person's identifiers and message content while keeping anonymised counts for reporting. */
appRoutes.post('/privacy/erase-contact', admin, async (c) => {
  const { leadId } = await body(c, z.object({ leadId: z.string().max(60) }));
  const t = tid(c);
  const lead = await getLead(c.env.DB, t, leadId) as Record<string, any>;
  const cid = lead.contact_id as string;
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM messages WHERE tenant_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE tenant_id = ? AND contact_id = ?)`).bind(t, t, cid),
    c.env.DB.prepare(`UPDATE conversations SET external_ref = NULL, state_json = '{}', status = 'resolved', access_token_hash = NULL WHERE tenant_id = ? AND contact_id = ?`).bind(t, cid),
    c.env.DB.prepare(`DELETE FROM lead_notes WHERE tenant_id = ? AND lead_id IN (SELECT id FROM leads WHERE tenant_id = ? AND contact_id = ?)`).bind(t, t, cid),
    c.env.DB.prepare(`UPDATE leads SET summary = NULL, requirements_json = '{}', preferred_time_text = NULL, next_action = NULL, status = CASE WHEN status = 'converted' THEN status ELSE 'closed' END, closed_reason = COALESCE(closed_reason, 'Data erased on request'), updated_at = ? WHERE tenant_id = ? AND contact_id = ?`).bind(nowIso(), t, cid),
    c.env.DB.prepare(`UPDATE follow_up_tasks SET status = 'cancelled' WHERE tenant_id = ? AND status = 'open' AND lead_id IN (SELECT id FROM leads WHERE tenant_id = ? AND contact_id = ?)`).bind(t, t, cid),
    c.env.DB.prepare(`UPDATE contacts SET name = 'Erased contact', phone = NULL, email = NULL, updated_at = ? WHERE tenant_id = ? AND id = ?`).bind(nowIso(), t, cid),
  ]);
  await recordConsent(c.env.DB, t, cid, 'follow_up_messages', false, 'staff', 'Data erasure request');
  await audit(c.env.DB, t, actorOf(c), 'privacy.contact_erased', 'lead', leadId);
  return c.json({ ok: true });
});

