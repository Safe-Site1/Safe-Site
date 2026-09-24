
create or replace function public.create_team_invitation(p_email text,p_full_name text,p_role text,p_site_id uuid default null)
returns table(invitation_id uuid,invitation_token uuid,expires_at timestamptz)
language plpgsql security definer
set search_path=''
as $$
declare v_org uuid; v_id uuid; v_token uuid; v_expires timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select om.organization_id into v_org
 from public.organization_memberships om
 where om.user_id=auth.uid() and om.active=true and om.role='administrator'
 order by om.created_at limit 1;
 if v_org is null then raise exception 'Administrator access required'; end if;
 if p_role not in ('administrator','supervisor','safety_coordinator','worker','client_viewer') then raise exception 'Invalid role'; end if;
 if p_site_id is not null and not exists(select 1 from public.sites s where s.id=p_site_id and s.organization_id=v_org and s.active=true) then raise exception 'Invalid site'; end if;
 update public.team_invitations set status='revoked' where organization_id=v_org and lower(email)=lower(trim(p_email)) and status='pending';
 insert into public.team_invitations(organization_id,site_id,email,full_name,role,invited_by)
 values(v_org,p_site_id,lower(trim(p_email)),nullif(trim(p_full_name),''),p_role,auth.uid())
 returning id,token,team_invitations.expires_at into v_id,v_token,v_expires;
 return query select v_id,v_token,v_expires;
end $$;

create or replace function public.accept_team_invitation(p_token uuid)
returns table(organization_id uuid,role text,site_id uuid)
language plpgsql security definer
set search_path=''
as $$
declare v_inv public.team_invitations%rowtype; v_email text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 v_email:=lower(coalesce(auth.jwt()->>'email',''));
 select * into v_inv from public.team_invitations ti where ti.token=p_token for update;
 if not found then raise exception 'Invitation not found'; end if;
 if v_inv.status<>'pending' then raise exception 'Invitation is no longer active'; end if;
 if v_inv.expires_at<now() then update public.team_invitations ti set status='expired' where ti.id=v_inv.id; raise exception 'Invitation has expired'; end if;
 if lower(v_inv.email)<>v_email then raise exception 'Sign in with the invited email address'; end if;
 insert into public.profiles(id,email,full_name) values(auth.uid(),v_email,v_inv.full_name)
 on conflict(id) do update set email=excluded.email,full_name=coalesce(nullif(excluded.full_name,''),public.profiles.full_name),updated_at=now();
 insert into public.organization_memberships(organization_id,user_id,role,active)
 values(v_inv.organization_id,auth.uid(),v_inv.role,true)
 on conflict(organization_id,user_id) do update set role=excluded.role,active=true;
 update public.organization_memberships om set active=false
 from public.organizations o
 where om.user_id=auth.uid() and om.organization_id=o.id and om.organization_id<>v_inv.organization_id
 and om.active=true and om.role='administrator' and o.slug like 'safe-site-pilot-%';
 if v_inv.site_id is not null then
  insert into public.site_memberships(site_id,user_id) values(v_inv.site_id,auth.uid()) on conflict do nothing;
 end if;
 update public.team_invitations ti set status='accepted',accepted_by=auth.uid(),accepted_at=now() where ti.id=v_inv.id;
 return query select v_inv.organization_id,v_inv.role,v_inv.site_id;
end $$;

create or replace function public.list_team_members()
returns table(user_id uuid,email text,full_name text,role text,active boolean,site_names text[])
language sql security definer
set search_path=''
as $$
 with my_org as (
  select om.organization_id from public.organization_memberships om
  where om.user_id=auth.uid() and om.active=true and om.role='administrator'
  order by om.created_at limit 1)
 select om.user_id,p.email,p.full_name,om.role,om.active,
 coalesce(array_agg(distinct s.name) filter(where s.name is not null),array[]::text[])
 from public.organization_memberships om join my_org mo on mo.organization_id=om.organization_id
 left join public.profiles p on p.id=om.user_id
 left join public.site_memberships sm on sm.user_id=om.user_id
 left join public.sites s on s.id=sm.site_id and s.organization_id=om.organization_id
 group by om.user_id,p.email,p.full_name,om.role,om.active;
$$;

revoke all on function public.create_team_invitation(text,text,text,uuid) from public,anon;
revoke all on function public.accept_team_invitation(uuid) from public,anon;
revoke all on function public.list_team_members() from public,anon;
revoke all on function public.ensure_worker_pass(uuid) from public,anon;
grant execute on function public.create_team_invitation(text,text,text,uuid) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.list_team_members() to authenticated;
grant execute on function public.ensure_worker_pass(uuid) to authenticated;
