grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update on public.organization_memberships to authenticated;
grant select, insert, update on public.sites to authenticated;
grant select, insert, update on public.site_memberships to authenticated;
grant select, insert, update, delete on public.workers to authenticated;
grant select, insert, update, delete on public.qualifications to authenticated;
grant select, insert, update, delete on public.task_templates to authenticated;
grant select, insert, update, delete on public.task_template_hazards to authenticated;
grant select, insert, update, delete on public.task_template_controls to authenticated;
grant select, insert, update, delete on public.safety_records to authenticated;
grant select, insert, update, delete on public.corrective_actions to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert on public.audit_log to authenticated;

create policy "profiles_insert_self" on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy "organizations_bootstrap_insert" on public.organizations
for insert to authenticated
with check (auth.uid() is not null);

create policy "memberships_bootstrap_insert" on public.organization_memberships
for insert to authenticated
with check (
  user_id = auth.uid()
  and role = 'administrator'
  and not exists (
    select 1 from public.organization_memberships existing
    where existing.organization_id = organization_memberships.organization_id
  )
);

create policy "site_memberships_insert_self" on public.site_memberships
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.sites s
    where s.id = site_id
      and public.has_org_role(s.organization_id, array['administrator'])
  )
);
