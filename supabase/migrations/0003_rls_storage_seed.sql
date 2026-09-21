-- Row Level Security on every tenant-owned table.
-- The SentLedger server uses the service role (bypasses RLS) and enforces
-- authorization in code; these policies are defense-in-depth so that the
-- public anon/authenticated keys can never read another organization's data.

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.invoices enable row level security;
alter table public.usage_counters enable row level security;
alter table public.audit_logs enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.contact_requests enable row level security;
alter table public.sender_domains enable row level security;
alter table public.provider_connections enable row level security;
alter table public.sender_identities enable row level security;
alter table public.contacts enable row level security;
alter table public.suppressions enable row level security;
alter table public.template_folders enable row level security;
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.files enable row level security;
alter table public.file_links enable row level security;
alter table public.messages enable row level security;
alter table public.message_recipients enable row level security;
alter table public.message_attachments enable row level security;
alter table public.events enable row level security;
alter table public.api_keys enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_attempts enable row level security;
alter table public.device_authorizations enable row level security;
alter table public.provider_webhook_events enable row level security;
alter table public.jobs enable row level security;

-- Profiles: a user sees and edits only their own profile, plus teammates' basic profile.
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_platform_admin = false);

-- Organizations and memberships
create policy orgs_member_select on public.organizations for select to authenticated using (public.is_member(id));
create policy orgs_admin_update on public.organizations for update to authenticated
  using (public.has_role(id, array['owner','admin'])) with check (public.has_role(id, array['owner','admin']));
create policy memberships_member_select on public.memberships for select to authenticated using (public.is_member(org_id));
create policy invitations_admin_select on public.invitations for select to authenticated using (public.has_role(org_id, array['owner','admin']));

-- Plans are public catalog data
create policy plans_public_select on public.plans for select to anon, authenticated using (is_public);

-- Billing: owner + billing roles only
create policy subs_select on public.subscriptions for select to authenticated using (public.is_member(org_id));
create policy billing_events_select on public.billing_events for select to authenticated using (public.has_role(org_id, array['owner','billing']));
create policy invoices_select on public.invoices for select to authenticated using (public.has_role(org_id, array['owner','billing']));
create policy usage_select on public.usage_counters for select to authenticated using (public.is_member(org_id));

-- Audit: owners and admins
create policy audit_select on public.audit_logs for select to authenticated using (public.has_role(org_id, array['owner','admin']));

-- Generic member read policies for tenant data
do $$
declare t text;
begin
  foreach t in array array['sender_domains','sender_identities','contacts','suppressions','template_folders',
    'templates','template_versions','files','file_links','messages','message_recipients','message_attachments',
    'events','webhook_deliveries','webhook_attempts','deletion_requests']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(org_id))', t || '_member_select', t);
  end loop;
end $$;

-- Writable tenant data for owner/admin/member (viewers and billing are read-only)
do $$
declare t text;
begin
  foreach t in array array['contacts','suppressions','template_folders','templates']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(org_id, array[''owner'',''admin'',''member'']))', t || '_writer_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(org_id, array[''owner'',''admin'',''member''])) with check (public.has_role(org_id, array[''owner'',''admin'',''member'']))', t || '_writer_update', t);
  end loop;
end $$;

-- Private template visibility
drop policy templates_member_select on public.templates;
create policy templates_member_select on public.templates for select to authenticated
  using (public.is_member(org_id) and (visibility = 'org' or created_by = auth.uid()));

-- Secret-bearing tables: provider tokens, API key hashes, webhook secrets,
-- idempotency records, jobs, device codes -> NO client policies (server only).
-- api_keys / webhook_endpoints metadata is exposed through the server API with secrets stripped.

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('secure-files', 'secure-files', false, 26214400)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;
-- No storage.objects policies for secure-files: every access goes through
-- short-lived signed URLs minted by the server after an authorization check.

-- ---------- Plan catalog (prices are placeholders; Stripe price IDs are set per environment) ----------
insert into public.plans (id, name, description, price_monthly_cents, price_annual_cents, sort, entitlements) values
('trial', 'Free trial', '14-day trial with Starter limits', 0, 0, 0,
 '{"monthly_sends":250,"tracked_links":true,"attachment_storage_mb":500,"seats":3,"api_access":true,"retention_days":90,"custom_branding":false,"overage_allowed":false,"connected_inboxes":1,"webhooks":2}'),
('starter', 'Starter', 'For individuals and small offices', null, null, 1,
 '{"monthly_sends":1000,"tracked_links":true,"attachment_storage_mb":2000,"seats":3,"api_access":false,"retention_days":365,"custom_branding":false,"overage_allowed":false,"connected_inboxes":2,"webhooks":0}'),
('pro', 'Professional', 'For teams that need records and integrations', null, null, 2,
 '{"monthly_sends":10000,"tracked_links":true,"attachment_storage_mb":20000,"seats":10,"api_access":true,"retention_days":1095,"custom_branding":true,"overage_allowed":true,"overage_unit_cents":null,"connected_inboxes":10,"webhooks":10}'),
('business', 'Business', 'For platforms and high-volume senders', null, null, 3,
 '{"monthly_sends":50000,"tracked_links":true,"attachment_storage_mb":100000,"seats":50,"api_access":true,"retention_days":2555,"custom_branding":true,"overage_allowed":true,"overage_unit_cents":null,"connected_inboxes":50,"webhooks":50}'),
('enterprise', 'Enterprise', 'Custom volume, retention, SSO and contracts', null, null, 4,
 '{"monthly_sends":null,"tracked_links":true,"attachment_storage_mb":null,"seats":null,"api_access":true,"retention_days":null,"custom_branding":true,"overage_allowed":true,"connected_inboxes":null,"webhooks":null,"contact_sales":true}')
on conflict (id) do update set entitlements = excluded.entitlements, name = excluded.name, description = excluded.description;
