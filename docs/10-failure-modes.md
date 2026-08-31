# 10. Failure Modes & Mitigations

| Failure | Mitigation |
|---|---|
| Client retries a message send after a timeout (network flake) | `messages.client_id` unique per sender; insert is an upsert on that key — no duplicate message (doc 8.4) |
| DB webhook fires `ai-extract` twice for one message (at-least-once delivery) | Unique constraint on `ai_extractions.message_id`; handler upserts, second call is a no-op that still returns 200 (doc 8.4) |
| Claude API times out or errors | `ai-extract` catches the failure, writes an `ai_extractions` row with `status='failed'` (not surfaced to users as an error — the message just has no card), and logs for retry/alerting. No user-facing failure, no partial/garbage event |
| Claude returns malformed/non-JSON or a schema-invalid result | Server-side Zod-equivalent validation (doc 6 §6.4) rejects it before any DB write; treated the same as "not an event" — never trust the model's output shape |
| Two people tap "Add" on the same suggestion card at once | `ai_extractions` resolution is guarded by a DB-level `status` transition (`pending → resolved`) inside a single UPDATE with a WHERE on the current status; the loser's UPDATE affects 0 rows and the function returns the already-created event instead of creating a second one |
| Two people redeem a `max_uses: 1` invite simultaneously | Redeem runs inside one Postgres function (`SECURITY DEFINER`) that increments a use-count with `FOR UPDATE` row locking — the second redeemer gets a clean "invite already used" error |
| Duplicate real-world event confirmation ("just confirming...") | Extraction matches existing events by normalized title + category + date proximity before proposing anything; a match short-circuits to "no card" rather than a second event (doc 2.6, doc 6 §6.5) |
| Conflicting edits to the same event from two devices | `calendar_events.updated_at` optimistic concurrency: client sends the `updated_at` it last saw; server update is `WHERE updated_at = $expected`; a mismatch returns `409` and the client re-fetches and re-prompts rather than silently overwriting |
| Offline app / poor network | Supabase SDK's local session cache lets read views render last-known data; message send queues locally (client_id-keyed) and flushes on reconnect; Realtime auto-reconnects and re-syncs via a `since` cursor rather than a full reload |
| Push notification delivery fails (bad/expired token) | `push-dispatch` treats APNs `BadDeviceToken`/`Unregistered` responses as a signal to soft-delete that token row, not a retryable error; does not retry-storm APNs |
| Authentication failure / expired session | Supabase SDK auto-refreshes access tokens using the refresh token; a hard failure (refresh token itself invalid/revoked) routes the whole app back to the Auth flow rather than surfacing scattered per-request 401s |
| AI over-triggers on casual chat ("that dinner yesterday was great") | Prompt explicitly instructs the model to distinguish past-tense recap from future scheduling, and any resulting `is_event:true` with a past/ambiguous date and low confidence is validated server-side against the confidence floor (doc 6 §6.3) — never shown as a card |
| Family sets an unreasonable auto-add threshold expectation | Server clamps the configurable threshold to a hard floor (doc 1 §1.4); UI cannot request auto-add below it even via a crafted request, since the Edge Function re-validates the family's setting against the floor server-side, not just the client's slider bound |
| Runaway AI cost from a very chatty family | Doc 6 §6.7 cost controls: heuristic pre-filter skips the API call entirely for messages with no plausible temporal/event signal (regex/keyword gate), trimmed context window, and a per-family daily extraction-call soft cap that degrades to heuristic-only (no Claude call) once hit, logged for the owner to see in Settings |
| Malformed AI response for the assistant Q&A (brief §13 "don't invent") | Assistant prompt is explicitly grounded-context-only and instructed to answer "I don't know" when the retrieved context doesn't contain the answer; response is not validated against a calendar-writing schema at all (it's read-only prose), so there's no DB-write risk from a bad assistant answer — worst case is an unhelpful reply, not corrupted data |
| App killed mid-flow (e.g. right after tapping "Add") | The action is a single idempotent HTTP call (doc 8.4); if the app is killed after the request is in flight, worst case is the state resolves without the UI reflecting it immediately — the next app open shows the true DB/Realtime state, no lost or double writes |

## Explicitly out of scope for V1 (acknowledged, not hidden)

- **End-to-end encryption.** RLS + TLS + encryption-at-rest protects
  against unauthorized *access*, not against a compromised Supabase
  project operator reading message content — which is also required for
  the AI extraction pipeline to function at all. True E2EE is incompatible
  with server-side AI extraction as designed and is flagged here as a
  conscious tradeoff, not an oversight; worth revisiting only if a
  client-side/on-device extraction model becomes viable.
- **Multi-conversation-per-family UI** — schema supports it (doc 4.2), V1
  UI does not expose creating a second conversation.
- **Image attachments, voice, document extraction** — per brief §30,
  schema-ready (`messages.attachments jsonb[]`, unused) not implemented.
