-- Emails are normalized to lowercase by the server; use a plain unique constraint so upserts can target it.
drop index if exists public.suppressions_org_email;
alter table public.suppressions add constraint suppressions_org_email_key unique (org_id, email);
alter table public.suppressions add constraint suppressions_email_lower check (email = lower(email));
