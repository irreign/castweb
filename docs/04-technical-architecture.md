# 4. Technical Architecture

## 4.1 System diagram

```
┌─────────────────┐        Realtime (WS)        ┌──────────────────────┐
│                  │◄────────────────────────────┤                      │
│   iOS App        │        Postgres over         │   Supabase Project   │
│   SwiftUI/MVVM    │────────REST/RPC─────────────►│  (Auth, Postgres,    │
│                  │        (anon key + JWT)      │   Realtime, Storage*) │
└────────┬─────────┘                              └──────────┬───────────┘
         │                                                     │ DB Webhook
         │ HTTPS (service calls only,                          │ (row inserted
         │  never the Claude key)                              │  into messages)
         ▼                                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Supabase Edge Functions (Deno)                    │
│  ai-extract     — validates+calls Claude, writes ai_extractions/      │
│                    calendar_events, posts system card via Realtime    │
│  ai-assistant   — grounded Q&A over the family's real data            │
│  invite         — create/redeem invite tokens                        │
│  push-dispatch  — fan out APNs pushes from DB webhook events          │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ HTTPS (server-held API key)
                                 ▼
                         ┌───────────────┐
                         │  Claude API    │
                         │ (Messages API, │
                         │ tool/JSON mode)│
                         └───────────────┘
```
`*Storage` is provisioned for future image attachments (brief §5/§30) but
unused by any V1 code path.

Cloudflare is used only at the edge of this diagram, not inside it: DNS +
CDN in front of any future marketing/web surface, and optionally Cloudflare
as the APNs-push fan-out trigger source if the team prefers Workers Cron
over a DB webhook for the "upcoming event reminder" notification (see
push-dispatch design). Nothing in the core request path depends on it —
brief §3's "where useful" is intentionally satisfied minimally, since
introducing it on the Claude/DB path would add a hop with no benefit for a
single-region family app.

## 4.2 Why this shape

- **One conversation per family, not a DM/group-chat graph.** The brief's
  product is a family operating system, not a messenger; modeling
  `conversations`/`conversation_members` as a many-to-many keeps the schema
  correct and future-proof (a family could get a second conversation, e.g.
  "Kids only") without forcing that complexity into V1 UI, which shows
  exactly one.
- **Edge Functions, not a separate always-on backend service.** The brief
  explicitly asks for a small-team-maintainable architecture (§3, §19). A
  bespoke server (Node/Fastify etc.) would duplicate what Supabase already
  gives for free (authenticated Postgres access, Realtime, RLS) and add an
  extra service to deploy/monitor. Edge Functions are the minimal thing
  that can hold a secret and call Claude.
- **DB webhook triggers ai-extract, not a synchronous call from the
  client on send.** If the client called `ai-extract` directly after
  insert, a slow/failed client (backgrounded app, killed process) would
  silently skip extraction. A Postgres trigger → `pg_net`/Supabase DB
  Webhook → Edge Function fires server-side, independent of client
  liveness, and is naturally retryable. The client still gets the fast
  optimistic message send; extraction is decoupled and arrives via
  Realtime moments later, exactly matching the demo's "🤖 ... " card
  appearing after the message.
- **Realtime, not push, for in-app updates.** Chat and calendar both use
  Supabase Realtime (Postgres CDC over WebSocket) for live updates while
  the app is foregrounded; APNs is reserved for backgrounded/killed-app
  notification per brief §15, avoiding double-delivery logic for the
  common foregrounded case.
- **MVVM on the client.** Each screen has a `View` (SwiftUI, no business
  logic beyond layout/state binding) and an `ObservableObject` `ViewModel`
  owning all logic and talking only to `Services` (thin wrappers over the
  Supabase Swift SDK + our Edge Function HTTP calls). Models are plain
  `Codable` structs mirroring the Postgres tables. This keeps view models
  unit-testable without a simulator.

## 4.3 Repository layout

```
docs/                        Phase 1 architecture (this package)
supabase/
  config.toml                 local dev config + webhook bindings
  migrations/0001_init.sql    schema, indexes, RLS
  functions/
    _shared/                  types, Claude client, Supabase admin client,
                               extraction validation/date-resolution logic
                               (framework-agnostic — also unit tested from
                               Node, see tests/)
    ai-extract/                per-message pipeline (brief §6-§9, §22-§23)
    ai-assistant/               grounded Q&A (brief §13)
    invite/                     create/redeem invite links (brief §16)
    push-dispatch/               webhook → APNs fan-out (brief §15)
ios/Hearth/
  project.yml                 XcodeGen spec (see ios/Hearth/README.md)
  Sources/Hearth/
    App/                       app entry, DI root
    Core/Models/                Codable models mirroring Postgres tables
    Core/Services/               SupabaseClient wrapper, Auth/Chat/Calendar/
                                 Family/AI services, Keychain, Permissions
    Features/Auth/…
    Features/Chat/…
    Features/Calendar/…
    Features/Family/…
    Features/Settings/…
    Resources/                  Assets, Info.plist
tests/                         Node-runnable tests for _shared extraction logic
```

## 4.4 Environments & config

- Three Supabase projects in practice (dev/staging/prod), each with its own
  `SUPABASE_URL`/anon key baked into the iOS build via an `.xcconfig` per
  scheme, and its own `CLAUDE_API_KEY`/`APNS_*` secrets set only in that
  project's Edge Function secrets store — never checked into the repo.
- `supabase/config.toml` documents the local dev loop (`supabase start`,
  `supabase db reset`, `supabase functions serve`) so a solo dev can run
  the whole backend locally against the Supabase CLI's local Postgres.

## 4.5 Replaceability of the AI provider (brief §19)

`_shared/ai/provider.ts` defines a narrow interface:

```ts
interface ExtractionProvider {
  extract(input: ExtractionRequest): Promise<RawExtractionResult>;
}
interface AssistantProvider {
  answer(input: AssistantRequest): Promise<string>;
}
```

`_shared/ai/claude.ts` is the only file that imports the Anthropic SDK and
implements these interfaces. `ai-extract`/`ai-assistant` depend on the
interface, not the concrete class, so a future provider swap (or an
eval/mocked provider for tests) is a one-file change plus a DI wire-up,
never a change to validation, prompting policy, or business logic.
