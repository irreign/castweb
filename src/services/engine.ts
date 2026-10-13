import type { Env } from '../env';
import { all, first, parseJson, run, type DB } from '../db';
import { aiProviderFor, llmTurnSchema, type AiProvider, type LlmTurn } from '../providers/ai';
import { getTenantSettings, type Settings } from '../settings';
import { monthlyUsage, recordUsage, audit } from './audit';
import { addMessage, getConversation, loadState, recordHandoff, saveState, type ConversationRow, type ConvState } from './conversations';
import { getLead, markFirstResponse, requirementsSchema, updateLead, type Requirements } from './leads';
import { retrieve, type Hit } from './retrieval';

// ---------- Deterministic helpers (all unit-tested) ----------

export const UNCERTAIN_REPLY = "I don't have approved information on that, and I don't want to guess. I can pass your question to one of our consultants who can give you an accurate answer.";
export const SAFE_BOOKING_REPLY = 'I can help you choose a time for a consultation — please pick one of the available slots and it will be confirmed on screen once it is saved.';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchesKeyword(text: string, keywords: string[]): string | null {
  for (const k of keywords) if (new RegExp(`(^|[^a-z0-9])${escapeRe(k.toLowerCase())}($|[^a-z0-9])`, 'i').test(text)) return k;
  return null;
}

export const wantsHuman = (t: string) => /\b(talk|speak|chat|connect)\b.{0,25}\b(human|person|someone|consultant|agent|staff|officer|real)\b|\b(human|real person|consultant)\b.{0,15}\b(please|now)\b|\bcall me\b|\bcan someone (call|contact)\b/i.test(t);
export const wantsConsultation = (t: string) => /\b(book|schedule|arrange|make|set up|fix)\b.{0,30}\b(consultation|appointment|meeting|visit|session|slot)\b|\b(consultation|appointment)\b|\bcome (down|over|by) (to|and)\b|\bvisit (your|the) (office|agency)\b/i.test(t);
export const looksLikeQuestion = (t: string) => /\?|^\s*(what|how|can|could|would|will|do|does|did|is|are|when|where|why|which|who|may|should)\b/i.test(t);
export const isGreeting = (t: string) => /^\s*(hi|hello|hey|good (morning|afternoon|evening)|hiya|yo)\b[\s!.,?]*$/i.test(t);

/** Cheap, rules-based extraction of qualification answers. Used when no LLM is configured and as a cross-check otherwise. */
export function extractFields(text: string): Requirements {
  const out: Record<string, unknown> = {};
  const hh = text.match(/\b(?:family|household|people|persons|members)\s+(?:of\s+)?(\d{1,2})\b/i) ?? text.match(/\b(\d{1,2})\s+(?:of us|people|persons|adults|in (?:my|our) (?:family|household))\b/i);
  if (hh) out.householdSize = Number(hh[1]);
  if (/\b(no|without)\s+(kids|children|child)\b/i.test(text)) out.hasChildren = false;
  else if (/\b(kids?|child|children|baby|babies|toddler|infant|newborn|son|daughter)\b/i.test(text)) out.hasChildren = true;
  if (/\b(elderly|grandparents?|grandmother|grandfather|grandma|grandpa|senior|aged parent|old folks)\b/i.test(text)) out.hasElderly = true;
  if (/\b(dogs?|cats?|pets?)\b/i.test(text)) out.hasPets = true;
  if (/\btransfer\b/i.test(text)) out.helperType = 'transfer';
  else if (/\bex[- ]?(singapore|sg)\b/i.test(text)) out.helperType = 'ex_singapore';
  else if (/\b(new|first[- ]time|fresh|from (overseas|abroad|myanmar|philippines|indonesia|india))\b.{0,20}\b(helper|maid|fdw)\b|\b(helper|maid)\b.{0,15}\bfrom (overseas|abroad)\b/i.test(text)) out.helperType = 'new';
  else if (/\bnot sure\b|\bdon'?t know\b/i.test(text)) out.helperType = 'not_sure';
  const timing = text.match(/\b(asap|as soon as possible|urgent(?:ly)?|immediately|next (?:week|month)|in (?:\d+|a couple of|a few) (?:days?|weeks?|months?)|(?:by|in|before|around) (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?: \d{4})?)\b/i);
  if (timing) out.startTiming = timing[1].slice(0, 100);
  const parsed = requirementsSchema.safeParse(out);
  return parsed.success ? parsed.data : {};
}

export function extractName(text: string): string | null {
  const m = text.match(/\b(?:my name is|this is|name'?s)\s+([A-Za-z][A-Za-z' .-]{1,40})/i);
  return m ? m[1].trim().replace(/\s+(and|here|speaking)\b.*$/i, '') : null;
}

/** Numbers (amounts, percentages, durations) in an answer must come from the approved snippets or the customer's own question. */
export function numbersGrounded(answer: string, snippets: string[], question: string, allow: string[] = []): boolean {
  const norm = (s: string) => (s.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((n) => n.replace(/[$,%]/g, '').replace(/\.0+$/, ''));
  const known = new Set([...norm(snippets.join(' ')), ...norm(question), ...allow]);
  return norm(answer).filter((n) => n.length >= 2 || /[$%]/.test(n)).every((n) => known.has(n));
}

const BOOKING_CLAIM = /\b(your|the|a)\s+(consultation|appointment|booking|slot|meeting)\b.{0,40}\b(is|has been|have been|was|is now|are)\b.{0,20}\b(confirmed|booked|scheduled|reserved|set)\b|\bi(?:'ve| have)\s+(booked|scheduled|reserved|confirmed)\b|\bbooking (confirmed|complete)\b|\ball set\b/i;
export const claimsBooking = (a: string) => BOOKING_CLAIM.test(a);

const GUARANTEE = /\b(guarantee[sd]?|definitely (will|can)|100% (sure|certain)|we promise|no problem getting)\b/i;

function extractiveAnswer(hit: Hit): string {
  const a = hit.text.match(/^Q:[^\n]*\nA:\s*([\s\S]*)$/);
  const body = a ? a[1] : hit.text.replace(/^[^\n]+\n(?=[\s\S])/, ''); // non-FAQ chunks start with their source title; drop it
  return body.length > 600 ? body.slice(0, 600).replace(/\s+\S*$/, '') + '…' : body;
}

export interface Citation { sourceId: string; title: string; snippet: string }
export interface EngineUi { action: 'none' | 'request_contact' | 'show_slots' | 'offer_handoff' | 'handoff_done'; reason?: string }
export interface EngineOutcome { reply: string | null; citations: Citation[]; ui: EngineUi; handoff: boolean; mode: 'llm' | 'extractive' | 'rules' | 'human' | 'blocked'; intent: string }

const FIELD_QUESTIONS: Record<string, { key: string; ask: string; has: (r: Requirements) => boolean }> = {
  household: { key: 'household', ask: 'To help the consultant prepare, how many people are in your household, and are there young children or elderly family members?', has: (r) => r.householdSize != null || r.hasChildren != null || r.hasElderly != null },
  helper_type: { key: 'helper_type', ask: 'Are you looking for a new helper, a transfer helper, or are you not sure yet?', has: (r) => r.helperType != null },
  start_timing: { key: 'start_timing', ask: 'When would you ideally like the helper to start?', has: (r) => r.startTiming != null },
  budget_notes: { key: 'budget_notes', ask: 'Do you have any budget considerations the consultant should know about?', has: (r) => r.budgetNotes != null },
};

export function nextQuestion(collect: Settings['ai']['collectFields'], req: Requirements, asked: string[]): { key: string; ask: string } | null {
  for (const f of collect) { const q = FIELD_QUESTIONS[f]; if (q && !q.has(req) && !asked.includes(q.key)) return q; }
  return null;
}

export function qualificationComplete(collect: Settings['ai']['collectFields'], req: Requirements): boolean {
  return collect.every((f) => FIELD_QUESTIONS[f]?.has(req) ?? true);
}

export function composeSummary(name: string | null, req: Requirements): string {
  const bits: string[] = [];
  if (req.householdSize) bits.push(`household of ${req.householdSize}`);
  if (req.hasChildren) bits.push('young children at home');
  if (req.hasElderly) bits.push('elderly family member(s)');
  if (req.hasPets) bits.push('pets');
  if (req.helperType) bits.push({ new: 'looking for a new helper', transfer: 'looking for a transfer helper', ex_singapore: 'looking for an ex-Singapore helper', not_sure: 'unsure of helper type' }[req.helperType]);
  if (req.startTiming) bits.push(`wants to start: ${req.startTiming}`);
  return bits.length ? `${name ?? 'Customer'}: ${bits.join('; ')}.` : '';
}

// ---------- Orchestration ----------

export interface HandleOpts { provider?: AiProvider | null; now?: number }

/**
 * Handles one inbound customer message on a persisted conversation. The caller has already stored the inbound message.
 * Model output is advisory: this function validates it and only performs whitelisted backend operations.
 */
export async function handleCustomerMessage(env: Env, tenantId: string, conversationId: string, text: string, opts: HandleOpts = {}): Promise<EngineOutcome> {
  const db = env.DB;
  const conv = await getConversation(db, tenantId, conversationId);
  const { settings, name: agencyName } = await getTenantSettings(db, tenantId);
  const state = loadState(conv);
  const none = (mode: EngineOutcome['mode'], intent: string): EngineOutcome => ({ reply: null, citations: [], ui: { action: 'none' }, handoff: false, mode, intent });

  if (conv.status === 'resolved') await run(db, `UPDATE conversations SET status = 'open', resolved_at = NULL, ai_enabled = 1 WHERE id = ? AND tenant_id = ?`, conv.id, tenantId);
  if (!settings.ai.enabled) return none('blocked', 'ai_disabled');
  if (conv.status === 'handoff' || !conv.ai_enabled) return none('human', 'human_handling'); // a person owns this conversation

  // 1. Hard escalations decided by deterministic rules, before any model sees the message.
  const kw = matchesKeyword(text, settings.ai.escalationKeywords);
  if (kw) return escalate(env, tenantId, conv, state, settings, 'sensitive_topic', 'sensitive');
  if (wantsHuman(text)) return escalate(env, tenantId, conv, state, settings, 'customer_requested', 'human_request');

  // 2. Retrieval over this tenant's published, ready sources.
  const hits = await retrieve(db, tenantId, text);
  const fields = extractFields(text);
  const name = extractName(text);
  const consult = wantsConsultation(text);

  // 3. Answer generation: LLM if configured and within the monthly budget, otherwise extractive from the top source.
  const provider = opts.provider === undefined ? aiProviderFor(env) : opts.provider;
  const overLimit = provider ? (await monthlyUsage(db, tenantId, 'ai_call')) >= settings.limits.aiCallsPerMonth : false;
  let turn: LlmTurn | null = null; let mode: EngineOutcome['mode'] = 'rules';
  if (provider && !overLimit) {
    try {
      const history = (await all<{ direction: string; sender_type: string; body: string }>(db, `SELECT direction, sender_type, body FROM messages WHERE tenant_id = ? AND conversation_id = ? AND direction <> 'internal' ORDER BY created_at DESC, rowid DESC LIMIT 7`, tenantId, conversationId)).reverse()
        .slice(0, -1).map((m) => ({ role: (m.sender_type === 'customer' ? 'customer' : m.sender_type === 'staff' ? 'staff' : 'assistant') as 'customer' | 'assistant' | 'staff', text: m.body.slice(0, 500) }));
      const lead = conv.lead_id ? await getLead(db, tenantId, conv.lead_id) as Record<string, any> : null;
      const out = await provider.respond({
        agencyName, tone: 'friendly, professional, concise', message: text.slice(0, 1500), history,
        sources: hits.map((h) => ({ id: h.sourceId, title: h.title, text: h.text.slice(0, 900) })),
        knownFields: lead?.requirements ?? state.pendingFields,
      });
      await recordUsage(db, tenantId, 'ai_call', 1, conv.channel);
      await recordUsage(db, tenantId, 'ai_tokens_in', out.tokensIn, conv.channel);
      await recordUsage(db, tenantId, 'ai_tokens_out', out.tokensOut, conv.channel);
      const parsed = llmTurnSchema.safeParse(out.raw);
      if (parsed.success) { turn = parsed.data; mode = 'llm'; }
      else { await recordUsage(db, tenantId, 'ai_invalid', 1, conv.channel); await audit(db, tenantId, { type: 'ai' }, 'ai.invalid_output', 'conversation', conv.id); }
    } catch {
      await recordUsage(db, tenantId, 'ai_failure', 1, conv.channel); // provider outage: degrade to extractive, never to a made-up answer
    }
  }

  // 4. Validate the draft answer. Anything unsupported becomes an honest "I don't know".
  let reply = ''; let citations: Citation[] = []; let grounded = false;
  const cite = (h: Hit): Citation => ({ sourceId: h.sourceId, title: h.title, snippet: h.text.replace(/^Q:[^\n]*\nA:\s*/, '').slice(0, 220) });
  if (turn) {
    const validIds = new Set(hits.map((h) => h.sourceId));
    const used = turn.used_source_ids.filter((id) => validIds.has(id));
    const usedHits = hits.filter((h) => used.includes(h.sourceId));
    if (turn.can_answer_from_sources && turn.answer.trim() && usedHits.length === turn.used_source_ids.length && usedHits.length > 0
      && numbersGrounded(turn.answer, usedHits.map((h) => h.text), text) && !GUARANTEE.test(turn.answer) && !claimsBooking(turn.answer)) {
      reply = turn.answer.trim(); citations = usedHits.map(cite); grounded = true;
    }
  } else if (hits.length) {
    // Extractive fallback: quote the approved text verbatim rather than paraphrasing it.
    reply = extractiveAnswer(hits[0]); citations = [cite(hits[0])]; grounded = true; mode = 'extractive';
  }

  const llmWantsHuman = !!turn?.wants_human;
  const consultRequested = consult || !!turn?.wants_consultation;

  // 5. Side effects — whitelisted and validated, never taken straight from the model.
  const merged: Requirements = { ...fields, ...(turn?.lead_fields ?? {}) };
  const safeMerged = requirementsSchema.parse(merged);
  const customerName = (turn?.customer_name?.trim() || name || '').slice(0, 80) || null;
  const newState: ConvState = { ...state, consultationRequested: state.consultationRequested || consultRequested };
  let leadReq: Requirements = {};
  if (conv.lead_id) {
    const lead = await getLead(db, tenantId, conv.lead_id) as Record<string, any>;
    leadReq = lead.requirements ?? {};
    if (Object.keys(safeMerged).length) {
      leadReq = { ...leadReq, ...safeMerged };
      await updateLead(db, tenantId, conv.lead_id, { type: 'ai' }, { requirements: safeMerged }, { system: true });
    }
    const summary = turn?.summary?.trim() || composeSummary(lead.name ?? customerName, leadReq);
    if (summary) await run(db, 'UPDATE leads SET summary = ?, updated_at = ? WHERE id = ? AND tenant_id = ?', summary.slice(0, 1000), new Date().toISOString(), conv.lead_id, tenantId);
    if (lead.status === 'new' && qualificationComplete(settings.ai.collectFields, leadReq) && (lead.email || lead.phone)) {
      await updateLead(db, tenantId, conv.lead_id, { type: 'ai' }, { status: 'qualified' }, { system: true });
    }
  } else {
    newState.pendingFields = { ...state.pendingFields, ...safeMerged };
    if (customerName && !state.pendingName) newState.pendingName = customerName;
  }

  // 6. Decide the response shape and the single next step.
  let ui: EngineUi = { action: 'none' }; let intent = grounded ? 'faq' : 'unknown';
  if (consultRequested) {
    intent = 'consultation_request';
    ui = conv.lead_id ? { action: 'show_slots' } : { action: 'request_contact', reason: 'consultation' };
    reply = reply ? `${reply}\n\n` : '';
    reply += conv.lead_id ? 'Happy to arrange a consultation. Please pick a time that suits you below.' : 'Happy to arrange a consultation. I just need your name and a way to reach you first.';
    newState.uncertainCount = 0;
    newState.recommendation = 'Customer asked for a consultation — confirm the booking or call to arrange.';
  } else if (!grounded) {
    if (isGreeting(text) || (turn && !turn.can_answer_from_sources && turn.answer.trim() === '' && !text.includes('?') && text.trim().split(/\s+/).length <= 3 && !hits.length && /^(hi|hello|hey|thanks|thank you|ok|okay)\b/i.test(text))) {
      intent = 'smalltalk'; reply = settings.ai.greeting;
    } else if (Object.keys(safeMerged).length && !hits.length && !looksLikeQuestion(text)) {
      intent = 'lead_info'; reply = 'Thanks, that helps. ';
      newState.uncertainCount = 0;
    } else {
      intent = 'out_of_scope';
      newState.uncertainCount = state.uncertainCount + 1;
      newState.recommendation = 'Assistant could not answer from approved sources — consultant should respond.';
      if (newState.uncertainCount >= 2 || llmWantsHuman) {
        await saveState(db, tenantId, conv.id, newState);
        return escalate(env, tenantId, conv, newState, settings, llmWantsHuman ? 'customer_requested' : 'repeated_uncertainty', 'out_of_scope');
      }
      reply = UNCERTAIN_REPLY; ui = { action: 'offer_handoff', reason: 'uncertain' };
    }
  } else {
    newState.uncertainCount = 0;
  }
  if (llmWantsHuman && intent !== 'consultation_request') {
    await saveState(db, tenantId, conv.id, newState);
    return escalate(env, tenantId, conv, newState, settings, 'customer_requested', 'human_request');
  }

  // Ask for at most one missing qualification detail, and only once the customer is an identified lead.
  if (conv.lead_id && ui.action === 'none' && intent !== 'out_of_scope') {
    const q = nextQuestion(settings.ai.collectFields, leadReq, newState.asked);
    if (q) { reply = `${reply.trim()}${reply.trim() ? '\n\n' : ''}${q.ask}`; newState.asked = [...newState.asked, q.key]; }
  }
  if (!reply.trim()) reply = settings.ai.greeting;
  if (claimsBooking(reply) && intent !== 'consultation_request') reply = SAFE_BOOKING_REPLY; // belt and braces

  await saveState(db, tenantId, conv.id, newState);
  return { reply: reply.trim(), citations, ui, handoff: false, mode, intent };
}

async function escalate(env: Env, tenantId: string, conv: ConversationRow, state: ConvState, settings: Settings, reason: string, intent: string): Promise<EngineOutcome> {
  await recordHandoff(env, tenantId, conv.id, reason, { type: 'ai' });
  await saveState(env.DB, tenantId, conv.id, { ...state, recommendation: `Human follow-up needed: ${reason.replace(/_/g, ' ')}.` });
  const needContact = !conv.lead_id;
  return {
    reply: settings.ai.handoffMessage + (needContact ? ' Please share your name and phone number or email so they can reach you.' : ''),
    citations: [], ui: needContact ? { action: 'request_contact', reason: 'handoff' } : { action: 'handoff_done' }, handoff: true, mode: 'rules', intent,
  };
}

export { parseJson, first };
