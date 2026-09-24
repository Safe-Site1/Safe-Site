drop policy if exists documents_manage_staff on public.documents;
create policy documents_manage_admin_safety on public.documents for all to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text]));

grant select on public.documents to authenticated;
grant insert,update,delete on public.documents to authenticated;

create table if not exists public.worker_passes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(worker_id)
);

alter table public.worker_passes enable row level security;

drop policy if exists worker_passes_select_member on public.worker_passes;
create policy worker_passes_select_member on public.worker_passes for select to authenticated using (private.is_org_member(organization_id));

drop policy if exists worker_passes_manage_admin_safety on public.worker_passes;
create policy worker_passes_manage_admin_safety on public.worker_passes for all to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));

grant select,insert,update on public.worker_passes to authenticated;

create or replace function public.ensure_worker_pass(p_worker_id uuid)
returns table(token uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_token uuid;
begin
  select w.organization_id into v_org from public.workers w where w.id=p_worker_id;
  if v_org is null then raise exception 'Worker not found'; end if;
  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id=v_org and om.user_id=auth.uid() and om.active=true and om.role in ('administrator','safety_coordinator')
  ) then raise exception 'Administrator or safety coordinator access required'; end if;

  insert into public.worker_passes(organization_id,worker_id,created_by)
  values(v_org,p_worker_id,auth.uid())
  on conflict(worker_id) do update set active=true,updated_at=now()
  returning worker_passes.token into v_token;

  return query select v_token;
end;
$$;

revoke all on function public.ensure_worker_pass(uuid) from public;
grant execute on function public.ensure_worker_pass(uuid) to authenticated;

create or replace function public.lookup_worker_pass(p_token uuid)
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
  expired_count integer
)
language sql
security definer
set search_path=''
as $$
  select
    w.id,
    trim(concat_ws(' ',w.first_name,w.last_name))::text,
    w.employee_number,
    w.job_title,
    s.name,
    w.ready_for_work,
    case
      when count(q.id)=0 then 'not_verified'
      when count(*) filter (where q.expires_on is not null and q.expires_on < current_date)>0 then 'expired'
      when count(*) filter (where q.expires_on is not null and q.expires_on between current_date and current_date+90)>0 then 'expiring'
      else 'valid'
    end::text,
    count(*) filter (where q.id is not null and (q.expires_on is null or q.expires_on>current_date+90))::int,
    count(*) filter (where q.id is not null and q.expires_on between current_date and current_date+90)::int,
    count(*) filter (where q.id is not null and q.expires_on<current_date)::int
  from public.worker_passes wp
  join public.workers w on w.id=wp.worker_id and w.status='active'
  left join public.sites s on s.id=w.site_id
  left join public.qualifications q on q.worker_id=w.id
  where wp.token=p_token and wp.active=true
  group by w.id,w.first_name,w.last_name,w.employee_number,w.job_title,s.name,w.ready_for_work;
$$;

revoke all on function public.lookup_worker_pass(uuid) from public;
grant execute on function public.lookup_worker_pass(uuid) to anon,authenticated;
