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
    update public.team_invitations ti set status='expired' where ti.id=v_inv.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(v_inv.email) <> v_email then raise exception 'Sign in with the invited email address'; end if;

  insert into public.profiles(id,email,full_name)
  values(auth.uid(),v_email,v_inv.full_name)
  on conflict(id) do update set email=excluded.email, full_name=coalesce(nullif(excluded.full_name,''),public.profiles.full_name), updated_at=now();

  insert into public.organization_memberships(organization_id,user_id,role,active)
  values(v_inv.organization_id,auth.uid(),v_inv.role,true)
  on conflict do nothing;

  update public.organization_memberships om
  set role=v_inv.role, active=true
  where om.organization_id=v_inv.organization_id and om.user_id=auth.uid();

  if v_inv.site_id is not null then
    insert into public.site_memberships(site_id,user_id)
    select v_inv.site_id,auth.uid()
    where not exists(select 1 from public.site_memberships sm where sm.site_id=v_inv.site_id and sm.user_id=auth.uid());
  end if;

  update public.team_invitations ti
  set status='accepted',accepted_by=auth.uid(),accepted_at=now()
  where ti.id=v_inv.id;

  return query select v_inv.organization_id,v_inv.role,v_inv.site_id;
end;
$$;
