# Hearth — Family Chat + AI Shared Calendar

Hearth is a private family messaging app whose defining feature is that ordinary
conversation quietly becomes a shared family calendar. This directory is the
Phase 1 architecture package requested in the build brief, produced before any
significant code was written.

Read in this order:

1. [01-product-requirements.md](./01-product-requirements.md)
2. [02-user-journeys.md](./02-user-journeys.md)
3. [03-screen-map.md](./03-screen-map.md)
4. [04-technical-architecture.md](./04-technical-architecture.md)
5. [05-database-schema.md](./05-database-schema.md)
6. [06-ai-extraction-architecture.md](./06-ai-extraction-architecture.md)
7. [07-security-model.md](./07-security-model.md)
8. [08-api-design.md](./08-api-design.md)
9. [09-development-plan.md](./09-development-plan.md)
10. [10-failure-modes.md](./10-failure-modes.md)

## Where things live

```
docs/                      ← this package
supabase/
  migrations/               ← Postgres schema + RLS (source of truth for the DB)
  functions/                ← Edge Functions (Deno/TypeScript) — the only code
                               that talks to the Claude API
  config.toml               ← local Supabase project config + webhook wiring
ios/Hearth/                 ← SwiftUI client (MVVM), XcodeGen project spec
tests/                      ← Node-runnable tests for the AI extraction/
                               validation logic described in doc 6
```

## Naming

The brief avoids WhatsApp branding by design. The product is called **Hearth**
internally (bundle id `com.irreign.hearth`) — a private, calm place a family
gathers. This is a placeholder brand the team can swap freely; nothing in the
architecture depends on the name.

## A note on scope

This is architected and built as a real, working MVP, not a slide deck. Every
slice in doc 9 that is marked "built" has actual code behind it in this repo:
a runnable Postgres schema with RLS, deployable Edge Functions with a tested
validation layer, and a SwiftUI app whose views are wired to real view models
and a real Supabase client — not mocked screens. What is *not* included is
anything the brief explicitly deferred (§30), and anything that requires
infrastructure this sandbox cannot provide (an Apple Developer account, a
live Supabase project, a live Claude API key, a macOS/Xcode toolchain to
compile and run the app). Those integration points are wired up correctly
and documented, but cannot be exercised end-to-end from here — see
doc 9 "What could not be verified in this environment".
