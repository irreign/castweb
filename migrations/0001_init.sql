-- Nexus Logic AI Enquiry-to-Booking: initial schema (Cloudflare D1 / SQLite).
-- All timestamps are ISO-8601 UTC strings (YYYY-MM-DDTHH:MM:SS.sssZ) so they sort lexicographically.
-- Every business table carries tenant_id and every query in the application layer filters on it.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL UNIQUE,            -- widget identifier; grants only public chat access
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Singapore',
  settings_json TEXT NOT NULL DEFAULT '{}',   -- validated by zod (src/settings.ts)
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,                          -- NULL until invite accepted
  disabled INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','consultant')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_memberships_user ON memberships(user_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                         -- SHA-256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,                                   -- normalised digits incl. country code, e.g. 6591234567
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_contacts_phone ON contacts(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uq_contacts_email ON contacts(tenant_id, email) WHERE email IS NOT NULL;

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN
    ('new','contacted','qualified','consultation_booked','follow_up_required','converted','closed')),
  source TEXT NOT NULL DEFAULT 'web_chat',      -- web_chat | whatsapp | voice | manual
  assigned_to TEXT REFERENCES users(id),
  requirements_json TEXT NOT NULL DEFAULT '{}', -- validated qualification answers
  preferred_time_text TEXT,
  summary TEXT,
  next_action TEXT,
  next_action_due TEXT,
  first_response_at TEXT,                       -- first reply (AI or human) to the enquiry
  first_human_contact_at TEXT,
  last_contacted_at TEXT,
  closed_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX idx_leads_tenant_created ON leads(tenant_id, created_at);
CREATE INDEX idx_leads_tenant_contact ON leads(tenant_id, contact_id);
CREATE INDEX idx_leads_tenant_assigned ON leads(tenant_id, assigned_to);

CREATE TABLE lead_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notes_lead ON lead_notes(tenant_id, lead_id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  lead_id TEXT REFERENCES leads(id),
  channel TEXT NOT NULL CHECK (channel IN ('web','whatsapp','voice','staff')),
  external_ref TEXT,                            -- whatsapp wa_id, etc.
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','handoff','resolved')),
  assigned_to TEXT REFERENCES users(id),
  access_token_hash TEXT,                       -- widget continuation secret (hash only)
  state_json TEXT NOT NULL DEFAULT '{}',        -- validated conversation state
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_conv_tenant_status ON conversations(tenant_id, status, last_message_at);
CREATE INDEX idx_conv_tenant_lead ON conversations(tenant_id, lead_id);
CREATE UNIQUE INDEX uq_conv_external ON conversations(tenant_id, channel, external_ref)
  WHERE external_ref IS NOT NULL AND status <> 'resolved';

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer','ai','staff','system')),
  sender_user_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  provider TEXT,                                -- whatsapp | web
  provider_message_id TEXT,
  client_message_id TEXT,                       -- widget-supplied idempotency key
  delivery_status TEXT NOT NULL DEFAULT 'n/a' CHECK (delivery_status IN
    ('n/a','queued','sent','delivered','read','failed')),
  error_code TEXT,
  error_detail TEXT,
  citations_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_conv ON messages(tenant_id, conversation_id, created_at);
CREATE UNIQUE INDEX uq_messages_provider ON messages(tenant_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX uq_messages_client ON messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('faq','service','fees','policy','procedure','hours','document','website','other')),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  published INTEGER NOT NULL DEFAULT 0,        -- only ready AND published sources are used by the live assistant
  error TEXT,
  content_text TEXT,                            -- approved text (FAQ answer / extracted document text)
  question TEXT,                                -- FAQ question (type = faq)
  original_name TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  r2_key TEXT,
  source_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_ks_tenant ON knowledge_sources(tenant_id, deleted_at);

CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  source_version INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  terms TEXT NOT NULL,                          -- space separated normalised terms for retrieval
  created_at TEXT NOT NULL
);
CREATE INDEX idx_chunks_tenant ON knowledge_chunks(tenant_id, source_id);

CREATE TABLE consultant_availability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday (local to tenant tz)
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  CHECK (end_min > start_min)
);
CREATE INDEX idx_avail_tenant_user ON consultant_availability(tenant_id, user_id);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id),
  contact_id TEXT REFERENCES contacts(id),
  consultant_id TEXT NOT NULL REFERENCES users(id),
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  block_end_utc TEXT NOT NULL,                  -- end + buffer; used for overlap checks
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  channel TEXT NOT NULL DEFAULT 'web',
  notes TEXT,
  idempotency_key TEXT,
  rescheduled_from TEXT REFERENCES bookings(id),
  cancel_reason TEXT,
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending','sent','failed','not_configured')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_utc > start_utc)
);
CREATE INDEX idx_bookings_tenant_start ON bookings(tenant_id, start_utc);
CREATE INDEX idx_bookings_consultant ON bookings(tenant_id, consultant_id, start_utc);
CREATE INDEX idx_bookings_lead ON bookings(tenant_id, lead_id);
CREATE UNIQUE INDEX uq_bookings_idem ON bookings(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Backstop: the same consultant can never hold two confirmed bookings starting at the same instant.
-- Overlap with differing durations/buffers is prevented by the conditional INSERT in the booking service.
CREATE UNIQUE INDEX uq_bookings_slot ON bookings(tenant_id, consultant_id, start_utc) WHERE status = 'confirmed';

CREATE TABLE follow_up_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  owner_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  origin TEXT NOT NULL DEFAULT 'manual',        -- manual | handoff | ai_suggestion | booking
  completed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_tenant_status_due ON follow_up_tasks(tenant_id, status, due_at);
CREATE INDEX idx_tasks_lead ON follow_up_tasks(tenant_id, lead_id);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,                          -- append-only; latest per purpose wins
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('enquiry_processing','follow_up_messages')),
  granted INTEGER NOT NULL,
  channel TEXT NOT NULL,
  notice_version TEXT,
  evidence TEXT,                                 -- e.g. 'widget checkbox', 'whatsapp STOP keyword'
  created_at TEXT NOT NULL
);
CREATE INDEX idx_consent_contact ON consent_records(tenant_id, contact_id, purpose, created_at);

CREATE TABLE tenant_channels (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  external_id TEXT NOT NULL,                    -- WhatsApp phone_number_id (routes inbound webhooks to the tenant)
  token_enc TEXT,                               -- AES-GCM ciphertext; key is the ENCRYPTION_KEY secret
  display_phone TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel)
);
CREATE UNIQUE INDEX uq_channel_external ON tenant_channels(channel, external_id);

CREATE TABLE provider_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed','ignored')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  payload_json TEXT,                            -- retained only while unprocessed/failed, cleared on success
  created_at TEXT NOT NULL,
  processed_at TEXT,
  UNIQUE (provider, event_id)
);
CREATE INDEX idx_pe_status ON provider_events(status, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                           -- booking_confirmed | booking_cancelled | handoff | task_overdue ...
  channel TEXT NOT NULL DEFAULT 'email',
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','not_configured')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX idx_notif_status ON notifications(status, created_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,                     -- user | ai | system | customer | webhook
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_events(tenant_id, entity_type, entity_id, created_at);
CREATE INDEX idx_audit_tenant ON audit_events(tenant_id, created_at);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                           -- ai_call | ai_tokens_in | ai_tokens_out | ai_failure | msg_in | msg_out | email | doc_processed | voice_seconds
  quantity INTEGER NOT NULL DEFAULT 1,
  channel TEXT,
  day TEXT NOT NULL,                            -- YYYY-MM-DD (UTC) for limit and billing rollups
  created_at TEXT NOT NULL
);
CREATE INDEX idx_usage_tenant_day ON usage_records(tenant_id, kind, day);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
