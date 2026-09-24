
alter table public.workers
  add column if not exists email text;

alter table public.onboarding_worker_rows
  add column if not exists email text;

alter table public.team_invitations
  add column if not exists employee_number text;

create index if not exists workers_org_email_idx
  on public.workers(organization_id,lower(email))
  where email is not null;

create index if not exists team_invitations_org_employee_idx
  on public.team_invitations(organization_id,lower(employee_number))
  where employee_number is not null;

comment on column public.workers.email is
  'Optional work/contact email used for enterprise onboarding and invitation matching; authentication identity remains auth.users.';
comment on column public.team_invitations.employee_number is
  'Optional stable worker match key. New worker invitations should prefer Employee Number over name matching.';

drop function if exists public.create_team_invitation(text,text,text,uuid);

create function public.create_team_invitation(
  p_email text,
  p_full_name text,
  p_role text,
  p_site_id uuid default null,
  p_employee_number text default null
)
returns table(invitation_id uuid, invitation_token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_token uuid;
  v_expires timestamptz;
  v_employee text:=nullif(btrim(p_employee_number),'');
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select om.organization_id into v_org
  from public.organization_memberships om
  where om.user_id=auth.uid()
    and om.active=true
    and om.role='administrator'
  order by om.created_at
  limit 1;

  if v_org is null then
    raise exception 'Administrator access required';
  end if;

  if nullif(btrim(p_email),'') is null
     or lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid email address required';
  end if;

  if p_role not in ('administrator','supervisor','safety_coordinator','worker','client_viewer') then
    raise exception 'Invalid role';
  end if;

  if p_site_id is not null
     and not exists(
       select 1 from public.sites s
       where s.id=p_site_id
         and s.organization_id=v_org
         and s.active=true
     ) then
    raise exception 'Invalid site';
  end if;

  if p_role<>'worker' then
    v_employee:=null;
  elsif v_employee is not null then
    if not exists(
      select 1 from public.workers w
      where w.organization_id=v_org
        and lower(btrim(coalesce(w.employee_number,'')))=lower(v_employee)
        and (p_site_id is null or w.site_id=p_site_id)
    ) then
      raise exception 'Employee Number does not match a worker in the selected site';
    end if;
  end if;

  update public.team_invitations
  set status='revoked'
  where organization_id=v_org
    and lower(email)=lower(btrim(p_email))
    and status='pending';

  insert into public.team_invitations(
    organization_id,site_id,email,full_name,role,invited_by,employee_number
  )
  values(
    v_org,p_site_id,lower(btrim(p_email)),nullif(btrim(p_full_name),''),
    p_role,auth.uid(),v_employee
  )
  returning id,token,team_invitations.expires_at
  into v_id,v_token,v_expires;

  return query select v_id,v_token,v_expires;
end;
$$;

revoke all on function public.create_team_invitation(text,text,text,uuid,text) from public,anon;
grant execute on function public.create_team_invitation(text,text,text,uuid,text) to authenticated;

create or replace function public.accept_team_invitation(p_token uuid)
returns table(organization_id uuid, role text, site_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.team_invitations%rowtype;
  v_email text;
  v_worker_id uuid;
  v_worker_user uuid;
  v_name text;
  v_first text;
  v_last text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_email:=lower(coalesce(auth.jwt()->>'email',''));

  select *
  into v_inv
  from public.team_invitations ti
  where ti.token=p_token
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_inv.status<>'pending' then
    raise exception 'Invitation is no longer active';
  end if;

  if v_inv.expires_at<now() then
    update public.team_invitations ti
    set status='expired'
    where ti.id=v_inv.id;
    raise exception 'Invitation has expired';
  end if;

  if lower(v_inv.email)<>v_email then
    raise exception 'Sign in with the invited email address';
  end if;

  insert into public.profiles(id,email,full_name)
  values(auth.uid(),v_email,v_inv.full_name)
  on conflict(id) do update
  set email=excluded.email,
      full_name=coalesce(nullif(excluded.full_name,''),public.profiles.full_name),
      updated_at=now();

  insert into public.organization_memberships(organization_id,user_id,role,active)
  values(v_inv.organization_id,auth.uid(),v_inv.role,true)
  on conflict(organization_id,user_id) do update
  set role=excluded.role,
      active=true;

  update public.organization_memberships om
  set active=false
  from public.organizations o
  where om.user_id=auth.uid()
    and om.organization_id=o.id
    and om.organization_id<>v_inv.organization_id
    and om.active=true
    and om.role='administrator'
    and o.slug like 'safe-site-pilot-%';

  delete from public.site_memberships sm
  using public.sites s,public.organizations o
  where sm.user_id=auth.uid()
    and sm.site_id=s.id
    and s.organization_id=o.id
    and s.organization_id<>v_inv.organization_id
    and o.slug like 'safe-site-pilot-%';

  if v_inv.site_id is not null then
    insert into public.site_memberships(site_id,user_id)
    values(v_inv.site_id,auth.uid())
    on conflict do nothing;
  end if;

  if v_inv.role='worker' then
    -- Already-linked profile for this account wins first.
    select w.id
    into v_worker_id
    from public.workers w
    where w.user_id=auth.uid()
      and w.organization_id=v_inv.organization_id
    order by w.created_at
    limit 1;

    -- New enterprise invitations prefer the stable Employee Number key.
    if v_worker_id is null and nullif(btrim(v_inv.employee_number),'') is not null then
      select w.id,w.user_id
      into v_worker_id,v_worker_user
      from public.workers w
      where w.organization_id=v_inv.organization_id
        and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(v_inv.employee_number))
        and (v_inv.site_id is null or w.site_id=v_inv.site_id)
      order by w.created_at
      limit 1;

      if v_worker_id is null then
        raise exception 'Worker profile for the invited Employee Number was not found';
      end if;

      if v_worker_user is not null and v_worker_user<>auth.uid() then
        raise exception 'Worker profile is already linked to another account';
      end if;

      update public.workers
      set user_id=auth.uid(),
          email=coalesce(nullif(email,''),v_email),
          updated_at=now()
      where id=v_worker_id;
    end if;

    -- Legacy invitations without Employee Number retain the old exact-name fallback.
    if v_worker_id is null
       and nullif(btrim(v_inv.employee_number),'') is null
       and coalesce(btrim(v_inv.full_name),'')<>'' then
      select w.id
      into v_worker_id
      from public.workers w
      where w.organization_id=v_inv.organization_id
        and w.user_id is null
        and lower(btrim(w.first_name||' '||w.last_name))=lower(btrim(v_inv.full_name))
        and (v_inv.site_id is null or w.site_id=v_inv.site_id)
      order by w.created_at
      limit 1;

      if v_worker_id is not null then
        update public.workers
        set user_id=auth.uid(),
            email=coalesce(nullif(email,''),v_email),
            updated_at=now()
        where id=v_worker_id;
      end if;
    end if;

    -- Legacy behavior: only invitations without an Employee Number may create a new Worker.
    if v_worker_id is null then
      if nullif(btrim(v_inv.employee_number),'') is not null then
        raise exception 'Worker profile for the invited Employee Number could not be linked';
      end if;

      v_name:=coalesce(nullif(btrim(v_inv.full_name),''),split_part(v_email,'@',1),'Worker');
      v_first:=split_part(v_name,' ',1);
      v_last:=nullif(btrim(substr(v_name,length(v_first)+1)),'');
      if v_last is null then v_last:='Worker'; end if;

      insert into public.workers(
        organization_id,site_id,first_name,last_name,job_title,status,ready_for_work,user_id,email
      )
      values(
        v_inv.organization_id,v_inv.site_id,v_first,v_last,'Worker','active',false,auth.uid(),v_email
      )
      returning id into v_worker_id;
    end if;
  end if;

  update public.team_invitations ti
  set status='accepted',
      accepted_by=auth.uid(),
      accepted_at=now()
  where ti.id=v_inv.id;

  return query
  select v_inv.organization_id,v_inv.role,v_inv.site_id;
end;
$$;

revoke all on function public.accept_team_invitation(uuid) from public,anon;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
