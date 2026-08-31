// Pure validation, matching, and routing logic for the AI event-extraction
// pipeline. This is the file that enforces "the AI must NOT add every
// statement to the calendar" (brief §2) in code, not just in a prompt.
// No Deno/Node-specific APIs — imported unmodified by the Edge Function
// runtime and by tests/ under Node.
//
// See docs/06-ai-extraction-architecture.md for the full design rationale.

export type EventCategory =
  | 'appointment' | 'birthday' | 'school' | 'holiday' | 'travel' | 'leave'
  | 'dinner' | 'meeting' | 'activity' | 'deadline' | 'reminder' | 'other';

export const EVENT_CATEGORIES: EventCategory[] = [
  'appointment', 'birthday', 'school', 'holiday', 'travel', 'leave',
  'dinner', 'meeting', 'activity', 'deadline', 'reminder', 'other',
];

// ----------------------------------------------------------------------------
// Confidence thresholds — the server-side constants doc 1 §1.4 requires
// exist independent of, and not overridable below, by the client.
// ----------------------------------------------------------------------------
export const SUGGESTION_FLOOR = 0.55;
export const AUTO_ADD_MIN_THRESHOLD = 0.90;
export const AUTO_ADD_MAX_THRESHOLD = 0.99;
export const AUTO_ADD_DEFAULT_THRESHOLD = 0.95;

export function clampAutoAddThreshold(value: number): number {
  if (!Number.isFinite(value)) return AUTO_ADD_DEFAULT_THRESHOLD;
  return Math.min(AUTO_ADD_MAX_THRESHOLD, Math.max(AUTO_ADD_MIN_THRESHOLD, value));
}

// ----------------------------------------------------------------------------
// The model's raw (untrusted) output shape, and our validated shape.
// ----------------------------------------------------------------------------
export interface RawExtractionResult {
  is_event?: unknown;
  confidence?: unknown;
  title?: unknown;
  date?: unknown;
  end_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  all_day?: unknown;
  location?: unknown;
  category?: unknown;
  recurrence?: unknown;
  participants?: unknown;
  needs_clarification?: unknown;
  clarification_question?: unknown;
  is_correction?: unknown;
  reasoning?: unknown;
}

export interface ValidatedExtraction {
  isEvent: boolean;
  confidence: number;
  title: string | null;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  category: EventCategory;
  recurrence: string | null;
  participants: string[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
  isCorrection: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function asIsoDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO_DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

function asTimeOrNull(v: unknown): string | null {
  return typeof v === 'string' && TIME_RE.test(v) ? v : null;
}

function addYears(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Re-validates and normalizes the model's raw output. Never trust the
 * model's output shape or claims as-is (docs/06 §6.4) — this is the
 * server-side gate the brief requires ("Validate all structured AI output
 * on the server before writing it to the database.").
 *
 * Returns null only when the input is fundamentally not an object (e.g.
 * the model returned non-JSON) — callers should treat that as a failed
 * extraction (ai_extractions.status = 'failed'), not as "not an event".
 */
export function validateExtraction(
  raw: RawExtractionResult,
  opts: { nowISODate?: string } = {},
): ValidatedExtraction | null {
  if (raw == null || typeof raw !== 'object') return null;

  const confidenceRaw = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0;

  const isEvent = raw.is_event === true;
  const title = typeof raw.title === 'string' && raw.title.trim().length > 0
    ? raw.title.trim().slice(0, 200)
    : null;

  let date = asIsoDateOrNull(raw.date);
  let endDate = asIsoDateOrNull(raw.end_date);
  const startTime = asTimeOrNull(raw.start_time);
  let endTime = asTimeOrNull(raw.end_time);
  const allDay = raw.all_day === true;
  const location = typeof raw.location === 'string' && raw.location.trim()
    ? raw.location.trim().slice(0, 200)
    : null;

  const categoryRaw = typeof raw.category === 'string' ? raw.category : '';
  const category: EventCategory = (EVENT_CATEGORIES as string[]).includes(categoryRaw)
    ? (categoryRaw as EventCategory)
    : 'other';

  const recurrence = typeof raw.recurrence === 'string' && raw.recurrence.trim()
    ? raw.recurrence.trim().slice(0, 200)
    : null;

  const participants = Array.isArray(raw.participants)
    ? raw.participants.filter((p): p is string => typeof p === 'string').slice(0, 20)
    : [];

  let needsClarification = raw.needs_clarification === true;
  let clarificationQuestion = typeof raw.clarification_question === 'string' && raw.clarification_question.trim()
    ? raw.clarification_question.trim().slice(0, 300)
    : null;

  const isCorrection = raw.is_correction === true;

  // Drop malformed ranges rather than propagate a broken one.
  if (endDate && date && endDate < date) endDate = null;
  if (startTime && endTime && endTime < startTime) endTime = null;

  // A far-future date with no stated recurrence is more likely a
  // misparse than a real request — degrade to a clarification instead of
  // silently accepting it.
  if (opts.nowISODate && date && !recurrence) {
    const maxPlausible = addYears(opts.nowISODate, 2);
    if (date > maxPlausible) {
      needsClarification = true;
      clarificationQuestion = clarificationQuestion ?? `Did you mean ${date}? That's more than two years away.`;
    }
  }

  if (!isEvent) {
    return {
      isEvent: false, confidence, title, date, endDate, startTime, endTime, allDay,
      location, category, recurrence, participants,
      needsClarification: false, clarificationQuestion: null, isCorrection,
    };
  }

  // An event with no title or no date is never presentable as "Add" —
  // degrade to a clarification rather than guess (brief §9).
  if (!title || !date) {
    needsClarification = true;
    if (!clarificationQuestion) {
      clarificationQuestion = !title ? 'What should I call this event?' : 'What date is this for?';
    }
  }

  return {
    isEvent: true, confidence, title, date, endDate, startTime, endTime, allDay,
    location, category, recurrence, participants,
    needsClarification, clarificationQuestion, isCorrection,
  };
}

// ----------------------------------------------------------------------------
// Duplicate / correction matching (docs/06 §6.5, brief §22-23)
// ----------------------------------------------------------------------------
export interface ExistingEventForMatching {
  id: string;
  title: string;
  category: string;
  start_date: string;
}

export type MatchResult =
  | { kind: 'none' }
  | { kind: 'duplicate'; eventId: string }
  | { kind: 'correction'; eventId: string };

const DUPLICATE_TITLE_THRESHOLD = 0.6;
const CORRECTION_TITLE_THRESHOLD = 0.6;
const CORRECTION_MAX_DISTANCE_DAYS = 7;
const MATCH_WINDOW_DAYS = 45;

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Jaccard token overlap — cheap, dependency-free, good enough to
 * distinguish "Grandma's Birthday Dinner" from "Grandma's Birthday" while
 * still recognizing near-identical restatements. */
function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const aTokens = new Set(na.split(' '));
  const bTokens = new Set(nb.split(' '));
  let intersection = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersection++;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round(Math.abs(da - db) / 86_400_000);
}

/**
 * Matches a validated, is_event=true extraction against the family's
 * existing (upcoming-window) events, to recognize a duplicate
 * confirmation (brief §22) or a correction (brief §23) instead of
 * creating a second event. Deliberately conservative: multiple weak
 * signals must agree (docs/06 §6.5) — this is the deterministic guard
 * behind the model's own (untrusted) is_correction claim.
 */
export function matchAgainstExistingEvents(
  extraction: ValidatedExtraction,
  existingEvents: ExistingEventForMatching[],
): MatchResult {
  if (!extraction.isEvent || !extraction.title || !extraction.date) return { kind: 'none' };

  let best: { event: ExistingEventForMatching; similarity: number; distanceDays: number } | null = null;
  for (const event of existingEvents) {
    if (event.category !== extraction.category) continue;
    const distanceDays = daysBetween(event.start_date, extraction.date);
    if (distanceDays > MATCH_WINDOW_DAYS) continue;
    const similarity = titleSimilarity(event.title, extraction.title);
    if (similarity < DUPLICATE_TITLE_THRESHOLD) continue;
    if (!best || similarity > best.similarity) {
      best = { event, similarity, distanceDays };
    }
  }

  if (!best) return { kind: 'none' };

  const sameDate = best.distanceDays === 0;
  if (sameDate && !extraction.isCorrection) {
    return { kind: 'duplicate', eventId: best.event.id };
  }

  const closeEnoughForCorrection = extraction.isCorrection || best.distanceDays <= CORRECTION_MAX_DISTANCE_DAYS;
  if (best.similarity >= CORRECTION_TITLE_THRESHOLD && closeEnoughForCorrection) {
    return { kind: 'correction', eventId: best.event.id };
  }

  return { kind: 'none' };
}

// ----------------------------------------------------------------------------
// Outcome routing (docs/06 §6.1, §6.3)
// ----------------------------------------------------------------------------
export type ExtractionOutcome =
  | { kind: 'silent' }
  | { kind: 'failed' }
  | { kind: 'duplicate'; duplicateOfEventId: string }
  | { kind: 'update'; existingEventId: string }
  | { kind: 'clarification'; question: string }
  | { kind: 'suggestion' }
  | { kind: 'auto_add'; threshold: number };

export interface FamilyAiSettings {
  autoAddEnabled: boolean;
  autoAddThreshold: number;
}

export function decideOutcome(
  extraction: ValidatedExtraction | null,
  match: MatchResult,
  settings: FamilyAiSettings,
): ExtractionOutcome {
  if (extraction === null) return { kind: 'failed' };
  if (!extraction.isEvent) return { kind: 'silent' };

  if (match.kind === 'duplicate') return { kind: 'duplicate', duplicateOfEventId: match.eventId };
  if (match.kind === 'correction') return { kind: 'update', existingEventId: match.eventId };

  if (extraction.needsClarification) {
    return { kind: 'clarification', question: extraction.clarificationQuestion ?? 'Can you confirm the date for this?' };
  }

  if (extraction.confidence < SUGGESTION_FLOOR) {
    return { kind: 'silent' };
  }

  const threshold = clampAutoAddThreshold(settings.autoAddThreshold);
  if (settings.autoAddEnabled && extraction.confidence >= threshold) {
    return { kind: 'auto_add', threshold };
  }

  return { kind: 'suggestion' };
}

// ----------------------------------------------------------------------------
// Heuristic pre-filter (docs/06 §6.2) — cost control, runs before any API call.
// ----------------------------------------------------------------------------
const WEEKDAY_WORDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTH_WORDS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
];
const CATEGORY_WORDS = [
  'birthday', 'anniversary', 'appointment', 'school', 'holiday', 'vacation', 'leave',
  'travel', 'trip', 'flight', 'dinner', 'lunch', 'breakfast', 'meeting', 'party',
  'celebration', 'deadline', 'reminder', 'recital', 'graduation', 'wedding', 'exam',
  'doctor', 'dentist', 'checkup', 'game', 'concert', 'rehearsal',
];
const RELATIVE_PHRASES = [
  'today', 'tomorrow', 'tonight', 'yesterday', 'next week', 'next month',
  'next weekend', 'this weekend',
];
const ORDINAL_DAY_RE = /\b\d{1,2}(st|nd|rd|th)\b/i;
const TIME_OF_DAY_RE = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;
const DATE_RANGE_RE = /\bfrom\b[\s\S]*\bto\b/i;
const IN_N_UNITS_RE = /\bin (a|an|\d+) (day|days|week|weeks|month|months)\b/i;

/**
 * Cheap, local, no-API-call check for whether a message could plausibly
 * carry event content. Deliberately biased toward false positives (call
 * Claude when unsure) — precision is enforced downstream by
 * validateExtraction + decideOutcome, not here. Eliminates the large
 * volume of obviously-non-event chatter ("ok", "😂", "thanks") from ever
 * reaching the API.
 */
export function isPlausibleEventMessage(text: string): boolean {
  const t = text.toLowerCase();
  if (t.trim().length === 0) return false;
  if ([...WEEKDAY_WORDS, ...MONTH_WORDS, ...CATEGORY_WORDS, ...RELATIVE_PHRASES].some((w) => t.includes(w))) {
    return true;
  }
  return ORDINAL_DAY_RE.test(t) || TIME_OF_DAY_RE.test(t) || DATE_RANGE_RE.test(t) || IN_N_UNITS_RE.test(t);
}

/** docs/06 §6.2.1 — a message with no date keywords of its own ("Let's do
 * lunch at 12") still deserves evaluation if the conversation has an open
 * event context very recently (last event-bearing message within
 * `windowMinutes`). Pure so it's testable without a DB. */
export function isWithinOpenEventContext(
  lastEventMessageAtISO: string | null,
  nowISO: string,
  windowMinutes = 30,
): boolean {
  if (!lastEventMessageAtISO) return false;
  const diffMs = new Date(nowISO).getTime() - new Date(lastEventMessageAtISO).getTime();
  return diffMs >= 0 && diffMs <= windowMinutes * 60_000;
}
