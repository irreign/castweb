// ai-extract: the per-message AI event-detection pipeline (brief §6-§9,
// §22-§23). Invoked by a Supabase DB Webhook on `messages` INSERT — see
// docs/04-technical-architecture.md §4.2 for why this is webhook-driven
// rather than called directly by the client, and
// docs/06-ai-extraction-architecture.md for the full pipeline design this
// function implements step by step.
import { verifyWebhookSecret } from '../_shared/webhook.ts';
import { adminClient } from '../_shared/supabaseClients.ts';
import { jsonResponse } from '../_shared/response.ts';
import { familyLocalToday } from '../_shared/dates.ts';
import {
  clampAutoAddThreshold,
  decideOutcome,
  isPlausibleEventMessage,
  isWithinOpenEventContext,
  matchAgainstExistingEvents,
  validateExtraction,
  type ExistingEventForMatching,
  type ValidatedExtraction,
} from '../_shared/extraction.ts';
import { claudeProvider } from '../_shared/ai/claude.ts';
import type { ContextEvent, ContextMessage } from '../_shared/ai/provider.ts';

const RECENT_MESSAGE_WINDOW = 15;
const UPCOMING_EVENT_WINDOW = 10;
const OPEN_CONTEXT_WINDOW_MINUTES = 30;

interface MessageRow {
  id: string;
  conversation_id: string;
  family_id: string;
  sender_id: string | null;
  kind: string;
  body: string | null;
  created_at: string;
  deleted_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'POST only' } }, 405);
  if (!verifyWebhookSecret(req)) return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'invalid webhook secret' } }, 401);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'invalid JSON body' } }, 400);
  }

  const messageId = extractMessageId(payload);
  if (!messageId) {
    return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'no message id in payload' } }, 400);
  }

  const db = adminClient();

  const { data: message, error: messageError } = await db
    .from('messages')
    .select('id, conversation_id, family_id, sender_id, kind, body, created_at, deleted_at')
    .eq('id', messageId)
    .maybeSingle<MessageRow>();

  if (messageError || !message) {
    console.error('ai-extract: message not found', messageId, messageError);
    return jsonResponse({ ok: true, skipped: 'message_not_found' }, 202);
  }

  if (message.kind !== 'user' || message.deleted_at || !message.body?.trim()) {
    return jsonResponse({ ok: true, skipped: 'not_a_user_message' }, 202);
  }

  // Idempotency: a re-fired webhook (at-least-once delivery) must not
  // double-evaluate a message (docs/06 §6.7, docs/10).
  const { data: existingExtraction } = await db
    .from('ai_extractions')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();
  if (existingExtraction) {
    return jsonResponse({ ok: true, extraction_id: existingExtraction.id, skipped: 'already_evaluated' }, 200);
  }

  // Heuristic pre-filter (docs/06 §6.2): skip the API call entirely for
  // obviously non-event chatter, unless this message is a same-burst
  // follow-up to a recently-created/pending event (§6.2.1).
  const { data: lastEventMessage } = await db
    .from('ai_extractions')
    .select('created_at')
    .eq('family_id', message.family_id)
    .in('status', ['pending', 'auto_added'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const withinOpenContext = isWithinOpenEventContext(
    lastEventMessage?.created_at ?? null,
    message.created_at,
    OPEN_CONTEXT_WINDOW_MINUTES,
  );

  if (!isPlausibleEventMessage(message.body) && !withinOpenContext) {
    return jsonResponse({ ok: true, skipped: 'heuristic_filter' }, 202);
  }

  const [{ data: family }, { data: sender }, { data: recentRows }, { data: upcomingRows }] = await Promise.all([
    db.from('families').select('id, timezone, settings').eq('id', message.family_id).maybeSingle(),
    db.from('users').select('id, display_name').eq('id', message.sender_id ?? '').maybeSingle(),
    db
      .from('messages')
      .select('body, sender_id, created_at, kind, users:sender_id (display_name)')
      .eq('conversation_id', message.conversation_id)
      .neq('id', messageId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_MESSAGE_WINDOW),
    db
      .from('calendar_events')
      .select('id, title, category, start_date, start_time')
      .eq('family_id', message.family_id)
      .eq('status', 'confirmed')
      .order('start_date', { ascending: true })
      .limit(UPCOMING_EVENT_WINDOW),
  ]);

  if (!family) {
    console.error('ai-extract: family not found', message.family_id);
    return jsonResponse({ ok: true, skipped: 'family_not_found' }, 202);
  }

  const familyTimezone: string = family.timezone ?? 'UTC';
  const nowISODate = familyLocalToday(message.created_at, familyTimezone);
  const senderDisplayName = sender?.display_name ?? 'A family member';

  // System cards (e.g. "✓ Added to Family Calendar") are kept in context —
  // they carry useful signal for follow-up messages referencing an event
  // just confirmed.
  const recentMessages: ContextMessage[] = (recentRows ?? [])
    .reverse() // oldest first
    .map((r: { body: string | null; created_at: string; users: { display_name: string } | null }) => ({
      senderDisplayName: r.users?.display_name ?? 'Hearth',
      text: r.body ?? '',
      createdAt: r.created_at,
    }));

  const upcomingEvents: ContextEvent[] = (upcomingRows ?? []).map((e: { id: string; title: string; category: string; start_date: string; start_time: string | null }) => ({
    id: e.id, title: e.title, category: e.category, startDate: e.start_date, startTime: e.start_time,
  }));

  const settings = (family.settings ?? {}) as { auto_add_enabled?: boolean; auto_add_threshold?: number };
  const aiSettings = {
    autoAddEnabled: settings.auto_add_enabled === true,
    autoAddThreshold: clampAutoAddThreshold(Number(settings.auto_add_threshold)),
  };

  let validated: ValidatedExtraction | null = null;
  let modelUsed = 'unknown';
  let apiError: string | null = null;
  let rawResult: unknown = null;

  try {
    const result = await claudeProvider.extract({
      triggeringMessage: { senderDisplayName, text: message.body, createdAt: message.created_at },
      recentMessages,
      upcomingEvents,
      familyTimezone,
      nowISODate,
    });
    modelUsed = result.model;
    rawResult = result.raw;
    validated = validateExtraction(result.raw, { nowISODate });
    if (validated === null) apiError = 'model returned a malformed/non-object result';
  } catch (err) {
    apiError = err instanceof Error ? err.message : String(err);
    console.error('ai-extract: provider call failed', messageId, apiError);
  }

  const matchCandidates: ExistingEventForMatching[] = upcomingEvents.map((e) => ({
    id: e.id, title: e.title, category: e.category, start_date: e.startDate,
  }));
  const match = validated ? matchAgainstExistingEvents(validated, matchCandidates) : { kind: 'none' as const };
  const outcome = decideOutcome(validated, match, aiSettings);

  // Every branch writes exactly one ai_extractions row (docs/06 §6.1) —
  // this is the provenance/audit trail required by brief §10.
  const baseInsert = {
    message_id: messageId,
    family_id: message.family_id,
    raw_result: rawResult,
    validated_result: validated ? toJsonRecord(validated) : null,
    confidence: validated?.confidence ?? null,
    needs_clarification: validated?.needsClarification ?? false,
    clarification_question: validated?.clarificationQuestion ?? null,
    provider: 'claude',
    model: modelUsed,
    error: apiError,
  };

  switch (outcome.kind) {
    case 'failed': {
      await db.from('ai_extractions').insert({ ...baseInsert, status: 'failed' });
      return jsonResponse({ ok: true, outcome: 'failed' }, 200);
    }
    case 'silent': {
      await db.from('ai_extractions').insert({ ...baseInsert, status: 'silent' });
      return jsonResponse({ ok: true, outcome: 'silent' }, 200);
    }
    case 'duplicate': {
      await db.from('ai_extractions').insert({
        ...baseInsert, status: 'duplicate', duplicate_of_event_id: outcome.duplicateOfEventId,
      });
      return jsonResponse({ ok: true, outcome: 'duplicate' }, 200);
    }
    case 'auto_add': {
      if (!validated) throw new Error('unreachable: auto_add without a validated extraction');
      const { data: extractionRow } = await db
        .from('ai_extractions')
        .insert({ ...baseInsert, status: 'auto_added' })
        .select('id')
        .single();

      const { data: event } = await db
        .from('calendar_events')
        .insert({
          family_id: message.family_id,
          title: validated.title,
          start_date: validated.date,
          end_date: validated.endDate,
          start_time: validated.startTime,
          end_time: validated.endTime,
          all_day: validated.allDay,
          location: validated.location,
          category: validated.category,
          recurrence_rule: validated.recurrence,
          created_by: message.sender_id,
          last_modified_by: message.sender_id,
          source_message_id: messageId,
          ai_generated: true,
          ai_confidence: validated.confidence,
        })
        .select('id, title, start_date, start_time')
        .single();

      const cardMessage = await postSystemMessage(db, message, {
        card_type: 'event_confirmed',
        card_state: 'resolved', // never goes through resolve_ai_extraction — it's final from creation
        extraction_id: extractionRow?.id,
        event_id: event?.id,
        title: event?.title,
        start_date: event?.start_date,
        start_time: event?.start_time,
      });

      if (extractionRow?.id) {
        await db.from('ai_extractions').update({
          resulting_event_id: event?.id, resolved_at: new Date().toISOString(), card_message_id: cardMessage?.id,
        }).eq('id', extractionRow.id);
      }
      return jsonResponse({ ok: true, outcome: 'auto_add', event_id: event?.id }, 200);
    }
    case 'clarification': {
      const { data: extractionRow } = await db
        .from('ai_extractions')
        .insert({ ...baseInsert, status: 'pending', needs_clarification: true, clarification_question: outcome.question })
        .select('id')
        .single();

      const cardMessage = await postSystemMessage(db, message, {
        card_type: 'event_clarification', extraction_id: extractionRow?.id, question: outcome.question,
      });
      if (extractionRow?.id && cardMessage?.id) {
        await db.from('ai_extractions').update({ card_message_id: cardMessage.id }).eq('id', extractionRow.id);
      }
      return jsonResponse({ ok: true, outcome: 'clarification' }, 200);
    }
    case 'update': {
      const { data: extractionRow } = await db
        .from('ai_extractions')
        .insert({ ...baseInsert, status: 'pending', duplicate_of_event_id: outcome.existingEventId })
        .select('id')
        .single();

      const existing = upcomingEvents.find((e) => e.id === outcome.existingEventId);
      const cardMessage = await postSystemMessage(db, message, {
        card_type: 'event_update_suggestion',
        extraction_id: extractionRow?.id,
        event_id: outcome.existingEventId,
        existing_title: existing?.title,
        existing_date: existing?.startDate,
        new_title: validated?.title,
        new_date: validated?.date,
        new_start_time: validated?.startTime,
      });
      if (extractionRow?.id && cardMessage?.id) {
        await db.from('ai_extractions').update({ card_message_id: cardMessage.id }).eq('id', extractionRow.id);
      }
      return jsonResponse({ ok: true, outcome: 'update' }, 200);
    }
    case 'suggestion':
    default: {
      const { data: extractionRow } = await db
        .from('ai_extractions')
        .insert({ ...baseInsert, status: 'pending' })
        .select('id')
        .single();

      const cardMessage = await postSystemMessage(db, message, {
        card_type: 'event_suggestion',
        extraction_id: extractionRow?.id,
        title: validated?.title,
        date: validated?.date,
        end_date: validated?.endDate,
        start_time: validated?.startTime,
        all_day: validated?.allDay,
        category: validated?.category,
      });
      if (extractionRow?.id && cardMessage?.id) {
        await db.from('ai_extractions').update({ card_message_id: cardMessage.id }).eq('id', extractionRow.id);
      }
      return jsonResponse({ ok: true, outcome: 'suggestion' }, 200);
    }
  }
});

function extractMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.message_id === 'string') return p.message_id;
  const record = p.record;
  if (record && typeof record === 'object' && typeof (record as Record<string, unknown>).id === 'string') {
    return (record as Record<string, unknown>).id as string;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function toJsonRecord(v: ValidatedExtraction): any {
  return {
    is_event: v.isEvent, confidence: v.confidence, title: v.title, date: v.date, end_date: v.endDate,
    start_time: v.startTime, end_time: v.endTime, all_day: v.allDay, location: v.location,
    category: v.category, recurrence: v.recurrence, participants: v.participants,
    needs_clarification: v.needsClarification, clarification_question: v.clarificationQuestion,
    is_correction: v.isCorrection,
  };
}

// deno-lint-ignore no-explicit-any
async function postSystemMessage(db: any, sourceMessage: MessageRow, metadata: Record<string, unknown>) {
  const { data, error } = await db
    .from('messages')
    .insert({
      conversation_id: sourceMessage.conversation_id,
      family_id: sourceMessage.family_id,
      sender_id: null,
      kind: 'system',
      body: null,
      reply_to_message_id: sourceMessage.id,
      metadata,
    })
    .select('id')
    .single();
  if (error) {
    console.error('ai-extract: failed to post system card message', error);
    return null;
  }
  return data as { id: string };
}
