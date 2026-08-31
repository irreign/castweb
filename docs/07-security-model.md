# 7. Security Model

## 7.1 Principles (brief §17)

- All family data is private by default: no public profiles, no discovery,
  no cross-family visibility, no ads, no data sale.
- The iOS app never holds a Claude API key or a Supabase *service role* key.
  It holds only the Supabase anon/public key (safe by design — it grants
  nothing without a valid user session + RLS) and a per-user JWT.
- Every privileged operation (calling Claude, sending push notifications,
  minting invite tokens with elevated scope) happens in an Edge Function
  running under the service role, never on-device.

## 7.2 AuthN

- Supabase Auth (email/password + email magic link). Session JWTs are
  short-lived access tokens + refresh tokens, stored in iOS Keychain only
  (never `UserDefaults`).
- Edge Functions that must act as a specific user verify the caller's JWT
  (`Authorization: Bearer <jwt>`) via Supabase's built-in verification and
  read `auth.uid()` from it; functions that must act with elevated
  privilege (writing an AI-derived event, sending a push) use the service
  role key, which lives only in the Edge Function's environment secrets,
  never in a response body or log.

## 7.3 AuthZ — Row Level Security

RLS is the primary authorization boundary, not an app-layer check. The
rule, uniformly, is: **a row is visible/writable only to authenticated
users who are an active member (`family_members.status = 'active'`) of the
family that row belongs to** (directly, or transitively through
`conversation_id → conversations.family_id`, `event_id → calendar_events →
family_id`, etc.). See `supabase/migrations/0001_init.sql` for the actual
policies; every table in doc 5 has RLS enabled with no default-allow.

Write-side rules layered on top of "must be a member":

- `messages.sender_id` must equal `auth.uid()` on insert; only the sender
  (or an Owner, for moderation) may soft-delete/edit their own message,
  and only within a configurable edit window.
- `calendar_events` insert/update: any `adult`/`owner` member of the family
  may create/edit; `child` role is read-only (doc 2.9). AI-authored writes
  go through the service role inside `ai-extract`, which enforces the same
  business rules server-side before writing (never trusts the client to
  have already validated).
- `family_members` role changes: `owner` only, and an owner cannot demote
  themselves below the family's last remaining owner (checked in a
  Postgres function, not just client-side).
- `invites`: creatable by `owner`/`adult`, redeemable once per token (or
  up to `max_uses`), and expire server-side (`expires_at` checked in the
  redeem function, not just filtered client-side).

## 7.4 Data minimization to the AI

Per brief §17/§20, the extraction call never receives the whole family
history. It receives:

- The triggering message text + sender display name + timestamp.
- The last N (default 15) messages in the same conversation, each reduced
  to `{sender_display_name, text, created_at}` — no message IDs beyond what's
  needed for the response's back-reference, no other family metadata (no
  emails, no phone numbers, no auth IDs).
- A compact list of *upcoming* structured events (title, date, category,
  id) for correction/duplicate matching — not full event history.
- The family's timezone (needed for correct relative-date resolution).

No historical chat is bulk-exported to Claude for training or logging
purposes; provider-side data retention is governed by using the Claude API
(not consumer Claude) — the team should confirm Anthropic's API data
retention/zero-retention terms fit the product's privacy commitments before
GA, but no product code performs additional retention beyond §7.6.

## 7.5 Transport & storage

- TLS everywhere (enforced by Supabase's HTTPS-only endpoints and iOS
  App Transport Security defaults — no ATS exceptions).
- Postgres data at rest is encrypted by the hosting provider (Supabase/AWS
  RDS-class storage) — no additional app-layer encryption in V1 (see doc
  10 for the E2EE tradeoff note).
- Push tokens (`device_push_tokens`) are stored server-side only, scoped by
  RLS to the owning user, and are the sole use of APNs — no third-party
  push relay.

## 7.6 Logging

- Edge Functions log request outcomes (status, latency, extraction
  confidence, error class) but never log full message bodies or Claude's
  raw response at `info` level. `debug`-level payload logging is behind an
  env flag that must be off in production, and even then redacts anything
  that looks like the free-text message content beyond the first ~40
  chars, kept only for local debugging of parsing failures.

## 7.7 Roles (brief §16)

| Role | Chat | Calendar | Family | Settings |
|---|---|---|---|---|
| Owner | full | full + role management | invite, remove members, manage roles | all, incl. family deletion |
| Adult | full | create/edit/delete events | invite, view members | notification/AI prefs for self |
| Child | send/read, no delete-others | view only | view members | notification prefs for self only |

Kept intentionally simple (brief §16 "keep permissions simple in V1") —
this is a table-driven check in one place (`Permissions.swift` client-side
for UX gating, mirrored exactly in RLS/Edge Function policy for the real
enforcement), not scattered conditionals.
