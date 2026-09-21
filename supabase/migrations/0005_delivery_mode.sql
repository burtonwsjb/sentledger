-- individual: each recipient gets a separately tracked copy (opens attributable per recipient)
-- group: one email to all recipients (To/CC visible to each other); engagement cannot be attributed to a specific person
alter table public.messages add column delivery_mode text not null default 'individual' check (delivery_mode in ('individual','group'));
alter table public.messages add column group_token text unique;
alter table public.messages add column unsubscribe_link boolean not null default false;
alter table public.messages add column tracking_notice text;
create index on public.messages (group_token);
