-- SentLedger messaging, tracking, evidence ledger, developer platform

-- ---------- Sending identities ----------
create table public.sender_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  provider text not null default 'resend',
  provider_domain_id text,
  dns_records jsonb not null default '[]'::jsonb,
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, domain)
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('gmail','microsoft')),
  account_email text not null,
  scopes text[] not null default '{}',
  access_token_enc text,            -- AES-256-GCM, key only in server env
  refresh_token_enc text,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected','needs_reauth','disconnected')),
  last_error text,
  last_used_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, provider, account_email)
);

create table public.sender_identities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('managed','gmail','microsoft','platform')),
  email text not null,
  name text,
  domain_id uuid references public.sender_domains(id) on delete cascade,
  connection_id uuid references public.provider_connections(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.sender_identities (org_id);

-- ---------- Contacts & suppression ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  company text,
  primary_email text not null,
  emails text[] not null default '{}',
  tags text[] not null default '{}',
  notes text,
  consent jsonb not null default '{}'::jsonb,
  custom jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_org_email on public.contacts (org_id, lower(primary_email)) where deleted_at is null;
create index on public.contacts using gin (emails);

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('unsubscribe','bounce','complaint','manual')),
  note text,
  source_message_id uuid,
  created_at timestamptz not null default now()
);
create unique index suppressions_org_email on public.suppressions (org_id, lower(email));

-- ---------- Templates ----------
create table public.template_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  folder_id uuid references public.template_folders(id) on delete set null,
  name text not null,
  subject text not null default '',
  html text not null default '',
  text text not null default '',
  variables text[] not null default '{}',
  tags text[] not null default '{}',
  visibility text not null default 'org' check (visibility in ('org','private')),
  version int not null default 1,
  use_count int not null default 0,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.templates (org_id);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version int not null,
  subject text not null,
  html text not null,
  text text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

-- ---------- Secure files ----------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  mime text not null,
  size bigint not null,
  sha256 text not null,
  storage_path text not null unique,
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','infected','skipped')),
  created_by uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.files (org_id);

create table public.file_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  message_id uuid,
  recipient_id uuid,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  allow_download boolean not null default true,
  view_count int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.file_links (org_id);
create index on public.file_links (message_id);

-- ---------- Messages ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id),
  api_key_id uuid,
  source text not null default 'web' check (source in ('web','api','extension')),
  status text not null default 'draft' check (status in ('draft','scheduled','queued','sending','sent','partially_failed','failed')),
  sender_identity_id uuid references public.sender_identities(id) on delete set null,
  send_via text not null default 'managed' check (send_via in ('managed','gmail','microsoft','platform')),
  from_email text,
  from_name text,
  reply_to text,
  subject text not null default '',
  html text not null default '',
  text text not null default '',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text not null default encode(gen_random_bytes(12), 'hex'),
  idempotency_key text,
  template_id uuid references public.templates(id) on delete set null,
  tracking jsonb not null default '{"open":true,"click":true,"files":true}'::jsonb,
  links jsonb not null default '[]'::jsonb,        -- [{i, url}] captured at send time
  scheduled_at timestamptz,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  html_sha256 text,
  text_sha256 text,
  content_frozen_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);
create index on public.messages (org_id, created_at desc);
create index on public.messages (org_id, status);
create index on public.messages (status, scheduled_at) where status = 'scheduled';
create index on public.messages using gin (metadata);
create index on public.messages using gin (tags);

-- Once a message has been sent its content is frozen: history is never silently altered.
create or replace function public.freeze_sent_content() returns trigger language plpgsql as $$
begin
  if old.content_frozen_at is not null and (
     new.subject is distinct from old.subject or new.html is distinct from old.html or
     new.text is distinct from old.text or new.from_email is distinct from old.from_email or
     new.html_sha256 is distinct from old.html_sha256 or new.text_sha256 is distinct from old.text_sha256) then
    raise exception 'message content is frozen after sending';
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger messages_freeze before update on public.messages
  for each row execute function public.freeze_sent_content();

create table public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'to' check (kind in ('to','cc','bcc')),
  email text not null,
  name text,
  contact_id uuid references public.contacts(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'pending' check (status in ('pending','suppressed','accepted','delivered','bounced','complained','failed')),
  provider_message_id text,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count int not null default 0,
  click_count int not null default 0,
  file_view_count int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index on public.message_recipients (message_id);
create index on public.message_recipients (org_id, lower(email));
create index on public.message_recipients (provider_message_id);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null references public.files(id),
  name text not null,
  size bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);
create index on public.message_attachments (message_id);

-- ---------- Evidence ledger: append-only, hash-chained events ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  org_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  recipient_id uuid references public.message_recipients(id) on delete set null,
  type text not null,
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('tracking','provider','system','user','api')),
  ip_truncated text,
  ip_hash text,
  user_agent text,
  device text,
  geo jsonb,
  is_proxy boolean not null default false,
  uncertain boolean not null default false,
  is_duplicate boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text,
  created_at timestamptz not null default now()
);
create index on public.events (message_id, seq);
create index on public.events (org_id, occurred_at desc);
create index on public.events (org_id, type, occurred_at desc);

-- hash chain: hash = sha256(prev_hash | id | message_id | recipient_id | type | occurred_at(UTC ISO) | source | data::text)
create or replace function public.chain_event() returns trigger language plpgsql as $$
declare v_prev text;
begin
  perform 1 from public.messages where id = new.message_id for update;
  select hash into v_prev from public.events where message_id = new.message_id order by seq desc limit 1;
  new.prev_hash := coalesce(v_prev, 'GENESIS');
  new.hash := encode(extensions.digest(
      new.prev_hash || '|' || new.id::text || '|' || new.message_id::text || '|' ||
      coalesce(new.recipient_id::text, '') || '|' || new.type || '|' ||
      to_char(new.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
      new.source || '|' || new.data::text, 'sha256'), 'hex');
  return new;
end $$;
create trigger events_chain before insert on public.events
  for each row execute function public.chain_event();
create trigger events_immutable before update or delete on public.events
  for each row when (pg_trigger_depth() = 0) execute function public.forbid_mutation();

-- ---------- Developer platform ----------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null,
  ip_allowlist text[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.api_keys (org_id);

create table public.idempotency_keys (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  request_hash text not null,
  status_code int,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, key)
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  url text not null,
  description text,
  secret_enc text not null,
  events text[] not null,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.webhook_endpoints (org_id);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz default now(),
  last_status_code int,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);
create index on public.webhook_deliveries (org_id, created_at desc);
create index on public.webhook_deliveries (status, next_attempt_at) where status = 'pending';

create table public.webhook_attempts (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
  org_id uuid not null,
  status_code int,
  duration_ms int,
  error text,
  response_snippet text,
  attempted_at timestamptz not null default now()
);
create index on public.webhook_attempts (delivery_id);

-- extension / device authorization flow (RFC 8628 style)
create table public.device_authorizations (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,
  user_code text not null unique,
  client_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied','consumed')),
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

-- provider webhook idempotency (Resend etc.)
create table public.provider_webhook_events (
  id text primary key,
  provider text not null,
  received_at timestamptz not null default now()
);

-- ---------- Job queue ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.jobs (status, run_at);

-- claim jobs atomically (SKIP LOCKED so multiple replicas are safe)
create or replace function public.claim_jobs(p_limit int) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update jobs set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
  where id in (
    select id from jobs
    where (status = 'queued' and run_at <= now())
       or (status = 'running' and locked_at < now() - interval '5 minutes')
    order by run_at
    limit p_limit
    for update skip locked)
  returning *;
end $$;

-- atomic counter bumps for recipients
create or replace function public.bump_recipient(p_id uuid, p_field text, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'open' then
    update message_recipients set open_count = open_count + 1,
      first_opened_at = coalesce(first_opened_at, p_at), last_opened_at = p_at where id = p_id;
  elsif p_field = 'click' then
    update message_recipients set click_count = click_count + 1 where id = p_id;
  elsif p_field = 'file' then
    update message_recipients set file_view_count = file_view_count + 1 where id = p_id;
  end if;
end $$;
