import { all, first, type DB } from '../db';
import { getTenantSettings } from '../settings';
import { monthlyUsage } from './audit';

/**
 * Metric definitions (shown verbatim in the Reports screen):
 * - Enquiry: a conversation that received at least one customer message.
 * - Unique lead: a lead record (one per person with an open enquiry); repeat chats from the same open lead do not add leads.
 * - Awaiting first contact: leads still `new` with no human contact recorded (right now, not date-ranged).
 * - Qualified: leads created in the period whose status is now qualified, consultation booked or converted.
 * - Consultation booked: a booking that is, or ended up, confirmed/completed/no-show (cancelled ones excluded).
 * - Completed consultation: a booking staff marked completed.
 * - Converted customer: a lead staff marked converted. This is a pipeline status, NOT revenue.
 * - Lead-to-consultation rate: leads created in the period with at least one non-cancelled booking ÷ leads created in the period.
 * - Response time: lead created → first reply (AI or human); human response time: lead created → first human contact. Median shown.
 */
export const METRIC_DEFINITIONS: Record<string, string> = {
  enquiries: 'Conversations that received at least one customer message in the period.',
  newLeads: 'Unique lead records created in the period.',
  awaitingFirstContact: 'Leads with status New and no human contact recorded (current).',
  qualified: 'Leads created in the period now at Qualified, Consultation booked or Converted.',
  confirmedUpcoming: 'Consultations currently confirmed and still in the future.',
  consultationsBooked: 'Bookings created in the period that were not cancelled.',
  consultationsCompleted: 'Consultations staff marked as completed in the period.',
  converted: 'Leads staff marked as converted in the period. This is a pipeline status, not revenue.',
  overdueFollowUps: 'Open follow-up tasks past their due time (current).',
  leadToConsultationRate: 'Leads created in the period with at least one non-cancelled booking ÷ leads created in the period.',
  medianFirstResponseMin: 'Median minutes from lead creation to the first reply (AI or human).',
  medianHumanResponseMin: 'Median minutes from lead creation to the first human contact.',
  handoffRate: 'Handoffs to a human ÷ conversations in the period.',
  aiFailureRate: 'AI provider errors and invalid model outputs ÷ AI attempts in the period.',
};

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10; };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export async function overview(db: DB, tenantId: string, days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const now = new Date().toISOString();
  const n = async (sql: string, ...a: unknown[]) => (await first<{ n: number }>(db, sql, ...a))?.n ?? 0;

  const [enquiries, newLeads, awaiting, qualified, upcoming, booked, completed, converted, overdue, leadsWithBooking] = await Promise.all([
    n(`SELECT COUNT(DISTINCT c.id) AS n FROM conversations c JOIN messages m ON m.conversation_id = c.id AND m.sender_type = 'customer' WHERE c.tenant_id = ? AND c.channel <> 'staff' AND c.created_at >= ?`, tenantId, since),
    n(`SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND source <> 'preview' AND created_at >= ?`, tenantId, since),
    n(`SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND status = 'new' AND source <> 'preview' AND first_human_contact_at IS NULL`, tenantId),
    n(`SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND source <> 'preview' AND created_at >= ? AND status IN ('qualified','consultation_booked','converted')`, tenantId, since),
    n(`SELECT COUNT(*) AS n FROM bookings WHERE tenant_id = ? AND status = 'confirmed' AND start_utc > ?`, tenantId, now),
    n(`SELECT COUNT(*) AS n FROM bookings WHERE tenant_id = ? AND created_at >= ? AND status <> 'cancelled'`, tenantId, since),
    n(`SELECT COUNT(*) AS n FROM bookings WHERE tenant_id = ? AND status = 'completed' AND start_utc >= ?`, tenantId, since),
    n(`SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND status = 'converted' AND updated_at >= ?`, tenantId, since),
    n(`SELECT COUNT(*) AS n FROM follow_up_tasks WHERE tenant_id = ? AND status = 'open' AND due_at < ?`, tenantId, now),
    n(`SELECT COUNT(*) AS n FROM leads l WHERE l.tenant_id = ? AND l.created_at >= ? AND EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id AND b.tenant_id = l.tenant_id AND b.status <> 'cancelled')`, tenantId, since),
  ]);

  const resp = await all<{ created_at: string; first_response_at: string | null; first_human_contact_at: string | null }>(db,
    "SELECT created_at, first_response_at, first_human_contact_at FROM leads WHERE tenant_id = ? AND source <> 'preview' AND created_at >= ? LIMIT 5000", tenantId, since);
  const mins = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60000;
  const firstResp = resp.filter((r) => r.first_response_at).map((r) => mins(r.created_at, r.first_response_at!));
  const humanResp = resp.filter((r) => r.first_human_contact_at).map((r) => mins(r.created_at, r.first_human_contact_at!));

  const byChannel = await all<{ channel: string; conversations: number; messages: number }>(db,
    `SELECT c.channel, COUNT(DISTINCT c.id) AS conversations, COUNT(m.id) AS messages FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id AND m.direction <> 'internal'
      WHERE c.tenant_id = ? AND c.channel <> 'staff' AND c.created_at >= ? GROUP BY c.channel ORDER BY conversations DESC`, tenantId, since);
  const totalConv = byChannel.reduce((a, r) => a + r.conversations, 0);
  const handoffs = await n(`SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ? AND action = 'conversation.handoff' AND created_at >= ?`, tenantId, since);
  const usageSum = async (kind: string) => (await first<{ n: number }>(db, 'SELECT COALESCE(SUM(quantity),0) AS n FROM usage_records WHERE tenant_id = ? AND kind = ? AND created_at >= ?', tenantId, kind, since))?.n ?? 0;
  const [aiCalls, aiFail, aiInvalid] = await Promise.all([usageSum('ai_call'), usageSum('ai_failure'), usageSum('ai_invalid')]);

  const byStatus = await all<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM leads WHERE tenant_id = ? AND source <> 'preview' GROUP BY status", tenantId);
  const daily = await all<{ day: string; leads: number }>(db, `SELECT substr(created_at,1,10) AS day, COUNT(*) AS leads FROM leads WHERE tenant_id = ? AND source <> 'preview' AND created_at >= ? GROUP BY day ORDER BY day`, tenantId, since);

  return {
    periodDays: days, since,
    metrics: {
      enquiries, newLeads, awaitingFirstContact: awaiting, qualified, confirmedUpcoming: upcoming, consultationsBooked: booked, consultationsCompleted: completed, converted,
      overdueFollowUps: overdue,
      leadToConsultationRate: pct(leadsWithBooking, newLeads),
      medianFirstResponseMin: median(firstResp), medianHumanResponseMin: median(humanResp),
      handoffs, handoffRate: pct(handoffs, totalConv),
      aiAttempts: aiCalls + aiFail, aiFailures: aiFail + aiInvalid, aiFailureRate: pct(aiFail + aiInvalid, aiCalls + aiFail),
    },
    byChannel, byStatus, daily, definitions: METRIC_DEFINITIONS,
    revenue: null as null, // intentionally absent: no verified revenue source exists
  };
}

export async function assistantHealth(db: DB, tenantId: string, env: { ANTHROPIC_API_KEY?: string }) {
  const { settings } = await getTenantSettings(db, tenantId);
  const published = (await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM knowledge_sources WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'ready' AND published = 1`, tenantId))?.n ?? 0;
  const failedSources = (await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM knowledge_sources WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'failed'`, tenantId))?.n ?? 0;
  const day = new Date(Date.now() - 864e5).toISOString();
  const rec = async (k: string) => (await first<{ n: number }>(db, 'SELECT COALESCE(SUM(quantity),0) AS n FROM usage_records WHERE tenant_id = ? AND kind = ? AND created_at >= ?', tenantId, k, day))?.n ?? 0;
  const [calls, fails, invalid] = await Promise.all([rec('ai_call'), rec('ai_failure'), rec('ai_invalid')]);
  const used = await monthlyUsage(db, tenantId, 'ai_call');
  const issues: string[] = [];
  if (!settings.ai.enabled) issues.push('The assistant is switched off in AI Assistant settings.');
  if (!published) issues.push('No published knowledge sources — the assistant cannot answer questions yet.');
  if (failedSources) issues.push(`${failedSources} knowledge source(s) failed processing.`);
  if (!env.ANTHROPIC_API_KEY) issues.push('No AI model configured: the assistant quotes approved sources directly instead of composing answers.');
  if (calls + fails > 5 && (fails + invalid) / (calls + fails) > 0.2) issues.push('More than 20% of AI requests failed in the last 24 hours.');
  if (used >= settings.limits.aiCallsPerMonth) issues.push('Monthly AI limit reached — answers are served from approved sources only.');
  return { ok: issues.length === 0, issues, publishedSources: published, aiConfigured: !!env.ANTHROPIC_API_KEY, aiCallsThisMonth: used, aiCallLimit: settings.limits.aiCallsPerMonth, last24h: { calls, failures: fails + invalid } };
}

export async function usageSummary(db: DB, tenantId: string) {
  const start = new Date().toISOString().slice(0, 7) + '-01';
  const rows = await all<{ kind: string; total: number }>(db, 'SELECT kind, SUM(quantity) AS total FROM usage_records WHERE tenant_id = ? AND day >= ? GROUP BY kind', tenantId, start);
  return { monthStart: start, usage: Object.fromEntries(rows.map((r) => [r.kind, r.total])) };
}
