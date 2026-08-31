# 9. Development Plan

Built in the vertical slices the brief specifies (§27). Status reflects
what exists in this repo right now, at the end of this implementation
pass.

| Slice | Scope | Status |
|---|---|---|
| 1. Auth + family creation | Supabase Auth wiring, family/member schema+RLS, create/join-by-invite flow, onboarding UI | **Built** |
| 2. Realtime family chat | messages schema+RLS, send/edit/delete/reply, pagination, Realtime subscription, optimistic send, Chat UI | **Built** |
| 3. Shared calendar | calendar_events schema+RLS, month/agenda/day views, manual create/edit/delete, Calendar UI | **Built** |
| 4. AI event detection | Heuristic pre-filter + Claude call + server-side validation + date resolution + duplicate/correction matching (doc 6) | **Built** (backend; requires a live `CLAUDE_API_KEY` to exercise against the real API — validation/date logic is unit tested without one, see tests/) |
| 5. AI confirmation cards | ai_extractions pipeline output rendered as inline chat cards; Add/Edit/Ignore/Update actions | **Built** |
| 6. Event ↔ source message linking | `source_message_id` provenance, "Created from chat" → jump-to-message navigation | **Built** |
| 7. AI family questions | ai-assistant Edge Function + grounded retrieval; recognized in Chat composer | **Built** (backend + client wiring; same live-key caveat as slice 4) |
| 8. Notifications | notification_preferences schema, push-dispatch Edge Function, APNs payload construction, Settings toggles | **Built** (backend + settings UI; requires real APNs certs/environment to deliver — see doc 10 and known issues below) |
| 9. Polish, testing, security | RLS coverage, dark mode, empty/loading/error states, haptics, extraction test suite | **Partially built** — see known issues |

## What "built" means in this sandbox

This environment has no macOS/Xcode toolchain, no Apple Developer account,
and no live Supabase/Claude/APNs credentials, so nothing here could be
compiled by `xcodebuild` or hit real network services during development.
"Built" means: the SQL is syntactically complete Postgres/RLS DDL meant to
run via `supabase db reset` unmodified; the Edge Functions are complete,
correctly-typed Deno/TypeScript meant to run via `supabase functions
serve`/deploy unmodified; the Swift is a complete, real SwiftUI/MVVM source
tree with an XcodeGen `project.yml` meant to open and build in Xcode
unmodified. The extraction/validation/date logic — the highest-risk,
highest-value part of the AI pipeline — is factored so it can be and is
unit tested right now, in this sandbox, with plain Node (`tests/`,
`npm test`), against synthetic model output, without needing a live key.

## What could not be verified in this environment

- Compiling/running the iOS app in the simulator (no Xcode).
- End-to-end Claude API calls against real family messages (no key
  provisioned; the 8 required test scenarios from brief §28 are
  implemented as **validation-layer** tests against synthetic Claude
  responses, not as live-model evals — running them live is a one-command
  follow-up once a key is available, see `tests/README.md`).
- Real APNs delivery (no push certs/provisioning profile).
- `supabase db reset` against an actual Postgres instance (SQL was
  reviewed carefully for syntax/ordering but not executed here — no
  `psql`/Supabase CLI in this sandbox).

## Known issues / what should be built next

1. Run the migration against a real Supabase project and fix anything a
   live Postgres catches that manual review didn't (policy typos,
   constraint ordering).
2. Wire a real `CLAUDE_API_KEY` and run the extraction test scenarios live
   to tune prompt wording against actual model behavior — the validation
   layer is solid, but prompt quality is best iterated against a live
   model.
3. Open `ios/Hearth` in Xcode, run `xcodegen generate`, resolve the
   `supabase-swift` SPM dependency, and fix any compile errors — this is
   real, complete Swift, but it has not been compiled by a Swift compiler
   in this pass.
4. APNs: provision certs/keys, fill in `push-dispatch`'s auth (currently
   structured for token-based HTTP/2 APNs auth with the key id/team id read
   from env, but untestable here).
5. Accessibility pass (VoiceOver labels), and a11y/dark-mode visual QA on
   a real device/simulator.
6. Image attachments, Apple/Google Calendar sync, recurring-event
   expansion, family briefing — deferred per brief §30, schema is ready.
7. Add server-side rate limiting/backoff tuning for the Claude API once
   real usage patterns are observable (doc 6 §6.7 cost controls are in
   place but the specific daily-cap number is a starting guess).

## Slice ordering rationale

Slices 1-3 establish the "boring but essential" substrate (auth, chat,
calendar) fully working with zero AI involvement — this is deliberately a
usable, if unremarkable, family chat+calendar app on its own, so the AI
layer (4-7) is additive risk on top of a working product rather than a
single all-or-nothing feature. Slice 6 (provenance linking) is pulled
forward to ship with 4-5 rather than after, because "created from chat" is
structurally part of the extraction pipeline's data model (the FK exists
from the first `calendar_events` write an extraction makes) — there's no
real slice boundary between 5 and 6 in the implementation, only in the UI
surface (the "View Event"/"Created from chat" links), so both are covered
together.
