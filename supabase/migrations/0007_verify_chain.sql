-- Recomputes each event hash from stored fields so exports can report chain integrity,
-- and returns the exact data text used in the hash preimage for independent verification.
create or replace function public.verify_message_chain(p_message uuid)
returns table (id uuid, seq bigint, prev_hash text, hash text, data_text text, occurred_at_text text, recomputed text, linked boolean, valid boolean)
language sql stable security definer set search_path = public, extensions as $$
  with e as (
    select ev.*, lag(ev.hash) over (order by ev.seq) as expected_prev
    from events ev where ev.message_id = p_message
  )
  select e.id, e.seq, e.prev_hash, e.hash, e.data::text,
    to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    encode(extensions.digest(
      e.prev_hash || '|' || e.id::text || '|' || e.message_id::text || '|' || coalesce(e.recipient_id::text, '') || '|' ||
      e.type || '|' || to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || e.source || '|' || e.data::text,
      'sha256'), 'hex') as recomputed,
    e.prev_hash = coalesce(e.expected_prev, 'GENESIS') as linked,
    false as valid
  from e order by e.seq;
$$;
revoke execute on function public.verify_message_chain(uuid) from public, anon, authenticated;
