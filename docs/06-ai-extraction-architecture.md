# 6. AI Extraction Architecture

This is the feature the whole product is built around (brief §6-§9,
§22-§24), so it gets the most detailed treatment and the most server-side
validation.

## 6.1 Pipeline overview

```
message inserted
   │
   ▼
[6.2] heuristic pre-filter (cheap, local, no API call)
   │  "could this plausibly be event-shaped?"
   │  no ──────────────────────────────► stop, no ai_extractions row at all
   ▼ yes
[6.3] build minimal context (doc 7.4)
   │
   ▼
[6.4] call ExtractionProvider (Claude, JSON-schema constrained)
   │
   ▼
[6.4] server-side validation of the raw result (never trust it as-is)
   │  invalid/malformed ──────────────► ai_extractions.status='failed', stop
   ▼ valid
[6.5] duplicate / correction matching against existing calendar_events
   │
   ├─ matches an existing event, same info ─► status='duplicate', stop (no card)
   ├─ matches an existing event, changed info ─► propose UPDATE card
   └─ no match ─► continue
   ▼
[6.3 principle] confidence routing
   │
   ├─ below suggestion floor (0.55) ──────────► status='silent', stop
   ├─ needs_clarification=true ───────────────► clarification card
   ├─ at/above suggestion floor, below
   │   auto-add threshold (default 0.95,
   │   family may raise/lower within 0.90–0.99,
   │   auto-add itself is opt-in) ────────────► suggestion card, status='pending'
   └─ at/above auto-add threshold AND
       family enabled auto-add ───────────────► create calendar_events row,
                                                  status='auto_added', confirmation card
```

Every branch writes exactly one `ai_extractions` row per message (upsert on
`message_id`) recording which branch was taken, the raw model output, the
validated/normalized output, and (if applicable) the resulting
`calendar_events.id` — this is the provenance chain required by brief §10.

## 6.2 Heuristic pre-filter (cost control, brief §20)

Before spending an API call, a cheap local check runs in the Edge Function:
does the message contain *any* signal that it could be temporal/event
content — a date-like token (day names, month names, ordinals like "15th",
words like "tomorrow"/"next"/"birthday"/"appointment"/etc.), **or** is it a
reply to a message that itself has a pending/recent extraction (so a
context-only follow-up like "let's do 12" still gets evaluated even though
"12" alone matches no keyword — see 6.2.1). Messages that are pure
reactions, very short acknowledgements ("ok", "thanks", "😂"), or that
match none of the above skip the Claude call entirely and get no
`ai_extractions` row.

This is intentionally conservative (biased toward calling Claude when
unsure) — the pre-filter only needs to eliminate the large volume of
obviously-non-event chatter; the real precision work happens in the model
call + validation, per the brief's "optimize for trust" principle. False
negatives here are worse than the cost of a few unnecessary calls, but a
family in mid-conversation about last week's dinner still shouldn't be
firing calls for every message, hence the filter exists at all.

### 6.2.1 Context-only follow-ups

A message with no date keywords of its own (e.g. "Let's do lunch at 12")
still triggers extraction if the immediately preceding 1-2 messages in the
conversation included a pending or recently-created event — the pre-filter
checks a short-lived per-conversation "open event context" marker (last
event-bearing message within the last 30 minutes) in addition to keyword
matching.

## 6.3 Confidence semantics

Confidence is the model's calibrated certainty that (a) this is genuinely
future-scheduling intent, not past recap/hypothetical/casual musing, and
(b) the extracted fields (title, date, time) are correct as extracted. The
brief's examples map roughly to:

| Statement | is_event | confidence (approx) | outcome |
|---|---|---|---|
| "My DMD is on 15 October at 3pm." | true | ~0.95+ | suggestion (or auto-add if enabled) |
| "Grandma's birthday is 24 October." | true | ~0.95+ | suggestion |
| "I'm on leave from 9 to 15 October." | true | ~0.9 | suggestion (date range, doc 6.8) |
| "Maybe we should visit Grandma on Sunday." | true, low conf. OR needs_clarification | ~0.4-0.6 | silent or, if a date is at least resolvable, a soft "Add / Ignore" ask — never auto-add |
| "We should probably have dinner next week." | false or needs_clarification | low | silent — no specific day, pure hedge |
| "I might take leave in October." | false | low | silent — no date, hedge language ("might") |
| "That dinner yesterday was really good." | false | n/a | silent — past tense, recap |

The **suggestion floor** (0.55) and **auto-add threshold** (0.90–0.99,
default 0.95, opt-in) are the two server-side constants referenced in doc
1 §1.4; both live in `_shared/extraction.ts` as named constants, not
magic numbers scattered through the code, and the family-configurable value
is clamped to the floor server-side regardless of what the client sends
(doc 10).

## 6.4 The model contract and server-side validation

The provider is called with Claude's structured/tool-use output mode
constrained to this JSON Schema (kept as a literal schema object in
`_shared/extraction.ts`, and this is the "conceptually similar" schema the
brief shows — extended with fields the brief's downstream requirements
need):

```jsonc
{
  "is_event": boolean,
  "confidence": number,          // 0..1
  "title": string | null,
  "date": "YYYY-MM-DD" | null,
  "end_date": "YYYY-MM-DD" | null,      // for date ranges (leave)
  "start_time": "HH:MM" | null,          // 24h, family-local
  "end_time": "HH:MM" | null,
  "all_day": boolean,
  "location": string | null,
  "category": "appointment"|"birthday"|"school"|"holiday"|"travel"|
              "leave"|"dinner"|"meeting"|"activity"|"deadline"|
              "reminder"|"other",
  "recurrence": string | null,           // RFC5545-ish freq text, or null
  "participants": string[],              // family display names mentioned
  "needs_clarification": boolean,
  "clarification_question": string | null,
  "relates_to_event_id": string | null,  // set by our matching pass, not the model
  "is_correction": boolean,
  "reasoning": string                    // short, for provenance/debugging only, never shown to users
}
```

**The API response is never written to the database as-is.** Every field
is re-validated server-side in `_shared/extraction.ts::validateExtraction`:

- Shape/type validation against the schema above (reject anything
  malformed → `status='failed'`, doc 10).
- `date`/`end_date`/`start_time`/`end_time` are re-parsed and range-checked
  (no `end_time` before `start_time` same day, no dates more than ~2 years
  out unless recurrence is set, etc.).
- `confidence` is clamped to `[0,1]`; a non-numeric or missing value is
  treated as `0` (fails safe toward *not* showing a card).
- `category` must be one of the enum values; anything else maps to
  `"other"` rather than being rejected outright (keeps a plausible event
  from being dropped over a label mismatch).
- If `is_event` is true but `title` or `date` is null/empty, the result is
  **downgraded to `needs_clarification: true`** rather than accepted — an
  event with no title or no date is never something we show as "Add"
  directly; it either asks a clarifying question or is dropped, never
  guessed (brief §9 "never silently guess").
- `relates_to_event_id` in the model's own output is ignored; that field
  is *always* computed by our own matching pass (6.5), not trusted from
  the model, since it is a claim about our database the model does not
  actually have privileged access to.

## 6.5 Duplicate & correction matching

Before routing on confidence, every validated `is_event:true` result is
matched against the family's events with `start_date` within a ±45 day
window of the extracted date, using:

1. Normalized-title similarity (lowercased, punctuation-stripped, simple
   token-overlap/edit-distance threshold) **and**
2. Same `category` **and**
3. Date proximity (exact match → likely duplicate/confirmation; a few days
   off with the model flagging `is_correction: true` or the text containing
   correction language → likely correction).

Outcomes:
- Exact/near match, no material new info → `duplicate_of_event_id` set,
  `status='duplicate'`, no card (doc 2.6).
- Match with a changed date/time/location and correction signal → an
  **update card** referencing the existing event (doc 2.5), never a second
  `calendar_events` row.
- No match → proceeds as a normal new-event candidate.

This matching is deliberately conservative (multiple weak signals must
agree) — brief §22's requirement is "recognize the existing event," and a
false-positive dedupe (silently swallowing a genuinely new, similarly-named
event) is its own kind of trust violation, so ties favor asking rather than
merging in the model prompt's `is_correction`/reasoning, but the final
merge decision is this deterministic server-side matcher, not the model's
say-so alone.

## 6.6 Conversational context window

`ai-extract` fetches, for the message's conversation:

- The triggering message.
- The previous 15 messages (configurable constant), each reduced per doc
  7.4, oldest first.
- Up to 10 upcoming (`start_date >= today`) `calendar_events` for the
  family, reduced to `{id, title, category, start_date, start_time}`, for
  the matching pass and for resolving references like "that day."

This bounded window (not the full history) is what keeps context coherent
per brief §7 ("It should NOT create three unrelated events") without
unbounded cost growth (brief §20) — 15 messages is enough to carry a short
back-and-forth like doc 2.3's Grandma's-birthday example while staying a
small, cheap prompt.

### Assistant Q&A context (brief §13) is a separate, larger retrieval

`ai-assistant` is a different code path with different context needs — a
question like "what's happening in October?" needs the *calendar*, not
recent chat. It retrieves: all `calendar_events` in the referenced date
range (parsed from the question using the same date-resolution utility as
6.8), and only falls back to a recent-message search when the question is
about something calendar events don't capture (e.g. "what did we decide
about the birthday dinner?" pulls recent messages matching the topic).
The assistant prompt instructs the model to answer *only* from the
provided context and to say "I don't know" rather than infer — this is
enforced by prompt instruction plus the product framing (its answer is
never written back as structured data, so a wrong guess here is a bad
answer, not bad data — still undesirable, so the prompt is explicit, but
it doesn't carry the same server-side-validation requirement as event
extraction because it doesn't mutate state).

## 6.7 Idempotency & the resolve action

`ai_extractions.status` transitions `pending → resolved|ignored` exactly
once, enforced by a conditional UPDATE (doc 10). `POST
.../ai-extract/:id/resolve` is safe to retry: a second call against an
already-resolved id returns the existing outcome rather than erroring or
double-creating (doc 8.4).

## 6.8 Relative date resolution (brief §8)

`_shared/dates.ts` implements resolution against the **family's configured
IANA timezone** (`families.timezone`, default from the creating device,
editable in Settings — never hardcoded, brief §8 explicit requirement),
using the message's `created_at` (converted to family-local time) as "now":

- Direct: today, tomorrow, tonight.
- Weekday-relative: "this Sunday" → nearest Sunday ≥ today; "next Monday" →
  the Monday of the week *after* the current week (explicit "next" always
  skips the current week, disambiguating the classic "next Monday"
  confusion); "next weekend" → the Sat/Sun following the current week.
- Offsets: "in two weeks", "next month" → calendar-aware addition (not
  naive +30 days).
- Day-of-month only: "the 15th" → nearest future occurrence of that day-of-
  month (this month if not yet passed, else next month).
- Named holidays: a small static table seeded with common ones (Christmas,
  New Year's Day, etc.) resolved to that year's date; "school holidays" has
  no fixed date and is *not* resolved automatically — it routes to
  `needs_clarification` asking for the actual dates, since guessing a
  school's term dates would be exactly the kind of silent wrong guess the
  brief prohibits.
- Ranges ("from 9 to 15 October") → `date`/`end_date` pair.

This module is pure and independently testable (see `tests/`), because
date resolution correctness is the single highest-leverage place for silent
errors to creep in.
