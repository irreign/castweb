import { z } from 'zod';
import { all, first, newId, nowIso, run, type DB } from '../db';
import { notFound } from '../http';
import { audit, type Actor } from './audit';
import { assertTenantMember, getLead } from './leads';

export const taskSchema = z.object({
  leadId: z.string().max(60).nullable().optional(),
  conversationId: z.string().max(60).nullable().optional(),
  ownerId: z.string().max(60).nullable().optional(),
  title: z.string().trim().min(2).max(200),
  dueAt: z.string().datetime({ offset: true }),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export async function createTask(db: DB, tenantId: string, actor: Actor, input: z.infer<typeof taskSchema>, origin = 'manual') {
  if (input.leadId) await getLead(db, tenantId, input.leadId);
  if (input.conversationId) {
    const c = await first(db, 'SELECT 1 AS x FROM conversations WHERE id = ? AND tenant_id = ?', input.conversationId, tenantId);
    if (!c) throw notFound('Conversation not found');
  }
  if (input.ownerId) await assertTenantMember(db, tenantId, input.ownerId);
  const id = newId('tsk');
  await run(db, 'INSERT INTO follow_up_tasks (id, tenant_id, lead_id, conversation_id, owner_id, title, due_at, priority, origin, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, tenantId, input.leadId ?? null, input.conversationId ?? null, input.ownerId ?? null, input.title, new Date(input.dueAt).toISOString(), input.priority, origin, actor.id ?? actor.type, nowIso());
  await audit(db, tenantId, actor, 'task.created', 'task', id, { leadId: input.leadId, origin });
  if (input.leadId) await syncNextAction(db, tenantId, input.leadId);
  return id;
}

/** Lead.next_action mirrors the earliest open task so the leads table never disagrees with the follow-ups screen. */
export async function syncNextAction(db: DB, tenantId: string, leadId: string) {
  const t = await first<{ title: string; due_at: string }>(db, `SELECT title, due_at FROM follow_up_tasks WHERE tenant_id = ? AND lead_id = ? AND status = 'open' ORDER BY due_at LIMIT 1`, tenantId, leadId);
  await run(db, 'UPDATE leads SET next_action = ?, next_action_due = ?, updated_at = ? WHERE id = ? AND tenant_id = ?', t?.title ?? null, t?.due_at ?? null, nowIso(), leadId, tenantId);
}

export async function setTaskStatus(db: DB, tenantId: string, actor: Actor, taskId: string, status: 'open' | 'done' | 'cancelled') {
  const t = await first<{ lead_id: string | null }>(db, 'SELECT lead_id FROM follow_up_tasks WHERE id = ? AND tenant_id = ?', taskId, tenantId);
  if (!t) throw notFound('Task not found');
  await run(db, 'UPDATE follow_up_tasks SET status = ?, completed_at = ? WHERE id = ? AND tenant_id = ?', status, status === 'done' ? nowIso() : null, taskId, tenantId);
  await audit(db, tenantId, actor, `task.${status}`, 'task', taskId);
  if (t.lead_id) await syncNextAction(db, tenantId, t.lead_id);
}

export async function listTasks(db: DB, tenantId: string, opts: { status?: string; ownerId?: string | null; overdueOnly?: boolean }) {
  const where = ['t.tenant_id = ?']; const args: unknown[] = [tenantId];
  if (opts.status) { where.push('t.status = ?'); args.push(opts.status); }
  if (opts.ownerId) { where.push('t.owner_id = ?'); args.push(opts.ownerId); }
  if (opts.overdueOnly) { where.push(`t.status = 'open' AND t.due_at < ?`); args.push(nowIso()); }
  return all(db, `SELECT t.id, t.title, t.due_at, t.priority, t.status, t.origin, t.lead_id, t.conversation_id, t.owner_id, u.name AS owner_name, c.name AS lead_name,
                         (t.status = 'open' AND t.due_at < ?) AS overdue
                    FROM follow_up_tasks t LEFT JOIN users u ON u.id = t.owner_id
                    LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN contacts c ON c.id = l.contact_id
                   WHERE ${where.join(' AND ')} ORDER BY t.status = 'open' DESC, t.due_at LIMIT 300`, nowIso(), ...args);
}
