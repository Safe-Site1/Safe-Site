drop policy if exists memberships_bootstrap_insert on public.organization_memberships;
drop policy if exists memberships_insert_admin on public.organization_memberships;
create policy memberships_insert_admin_or_bootstrap on public.organization_memberships for insert to authenticated with check (
  private.has_org_role(organization_id,array['administrator'::text])
  or (
    user_id=(select auth.uid())
    and role='administrator'
    and not exists (select 1 from public.organization_memberships existing where existing.organization_id=organization_memberships.organization_id)
  )
);

drop policy if exists site_memberships_insert_self on public.site_memberships;
