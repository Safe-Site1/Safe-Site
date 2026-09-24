create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('administrator','supervisor','safety_coordinator','worker','client_viewer')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.team_invitations enable row level security;

drop policy if exists team_invitations_admin_manage on public.team_invitations;
create policy team_invitations_admin_manage
on public.team_invitations
for all
to authenticated
using (private.has_org_role(organization_id, array['administrator']::text[]))
with check (private.has_org_role(organization_id, array['administrator']::text[]));

create or replace function public.create_team_invitation(
  p_email text,
  p_full_name text,
  p_role text,
  p_site_id uuid default null
)
returns table(invitation_id uuid, invitation_token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_org uuid;
  v_id uuid;
  v_token uuid;
  v_expires timestamptz;
begin
  select om.organization_id into v_org
  from public.organization_memberships om
  where om.user_id = auth.uid() and om.active = true and om.role = 'administrator'
  order by om.created_at
  limit 1;

  if v_org is null then
    raise exception 'Administrator access required';
  end if;

  if p_role not in ('administrator','supervisor','safety_coordinator','worker','client_viewer') then
    raise exception 'Invalid role';
  end if;

  if p_site_id is not null and not exists (
    select 1 from public.sites s where s.id = p_site_id and s.organization_id = v_org and s.active = true
  ) then
    raise exception 'Invalid site';
  end if;

  update public.team_invitations
  set status='revoked'
  where organization_id=v_org and lower(email)=lower(trim(p_email)) and status='pending';

  insert into public.team_invitations(organization_id,site_id,email,full_name,role,invited_by)
  values(v_org,p_site_id,lower(trim(p_email)),nullif(trim(p_full_name),''),p_role,auth.uid())
  returning id, token, team_invitations.expires_at into v_id, v_token, v_expires;

  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.accept_team_invitation(p_token uuid)
returns table(organization_id uuid, role text, site_id uuid)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_inv public.team_invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  v_email := lower(coalesce(auth.jwt()->>'email',''));

  select * into v_inv
  from public.team_invitations ti
  where ti.token = p_token
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if v_inv.status <> 'pending' then raise exception 'Invitation is no longer active'; end if;
  if v_inv.expires_at < now() then
    update public.team_invitations set status='expired' where id=v_inv.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(v_inv.email) <> v_email then raise exception 'Sign in with the invited email address'; end if;

  insert into public.profiles(id,email,full_name)
  values(auth.uid(),v_email,v_inv.full_name)
  on conflict(id) do update set email=excluded.email, full_name=coalesce(nullif(excluded.full_name,''),public.profiles.full_name), updated_at=now();

  insert into public.organization_memberships(organization_id,user_id,role,active)
  values(v_inv.organization_id,auth.uid(),v_inv.role,true)
  on conflict do nothing;

  update public.organization_memberships
  set role=v_inv.role, active=true
  where organization_id=v_inv.organization_id and user_id=auth.uid();

  if v_inv.site_id is not null then
    insert into public.site_memberships(site_id,user_id)
    select v_inv.site_id,auth.uid()
    where not exists(select 1 from public.site_memberships sm where sm.site_id=v_inv.site_id and sm.user_id=auth.uid());
  end if;

  update public.team_invitations
  set status='accepted',accepted_by=auth.uid(),accepted_at=now()
  where id=v_inv.id;

  return query select v_inv.organization_id,v_inv.role,v_inv.site_id;
end;
$$;

grant execute on function public.create_team_invitation(text,text,text,uuid) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
