import { newId, nowIso, run, dayOf, type DB } from '../db';

export type Actor = { type: 'user' | 'ai' | 'system' | 'customer' | 'webhook'; id?: string | null };

export async function audit(db: DB, tenantId: string, actor: Actor, action: string, entityType: string, entityId: string | null, detail?: Record<string, unknown>) {
  await run(db, 'INSERT INTO audit_events (id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, detail_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    newId('aud'), tenantId, actor.type, actor.id ?? null, action, entityType, entityId, detail ? JSON.stringify(detail) : null, nowIso());
}

export async function recordUsage(db: DB, tenantId: string, kind: string, quantity = 1, channel?: string) {
  await run(db, 'INSERT INTO usage_records (id, tenant_id, kind, quantity, channel, day, created_at) VALUES (?,?,?,?,?,?,?)',
    newId('use'), tenantId, kind, quantity, channel ?? null, dayOf(), nowIso());
}

export async function monthlyUsage(db: DB, tenantId: string, kind: string): Promise<number> {
  const start = new Date().toISOString().slice(0, 7) + '-01';
  const r = await db.prepare('SELECT COALESCE(SUM(quantity),0) AS n FROM usage_records WHERE tenant_id = ? AND kind = ? AND day >= ?').bind(tenantId, kind, start).first<{ n: number }>();
  return r?.n ?? 0;
}
