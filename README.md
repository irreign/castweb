# Nexus Logic — AI Enquiry-to-Booking

Multi-tenant SaaS for licensed Singapore maid agencies: every enquiry gets a response, every serious prospect gets qualified,
every next step gets followed up. An agency can receive an enquiry (website chat or WhatsApp), have it answered from **approved
knowledge only**, capture a consented lead, book a real consultation, and see the outcome in its dashboard.

It is software for agencies, not a placement marketplace: nothing here matches helpers to employers, processes work passes, or promises
availability, fees, eligibility or outcomes.

## 1. Audit of the repository (as found)

| Area | Finding |
|---|---|
| Contents | One file: `index.html` — a static marketing page for **CastWeb** ("Websites for Singapore SMEs"). *Note:* the brief refers to an existing "Nexus Logic" site; this repository contains the CastWeb page instead. It was left **byte-for-byte untouched** (an automated test enforces this). |
| Stack / deploy | No `package.json`, framework, build, Cloudflare config, CI or tests. Git history suggests static hosting (file uploaded and renamed `index.html`). The real deployment target of the marketing page is unknown. |
| Existing integrations | **None.** No Twilio, voice agent, WhatsApp (only a `wa.me` link with a placeholder number), webhook, knowledge base, database, auth or secrets handling. |
| Debt / risks in the page | Contact form is non-functional (no action, button does nothing); placeholder phone `6591234567` and UEN `202600000X`; "Privacy Policy" links to `#`; testimonials/prices are unverified marketing copy. |
| Tests/build before changes | Nothing to run. |

Because there was nothing to reuse, this is a greenfield build on the stack the brief preferred: **Cloudflare Workers + D1 (+ optional R2)**,
one provider, near-zero idle cost.

## 2. Architecture

```
Browser ─┬─ /            CastWeb marketing page (unchanged)
         ├─ /app/        Agency app (vanilla ES modules, no build step; all DOM built with text nodes → no stored XSS)
         ├─ /widget/*    Embeddable chat: v1.js loader → iframe (/widget/frame) on OUR origin → no CORS, no credentials in host page
         └─ /api/*  ──►  Cloudflare Worker (Hono + zod)
                          ├─ /api/auth      sessions (PBKDF2, HttpOnly cookie, lockout, CSRF guard)
                          ├─ /api/app       private API; tenantId comes ONLY from the session, never from the request
                          ├─ /api/public    widget API (tenant public key + per-conversation secret token, rate limited)
                          ├─ /api/webhooks  WhatsApp Cloud API (HMAC-verified, idempotent, retryable)
                          └─ /api/platform  operator-only tenant provisioning (secret bearer token)
                         D1 (SQLite)  ·  R2 (optional original uploads)  ·  Cron (every 10 min: notification retries, webhook recovery, retention)
```

Why this fits: matches the brief's preferred stack, keeps one infrastructure provider, D1's single-writer semantics + SQL constraints give
safe booking, no queue/vector DB/workflow engine is needed at pilot scale (retrieval is BM25 over a tenant's own chunks; D1 rows + cron cover retries).

Key design decisions
* **Tenant isolation**: every table has `tenant_id`; every query filters on it; ids from URLs are always looked up *with* the session tenant. Tests attack every endpoint family cross-tenant.
* **AI is advisory**: the model returns a strict JSON object (forced tool call). The backend validates it, retrieves only the tenant's *published, ready* sources, rejects answers citing unknown sources, containing figures not in the sources, guarantees, or booking claims, and only performs whitelisted writes (validated lead fields, `new → qualified`). The model cannot create bookings, change arbitrary status, or call anything else. Without an API key the assistant **quotes approved text verbatim** (extractive mode) — it never invents.
* **Bookings**: availability is recomputed server-side immediately before writing; the write is a single conditional `INSERT … WHERE NOT EXISTS (overlap)` plus a unique-index backstop, batched with the lead update in a transaction. Idempotency keys make retries safe; reschedule is atomic. A booking is shown as confirmed only after the row exists.
* **Notifications are honest**: `bookings.notification_status` is `sent` only when the provider accepted the email; otherwise `failed`/`not_configured`.
* **Privacy**: AI disclosure in the widget; consent required before any lead is created from web chat; append-only consent records; WhatsApp STOP/START; no NRIC/FIN fields exist; messages not used for training; retention job; per-person erasure.
* **No fake analytics**: all metrics are SQL over real rows with in-product definitions; revenue is deliberately absent; demo tenants carry a permanent DEMO banner; admin-preview chats are excluded from reports.

## 3. What works (all covered by tests)

Leads (7-status pipeline with validated transitions, search/filter/sort/pagination, notes, audit history, next-action → follow-up tasks) ·
Conversations (timeline, assign, resolve, handoff, follow-up, staff reply with delivery status) · Bookings (calendar + list, create/cancel/reschedule, outcomes) ·
Follow-ups (overdue flags, completion) · Knowledge base (FAQ, text, `.txt/.md/.csv/.html` upload, public web page import, versioning, publish gate, failed-processing errors, test console) ·
AI assistant settings + live preview · Reports · Settings (profile, hours, consultation, team/roles/availability, branding, channels, privacy/limits, usage, activity log) ·
Website widget · WhatsApp adapter (Cloud API) · Usage metering and monthly limits.

Not built (see `docs/ROADMAP.md`): voice, billing, customer self-service cancel, PDF/DOCX parsing, external calendar sync, outbound reminder campaigns.

## 4. Repository map

```
index.html                  CastWeb marketing page (unchanged)
migrations/0001_init.sql    schema (apply with wrangler d1 migrations)
src/                        Worker: index.ts, auth.ts, settings.ts, time.ts, routes/*, services/*, providers/* (ai, whatsapp, email)
web/app/                    agency app;  web/widget/  chat widget
scripts/build.mjs           assembles ./dist (marketing + app + widget);  scripts/seed-demo.mjs  flagged demo data
test/                       vitest suites (+ test/e2e Playwright journey)
docs/                       DEPLOYMENT.md, PILOT-CHECKLIST.md, ROADMAP.md
```

## 5. Develop & test

```bash
npm install
cp .dev.vars.example .dev.vars          # local dummy secrets
npm run db:migrate:local
npm run dev                             # http://127.0.0.1:8787  (app at /app/)
npm run typecheck && npm test           # unit/integration suites (SQLite-backed D1 shim, real migrations)
CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # real browser + real workerd runtime
```
Provision a first agency locally:
`curl -X POST localhost:8787/api/platform/tenants -H "authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H 'content-type: application/json' -d '{"agencyName":"Acme Maids","slug":"acme","ownerName":"Owner","ownerEmail":"owner@acme.sg"}'` → open the returned `inviteUrl`.
