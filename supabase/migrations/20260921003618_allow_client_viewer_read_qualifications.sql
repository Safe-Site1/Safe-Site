
drop policy if exists qualifications_select_authorized on public.qualifications;
create policy qualifications_select_authorized
on public.qualifications
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['administrator','supervisor','safety_coordinator','client_viewer']::text[]
  )
  or private.is_self_worker(worker_id)
);
