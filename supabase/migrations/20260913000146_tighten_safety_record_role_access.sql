drop policy if exists safety_records_select_member on public.safety_records;
drop policy if exists safety_records_insert_member on public.safety_records;

create policy safety_records_select_staff_client_or_self
on public.safety_records for select
to authenticated
using (
  private.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator','client_viewer']::text[])
  or created_by = auth.uid()
  or (worker_id is not null and private.is_self_worker(worker_id))
);

create policy safety_records_insert_operational
on public.safety_records for insert
to authenticated
with check (
  created_by = auth.uid()
  and private.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator','worker']::text[])
);
