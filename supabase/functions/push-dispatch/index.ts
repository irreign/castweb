// push-dispatch: fans out APNs pushes from DB webhook events (brief §15).
// Webhook-only (see supabase/config.toml for the wiring); not called by
// the client. Handles two shapes of trigger:
//   1. A row-change webhook: { type: 'INSERT'|'UPDATE', table, record, old_record }
//      for messages / calendar_events / ai_extractions.
//   2. A scheduled reminder sweep: { type: 'CRON_UPCOMING_EVENTS' }, meant
//      to be invoked hourly by a Postgres pg_cron job or an external
//      scheduler (Cloudflare Workers Cron is a reasonable choice here per
//      docs/04 §4.1) hitting this endpoint with the shared webhook secret.
//      Simplification, documented: it checks a fixed UTC lookahead window
//      rather than per-family local "tomorrow", since family timezones
//      differ — see docs/10-failure-modes.md.
import { verifyWebhookSecret } from '../_shared/webhook.ts';
import { adminClient } from '../_shared/supabaseClients.ts';
import { jsonResponse } from '../_shared/response.ts';
import { sendApnsPush } from '../_shared/apns.ts';

type NotificationCategory = 'new_message' | 'event_added' | 'event_upcoming' | 'event_changed' | 'clarification_needed';

interface Notification {
  familyId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  excludeUserId: string | null;
  data: Record<string, unknown>;
}

interface RowWebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatEventDate(e: { start_date: unknown; start_time: unknown; all_day: unknown }): string {
  const date = e.start_date as string;
  const time = e.start_time as string | null;
  return e.all_day || !time ? date : `${date} ${time}`;
}

// deno-lint-ignore no-explicit-any
async function buildRowNotification(db: any, payload: RowWebhookPayload): Promise<Notification | null> {
  const { table, type, record: r, old_record: old } = payload;

  if (table === 'messages' && type === 'INSERT') {
    if (r.kind !== 'user') return null;
    const { data: sender } = await db.from('users').select('display_name').eq('id', r.sender_id).maybeSingle();
    return {
      familyId: r.family_id as string,
      category: 'new_message',
      title: (sender?.display_name as string) ?? 'New message',
      body: truncate((r.body as string) ?? '', 120),
      excludeUserId: r.sender_id as string | null,
      data: { type: 'message', conversation_id: r.conversation_id, message_id: r.id },
    };
  }

  if (table === 'calendar_events' && type === 'INSERT') {
    return {
      familyId: r.family_id as string,
      category: 'event_added',
      title: '📅 Added to Family Calendar',
      body: `${r.title} — ${formatEventDate(r as never)}`,
      excludeUserId: (r.created_by as string) ?? null,
      data: { type: 'event_added', event_id: r.id },
    };
  }

  if (table === 'calendar_events' && type === 'UPDATE') {
    if (!old) return null;
    const changed = old.title !== r.title || old.start_date !== r.start_date
      || old.start_time !== r.start_time || old.location !== r.location;
    if (!changed) return null;
    return {
      familyId: r.family_id as string,
      category: 'event_changed',
      title: '🔄 Family Calendar updated',
      body: `${r.title} — ${formatEventDate(r as never)}`,
      excludeUserId: (r.last_modified_by as string) ?? null,
      data: { type: 'event_changed', event_id: r.id },
    };
  }

  if (table === 'ai_extractions' && type === 'INSERT') {
    if (r.needs_clarification !== true) return null;
    return {
      familyId: r.family_id as string,
      category: 'clarification_needed',
      title: '🤖 Quick question',
      body: (r.clarification_question as string) ?? 'Can you confirm a date for something you mentioned?',
      excludeUserId: null,
      data: { type: 'clarification', extraction_id: r.id },
    };
  }

  return null;
}

// deno-lint-ignore no-explicit-any
async function dispatch(db: any, notification: Notification): Promise<{ recipients: number; sent: number }> {
  const { data: members } = await db
    .from('family_members')
    .select('user_id')
    .eq('family_id', notification.familyId)
    .eq('status', 'active');

  const candidateIds = (members ?? [])
    .map((m: { user_id: string }) => m.user_id)
    .filter((id: string) => id !== notification.excludeUserId);
  if (candidateIds.length === 0) return { recipients: 0, sent: 0 };

  const { data: prefs } = await db
    .from('notification_preferences')
    .select(`user_id, ${notification.category}`)
    .eq('family_id', notification.familyId)
    .in('user_id', candidateIds);

  const prefsById = new Map((prefs ?? []).map((p: Record<string, unknown>) => [p.user_id as string, p]));
  // A member with no preferences row yet defaults to opted-in (the row is
  // normally provisioned on join/create — 0001_init.sql — but this fails
  // open rather than silently dropping their notifications).
  const recipientIds = candidateIds.filter((id: string) => {
    const pref = prefsById.get(id) as Record<string, unknown> | undefined;
    return !pref || pref[notification.category] !== false;
  });
  if (recipientIds.length === 0) return { recipients: 0, sent: 0 };

  const { data: tokens } = await db
    .from('device_push_tokens')
    .select('id, token')
    .in('user_id', recipientIds);

  let sent = 0;
  const staleTokenIds: string[] = [];
  for (const t of tokens ?? []) {
    const result = await sendApnsPush(t.token, {
      title: notification.title,
      body: notification.body,
      threadId: notification.familyId,
      data: notification.data,
    });
    if (result.ok) {
      sent++;
    } else {
      console.error('push-dispatch: send failed', t.id, result.reason);
      if (result.shouldRemoveToken) staleTokenIds.push(t.id);
    }
  }
  if (staleTokenIds.length > 0) {
    await db.from('device_push_tokens').delete().in('id', staleTokenIds);
  }
  return { recipients: recipientIds.length, sent };
}

// deno-lint-ignore no-explicit-any
async function dispatchUpcomingEventReminders(db: any): Promise<{ events: number; sent: number }> {
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
  const toISODate = (d: Date) => d.toISOString().slice(0, 10);

  const { data: events } = await db
    .from('calendar_events')
    .select('id, family_id, title, start_date, start_time, all_day')
    .eq('status', 'confirmed')
    .gte('start_date', toISODate(windowStart))
    .lte('start_date', toISODate(windowEnd));

  let totalSent = 0;
  for (const event of events ?? []) {
    const { sent } = await dispatch(db, {
      familyId: event.family_id,
      category: 'event_upcoming',
      title: '📅 Coming up',
      body: `${event.title} — ${formatEventDate(event)}`,
      excludeUserId: null,
      data: { type: 'event_upcoming', event_id: event.id },
    });
    totalSent += sent;
  }
  return { events: (events ?? []).length, sent: totalSent };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'POST only' } }, 405);
  if (!verifyWebhookSecret(req)) return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'invalid webhook secret' } }, 401);

  const payload = await req.json().catch(() => null) as { type?: string } & Partial<RowWebhookPayload> | null;
  if (!payload) return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'invalid JSON body' } }, 400);

  const db = adminClient();

  if (payload.type === 'CRON_UPCOMING_EVENTS') {
    const result = await dispatchUpcomingEventReminders(db);
    return jsonResponse({ ok: true, ...result }, 200);
  }

  if (!payload.table || !payload.record || (payload.type !== 'INSERT' && payload.type !== 'UPDATE')) {
    return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'unrecognized payload shape' } }, 400);
  }

  const notification = await buildRowNotification(db, payload as RowWebhookPayload);
  if (!notification) return jsonResponse({ ok: true, skipped: true }, 200);

  const result = await dispatch(db, notification);
  return jsonResponse({ ok: true, ...result }, 200);
});
