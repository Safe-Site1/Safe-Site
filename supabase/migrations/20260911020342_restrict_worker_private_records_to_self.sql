drop policy if exists workers_select_member on public.workers;
create policy workers_select_authorized
on public.workers for select
to authenticated
using (
  private.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])
  or user_id = auth.uid()
);

drop policy if exists qualifications_select_member on public.qualifications;
create policy qualifications_select_authorized
on public.qualifications for select
to authenticated
using (
  private.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])
  or private.is_self_worker(worker_id)
);

drop policy if exists documents_select_member on public.documents;
create policy documents_select_authorized
on public.documents for select
to authenticated
using (
  private.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])
  or (worker_id is not null and private.is_self_worker(worker_id))
);

drop policy if exists worker_passes_select_member on public.worker_passes;
create policy worker_passes_select_authorized
on public.worker_passes for select
to authenticated
using (
  private.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])
  or private.is_self_worker(worker_id)
);

drop policy if exists "Safe Site members read worker documents" on storage.objects;
create policy "Safe Site authorized read worker documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'worker-documents'
  and (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.active = true
        and om.role in ('administrator','supervisor','safety_coordinator')
        and om.organization_id::text = (storage.foldername(name))[1]
    )
    or exists (
      select 1 from public.workers w
      where w.user_id = auth.uid()
        and w.organization_id::text = (storage.foldername(name))[1]
        and w.id::text = (storage.foldername(name))[2]
    )
  )
);
