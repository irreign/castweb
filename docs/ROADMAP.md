# Remaining work

## Blockers before a *paid* launch (not before a supervised pilot)
1. **Legal review** of consent/notice wording, DPA and terms (PDPA; agency is controller). Owner action.
2. **Email sender domain** (Resend or alternative) so booking confirmations really deliver. Without it everything works but shows "Email off".
3. **WhatsApp go-live**: Meta business verification, number, approved templates (external lead time of days–weeks). The adapter, signatures, idempotency, opt-out and recovery are built and tested in test mode; live sending has *not* been exercised against Meta.
4. **Real-model quality pass**: with `ANTHROPIC_API_KEY` set, run ~50 representative questions per agency and review. The guards are tested with a scripted model; live model behaviour is unverified here.
5. **Operational**: error alerting (e.g. Workers Logpush/Sentry), backups routine (D1 Time Travel + weekly export), password-reset flow (currently the operator re-issues an invite).
6. **Marketing page**: contact form is non-functional, placeholder phone/UEN, no privacy policy (pre-existing).

## Should-have (soon after pilot)
* Customer self-service reschedule/cancel link; reminder emails/WhatsApp templates before consultations (needs template + consent rules).
* PDF/DOCX ingestion (needs a parser; Workers-friendly option or external conversion); scheduled website re-crawl.
* Google/Outlook calendar sync behind the existing booking-service boundary (`createBooking`/`availableSlots`).
* Per-consultant lead visibility rules; bulk actions; CSV export.
* Billing (usage-based) using `usage_records`; plan limits already enforced per agency.
* Move rate limiting to the Workers Rate Limiting binding if traffic grows; Durable Object for strict per-tenant ordering if needed.
* Strengthen retrieval (synonyms per agency, optional embeddings) only if measured misses justify it.

## Phase 2 — voice (not started; nothing existing to reuse)
The repository contained no Twilio/voice code. Plan: Twilio number → Worker webhook (signature-verified like WhatsApp) → streaming speech-to-text/LLM/text-to-speech provider behind the same `handleCustomerMessage` service (so the same approved knowledge, handoff, lead and booking rules apply) → call summary stored as a conversation (`channel = 'voice'` already exists in the schema), call outcome + `voice_seconds` usage recorded only when the provider confirms. Success/handoff/booking must only be reported from provider/backend confirmation, never from the model.

## Known limitations (honest list)
* Retrieval is lexical (BM25 with a small synonym list); paraphrased questions can miss → the assistant says it doesn't know and offers a person (safe failure).
* Reply/answer quality with a live model is untested here; extractive mode quotes the best-matching passage verbatim.
* Calendar view assumes the browser's week boundaries; times are displayed in the agency timezone.
* Admin preview chats are excluded from reports but still consume AI calls.
* `wrangler dev` could not reach Cloudflare telemetry in the sandbox (harmless).
