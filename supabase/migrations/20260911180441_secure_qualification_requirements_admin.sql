alter table public.qualification_requirements enable row level security;

drop policy if exists qualification_requirements_select_member on public.qualification_requirements;
create policy qualification_requirements_select_member on public.qualification_requirements
for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists qualification_requirements_manage_admin on public.qualification_requirements;
create policy qualification_requirements_manage_admin on public.qualification_requirements
for all to authenticated
using (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text]))
with check (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text]));
