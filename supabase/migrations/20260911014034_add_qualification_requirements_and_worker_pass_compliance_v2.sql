create table if not exists public.qualification_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  job_title text not null,
  qualification_name text not null,
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists qualification_requirements_site_role_qual_uq
  on public.qualification_requirements(site_id, lower(job_title), lower(qualification_name));

alter table public.qualification_requirements enable row level security;

insert into public.qualification_requirements
  (organization_id, site_id, job_title, qualification_name, aliases)
values
  ('66aa534f-d01d-4f2d-a281-180db88dd4a4','9c1be2ed-5dd9-4492-a9a3-cb5331e2f8a0','Construction Miner','Ontario common core',array['Underground Hard Rock Miner']),
  ('66aa534f-d01d-4f2d-a281-180db88dd4a4','9c1be2ed-5dd9-4492-a9a3-cb5331e2f8a0','Construction Miner','First aid',array[]::text[]),
  ('66aa534f-d01d-4f2d-a281-180db88dd4a4','9c1be2ed-5dd9-4492-a9a3-cb5331e2f8a0','Construction Miner','WHMIS',array[]::text[]),
  ('66aa534f-d01d-4f2d-a281-180db88dd4a4','9c1be2ed-5dd9-4492-a9a3-cb5331e2f8a0','Construction Miner','Site induction',array['Site orientation'])
on conflict do nothing;

drop function if exists public.lookup_worker_pass(uuid);

create function public.lookup_worker_pass(p_token uuid)
returns table(
  worker_id uuid,
  full_name text,
  employee_number text,
  job_title text,
  site_name text,
  ready_for_work boolean,
  qualification_status text,
  valid_count integer,
  expiring_count integer,
  expired_count integer,
  missing_required_count integer,
  missing_required_names text[]
)
language sql
security definer
set search_path = ''
as $function$
with worker_base as (
  select
    w.id,
    w.organization_id,
    w.site_id,
    trim(concat_ws(' ',w.first_name,w.last_name))::text as full_name,
    w.employee_number,
    w.job_title,
    s.name::text as site_name
  from public.worker_passes wp
  join public.workers w on w.id=wp.worker_id and w.status='active'
  left join public.sites s on s.id=w.site_id
  where wp.token=p_token and wp.active=true
),
reqs as (
  select wb.id as worker_id, r.id as requirement_id, r.qualification_name, r.aliases
  from worker_base wb
  join public.qualification_requirements r
    on r.organization_id=wb.organization_id
   and r.site_id=wb.site_id
   and r.active=true
   and lower(trim(r.job_title))=lower(trim(wb.job_title))
),
matched as (
  select
    r.worker_id,
    r.requirement_id,
    r.qualification_name,
    q.id as qualification_id,
    q.expires_on
  from reqs r
  left join lateral (
    select q.id,q.expires_on
    from public.qualifications q
    where q.worker_id=r.worker_id
      and (
        lower(trim(q.name))=lower(trim(r.qualification_name))
        or exists (
          select 1 from unnest(r.aliases) a
          where lower(trim(a))=lower(trim(q.name))
        )
      )
    order by case when q.expires_on is null then 1 else 0 end desc, q.expires_on desc nulls first
    limit 1
  ) q on true
),
agg as (
  select
    wb.id as worker_id,
    count(m.requirement_id)::int as required_count,
    count(*) filter (where m.qualification_id is not null and (m.expires_on is null or m.expires_on > current_date + 30))::int as valid_count,
    count(*) filter (where m.qualification_id is not null and m.expires_on between current_date and current_date + 30)::int as expiring_count,
    count(*) filter (where m.qualification_id is not null and m.expires_on < current_date)::int as expired_count,
    count(*) filter (where m.requirement_id is not null and m.qualification_id is null)::int as missing_count,
    coalesce(array_agg(m.qualification_name order by m.qualification_name) filter (where m.requirement_id is not null and m.qualification_id is null), '{}'::text[]) as missing_names
  from worker_base wb
  left join matched m on m.worker_id=wb.id
  group by wb.id
)
select
  wb.id,
  wb.full_name,
  wb.employee_number,
  wb.job_title,
  wb.site_name,
  case when a.required_count>0 and a.missing_count=0 and a.expired_count=0 and a.expiring_count=0 then true else false end,
  case
    when a.required_count=0 then 'not_configured'
    when a.missing_count>0 then 'missing'
    when a.expired_count>0 then 'expired'
    when a.expiring_count>0 then 'expiring'
    else 'valid'
  end::text,
  a.valid_count,
  a.expiring_count,
  a.expired_count,
  a.missing_count,
  a.missing_names
from worker_base wb
join agg a on a.worker_id=wb.id;
$function$;

grant execute on function public.lookup_worker_pass(uuid) to anon, authenticated;
