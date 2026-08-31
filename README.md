# Hearth — Family Chat + AI Shared Calendar

> A private family chat app where normal conversation quietly becomes a
> shared family calendar. Built to the brief in this repo's task history:
> a native iOS MVP on Supabase + Claude, architected as a Family Operating
> System rather than a WhatsApp clone.

**Start here:** [`docs/README.md`](docs/README.md) — the Phase 1
architecture package (product requirements, user journeys, screen map,
technical architecture, database schema, AI extraction design, security
model, API design, development plan, failure modes), written before any
significant code, as the brief's methodology (§26) required.

## A note on this repository

This repo's existing content (`index.html`) is an unrelated static
marketing site for a different product ("CastWeb"). Hearth is built
alongside it, in its own directories, without touching that file — see
the bottom of this README for why that seemed like the right call rather
than stopping to ask.

## What's here

```
docs/           Phase 1 architecture package — read this first
supabase/       Postgres schema + RLS, and the Edge Functions (Deno/TS)
                that are the only code allowed to call the Claude API
ios/Hearth/     SwiftUI/MVVM client, XcodeGen project spec
tests/          Node-runnable tests for the AI extraction/validation logic
```

## Quick orientation by slice (docs/09-development-plan.md)

| Slice | Where |
|---|---|
| 1. Auth + family creation | `supabase/migrations/0001_init.sql` (`create_family`, `redeem_invite`), `ios/.../Features/Auth`, `App/AppState.swift` |
| 2. Realtime family chat | `supabase/migrations/0001_init.sql` (`messages`), `ios/.../Features/Chat` |
| 3. Shared calendar | `supabase/migrations/0001_init.sql` (`calendar_events`), `ios/.../Features/Calendar` |
| 4. AI event detection | `supabase/functions/_shared/{extraction,dates}.ts`, `supabase/functions/ai-extract` |
| 5. AI confirmation cards | `ios/.../Features/Chat/Event*CardView.swift` |
| 6. Event ↔ source message linking | `calendar_events.source_message_id`, `EventDetailView.swift` "Created from chat" |
| 7. AI family questions | `supabase/functions/ai-assistant`, `ChatViewModel.looksLikeAssistantQuestion` |
| 8. Notifications | `supabase/functions/push-dispatch`, `ios/.../Features/Settings/NotificationSettingsView.swift` |
| 9. Polish/testing/security | `supabase/migrations/0001_init.sql` RLS policies, `tests/`, `ios/Hearth/HearthTests/` |

## Running what can actually run here

```bash
npm test   # the AI extraction/validation/date-resolution test suite (33 tests, all passing)
```

This is the one part of the stack this sandbox could fully build *and*
verify — see `tests/README.md` for what it does and doesn't prove. The
Postgres schema, Edge Functions, and iOS app are complete, real code, but
none of them could be compiled or run end-to-end here (no Supabase
project, no Claude API key, no Apple Developer account, no macOS/Xcode).
`docs/09-development-plan.md` spells out exactly what's built vs. what
still needs a first real run against live infrastructure, and what to fix
if that first run finds something.

## Why build this alongside an unrelated site instead of asking first

The task specified an exact branch on this exact repo with instructions
to develop and push there; the repo's prior content is a finished,
unrelated marketing page that Hearth doesn't touch or depend on in any
way. Stopping mid-build to ask "are you sure you meant this repo" over a
harmless, additive, easily-undone directory structure would have cost a
full round trip for a question with an obvious answer once you see that
nothing was overwritten. If `index.html` was meant to be replaced instead
of coexisting with, that's a one-line follow-up, not a redo.
