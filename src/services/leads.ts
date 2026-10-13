import { z } from 'zod';
import { all, first, isUniqueViolation, likeEscape, newId, nowIso, parseJson, run, type DB } from '../db';
import { badRequest, conflict, notFound, unprocessable } from '../http';
import { audit, type Actor } from './audit';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'consultation_booked', 'follow_up_required', 'converted', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Allowed manual transitions. `consultation_booked` is reachable only through the booking service (system=true). */
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted', 'qualified', 'follow_up_required', 'closed'],
  contacted: ['qualified', 'follow_up_required', 'converted', 'closed'],
  qualified: ['contacted', 'follow_up_required', 'converted', 'closed'],
  consultation_booked: ['contacted', 'qualified', 'follow_up_required', 'converted', 'closed'],
  follow_up_required: ['contacted', 'qualified', 'converted', 'closed'],
  converted: [],
  closed: ['contacted', 'follow_up_required'],
};

export function canTransition(from: LeadStatus, to: LeadStatus, system = false): boolean {
  if (from === to) return true;
  if (to === 'consultation_booked') return system && from !== 'converted' && from !== 'closed';
  if (system && to === 'qualified' && from === 'new') return true;
  return TRANSITIONS[from].includes(to);
}

// Qualification answers. Deliberately excludes identity numbers and any other sensitive identifiers.
export const requirementsSchema = z.object({
  householdSize: z.number().int().min(1).max(20).optional(),
  hasChildren: z.boolean().optional(),
  hasElderly: z.boolean().optional(),
  hasPets: z.boolean().optional(),
  helperType: z.enum(['new', 'transfer', 'ex_singapore', 'not_sure']).optional(),
  startTiming: z.string().trim().max(100).optional(),
  languagePreference: z.string().trim().max(60).optional(),
  budgetNotes: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
}).strip();
export type Requirements = z.infer<typeof requirementsSchema>;

export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\D/g, '');
  if (!d) return null;
  if (!plus && d.length === 8 && /^[689]/.test(d)) d = '65' + d; // Singapore local numbers
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export async function upsertContact(db: DB, tenantId: string, input: { name?: string | null; phone?: string | null; email?: string | null }) {
  const phone = normalisePhone(input.phone);
  const email = input.email ? input.email.trim().toLowerCase() : null;
  if (input.phone && !phone) throw unprocessable('That phone number does not look valid');
  const find = async () => first<{ id: string; name: string | null; phone: string | null; email: string | null }>(db,
    'SELECT id, name, phone, email FROM contacts WHERE tenant_id = ? AND ((? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND email = ?)) LIMIT 1',
    tenantId, phone, phone, email, email);
  let existing = await find();
  if (!existing) {
    const id = newId('con');
    try {
      await run(db, 'INSERT INTO contacts (id, tenant_id, name, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', id, tenantId, input.name?.trim() || null, phone, email, nowIso(), nowIso());
      return id;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      existing = await find(); // lost a race; use the winner
      if (!existing) throw e;
    }
  }
  // Fill gaps only; never overwrite existing details from an unauthenticated source.
  const patch: string[] = []; const args: unknown[] = [];
  if (!existing.name && input.name?.trim()) { patch.push('name = ?'); args.push(input.name.trim()); }
  if (!existing.phone && phone) { patch.push('phone = ?'); args.push(phone); }
  if (!existing.email && email) { patch.push('email = ?'); args.push(email); }
  if (patch.length) {
    try { await run(db, `UPDATE contacts SET ${patch.join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`, ...args, nowIso(), existing.id, tenantId); } catch (e) { if (!isUniqueViolation(e)) throw e; }
  }
  return existing.id;
}

/** Find the contact's open lead or create one. Closed/converted leads are not reused: a returning customer gets a fresh enquiry. */
export async function findOrCreateLead(db: DB, tenantId: string, contactId: string, source: string, actor: Actor): Promise<{ id: string; created: boolean }> {
  const open = await first<{ id: string }>(db, `SELECT id FROM leads WHERE tenant_id = ? AND contact_id = ? AND status NOT IN ('closed','converted') ORDER BY created_at DESC LIMIT 1`, tenantId, contactId);
  if (open) return { id: open.id, created: false };
  const id = newId('led');
  await run(db, `INSERT INTO leads (id, tenant_id, contact_id, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, id, tenantId, contactId, 'new', source, nowIso(), nowIso());
  await audit(db, tenantId, actor, 'lead.created', 'lead', id, { source });
  return { id, created: true };
}

export const LEAD_SELECT = `
  SELECT l.id, l.status, l.source, l.assigned_to, l.requirements_json, l.preferred_time_text, l.summary,
         l.next_action, l.next_action_due, l.first_response_at, l.first_human_contact_at, l.last_contacted_at,
         l.closed_reason, l.created_at, l.updated_at,
         c.id AS contact_id, c.name, c.phone, c.email, u.name AS assigned_name
    FROM leads l JOIN contacts c ON c.id = l.contact_id AND c.tenant_id = l.tenant_id
    LEFT JOIN users u ON u.id = l.assigned_to`;

function shape(r: Record<string, unknown>) {
  const { requirements_json, ...rest } = r as Record<string, unknown> & { requirements_json: string };
  return { ...rest, requirements: parseJson<Requirements>(requirements_json, {}) };
}

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().max(30).optional(),
  assigned: z.string().max(60).optional(), // user id | 'me' | 'unassigned'
  sort: z.enum(['created_at', 'last_contacted_at', 'next_action_due', 'name', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listLeads(db: DB, tenantId: string, userId: string, q: z.infer<typeof listQuerySchema>) {
  const where = ["l.tenant_id = ?", "l.source <> 'preview'"]; const args: unknown[] = [tenantId];
  if (q.status) { where.push('l.status = ?'); args.push(q.status); }
  if (q.source) { where.push('l.source = ?'); args.push(q.source); }
  if (q.assigned === 'unassigned') where.push('l.assigned_to IS NULL');
  else if (q.assigned) { where.push('l.assigned_to = ?'); args.push(q.assigned === 'me' ? userId : q.assigned); }
  if (q.q) {
    const like = `%${likeEscape(q.q)}%`;
    where.push(`(c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR l.summary LIKE ? ESCAPE '\\')`);
    args.push(like, like, like, like);
  }
  const sortCol = { created_at: 'l.created_at', last_contacted_at: 'l.last_contacted_at', next_action_due: 'l.next_action_due', name: 'c.name', status: 'l.status' }[q.sort];
  // NULLs last regardless of direction so "no due date" never crowds the top.
  const orderSql = `${sortCol} IS NULL, ${sortCol} ${q.order === 'asc' ? 'ASC' : 'DESC'}, l.id`;
  const total = (await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM leads l JOIN contacts c ON c.id = l.contact_id WHERE ${where.join(' AND ')}`, ...args))?.n ?? 0;
  const rows = await all(db, `${LEAD_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${orderSql} LIMIT ? OFFSET ?`, ...args, q.pageSize, (q.page - 1) * q.pageSize);
  return { items: rows.map(shape), total, page: q.page, pageSize: q.pageSize };
}

export async function getLead(db: DB, tenantId: string, leadId: string) {
  const r = await first(db, `${LEAD_SELECT} WHERE l.tenant_id = ? AND l.id = ?`, tenantId, leadId);
  if (!r) throw notFound('Lead not found');
  return shape(r);
}

export async function assertTenantMember(db: DB, tenantId: string, userId: string) {
  const m = await first(db, 'SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND user_id = ? AND active = 1', tenantId, userId);
  if (!m) throw badRequest('That user is not an active member of your team');
}

export const leadPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().max(60).nullable().optional(),
  requirements: requirementsSchema.optional(),
  preferredTimeText: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  closedReason: z.string().trim().max(300).nullable().optional(),
}).strict();

export async function updateLead(db: DB, tenantId: string, leadId: string, actor: Actor, patch: z.infer<typeof leadPatchSchema>, opts: { system?: boolean } = {}) {
  const lead = await getLead(db, tenantId, leadId) as Record<string, any>;
  const sets: string[] = []; const args: unknown[] = []; const changed: Record<string, unknown> = {};

  if (patch.status && patch.status !== lead.status) {
    if (!canTransition(lead.status, patch.status, !!opts.system)) throw conflict(`A lead cannot move from "${lead.status}" to "${patch.status}"`, 'invalid_transition');
    sets.push('status = ?'); args.push(patch.status); changed.status = { from: lead.status, to: patch.status };
    if (patch.status === 'contacted' && !lead.first_human_contact_at && actor.type === 'user') { sets.push('first_human_contact_at = ?', 'last_contacted_at = ?'); args.push(nowIso(), nowIso()); }
    if (patch.status === 'closed' && !patch.closedReason && !lead.closed_reason) throw unprocessable('Please record a reason for closing this lead');
  }
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo) await assertTenantMember(db, tenantId, patch.assignedTo);
    sets.push('assigned_to = ?'); args.push(patch.assignedTo); changed.assignedTo = patch.assignedTo;
  }
  if (patch.requirements) {
    const merged = { ...lead.requirements, ...patch.requirements };
    sets.push('requirements_json = ?'); args.push(JSON.stringify(merged)); changed.requirements = Object.keys(patch.requirements);
  }
  for (const [k, col] of [['preferredTimeText', 'preferred_time_text'], ['summary', 'summary'], ['closedReason', 'closed_reason']] as const) {
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); args.push(patch[k]); changed[k] = true; }
  }
  if (sets.length) {
    sets.push('updated_at = ?'); args.push(nowIso());
    await run(db, `UPDATE leads SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, ...args, leadId, tenantId);
  }
  if (patch.name !== undefined || patch.phone !== undefined || patch.email !== undefined) {
    const phone = patch.phone === undefined ? undefined : normalisePhone(patch.phone);
    if (patch.phone && !phone) throw unprocessable('That phone number does not look valid');
    const cs: string[] = []; const ca: unknown[] = [];
    if (patch.name !== undefined) { cs.push('name = ?'); ca.push(patch.name); }
    if (phone !== undefined) { cs.push('phone = ?'); ca.push(phone); }
    if (patch.email !== undefined) { cs.push('email = ?'); ca.push(patch.email?.toLowerCase() ?? null); }
    try { await run(db, `UPDATE contacts SET ${cs.join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`, ...ca, nowIso(), lead.contact_id, tenantId); }
    catch (e) { if (isUniqueViolation(e)) throw conflict('Another contact already uses that phone number or email'); throw e; }
    changed.contact = true;
  }
  if (Object.keys(changed).length) await audit(db, tenantId, actor, 'lead.updated', 'lead', leadId, changed);
  return getLead(db, tenantId, leadId);
}

export async function markFirstResponse(db: DB, tenantId: string, leadId: string, human: boolean) {
  const t = nowIso();
  await run(db, 'UPDATE leads SET first_response_at = COALESCE(first_response_at, ?), last_contacted_at = CASE WHEN ? THEN ? ELSE last_contacted_at END, first_human_contact_at = CASE WHEN ? THEN COALESCE(first_human_contact_at, ?) ELSE first_human_contact_at END, updated_at = ? WHERE id = ? AND tenant_id = ?',
    t, human ? 1 : 0, t, human ? 1 : 0, t, t, leadId, tenantId);
}

export async function addNote(db: DB, tenantId: string, leadId: string, authorId: string, text: string) {
  await getLead(db, tenantId, leadId);
  const id = newId('not');
  await run(db, 'INSERT INTO lead_notes (id, tenant_id, lead_id, author_id, body, created_at) VALUES (?,?,?,?,?,?)', id, tenantId, leadId, authorId, text, nowIso());
  await audit(db, tenantId, { type: 'user', id: authorId }, 'lead.note_added', 'lead', leadId);
  return id;
}

export async function leadDetail(db: DB, tenantId: string, leadId: string) {
  const lead = await getLead(db, tenantId, leadId);
  const [notes, tasks, bookings, conversations, consent, history] = await Promise.all([
    all(db, `SELECT n.id, n.body, n.created_at, u.name AS author FROM lead_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.tenant_id = ? AND n.lead_id = ? ORDER BY n.created_at DESC`, tenantId, leadId),
    all(db, `SELECT t.id, t.title, t.due_at, t.priority, t.status, t.owner_id, u.name AS owner_name FROM follow_up_tasks t LEFT JOIN users u ON u.id = t.owner_id WHERE t.tenant_id = ? AND t.lead_id = ? ORDER BY t.status = 'open' DESC, t.due_at`, tenantId, leadId),
    all(db, `SELECT b.id, b.start_utc, b.end_utc, b.status, b.consultant_id, u.name AS consultant_name, b.notification_status FROM bookings b JOIN users u ON u.id = b.consultant_id WHERE b.tenant_id = ? AND b.lead_id = ? ORDER BY b.start_utc DESC`, tenantId, leadId),
    all(db, `SELECT id, channel, status, last_message_at, assigned_to FROM conversations WHERE tenant_id = ? AND lead_id = ? ORDER BY last_message_at DESC`, tenantId, leadId),
    all(db, `SELECT purpose, granted, channel, evidence, created_at FROM consent_records WHERE tenant_id = ? AND contact_id = ? ORDER BY created_at DESC LIMIT 20`, tenantId, (lead as any).contact_id),
    all(db, `SELECT a.action, a.actor_type, a.detail_json, a.created_at, u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id AND a.actor_type = 'user' WHERE a.tenant_id = ? AND a.entity_type = 'lead' AND a.entity_id = ? ORDER BY a.created_at DESC LIMIT 50`, tenantId, leadId),
  ]);
  return { lead, notes, tasks, bookings, conversations, consent, history };
}
