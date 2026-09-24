create or replace function public.lookup_worker_pass_expiry(p_token uuid)
returns table(
  worker_id uuid,
  full_name text,
  employee_number text,
  job_title text,
  site_name text,
  valid_count integer,
  expiring_30_count integer,
  expiring_60_count integer,
  expiring_90_count integer,
  expired_count integer,
  next_expiry_date date,
  days_until_next_expiry integer,
  status text
)
language sql
security definer
set search_path = ''
as $function$
  select
    w.id,
    trim(concat_ws(' ',w.first_name,w.last_name))::text,
    w.employee_number,
    w.job_title,
    s.name,
    count(*) filter (where q.id is not null and (q.expires_on is null or q.expires_on > current_date + 90))::int,
    count(*) filter (where q.id is not null and q.expires_on between current_date and current_date + 30)::int,
    count(*) filter (where q.id is not null and q.expires_on between current_date + 31 and current_date + 60)::int,
    count(*) filter (where q.id is not null and q.expires_on between current_date + 61 and current_date + 90)::int,
    count(*) filter (where q.id is not null and q.expires_on < current_date)::int,
    min(q.expires_on) filter (where q.expires_on is not null and q.expires_on >= current_date),
    case when min(q.expires_on) filter (where q.expires_on is not null and q.expires_on >= current_date) is null then null
         else (min(q.expires_on) filter (where q.expires_on is not null and q.expires_on >= current_date) - current_date)::int end,
    case
      when count(q.id)=0 then 'review_required'
      when count(*) filter (where q.expires_on is not null and q.expires_on < current_date)>0 then 'review_required'
      when count(*) filter (where q.expires_on is not null and q.expires_on between current_date and current_date + 30)>0 then 'expiring_30'
      when count(*) filter (where q.expires_on is not null and q.expires_on between current_date + 31 and current_date + 60)>0 then 'expiring_60'
      when count(*) filter (where q.expires_on is not null and q.expires_on between current_date + 61 and current_date + 90)>0 then 'expiring_90'
      else 'ready'
    end::text
  from public.worker_passes wp
  join public.workers w on w.id=wp.worker_id and w.status='active'
  left join public.sites s on s.id=w.site_id
  left join public.qualifications q on q.worker_id=w.id
  where wp.token=p_token and wp.active=true
  group by w.id,w.first_name,w.last_name,w.employee_number,w.job_title,s.name;
$function$;

grant execute on function public.lookup_worker_pass_expiry(uuid) to anon, authenticated;
