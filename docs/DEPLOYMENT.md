# Deployment, configuration, rollback

## 1. Environment variables / secrets (names only)

| Name | Required | Purpose |
|---|---|---|
| `PLATFORM_ADMIN_TOKEN` | **Yes** | Authorises `POST /api/platform/tenants` (onboarding). Long random string. |
| `ENCRYPTION_KEY` | For WhatsApp | base64 of 32 random bytes (`openssl rand -base64 32`). Encrypts per-agency WhatsApp tokens (AES-GCM). Losing it means re-entering tokens. |
| `ANTHROPIC_API_KEY` | Optional | Enables the AI model. Without it the assistant quotes approved sources verbatim. `ANTHROPIC_MODEL` optional (default `claude-haiku-5-5`). |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Booking/handoff email. Without them notifications are recorded as `not_configured` (never "sent"). |
| `WHATSAPP_APP_SECRET` | For WhatsApp | Meta app secret; webhook signatures are verified with it. Webhook **rejects everything** (503) if unset. |
| `WHATSAPP_VERIFY_TOKEN` | For WhatsApp | Value you type into Meta's webhook setup. |
| `WHATSAPP_MODE` | Optional | `test` = nothing is sent to WhatsApp (safe integration testing). Leave unset in production. |

Set with `npx wrangler secret put NAME`. Never commit values; `.dev.vars` is git-ignored.

## 2. First deployment

```bash
npx wrangler login
npx wrangler d1 create nexus-enquiry          # copy database_id into wrangler.toml
# optional uploads archive:  npx wrangler r2 bucket create nexus-enquiry-files  (then uncomment [[r2_buckets]])
npm ci && npm run typecheck && npm test
npm run db:migrate:remote                     # applies migrations/ (idempotent; tracked in d1_migrations)
npx wrangler secret put PLATFORM_ADMIN_TOKEN  # + the others you need
npm run deploy                                # builds ./dist and deploys the Worker + static assets
```
Routing: the Worker serves `/api/*` and `/widget/*` first and falls back to static assets (`/` = CastWeb page, `/app/` = agency app). Attach your domain (e.g. `app.nexuslogic.sg`) in Cloudflare → Workers → Domains.
**Decision for the owner:** the marketing page at `/` is served unchanged. If CastWeb is currently hosted elsewhere (e.g. GitHub Pages), keep it there and use this Worker only on an `app.` subdomain.

## 3. Onboarding an agency (no code changes)

```bash
curl -X POST https://APP/api/platform/tenants -H "authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"agencyName":"Acme Maids","slug":"acme","ownerName":"Owner Name","ownerEmail":"owner@acme.sg"}'
```
Returns `inviteUrl` (7 days, single use) and `widgetKey`. The owner sets a password, then: Settings → hours/consultation/team → Knowledge Base → publish → Branding & website chat (copy snippet, set allowed origins) → optionally Channels → WhatsApp.

Embed snippet (shown in Settings): `<script src="https://APP/widget/v1.js" data-agency="pk_…" async></script>`
Restrict embedding by listing the agency's website origins in Settings → Branding (enforced with CSP `frame-ancestors`).

## 4. WhatsApp Business Cloud API setup (owner/Meta side)

1. Meta Business account + verified business; create a Meta app with the WhatsApp product; add a phone number (display name approved).
2. Copy **Phone number ID** and create a **permanent system-user access token** (`whatsapp_business_messaging`, `whatsapp_business_management`).
3. Set secrets `WHATSAPP_APP_SECRET` (App settings → Basic) and `WHATSAPP_VERIFY_TOKEN` (you choose).
4. In Meta → WhatsApp → Configuration: callback URL `https://APP/api/webhooks/whatsapp`, verify token as above, subscribe to **messages**.
5. In the app: Settings → Communication channels → enter Phone number ID + token. Test with `WHATSAPP_MODE=test` first.
6. Create and get approved any **message templates** needed for outside the 24-hour window (the app blocks free-text sends outside it).
Customers who send STOP are never messaged until they send START.

## 5. Migrations & rollback

* Migrations are forward-only SQL files in `migrations/`; apply with `npm run db:migrate:remote`. Verified locally against D1 (`wrangler d1 migrations apply --local`) and in tests (real SQLite).
* **Code rollback**: `npx wrangler rollback` (previous Worker version) or redeploy a prior git tag. Static assets roll back with the same version.
* **Schema rollback**: write a new forward migration. Before any risky migration take a point-in-time snapshot: D1 Time Travel (`npx wrangler d1 time-travel info nexus-enquiry`, `… restore --timestamp=…`), plus `wrangler d1 export` for an off-platform copy.
* Keep migrations backwards compatible with the previous Worker version (add columns/tables first, remove later) so code rollback is always safe.

## 6. Production smoke test (5 minutes)

1. `curl https://APP/api/health` → `{"ok":true,"db":true}`.
2. `https://APP/` shows the marketing page; `https://APP/app/` shows sign-in.
3. Provision a throw-away agency (slug `smoke-…`), accept the invite, sign in.
4. Knowledge → add FAQ → test question → publish. Settings → Branding → preview chat answers it with a source.
5. Public widget on a test page: ask the FAQ, ask something unknown (must say it doesn't know), tick consent, book a slot → "confirmed" appears **only** after the app shows the booking in Bookings.
6. Bookings → cancel it. Leads → open the lead, add a next action; Follow-ups shows it.
7. (If configured) send a WhatsApp message to the number → appears in Conversations with delivery status; send STOP and confirm staff replies are blocked.
8. `npx wrangler tail` shows no `unhandled_error` lines. Delete the throw-away agency's data (Leads → Erase personal data) or leave it suspended.

## 7. Operations

* Logs contain request paths and short error reasons only — never message bodies, tokens or secrets.
* Cron (`*/10`) retries notifications (≤5 attempts), replays failed WhatsApp events (≤5 attempts), purges expired sessions/rate-limit rows, applies per-agency retention.
* Cost levers: per-agency monthly caps (Settings → Privacy & limits); usage is metered in `usage_records` (AI calls/tokens, messages, emails, documents) and visible per agency. Measure real provider costs for a month before quoting margins.
* Rate limits (D1 counters): public chat 40 msg/5 min/IP, 15 new chats/10 min/IP, login 20/10 min/IP + account lockout after 8 failures.
