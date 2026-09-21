-- Internal functions are server-only (service role). Revoke client access.
revoke execute on function public.bump_recipient(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_jobs(int) from public, anon, authenticated;
revoke execute on function public.increment_usage(uuid, text, int, int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- RLS helpers only answer questions about the caller's own memberships; signed-in users need them for policies.
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

alter function public.forbid_mutation() set search_path = public;
alter function public.freeze_sent_content() set search_path = public;
alter function public.chain_event() set search_path = public, extensions;
