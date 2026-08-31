-- Hearth — initial schema, indexes, and row level security.
-- See docs/05-database-schema.md for the rationale behind these choices.
-- Idempotent-ish: written for a fresh `supabase db reset`; not designed to
-- be re-run against an already-migrated database.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto;

-- ============================================================================
-- Enums
-- ============================================================================
create type public.family_role as enum ('owner', 'adult', 'child');
create type public.member_status as enum ('active', 'removed');
create type public.message_kind as enum ('user', 'system', 'assistant');
create type public.event_category as enum (
  'appointment', 'birthday', 'school', 'holiday', 'travel', 'leave',
  'dinner', 'meeting', 'activity', 'deadline', 'reminder', 'other'
);
create type public.event_status as enum ('confirmed', 'cancelled');
create type public.extraction_status as enum (
  'silent', 'pending', 'resolved', 'ignored', 'duplicate', 'failed', 'auto_added'
);

-- ============================================================================
-- Helpers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Tables
-- ============================================================================

-- users: thin mirror of auth.users, populated by trigger below.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'New User',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'UTC',
  -- { "auto_add_enabled": bool, "auto_add_threshold": number }
  settings jsonb not null default '{"auto_add_enabled": false, "auto_add_threshold": 0.95}'::jsonb,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.family_role not null default 'adult',
  status public.member_status not null default 'active',
  display_name text, -- optional family-scoped nickname override
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null default 'Family Chat',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  family_member_id uuid not null references public.family_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, family_member_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade, -- denormalized for RLS/index simplicity
  sender_id uuid references public.users (id) on delete set null,
  kind public.message_kind not null default 'user',
  client_id uuid, -- client-generated idempotency key, unique per sender
  body text,
  reply_to_message_id uuid references public.messages (id) on delete set null,
  attachments jsonb not null default '[]'::jsonb, -- reserved for future image support, unused in V1
  metadata jsonb not null default '{}'::jsonb, -- e.g. {"extraction_id": "...", "card_state": "pending"}
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sender_id, client_id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null,
  description text,
  start_date date not null,
  end_date date,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  location text,
  category public.event_category not null default 'other',
  recurrence_rule text, -- reserved for future recurrence expansion, not expanded in V1 UI
  status public.event_status not null default 'confirmed',
  created_by uuid references public.users (id) on delete set null,
  last_modified_by uuid references public.users (id) on delete set null,
  -- provenance: the message that caused this event to be created (brief §10)
  source_message_id uuid references public.messages (id) on delete set null,
  ai_generated boolean not null default false,
  ai_confidence numeric(4, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_order check (
    start_time is null or end_time is null or end_time >= start_time
  ),
  constraint calendar_events_date_order check (
    end_date is null or end_date >= start_date
  )
);

create table public.event_participants (
  event_id uuid not null references public.calendar_events (id) on delete cascade,
  family_member_id uuid not null references public.family_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, family_member_id)
);

create table public.ai_extractions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  status public.extraction_status not null default 'pending',
  raw_result jsonb, -- exactly what the model returned
  validated_result jsonb, -- post server-side validation/normalization
  confidence numeric(4, 3),
  needs_clarification boolean not null default false,
  clarification_question text,
  duplicate_of_event_id uuid references public.calendar_events (id) on delete set null,
  resulting_event_id uuid references public.calendar_events (id) on delete set null,
  -- the in-chat card (a 'system'-kind message) this extraction rendered as,
  -- if any — lets resolve_ai_extraction() flip the card in place for every
  -- device via Realtime, regardless of who resolves it (brief §12).
  card_message_id uuid references public.messages (id) on delete set null,
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz,
  provider text not null default 'claude',
  model text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.users (id),
  max_uses integer not null default 1,
  use_count integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  environment text not null default 'production', -- 'sandbox' | 'production'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create table public.notification_preferences (
  user_id uuid not null references public.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  new_message boolean not null default true,
  event_added boolean not null default true,
  event_upcoming boolean not null default true,
  event_changed boolean not null default true,
  clarification_needed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, family_id)
);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create trigger set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.families for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.family_members for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conversations for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.messages for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ai_extractions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.device_push_tokens for each row execute function public.set_updated_at();

-- ============================================================================
-- Indexes
-- ============================================================================
create index family_members_user_id_idx on public.family_members (user_id);
create index family_members_family_id_idx on public.family_members (family_id);
create index conversations_family_id_idx on public.conversations (family_id);
create index conversation_members_family_member_id_idx on public.conversation_members (family_member_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index messages_family_id_idx on public.messages (family_id);
create index messages_reply_to_idx on public.messages (reply_to_message_id);
create index calendar_events_family_start_idx on public.calendar_events (family_id, start_date);
create index calendar_events_source_message_idx on public.calendar_events (source_message_id);
create index event_participants_member_idx on public.event_participants (family_member_id);
create index ai_extractions_family_status_idx on public.ai_extractions (family_id, status);
create index invites_family_id_idx on public.invites (family_id);
create index device_push_tokens_user_id_idx on public.device_push_tokens (user_id);

-- ============================================================================
-- Auth trigger: keep public.users in sync with auth.users
-- ============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- RLS helper functions (SECURITY DEFINER: read-only membership checks that
-- intentionally cross a user's own row-visibility boundary in a controlled
-- way — see docs/07-security-model.md §7.3)
-- ============================================================================
create or replace function public.is_family_member(_family_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = _family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.current_family_role(_family_id uuid)
returns public.family_role
language sql stable security definer set search_path = public
as $$
  select fm.role from public.family_members fm
  where fm.family_id = _family_id
    and fm.user_id = auth.uid()
    and fm.status = 'active'
  limit 1;
$$;

-- ============================================================================
-- Role-safety triggers on family_members
-- ============================================================================
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and public.current_family_role(old.family_id) is distinct from 'owner' then
    raise exception 'only an owner can change member roles';
  end if;
  return new;
end;
$$;

create trigger family_members_guard_role
  before update on public.family_members
  for each row execute function public.prevent_self_role_escalation();

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
as $$
declare
  _other_owners int;
begin
  if (tg_op = 'UPDATE' and old.role = 'owner' and (new.role <> 'owner' or new.status <> 'active'))
     or (tg_op = 'DELETE' and old.role = 'owner') then
    select count(*) into _other_owners
    from public.family_members
    where family_id = old.family_id and role = 'owner' and status = 'active' and id <> old.id;

    if _other_owners = 0 then
      raise exception 'cannot remove the family''s last remaining owner';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger family_members_guard_last_owner
  before update or delete on public.family_members
  for each row execute function public.prevent_last_owner_removal();

-- ============================================================================
-- Transactional RPCs (SECURITY DEFINER — the only sanctioned way to cross
-- table-level RLS boundaries; every one of these re-derives auth.uid() from
-- the caller's JWT and re-checks membership/role itself, never trusting a
-- client-supplied id blindly. See docs/07-security-model.md and
-- docs/08-api-design.md.)
-- ============================================================================

-- Atomically creates a family, makes the caller its owner, and provisions
-- the family's single V1 conversation. Called from the client (via the
-- Supabase SDK's .rpc(), authenticated as the creating user) during
-- onboarding (docs/02-user-journeys.md §2.1).
create or replace function public.create_family(_name text, _timezone text default 'UTC')
returns public.families
language plpgsql security definer set search_path = public
as $$
declare
  _family public.families;
  _member_id uuid;
  _conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if length(trim(_name)) = 0 then
    raise exception 'family name is required';
  end if;

  insert into public.families (name, timezone, created_by)
  values (trim(_name), coalesce(nullif(trim(_timezone), ''), 'UTC'), auth.uid())
  returning * into _family;

  insert into public.family_members (family_id, user_id, role, status)
  values (_family.id, auth.uid(), 'owner', 'active')
  returning id into _member_id;

  insert into public.conversations (family_id, name, is_primary)
  values (_family.id, 'Family Chat', true)
  returning id into _conversation_id;

  insert into public.conversation_members (conversation_id, family_member_id)
  values (_conversation_id, _member_id);

  insert into public.notification_preferences (user_id, family_id)
  values (auth.uid(), _family.id)
  on conflict do nothing;

  return _family;
end;
$$;

-- Atomically redeems an invite token: validates expiry/use-count under a
-- row lock (so two simultaneous redeemers of a single-use link can't both
-- succeed), adds the caller to the family, and joins them to its
-- conversation. See docs/08-api-design.md §8.2, docs/10-failure-modes.md.
create or replace function public.redeem_invite(_token text)
returns public.families
language plpgsql security definer set search_path = public
as $$
declare
  _invite public.invites;
  _family public.families;
  _conversation_id uuid;
  _member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into _invite from public.invites where token = _token for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if _invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if _invite.use_count >= _invite.max_uses then
    raise exception 'invite_exhausted';
  end if;

  select * into _family from public.families where id = _invite.family_id;

  insert into public.family_members (family_id, user_id, role, status)
  values (_invite.family_id, auth.uid(), 'adult', 'active')
  on conflict (family_id, user_id) do update set status = 'active'
  returning id into _member_id;

  select id into _conversation_id from public.conversations
  where family_id = _invite.family_id and is_primary = true
  limit 1;

  if _conversation_id is not null then
    insert into public.conversation_members (conversation_id, family_member_id)
    values (_conversation_id, _member_id)
    on conflict do nothing;
  end if;

  insert into public.notification_preferences (user_id, family_id)
  values (auth.uid(), _invite.family_id)
  on conflict do nothing;

  update public.invites set use_count = use_count + 1 where id = _invite.id;

  return _family;
end;
$$;

-- Resolves a pending AI extraction (Add / Edit-with-overrides / Update / Ignore).
-- Idempotent: re-calling on an already-resolved extraction returns the prior
-- outcome instead of erroring or double-writing (docs/06 §6.7, docs/10).
-- `_action`: 'add' | 'edit' | 'update' | 'ignore'.
create or replace function public.resolve_ai_extraction(
  _extraction_id uuid,
  _action text,
  _overrides jsonb default null
)
returns public.calendar_events
language plpgsql security definer set search_path = public
as $$
declare
  _extraction public.ai_extractions;
  _event public.calendar_events;
  _payload jsonb;
  _role public.family_role;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into _extraction from public.ai_extractions where id = _extraction_id for update;
  if not found then
    raise exception 'extraction_not_found';
  end if;

  if not public.is_family_member(_extraction.family_id) then
    raise exception 'not_a_family_member';
  end if;

  _role := public.current_family_role(_extraction.family_id);
  if _role = 'child' then
    raise exception 'insufficient_role';
  end if;

  -- idempotent replay
  if _extraction.status in ('resolved', 'ignored', 'auto_added') then
    if _extraction.resulting_event_id is not null then
      select * into _event from public.calendar_events where id = _extraction.resulting_event_id;
    end if;
    return _event;
  end if;

  if _extraction.status <> 'pending' then
    raise exception 'extraction_not_actionable';
  end if;

  if _action = 'ignore' then
    update public.ai_extractions
      set status = 'ignored', resolved_by = auth.uid(), resolved_at = now()
      where id = _extraction_id and status = 'pending';

    if _extraction.card_message_id is not null then
      update public.messages
        set metadata = metadata || jsonb_build_object('card_state', 'ignored'),
            updated_at = now()
        where id = _extraction.card_message_id;
    end if;

    return null;
  end if;

  if _action not in ('add', 'edit', 'update') then
    raise exception 'invalid_action';
  end if;

  _payload := coalesce(_overrides, _extraction.validated_result);
  if _payload is null or coalesce(_payload ->> 'title', '') = '' or coalesce(_payload ->> 'date', '') = '' then
    raise exception 'incomplete_event_payload';
  end if;

  if _action = 'update' and _extraction.duplicate_of_event_id is not null then
    update public.calendar_events set
      title = coalesce(nullif(_payload ->> 'title', ''), title),
      start_date = coalesce(nullif(_payload ->> 'date', '')::date, start_date),
      end_date = nullif(_payload ->> 'end_date', '')::date,
      start_time = nullif(_payload ->> 'start_time', '')::time,
      end_time = nullif(_payload ->> 'end_time', '')::time,
      location = coalesce(nullif(_payload ->> 'location', ''), location),
      last_modified_by = auth.uid(),
      updated_at = now()
    where id = _extraction.duplicate_of_event_id
    returning * into _event;
  else
    insert into public.calendar_events (
      family_id, title, description, start_date, end_date, start_time, end_time,
      all_day, location, category, recurrence_rule, created_by, last_modified_by,
      source_message_id, ai_generated, ai_confidence
    ) values (
      _extraction.family_id,
      _payload ->> 'title',
      nullif(_payload ->> 'description', ''),
      (_payload ->> 'date')::date,
      nullif(_payload ->> 'end_date', '')::date,
      nullif(_payload ->> 'start_time', '')::time,
      nullif(_payload ->> 'end_time', '')::time,
      coalesce((_payload ->> 'all_day')::boolean, false),
      nullif(_payload ->> 'location', ''),
      coalesce(nullif(_payload ->> 'category', '')::public.event_category, 'other'),
      nullif(_payload ->> 'recurrence', ''),
      auth.uid(), auth.uid(),
      _extraction.message_id, true, _extraction.confidence
    ) returning * into _event;
  end if;

  update public.ai_extractions
    set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resulting_event_id = _event.id
    where id = _extraction_id and status = 'pending';

  if _extraction.card_message_id is not null then
    update public.messages
      set metadata = metadata || jsonb_build_object('card_state', 'resolved', 'event_id', _event.id),
          updated_at = now()
      where id = _extraction.card_message_id;
  end if;

  return _event;
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.users enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.calendar_events enable row level security;
alter table public.event_participants enable row level security;
alter table public.ai_extractions enable row level security;
alter table public.invites enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.notification_preferences enable row level security;

-- users: visible to yourself and anyone who shares a family with you
-- (needed to render sender names/avatars in chat); only self-editable.
create policy users_select on public.users for select using (
  id = auth.uid()
  or exists (
    select 1 from public.family_members fm1
    join public.family_members fm2 on fm1.family_id = fm2.family_id
    where fm1.user_id = auth.uid() and fm1.status = 'active'
      and fm2.user_id = public.users.id and fm2.status = 'active'
  )
);
create policy users_update_self on public.users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- families: members only. No direct insert policy — creation only via
-- create_family() so the owning family_members row is never skipped.
create policy families_select on public.families for select
  using (public.is_family_member(id));
create policy families_update_owner on public.families for update
  using (public.current_family_role(id) = 'owner')
  with check (public.current_family_role(id) = 'owner');

-- family_members: members can see their family roster; a member may edit
-- their own row (e.g. nickname) or an owner may edit any row — role changes
-- and last-owner protection are enforced by the triggers above regardless.
create policy family_members_select on public.family_members for select
  using (public.is_family_member(family_id));
create policy family_members_update on public.family_members for update
  using (user_id = auth.uid() or public.current_family_role(family_id) = 'owner')
  with check (user_id = auth.uid() or public.current_family_role(family_id) = 'owner');

-- conversations / conversation_members: read-only to members; provisioned
-- only via create_family()/redeem_invite().
create policy conversations_select on public.conversations for select
  using (public.is_family_member(family_id));
create policy conversation_members_select on public.conversation_members for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and public.is_family_member(c.family_id)
  ));

-- messages: members can read; a user may only insert as themselves, as a
-- 'user'-kind message (system/assistant messages are written by Edge
-- Functions using the service role, which bypasses RLS entirely); no hard
-- delete policy — deletion is a soft-delete via update (docs/05 §5.2).
create policy messages_select on public.messages for select
  using (public.is_family_member(family_id));
create policy messages_insert on public.messages for insert
  with check (public.is_family_member(family_id) and sender_id = auth.uid() and kind = 'user');
create policy messages_update_own on public.messages for update
  using (sender_id = auth.uid() or public.current_family_role(family_id) = 'owner')
  with check (sender_id = auth.uid() or public.current_family_role(family_id) = 'owner');

-- calendar_events: any member can read; owner/adult can create, edit,
-- delete; child role is read-only (docs/07 §7.7).
create policy calendar_events_select on public.calendar_events for select
  using (public.is_family_member(family_id));
create policy calendar_events_insert on public.calendar_events for insert
  with check (public.current_family_role(family_id) in ('owner', 'adult'));
create policy calendar_events_update on public.calendar_events for update
  using (public.current_family_role(family_id) in ('owner', 'adult'))
  with check (public.current_family_role(family_id) in ('owner', 'adult'));
create policy calendar_events_delete on public.calendar_events for delete
  using (public.current_family_role(family_id) in ('owner', 'adult'));

-- event_participants: mirrors calendar_events permissions.
create policy event_participants_select on public.event_participants for select
  using (exists (
    select 1 from public.calendar_events e
    where e.id = event_id and public.is_family_member(e.family_id)
  ));
create policy event_participants_write on public.event_participants for all
  using (exists (
    select 1 from public.calendar_events e
    where e.id = event_id and public.current_family_role(e.family_id) in ('owner', 'adult')
  ))
  with check (exists (
    select 1 from public.calendar_events e
    where e.id = event_id and public.current_family_role(e.family_id) in ('owner', 'adult')
  ));

-- ai_extractions: read-only to members; all writes go through the service
-- role (ai-extract Edge Function) or resolve_ai_extraction() above, both of
-- which bypass RLS deliberately and re-check membership/role themselves.
create policy ai_extractions_select on public.ai_extractions for select
  using (public.is_family_member(family_id));

-- invites: owner/adult can see and create; redemption is via redeem_invite()
-- (the redeemer isn't a family member yet, so no client-facing select/use
-- policy is needed or appropriate here).
create policy invites_select on public.invites for select
  using (public.current_family_role(family_id) in ('owner', 'adult'));
create policy invites_insert on public.invites for insert
  with check (public.current_family_role(family_id) in ('owner', 'adult') and created_by = auth.uid());

-- device_push_tokens / notification_preferences: strictly self-scoped.
create policy device_push_tokens_own on public.device_push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_preferences_own on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- Grants
-- ============================================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.resolve_ai_extraction(uuid, text, jsonb) to authenticated;
