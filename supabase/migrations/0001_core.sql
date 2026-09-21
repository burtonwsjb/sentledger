-- SentLedger core schema: tenancy, identity, billing, audit
create extension if not exists pgcrypto;

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  notification_prefs jsonb not null default '{"email_on_open":true,"email_on_click":false,"weekly_digest":true}'::jsonb,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-create a profile for every new auth user
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Organizations ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text unique,
  logo_url text,
  timezone text not null default 'UTC',
  intended_use text check (intended_use in ('web','inbox','api')),
  default_sender_id uuid,
  default_reply_to text,
  tracking_defaults jsonb not null default '{"open":true,"click":true,"files":true}'::jsonb,
  consent_language text not null default 'This message may contain tracking to confirm delivery and engagement.',
  require_tracking_notice boolean not null default false,
  retention_days int not null default 365,
  custom_field_defs jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','suspended')),
  suspended_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer','billing')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member','viewer','billing')),
  token_hash text not null unique,
  invited_by uuid references public.profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invitations (org_id);

-- ---------- Authorization helpers (used by RLS) ----------
create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid() and role = any(p_roles));
$$;

-- ---------- Plans & billing ----------
create table public.plans (
  id text primary key,
  name text not null,
  description text,
  stripe_price_monthly text,
  stripe_price_annual text,
  price_monthly_cents int,           -- display only; Stripe is the source of truth for charges
  price_annual_cents int,
  entitlements jsonb not null,
  is_public boolean not null default true,
  sort int not null default 0
);

create table public.subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('trialing','active','past_due','canceled','incomplete','unpaid')),
  billing_interval text check (billing_interval in ('month','year')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  stripe_event_id text unique,
  type text not null,
  summary text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index on public.billing_events (org_id, created_at desc);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  stripe_invoice_id text unique not null,
  number text,
  amount_due int not null default 0,
  amount_paid int not null default 0,
  currency text not null default 'usd',
  status text,
  hosted_invoice_url text,
  invoice_pdf text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invoices (org_id, created_at desc);

create table public.usage_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  period text not null,               -- YYYY-MM
  sends int not null default 0,
  api_calls int not null default 0,
  overage_sends int not null default 0,
  primary key (org_id, period)
);

create or replace function public.increment_usage(p_org uuid, p_period text, p_sends int, p_api int)
returns public.usage_counters language plpgsql security definer set search_path = public as $$
declare r usage_counters;
begin
  insert into usage_counters (org_id, period, sends, api_calls) values (p_org, p_period, p_sends, p_api)
  on conflict (org_id, period) do update set sends = usage_counters.sends + p_sends, api_calls = usage_counters.api_calls + p_api
  returning * into r;
  return r;
end $$;

-- ---------- Audit ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid,
  actor_api_key_id uuid,
  action text not null,
  target_type text,
  target_id text,
  ip text,
  user_agent text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (org_id, created_at desc);

create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row when (pg_trigger_depth() = 0) execute function public.forbid_mutation();

-- ---------- Platform operations ----------
create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  message_id uuid,
  reporter_email text,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now()
);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','cancelled','completed')),
  scheduled_for timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  topic text not null default 'sales',
  message text not null,
  created_at timestamptz not null default now()
);
