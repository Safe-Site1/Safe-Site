
create or replace function private.is_own_inspection_action_source(
  p_safety_record_id uuid,
  p_organization_id uuid,
  p_site_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.safety_records sr
    where sr.id = p_safety_record_id
      and sr.organization_id = p_organization_id
      and sr.record_type = 'inspection'
      and sr.created_by = auth.uid()
      and (p_site_id is null or sr.site_id = p_site_id)
  );
$$;

grant execute on function private.is_own_inspection_action_source(uuid,uuid,uuid) to authenticated;

drop policy if exists actions_insert_staff on public.corrective_actions;
create policy actions_insert_staff_or_worker_own_inspection
on public.corrective_actions
for insert
to authenticated
with check (
  private.has_org_role(
    organization_id,
    array['administrator','supervisor','safety_coordinator']
  )
  or (
    private.has_org_role(organization_id, array['worker'])
    and safety_record_id is not null
    and private.is_own_inspection_action_source(safety_record_id, organization_id, site_id)
    and status = 'open'
    and assigned_to is null
  )
);

drop policy if exists actions_select_member on public.corrective_actions;
create policy actions_select_staff_client_or_worker_own_inspection
on public.corrective_actions
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['administrator','supervisor','safety_coordinator','client_viewer']
  )
  or (
    private.has_org_role(organization_id, array['worker'])
    and safety_record_id is not null
    and private.is_own_inspection_action_source(safety_record_id, organization_id, site_id)
  )
);
