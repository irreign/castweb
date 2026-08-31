# 5. Database Schema

Full DDL lives in `supabase/migrations/0001_init.sql` — this is the
reference/rationale doc; that file is the source of truth.

## 5.1 Entity overview

```
users (mirrors auth.users, 1:1)
  └─< family_members >─ families
                            └─< invites
families
  └─< conversations (V1: exactly one per family, schema allows more)
        └─< conversation_members
        └─< messages >── replies to → messages (self-FK)
              └─< ai_extractions ── may produce ──> calendar_events
families
  └─< calendar_events
        └─< event_participants >─ family_members
users
  └─< device_push_tokens
users
  └─< notification_preferences (per family)
```

## 5.2 Table notes

- **`users`** — a thin public-schema mirror of `auth.users` (id, display
  name, avatar_url, created_at), populated by a trigger on
  `auth.users` insert. Nothing else in the schema references `auth.users`
  directly, so RLS policies and foreign keys stay in the public schema.
- **`families`** — `timezone` (IANA string, e.g. `Asia/Singapore`) is
  required and drives all date resolution (doc 6.8); `settings jsonb`
  holds the AI-behaviour config (`auto_add_enabled`, `auto_add_threshold`)
  so new settings don't require a migration.
- **`family_members`** — join table with `role` (`owner`/`adult`/`child`)
  and `status` (`active`/`removed`) rather than hard-deleting on removal,
  preserving historical provenance (a removed member's past messages/events
  keep a valid `created_by`).
- **`conversations`** / **`conversation_members`** — modeled as real
  many-to-many even though V1 UI only ever creates one conversation per
  family at family-creation time (doc 4.2 rationale).
- **`messages`** — `client_id uuid` (unique per `sender_id`) for
  send-idempotency (doc 8.4); `reply_to_message_id` self-FK for
  quote/reply; `deleted_at`/`edited_at` for soft delete/edit history
  rather than destructive updates (needed for "created from chat" links to
  stay valid even if the source message is later edited); `attachments
  jsonb` unused placeholder for future images (brief §5/§30).
- **`calendar_events`** — carries every field brief §10 lists explicitly,
  plus `source_message_id` (nullable FK to `messages`, the provenance
  link), `ai_generated boolean`, `ai_confidence numeric`, `status`
  (`confirmed`/`cancelled`), and optimistic-concurrency `updated_at` (doc
  10). `recurrence_rule text` stores a simple RFC5545-ish string; V1 UI
  does not expand recurrence into multiple instances (out of scope, doc
  10), it's stored for forward compatibility only.
- **`event_participants`** — many-to-many `calendar_events` ↔
  `family_members`, so the calendar can show per-member avatars (brief
  §11) without overloading `calendar_events` with array columns.
- **`ai_extractions`** — the audit/provenance table required by brief §10
  and the idempotency backbone of doc 6/8: one row per evaluated message
  (`message_id` unique), `raw_result jsonb` (exactly what the model
  returned), `validated_result jsonb` (post-validation, what we acted on),
  `status` (`silent`/`pending`/`resolved`/`ignored`/`duplicate`/`failed`/
  `auto_added`), `resulting_event_id` nullable FK, `resolved_by` nullable
  FK to the user who tapped Add/Ignore/Update.
- **`invites`** — `token` (random, unique), `max_uses`, `use_count`,
  `expires_at`, `created_by`.
- **`device_push_tokens`** / **`notification_preferences`** — per-user,
  per-category (`new_message`, `event_added`, `event_upcoming`,
  `event_changed`, `clarification_needed`) boolean opt-outs (brief §15).

## 5.3 Conventions

- UUID primary keys (`gen_random_uuid()`) everywhere.
- `created_at timestamptz not null default now()` on every table;
  `updated_at timestamptz` (with a trigger to bump it on UPDATE) on every
  mutable table.
- Foreign keys `on delete cascade` where the child row is meaningless
  without the parent (e.g. `conversation_members`), `on delete set null`
  or `restrict` where history should survive (e.g.
  `calendar_events.source_message_id` uses `set null` so deleting a very
  old message — if that's ever allowed — doesn't cascade-delete the event
  it created; `ai_extractions.message_id` cascades since an extraction is
  meaningless without its message).
- Indexes: every foreign key, plus `messages (conversation_id, created_at
  desc)` for pagination, `calendar_events (family_id, start_date)` for
  calendar range queries, `ai_extractions (message_id)` unique, `invites
  (token)` unique.
- RLS enabled on every table, default-deny, policies keyed off
  `family_members` membership as described in doc 7.3. `security definer`
  Postgres functions are used only for the handful of operations that
  legitimately need to cross a user's own RLS boundary in a controlled way
  (invite redemption, role-change safety check) — never as a blanket
  bypass.
