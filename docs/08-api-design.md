# 8. API Design

The iOS app talks to two surfaces: the Supabase auto-generated
REST/Realtime API (via the official `supabase-swift` SDK) for plain CRUD +
subscriptions under RLS, and a small set of custom Edge Functions for
anything privileged. It never calls Claude or APNs directly.

## 8.1 Supabase SDK usage (no bespoke API needed)

Handled directly by the client through the SDK, entirely governed by RLS:

- Auth: `signUp`, `signIn`, `signOut`, session refresh.
- `families`, `family_members`, `conversations`, `messages`,
  `calendar_events`, `event_participants`, `notification_preferences`:
  standard `select`/`insert`/`update` with PostgREST filters, plus
  `.channel(...)` Realtime subscriptions scoped to `family_id`.
- Message send is a plain `insert` into `messages` — the client does not
  call `ai-extract` itself; the DB webhook does (doc 4.2).

## 8.2 Edge Functions

All Edge Functions require a valid Supabase Auth JWT (`Authorization:
Bearer <token>`) except `push-dispatch`, which is invoked only by a
Supabase DB Webhook (validated via a shared webhook secret header, not a
user JWT). Every function re-derives `family_id` from data the caller is
already an RLS-checked member of — no function trusts a client-supplied
`family_id` without checking membership server-side.

### `POST /functions/v1/ai-extract`
Normally fired by the DB webhook on `messages` insert, not called by the
client — documented here because it's the core pipeline (doc 6).

Request:
```json
{ "message_id": "uuid" }
```
Behavior: loads the message + last-N context + upcoming events for its
family, calls the extraction provider, validates the result server-side,
and — depending on outcome — writes an `ai_extractions` row plus either
nothing (silent), a suggestion (`status = 'pending'`, surfaced via Realtime
as a synthetic system message the client renders as a card) or a new/updated
`calendar_events` row (auto-add path). Returns `202 { extraction_id }`
immediately; result delivery to clients is via Realtime, not the response
body, since multiple family members must see it simultaneously.

### `rpc('resolve_ai_extraction', { _extraction_id, _action, _overrides })`
Called by the client (directly via the Supabase SDK, per §8.1's pattern —
no bespoke Edge Function needed) when a user taps **Add / Edit / Update /
Ignore** on a suggestion card. Implemented as the `resolve_ai_extraction()`
Postgres function in `0001_init.sql` rather than an Edge Function: it's a
single atomic multi-table write (extraction row + calendar_events +
the in-chat card message) gated by role checks that read `auth.uid()`
straight from the caller's own JWT — a stateless HTTP hop through an Edge
Function would add latency and a second place to keep those checks in
sync, for no benefit, since no Claude call or other external I/O is
involved in resolving a card.

`_action`: `'add' | 'edit' | 'update' | 'ignore'`. `_overrides` (jsonb) is
only read when `_action` is `'edit'`; it goes through the same shape
checks as an AI result before being written (title/date required), so a
user cannot smuggle an invalid event through the edit path.

Returns the resulting `calendar_events` row, or `null` for `'ignore'`.
Idempotent by `extraction_id` — resolving an already-resolved extraction
returns the prior result rather than double-writing (doc 6 §6.7).

### `POST /functions/v1/ai-assistant/ask`
Request:
```json
{ "conversation_id": "uuid", "question": "What's happening in October?" }
```
Loads grounded context (doc 6 §6.6), calls the assistant provider, inserts
the answer as a message authored by the system/assistant sender, returns
`200 { message: Message }`. The client also receives this via the normal
Realtime message subscription — the direct response just removes a round
trip for the asker's own optimistic UI.

### `POST /functions/v1/invite/create`
Request: `{ "family_id": "uuid", "max_uses": 1, "expires_in_hours": 168 }`
Response: `{ "token": "...", "url": "hearth://invite/<token>", "expires_at": "..." }`
Role-gated (owner/adult) — enforced in the function via a membership+role
lookup, in addition to RLS on the underlying `invites` table.

### `POST /functions/v1/invite/redeem`
Request: `{ "token": "..." }`
Response: `{ "family_id": "uuid" }` — inserts the caller into
`family_members` with role `adult`, marks the invite used, all inside one
transaction (via a Postgres function called with the service role) so a
race between two redeemers of a `max_uses: 1` link can't both succeed.

### `POST /functions/v1/push-dispatch` (webhook-only, not client-facing)
Triggered by DB webhooks on `messages` insert, `calendar_events`
insert/update, and `ai_extractions` insert-with-clarification. Looks up
recipient devices' push tokens + their `notification_preferences`, and
sends APNs pushes, respecting per-category opt-outs and basic rate
limiting (doc 15/doc 10).

## 8.3 Error shape

All Edge Functions return errors as:
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "human-readable" } }
```
with HTTP status matching the code (`400` validation, `401`
unauthenticated, `403` not a family member / wrong role, `404`, `409`
conflict/idempotency replay, `422` AI result failed server-side schema
validation, `502` upstream Claude failure, `504` upstream timeout). The
iOS `NetworkClient` maps these to a small typed `ServiceError` enum so view
models can show the right empty/error state rather than a generic alert.

## 8.4 Idempotency

- `messages.client_id` (client-generated UUID, unique per sender) lets a
  retried send be upserted rather than duplicated — the classic
  offline/flaky-network case from brief §21.
- `ai-extract` is keyed by `message_id` with a unique constraint on
  `ai_extractions.message_id` — a re-fired webhook (Supabase webhooks are
  at-least-once) upserts/no-ops instead of creating a second extraction or
  a second event (brief §21 "must never create duplicate events simply
  because an API request was retried").
- `ai-extract/:id/resolve` and `invite/redeem` are transactionally guarded
  as described above.
