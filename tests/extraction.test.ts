// Validation-layer tests for the AI extraction pipeline, covering the 8
// scenarios brief §28 requires at minimum, plus the server-side guards
// from docs/06-ai-extraction-architecture.md. These test the
// deterministic, server-side logic against *synthetic* model output —
// they prove "given what Claude plausibly returns for this sentence, does
// our system do the right thing", not "does Claude itself return the
// right thing" (that needs a live API key; see tests/README.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExtraction,
  matchAgainstExistingEvents,
  decideOutcome,
  isPlausibleEventMessage,
  isWithinOpenEventContext,
  clampAutoAddThreshold,
  AUTO_ADD_MIN_THRESHOLD,
  AUTO_ADD_MAX_THRESHOLD,
  SUGGESTION_FLOOR,
  type RawExtractionResult,
  type ExistingEventForMatching,
} from '../supabase/functions/_shared/extraction.ts';

const NOW = '2026-08-31';
const NO_AUTO_ADD = { autoAddEnabled: false, autoAddThreshold: 0.95 };
const AUTO_ADD_ON = { autoAddEnabled: true, autoAddThreshold: 0.95 };

function outcomeFor(raw: RawExtractionResult, existing: ExistingEventForMatching[] = [], settings = NO_AUTO_ADD) {
  const validated = validateExtraction(raw, { nowISODate: NOW });
  const match = validated ? matchAgainstExistingEvents(validated, existing) : { kind: 'none' as const };
  return { validated, match, outcome: decideOutcome(validated, match, settings) };
}

// ---------------------------------------------------------------------------
// 1. Explicit event
// ---------------------------------------------------------------------------
test('explicit event: "My DMD is on 15 October at 3pm." → suggestion card', () => {
  const { outcome, validated } = outcomeFor({
    is_event: true, confidence: 0.96, title: 'DMD', date: '2026-10-15',
    start_time: '15:00', all_day: false, category: 'appointment',
  });
  assert.equal(outcome.kind, 'suggestion');
  assert.equal(validated?.title, 'DMD');
  assert.equal(validated?.date, '2026-10-15');
});

test('explicit event with auto-add enabled and confidence above threshold → auto_add', () => {
  const { outcome } = outcomeFor(
    { is_event: true, confidence: 0.96, title: 'DMD', date: '2026-10-15', start_time: '15:00', category: 'appointment' },
    [],
    AUTO_ADD_ON,
  );
  assert.equal(outcome.kind, 'auto_add');
});

// ---------------------------------------------------------------------------
// 2. Birthday
// ---------------------------------------------------------------------------
test('birthday: "Grandma\'s birthday is 24 October." → suggestion card', () => {
  const { outcome, validated } = outcomeFor({
    is_event: true, confidence: 0.97, title: "Grandma's Birthday", date: '2026-10-24',
    all_day: true, category: 'birthday',
  });
  assert.equal(outcome.kind, 'suggestion');
  assert.equal(validated?.allDay, true);
});

// ---------------------------------------------------------------------------
// 3. Date range (leave)
// ---------------------------------------------------------------------------
test('date range: "I\'m on leave from 9 to 15 October." → suggestion with date+end_date', () => {
  const { outcome, validated } = outcomeFor({
    is_event: true, confidence: 0.9, title: 'Leave', date: '2026-10-09', end_date: '2026-10-15',
    all_day: true, category: 'leave',
  });
  assert.equal(outcome.kind, 'suggestion');
  assert.equal(validated?.endDate, '2026-10-15');
});

test('a malformed range (end before start) has its end_date dropped, not silently kept', () => {
  const validated = validateExtraction({
    is_event: true, confidence: 0.9, title: 'Leave', date: '2026-10-15', end_date: '2026-10-09',
    category: 'leave',
  });
  assert.equal(validated?.endDate, null);
});

// ---------------------------------------------------------------------------
// 4. Relative date
// ---------------------------------------------------------------------------
test('relative date: model resolves "tomorrow" using the family-local date it was given', () => {
  // The extraction prompt is fed nowISODate=NOW; a correct model response
  // for "Dinner is tomorrow at 7" resolves to NOW+1. We validate that a
  // pre-resolved date passes straight through unchanged.
  const { outcome, validated } = outcomeFor({
    is_event: true, confidence: 0.9, title: 'Dinner', date: '2026-09-01', start_time: '19:00', category: 'dinner',
  });
  assert.equal(outcome.kind, 'suggestion');
  assert.equal(validated?.date, '2026-09-01');
});

// ---------------------------------------------------------------------------
// 5. Ambiguous
// ---------------------------------------------------------------------------
test('ambiguous, low-confidence hedge: "We should probably have dinner next week." → silent', () => {
  // A pure hedge with no specific day — the model itself should recognize
  // this isn't concrete enough to be an event at all, not merely an event
  // with missing fields (that's the "missing title/date" case below).
  const { outcome } = outcomeFor({
    is_event: false, confidence: 0.3, title: null, date: null, category: 'dinner',
  });
  assert.equal(outcome.kind, 'silent');
});

test('ambiguous but resolvable date, soft-ask territory: "Let\'s meet Mum on Saturday." → suggestion, never auto_add', () => {
  const { outcome } = outcomeFor(
    { is_event: true, confidence: 0.6, title: 'Meet Mum', date: '2026-09-05', category: 'activity' },
    [],
    AUTO_ADD_ON, // even with auto-add on, this confidence must not qualify
  );
  assert.equal(outcome.kind, 'suggestion');
});

test('explicit needs_clarification always produces a clarification, regardless of confidence', () => {
  const { outcome } = outcomeFor({
    is_event: true, confidence: 0.8, title: 'Meet Mum', date: null, category: 'activity',
    needs_clarification: true, clarification_question: 'Do you mean this Saturday, 5 Sept, or next Saturday, 12 Sept?',
  });
  assert.equal(outcome.kind, 'clarification');
  if (outcome.kind === 'clarification') {
    assert.match(outcome.question, /Saturday/);
  }
});

test('is_event=true but missing title/date degrades to clarification, never a guessed card', () => {
  const validated = validateExtraction({ is_event: true, confidence: 0.9, title: null, date: '2026-09-05' });
  assert.equal(validated?.needsClarification, true);
  assert.match(validated?.clarificationQuestion ?? '', /call this event/i);
});

// ---------------------------------------------------------------------------
// 6. Non-event
// ---------------------------------------------------------------------------
test('non-event, past-tense recap: "That dinner yesterday was really good." → silent', () => {
  const { outcome } = outcomeFor({ is_event: false, confidence: 0.05 });
  assert.equal(outcome.kind, 'silent');
});

test('the heuristic pre-filter skips an obvious non-event before any API call', () => {
  assert.equal(isPlausibleEventMessage('ok'), false);
  assert.equal(isPlausibleEventMessage('thanks!! 😂'), false);
  assert.equal(isPlausibleEventMessage(''), false);
  assert.equal(isPlausibleEventMessage("That dinner yesterday was really good."), true); // "dinner" keyword — still gated by validation, not the filter
});

test('the heuristic pre-filter catches explicit event language', () => {
  assert.equal(isPlausibleEventMessage("Grandma's birthday is 24 October."), true);
  assert.equal(isPlausibleEventMessage('My DMD is on 15 October at 3pm.'), true);
  assert.equal(isPlausibleEventMessage("I'm on leave from 9 to 15 October."), true);
  assert.equal(isPlausibleEventMessage('Dinner is tomorrow at 7.'), true);
});

// ---------------------------------------------------------------------------
// 7. Correction
// ---------------------------------------------------------------------------
test('correction: "Actually Grandma\'s birthday dinner is on the 25th, not the 24th." → update, not a new event', () => {
  const existing: ExistingEventForMatching[] = [
    { id: 'evt-1', title: "Grandma's Birthday Dinner", category: 'birthday', start_date: '2026-10-24' },
  ];
  const { outcome } = outcomeFor({
    is_event: true, confidence: 0.9, title: "Grandma's Birthday Dinner", date: '2026-10-25',
    category: 'birthday', is_correction: true,
  }, existing);
  assert.equal(outcome.kind, 'update');
  if (outcome.kind === 'update') assert.equal(outcome.existingEventId, 'evt-1');
});

// ---------------------------------------------------------------------------
// 8. Duplicate confirmation
// ---------------------------------------------------------------------------
test('duplicate: "Just confirming Grandma\'s birthday is 24 October." → recognized, no second event', () => {
  const existing: ExistingEventForMatching[] = [
    { id: 'evt-1', title: "Grandma's Birthday", category: 'birthday', start_date: '2026-10-24' },
  ];
  const { outcome } = outcomeFor({
    is_event: true, confidence: 0.9, title: "Grandma's Birthday", date: '2026-10-24', category: 'birthday',
  }, existing);
  assert.equal(outcome.kind, 'duplicate');
  if (outcome.kind === 'duplicate') assert.equal(outcome.duplicateOfEventId, 'evt-1');
});

test('a same-day, similarly-titled but different-category event is NOT treated as a duplicate', () => {
  const existing: ExistingEventForMatching[] = [
    { id: 'evt-1', title: "Grandma's Birthday", category: 'birthday', start_date: '2026-10-24' },
  ];
  const { outcome } = outcomeFor({
    is_event: true, confidence: 0.9, title: "Grandma's Birthday Cake Pickup", date: '2026-10-24', category: 'reminder',
  }, existing);
  assert.equal(outcome.kind, 'suggestion');
});

// ---------------------------------------------------------------------------
// 9. Conversational context (multi-message)
// ---------------------------------------------------------------------------
test('conversational context: a follow-up with no date keyword stays in the open-event window', () => {
  // Person A: "Grandma's birthday is on 24 October." (creates an event)
  // Person B: "What time are we going?" (a question — no keywords, not evaluated)
  // Person A: "How about 12?" (a bare number, no date/time/category keyword of its own)
  assert.equal(isPlausibleEventMessage('How about 12?'), false);
  const lastEventMessageAt = '2026-08-31T10:00:00Z';
  const thisMessageAt = '2026-08-31T10:05:00Z'; // 5 minutes later, same conversation burst
  assert.equal(isWithinOpenEventContext(lastEventMessageAt, thisMessageAt), true);

  const muchLaterMessageAt = '2026-08-31T11:00:00Z'; // 60 minutes later — outside the 30-min window
  assert.equal(isWithinOpenEventContext(lastEventMessageAt, muchLaterMessageAt), false);
});

test('a follow-up that references the open event updates it rather than creating a second one', () => {
  const existing: ExistingEventForMatching[] = [
    { id: 'evt-grandma', title: "Grandma's Birthday", category: 'birthday', start_date: '2026-10-24' },
  ];
  // The extraction call (fed the open-context event) recognizes "let's do
  // lunch at 12" as adding a time to the existing birthday event, not a
  // new, unrelated "lunch" event — represented here as a correction-shaped
  // result the model returns once it has that context.
  const { outcome } = outcomeFor({
    is_event: true, confidence: 0.85, title: "Grandma's Birthday", date: '2026-10-24',
    start_time: '12:00', category: 'birthday', is_correction: true,
  }, existing);
  assert.equal(outcome.kind, 'update');
});

// ---------------------------------------------------------------------------
// Malformed / failed model output
// ---------------------------------------------------------------------------
test('non-object model output fails validation rather than being coerced into something', () => {
  assert.equal(validateExtraction(null as unknown as RawExtractionResult), null);
  assert.equal(validateExtraction(undefined as unknown as RawExtractionResult), null);
});

test('a garbage confidence value fails safe toward not showing a card', () => {
  const v = validateExtraction({ is_event: true, title: 'X', date: '2026-09-01', confidence: 'high' as unknown as number });
  assert.equal(v?.confidence, 0);
  const { outcome } = outcomeFor({ is_event: true, title: 'X', date: '2026-09-01', confidence: 'high' as unknown as number });
  assert.equal(outcome.kind, 'silent');
});

test('an implausible far-future date with no recurrence degrades to clarification', () => {
  const v = validateExtraction(
    { is_event: true, confidence: 0.9, title: 'Something', date: '2031-01-01' },
    { nowISODate: NOW },
  );
  assert.equal(v?.needsClarification, true);
});

// ---------------------------------------------------------------------------
// Threshold governance (docs/01 §1.4 — server owns the floor, client can't move it)
// ---------------------------------------------------------------------------
test('auto-add threshold is clamped server-side regardless of what is requested', () => {
  assert.equal(clampAutoAddThreshold(0.5), AUTO_ADD_MIN_THRESHOLD);
  assert.equal(clampAutoAddThreshold(1.5), AUTO_ADD_MAX_THRESHOLD);
  assert.equal(clampAutoAddThreshold(Number.NaN), 0.95);
});

test('nothing below the suggestion floor is ever surfaced, even with auto-add on', () => {
  const { outcome } = outcomeFor(
    { is_event: true, confidence: SUGGESTION_FLOOR - 0.01, title: 'X', date: '2026-09-01' },
    [],
    AUTO_ADD_ON,
  );
  assert.equal(outcome.kind, 'silent');
});
