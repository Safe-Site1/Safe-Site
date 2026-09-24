
create or replace function public.accept_team_invitation(p_token uuid)
returns table(organization_id uuid, role text, site_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inv public.team_invitations%rowtype;
  v_email text;
  v_worker_id uuid;
  v_name text;
  v_first text;
  v_last text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_email := lower(coalesce(auth.jwt()->>'email',''));

  select *
  into v_inv
  from public.team_invitations ti
  where ti.token = p_token
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Invitation is no longer active';
  end if;

  if v_inv.expires_at < now() then
    update public.team_invitations ti
    set status = 'expired'
    where ti.id = v_inv.id;
    raise exception 'Invitation has expired';
  end if;

  if lower(v_inv.email) <> v_email then
    raise exception 'Sign in with the invited email address';
  end if;

  insert into public.profiles(id,email,full_name)
  values(auth.uid(),v_email,v_inv.full_name)
  on conflict(id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(excluded.full_name,''),public.profiles.full_name),
      updated_at = now();

  insert into public.organization_memberships(organization_id,user_id,role,active)
  values(v_inv.organization_id,auth.uid(),v_inv.role,true)
  on conflict(organization_id,user_id) do update
  set role = excluded.role,
      active = true;

  update public.organization_memberships om
  set active = false
  from public.organizations o
  where om.user_id = auth.uid()
    and om.organization_id = o.id
    and om.organization_id <> v_inv.organization_id
    and om.active = true
    and om.role = 'administrator'
    and o.slug like 'safe-site-pilot-%';

  delete from public.site_memberships sm
  using public.sites s, public.organizations o
  where sm.user_id = auth.uid()
    and sm.site_id = s.id
    and s.organization_id = o.id
    and s.organization_id <> v_inv.organization_id
    and o.slug like 'safe-site-pilot-%';

  if v_inv.site_id is not null then
    insert into public.site_memberships(site_id,user_id)
    values(v_inv.site_id,auth.uid())
    on conflict do nothing;
  end if;

  if v_inv.role = 'worker' then
    select w.id
    into v_worker_id
    from public.workers w
    where w.user_id = auth.uid()
      and w.organization_id = v_inv.organization_id
    order by w.created_at
    limit 1;

    if v_worker_id is null and coalesce(btrim(v_inv.full_name),'') <> '' then
      select w.id
      into v_worker_id
      from public.workers w
      where w.organization_id = v_inv.organization_id
        and w.user_id is null
        and lower(btrim(w.first_name || ' ' || w.last_name)) = lower(btrim(v_inv.full_name))
        and (v_inv.site_id is null or w.site_id = v_inv.site_id)
      order by w.created_at
      limit 1;

      if v_worker_id is not null then
        update public.workers
        set user_id = auth.uid(),
            updated_at = now()
        where id = v_worker_id;
      end if;
    end if;

    if v_worker_id is null then
      v_name := coalesce(nullif(btrim(v_inv.full_name),''), split_part(v_email,'@',1), 'Worker');
      v_first := split_part(v_name,' ',1);
      v_last := nullif(btrim(substr(v_name,length(v_first)+1)),'');
      if v_last is null then
        v_last := 'Worker';
      end if;

      insert into public.workers(
        organization_id,site_id,first_name,last_name,job_title,status,ready_for_work,user_id
      )
      values(
        v_inv.organization_id,v_inv.site_id,v_first,v_last,'Worker','active',false,auth.uid()
      )
      returning id into v_worker_id;
    end if;
  end if;

  update public.team_invitations ti
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  where ti.id = v_inv.id;

  return query
  select v_inv.organization_id,v_inv.role,v_inv.site_id;
end
$function$;
