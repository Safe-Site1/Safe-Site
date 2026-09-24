create or replace function public.accept_team_invitation(p_token uuid)
returns table(organization_id uuid, role text, site_id uuid)
language plpgsql
security definer
set search_path to 'public','private','auth'
as $function$
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
  on conflict (organization_id,user_id) do update set role=excluded.role, active=true;

  /* If account bootstrap raced ahead of invite acceptance, disable only the
     automatically-created Safe Site Pilot admin membership. Legitimate
     memberships in other organizations are left untouched. */
  update public.organization_memberships om
  set active=false
  from public.organizations o
  where om.user_id=auth.uid()
    and om.organization_id=o.id
    and om.organization_id<>v_inv.organization_id
    and om.active=true
    and om.role='administrator'
    and o.slug like 'safe-site-pilot-%';

  if v_inv.site_id is not null then
    insert into public.site_memberships(site_id,user_id)
    values(v_inv.site_id,auth.uid())
    on conflict do nothing;
  end if;

  update public.team_invitations ti
  set status='accepted',accepted_by=auth.uid(),accepted_at=now()
  where ti.id=v_inv.id;

  return query select v_inv.organization_id,v_inv.role,v_inv.site_id;
end;
$function$;
