create or replace function public.analytics_summary(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  with msgs as (
    select * from messages where org_id = p_org and deleted_at is null and coalesce(sent_at, created_at) between p_from and p_to
  ), rc as (
    select r.* from message_recipients r join msgs m on m.id = r.message_id
  ), ev as (
    select * from events where org_id = p_org and occurred_at between p_from and p_to and is_duplicate = false
  ), days as (
    select generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day')::date as d
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'messages', (select count(*) from msgs where status <> 'draft'),
      'sends', (select count(*) from rc where status in ('accepted','delivered','bounced','complained')),
      'delivered', (select count(*) from rc where status = 'delivered'),
      'opened', (select count(*) from rc where open_count > 0),
      'clicked', (select count(*) from rc where click_count > 0),
      'files_viewed', (select count(*) from rc where file_view_count > 0),
      'failed', (select count(*) from rc where status = 'failed'),
      'bounced', (select count(*) from rc where status = 'bounced'),
      'complained', (select count(*) from rc where status = 'complained'),
      'pending', (select count(*) from rc where status = 'pending') + (select count(*) from msgs where status in ('queued','scheduled','sending')),
      'drafts', (select count(*) from msgs where status = 'draft'),
      'uncertain_opens', (select count(*) from ev where type = 'message.opened' and uncertain)
    ),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'date', d,
        'sent', (select count(*) from ev where type = 'message.sent' and occurred_at::date = d),
        'opened', (select count(*) from ev where type = 'message.opened' and occurred_at::date = d),
        'clicked', (select count(*) from ev where type = 'message.clicked' and occurred_at::date = d),
        'files', (select count(*) from ev where type = 'message.file_viewed' and occurred_at::date = d),
        'bounced', (select count(*) from ev where type in ('message.bounced','message.failed') and occurred_at::date = d)
      ) order by d), '[]'::jsonb) from days),
    'top_templates', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select tp.id, tp.name, count(distinct m.id) as sent,
          count(distinct r.id) filter (where r.open_count > 0) as opened
        from msgs m join templates tp on tp.id = m.template_id left join message_recipients r on r.message_id = m.id
        where m.status <> 'draft' group by tp.id, tp.name order by sent desc limit 5) t),
    'top_links', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select data->>'url' as url, count(*) as clicks, count(distinct recipient_id) as unique_recipients
        from ev where type = 'message.clicked' and data ? 'url' group by data->>'url' order by clicks desc limit 5) t),
    'by_source', (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb) from (select source, count(*) n from msgs where status <> 'draft' group by source) s),
    'devices', (select coalesce(jsonb_object_agg(coalesce(device,'unknown'), n), '{}'::jsonb) from (select device, count(*) n from ev where type = 'message.opened' group by device) s)
  );
$$;
revoke execute on function public.analytics_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
