
create or replace function public.lookup_worker_pass(p_token uuid)
returns table(worker_id uuid,full_name text,employee_number text,job_title text,site_name text,ready_for_work boolean,qualification_status text,valid_count integer,expiring_count integer,expired_count integer,missing_required_count integer,missing_required_names text[])
language sql security definer set search_path=''
as $$
with worker_base as (
 select w.id,w.organization_id,w.site_id,
        trim(concat_ws(' ',w.first_name,w.last_name))::text full_name,
        w.employee_number,w.job_title,s.name::text site_name
 from public.worker_passes wp
 join public.workers w on w.id=wp.worker_id and w.status='active'
 left join public.sites s on s.id=w.site_id
 where wp.token=p_token and wp.active=true
),
reqs as (
 select wb.id worker_id,r.id requirement_id,r.qualification_name,r.aliases
 from worker_base wb join public.qualification_requirements r
 on r.organization_id=wb.organization_id and r.site_id=wb.site_id and r.active=true
 and lower(trim(r.job_title))=lower(trim(wb.job_title))
),
matched as (
 select r.worker_id,r.requirement_id,r.qualification_name,q.id qualification_id,q.expires_on
 from reqs r left join lateral (
  select q.id,q.expires_on from public.qualifications q
  where q.worker_id=r.worker_id and (
   lower(trim(q.name))=lower(trim(r.qualification_name))
   or exists(select 1 from unnest(r.aliases) a where lower(trim(a))=lower(trim(q.name)))
  )
  order by case when q.expires_on is null then 1 else 0 end desc,q.expires_on desc nulls first limit 1
 ) q on true
),
agg as (
 select wb.id worker_id,count(m.requirement_id)::int required_count,
 count(*) filter(where m.qualification_id is not null and (m.expires_on is null or m.expires_on>current_date+30))::int valid_count,
 count(*) filter(where m.qualification_id is not null and m.expires_on between current_date and current_date+30)::int expiring_count,
 count(*) filter(where m.qualification_id is not null and m.expires_on<current_date)::int expired_count,
 count(*) filter(where m.requirement_id is not null and m.qualification_id is null)::int missing_count
 from worker_base wb left join matched m on m.worker_id=wb.id group by wb.id
)
select wb.id,wb.full_name,
       null::text as employee_number,
       wb.job_title,wb.site_name,
       case when a.required_count>0 and a.missing_count=0 and a.expired_count=0 and a.expiring_count=0 then true else false end,
       case when a.required_count=0 then 'not_configured' when a.missing_count>0 then 'missing'
            when a.expired_count>0 then 'expired' when a.expiring_count>0 then 'expiring' else 'valid' end::text,
       a.valid_count,a.expiring_count,a.expired_count,a.missing_count,
       '{}'::text[] as missing_required_names
from worker_base wb join agg a on a.worker_id=wb.id;
$$;

create or replace function public.lookup_worker_pass_expiry(p_token uuid)
returns table(worker_id uuid,full_name text,employee_number text,job_title text,site_name text,valid_count integer,expiring_30_count integer,expiring_60_count integer,expiring_90_count integer,expired_count integer,next_expiry_date date,days_until_next_expiry integer,status text)
language sql security definer set search_path=''
as $$
select w.id,trim(concat_ws(' ',w.first_name,w.last_name))::text,
       null::text,w.job_title,s.name,
       count(*) filter(where q.id is not null and (q.expires_on is null or q.expires_on>current_date+90))::int,
       count(*) filter(where q.id is not null and q.expires_on between current_date and current_date+30)::int,
       count(*) filter(where q.id is not null and q.expires_on between current_date+31 and current_date+60)::int,
       count(*) filter(where q.id is not null and q.expires_on between current_date+61 and current_date+90)::int,
       count(*) filter(where q.id is not null and q.expires_on<current_date)::int,
       null::date,null::integer,
       case when count(q.id)=0 then 'review_required'
            when count(*) filter(where q.expires_on is not null and q.expires_on<current_date)>0 then 'review_required'
            when count(*) filter(where q.expires_on is not null and q.expires_on between current_date and current_date+30)>0 then 'expiring_30'
            when count(*) filter(where q.expires_on is not null and q.expires_on between current_date+31 and current_date+60)>0 then 'expiring_60'
            when count(*) filter(where q.expires_on is not null and q.expires_on between current_date+61 and current_date+90)>0 then 'expiring_90'
            else 'ready' end::text
from public.worker_passes wp join public.workers w on w.id=wp.worker_id and w.status='active'
left join public.sites s on s.id=w.site_id left join public.qualifications q on q.worker_id=w.id
where wp.token=p_token and wp.active=true
group by w.id,w.first_name,w.last_name,w.job_title,s.name;
$$;

revoke all on function public.lookup_worker_pass(uuid) from public;
revoke all on function public.lookup_worker_pass_expiry(uuid) from public;
grant execute on function public.lookup_worker_pass(uuid) to anon,authenticated;
grant execute on function public.lookup_worker_pass_expiry(uuid) to anon,authenticated;
