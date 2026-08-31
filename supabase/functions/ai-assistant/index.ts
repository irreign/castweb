// ai-assistant: grounded natural-language Q&A over the family's real
// messages/events (brief §13). Called directly by the client when a chat
// message is recognized as a question addressed to the assistant.
//
// Reads use the CALLER's own JWT (userClient), so Postgres RLS is the
// authorization boundary here, not application code — a user can only ever
// retrieve data from families they actually belong to. Only the final
// answer write uses the service role, because 'assistant'-kind messages
// aren't insertable directly by a user (docs/07 §7.3, messages_insert policy).
import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, withErrorHandling, HttpError } from '../_shared/response.ts';
import { adminClient, userClient } from '../_shared/supabaseClients.ts';
import { addDays, familyLocalToday, resolveRelativePhrase, startOfWeek } from '../_shared/dates.ts';
import { claudeProvider } from '../_shared/ai/claude.ts';
import type { ContextEvent, ContextMessage } from '../_shared/ai/provider.ts';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Best-effort date-range extraction from a free-text question, so the
 * assistant retrieves a bounded, relevant slice of the calendar instead of
 * everything. Not exhaustive — anything unrecognized falls back to "all
 * upcoming events", which the prompt is still grounded against. */
function parseQuestionDateRange(question: string, nowISODate: string): { start: string; end: string } | null {
  const q = question.toLowerCase();

  for (let i = 0; i < MONTHS.length; i++) {
    if (q.includes(MONTHS[i])) {
      const monthNum = i + 1;
      const [nowYear, nowMonth] = nowISODate.split('-').map(Number);
      const year = monthNum < nowMonth ? nowYear + 1 : nowYear;
      const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
      return { start: `${year}-${pad2(monthNum)}-01`, end: `${year}-${pad2(monthNum)}-${pad2(lastDay)}` };
    }
  }

  if (q.includes('this week')) {
    const start = startOfWeek(nowISODate);
    return { start, end: addDays(start, 6) };
  }
  if (q.includes('next week')) {
    const start = addDays(startOfWeek(nowISODate), 7);
    return { start, end: addDays(start, 6) };
  }

  for (const phrase of ['next weekend', 'this weekend', 'today', 'tomorrow']) {
    if (q.includes(phrase)) {
      const resolved = resolveRelativePhrase(phrase, nowISODate);
      if (resolved) return { start: resolved.date, end: resolved.endDate ?? resolved.date };
    }
  }

  return null;
}

interface AskBody {
  conversation_id?: unknown;
  question?: unknown;
}

Deno.serve((req) => withErrorHandling(async () => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') throw new HttpError('VALIDATION_FAILED', 'POST only');

  const body = (await req.json().catch(() => null)) as AskBody | null;
  const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : null;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!conversationId || !question) {
    throw new HttpError('VALIDATION_FAILED', 'conversation_id and question are required');
  }
  if (question.length > 500) {
    throw new HttpError('VALIDATION_FAILED', 'question is too long');
  }

  const asUser = userClient(req);

  // RLS does the real authorization here: this select only returns a row
  // if the caller is an active member of the conversation's family.
  const { data: conversation, error: convError } = await asUser
    .from('conversations')
    .select('id, family_id, families ( id, timezone )')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new HttpError('FORBIDDEN', 'not a member of this conversation\'s family, or it does not exist');
  }

  const familyTimezone: string = (conversation.families as { timezone?: string } | null)?.timezone ?? 'UTC';
  const nowISODate = familyLocalToday(new Date().toISOString(), familyTimezone);
  const range = parseQuestionDateRange(question, nowISODate);

  let eventQuery = asUser
    .from('calendar_events')
    .select('id, title, category, start_date, start_time')
    .eq('family_id', conversation.family_id)
    .eq('status', 'confirmed')
    .order('start_date', { ascending: true })
    .limit(25);

  eventQuery = range
    ? eventQuery.gte('start_date', range.start).lte('start_date', range.end)
    : eventQuery.gte('start_date', nowISODate);

  const { data: eventRows } = await eventQuery;

  // A light keyword match over recent messages as a fallback for
  // questions the calendar alone can't answer (e.g. "what did we decide
  // about the birthday dinner?"). Deliberately simple — this is grounding
  // context, not a search product.
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['what', 'when', 'where', 'which', 'about', 'happening', 'this', 'that', 'have', 'does'].includes(w));

  let messageRows: { body: string | null; created_at: string; users: { display_name: string } | null }[] = [];
  if (keywords.length > 0) {
    const orFilter = keywords.slice(0, 5).map((k) => `body.ilike.%${k}%`).join(',');
    const { data } = await asUser
      .from('messages')
      .select('body, created_at, users:sender_id ( display_name )')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .eq('kind', 'user')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(10);
    messageRows = (data as typeof messageRows | null) ?? [];
  }

  const relevantEvents: ContextEvent[] = (eventRows ?? []).map((e) => ({
    id: e.id, title: e.title, category: e.category, startDate: e.start_date, startTime: e.start_time,
  }));
  const relevantMessages: ContextMessage[] = messageRows
    .reverse()
    .map((m) => ({ senderDisplayName: m.users?.display_name ?? 'A family member', text: m.body ?? '', createdAt: m.created_at }));

  let answerText: string;
  let modelUsed = 'unknown';
  try {
    const result = await claudeProvider.answer({
      question, familyTimezone, nowISODate, relevantEvents, relevantMessages,
    });
    answerText = result.text;
    modelUsed = result.model;
  } catch (err) {
    console.error('ai-assistant: provider call failed', err);
    return errorResponse('UPSTREAM_FAILURE', 'The assistant is unavailable right now — please try again shortly.');
  }

  // 'assistant'-kind messages bypass the messages_insert RLS policy
  // (which only allows kind='user' from clients), so this write uses the
  // service role deliberately — the read path above stayed fully
  // user-scoped.
  const db = adminClient();
  const { data: inserted, error: insertError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      family_id: conversation.family_id,
      sender_id: null,
      kind: 'assistant',
      body: answerText,
      metadata: { model: modelUsed },
    })
    .select('id, conversation_id, body, created_at')
    .single();

  if (insertError || !inserted) {
    console.error('ai-assistant: failed to persist answer', insertError);
    throw new HttpError('INTERNAL', 'failed to save the assistant\'s answer');
  }

  return jsonResponse({ message: inserted }, 200);
}));
