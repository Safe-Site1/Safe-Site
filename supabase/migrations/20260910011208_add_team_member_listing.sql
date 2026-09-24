create or replace function public.list_team_members()
returns table(user_id uuid, email text, full_name text, role text, active boolean, site_names text[])
language sql
security definer
set search_path = public, private, auth
as $$
  with my_org as (
    select om.organization_id
    from public.organization_memberships om
    where om.user_id=auth.uid() and om.active=true and om.role='administrator'
    order by om.created_at limit 1
  )
  select om.user_id,
         p.email,
         p.full_name,
         om.role,
         om.active,
         coalesce(array_agg(distinct s.name) filter (where s.name is not null), array[]::text[]) as site_names
  from public.organization_memberships om
  join my_org mo on mo.organization_id=om.organization_id
  left join public.profiles p on p.id=om.user_id
  left join public.site_memberships sm on sm.user_id=om.user_id
  left join public.sites s on s.id=sm.site_id and s.organization_id=om.organization_id
  group by om.user_id,p.email,p.full_name,om.role,om.active;
$$;

grant execute on function public.list_team_members() to authenticated;
