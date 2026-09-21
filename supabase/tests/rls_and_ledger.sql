-- Run against a Supabase database (service role / postgres). Everything is rolled back.
-- Verifies: profile trigger, event hash chain, cross-organization RLS isolation.
-- Expected: chain shows GENESIS -> h1 -> h2; A sees only 'A secret' / 'Org A'; A_updates_B_rows = 0.
begin;
insert into auth.users (id, email, instance_id, aud, role) values
 ('11111111-1111-1111-1111-111111111111','a@test.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('22222222-2222-2222-2222-222222222222','b@test.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
insert into organizations (id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','Org A'),('bbbbbbbb-0000-0000-0000-000000000002','Org B');
insert into memberships values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owner'),
 ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','owner');
insert into messages (id,org_id,subject) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','A secret'),
 ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','B secret');
insert into events (org_id,message_id,type,source) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','message.created','system');
insert into events (org_id,message_id,type,source) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','message.sent','system');
create temp table results (k text, v text) on commit drop;
grant all on results to authenticated;
insert into results select 'chain', string_agg(type||':'||left(prev_hash,8)||'->'||left(hash,8), ' | ' order by seq) from events;
insert into results select 'profiles_created', count(*)::text from profiles where email like '%@test.local';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into results select 'A_sees_messages', string_agg(subject, ',') from messages;
insert into results select 'A_sees_orgs', string_agg(name, ',') from organizations;
insert into results select 'A_sees_events', count(*)::text from events;
insert into results select 'A_sees_apikeys', count(*)::text from api_keys;
with u as (update messages set subject='hacked' where org_id='bbbbbbbb-0000-0000-0000-000000000002' returning 1)
insert into results select 'A_updates_B_rows', count(*)::text from u;
reset role;
select * from results;
rollback;
