# Hearth backend (Supabase)

See `docs/04-technical-architecture.md` and `docs/08-api-design.md` for the
full design. This is the local dev / deploy quick-reference.

## Local dev loop

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start                 # boots local Postgres/Auth/Realtime/Studio
supabase db reset              # applies migrations/0001_init.sql fresh
supabase functions serve       # serves all functions/ locally, hot-reloading
```

Studio (local Postgres/Auth browser) is at http://localhost:54323 by
default (see `config.toml`).

## Required secrets (Edge Function env)

Never commit these. Set locally via `supabase/.env.local` (gitignored) for
`functions serve`, and via the Supabase Dashboard's Edge Function secrets
(or `supabase secrets set`) for a deployed project.

| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | all | auto-populated by the CLI locally |
| `SUPABASE_ANON_KEY` | ai-assistant, invite | for the user-scoped client |
| `SUPABASE_SERVICE_ROLE_KEY` | ai-extract, ai-assistant, push-dispatch | never exposed to the client, ever |
| `CLAUDE_API_KEY` | ai-extract, ai-assistant | Anthropic API key |
| `CLAUDE_EXTRACTION_MODEL` / `CLAUDE_ASSISTANT_MODEL` | ai-extract, ai-assistant | optional override, defaults to `claude-sonnet-5` |
| `DB_WEBHOOK_SECRET` | ai-extract, push-dispatch | shared secret checked against the `x-webhook-secret` header — configure the same value in each Database Webhook |
| `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` / `APNS_PRIVATE_KEY` / `APNS_ENVIRONMENT` | push-dispatch | token-based APNs auth; `APNS_PRIVATE_KEY` is the full `.p8` PEM contents |

## Wiring the Database Webhooks (hosted project)

In the Supabase Dashboard → Database → Webhooks, create (see
`config.toml`'s comment block for the exact table/event/function map):

1. `messages` INSERT → `ai-extract`, header `x-webhook-secret: <DB_WEBHOOK_SECRET>`
2. `messages` INSERT → `push-dispatch`, same header
3. `calendar_events` INSERT, UPDATE → `push-dispatch`, same header
4. `ai_extractions` INSERT → `push-dispatch`, same header

For the "upcoming event" reminder (not a row-change event), schedule an
hourly job — a Postgres `pg_cron` job calling `net.http_post` against
`push-dispatch` with `{"type":"CRON_UPCOMING_EVENTS"}`, or an external
scheduler — Cloudflare Workers Cron Triggers is a reasonable, already-in-
the-brief choice (docs/04 §4.1).

## Deploying

```bash
supabase link --project-ref <your-project-ref>
supabase db push                      # migrations
supabase functions deploy ai-extract ai-assistant invite push-dispatch
```

## Manually exercising the extraction pipeline

`ai-extract` is designed to be fired by a webhook, but you can invoke it
directly while testing (it only needs a message id that already exists):

```bash
curl -X POST http://localhost:54321/functions/v1/ai-extract \
  -H "x-webhook-secret: $DB_WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{"message_id": "<uuid of a real messages row>"}'
```

This is the fastest way to run the brief §29 demo sentences against a real
model once `CLAUDE_API_KEY` is set (see `tests/README.md`).
