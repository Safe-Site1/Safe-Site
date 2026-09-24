insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('worker-documents','worker-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "Safe Site members read worker documents" on storage.objects;
create policy "Safe Site members read worker documents" on storage.objects for select to authenticated using (bucket_id='worker-documents' and exists (select 1 from public.organization_memberships om where om.user_id=auth.uid() and om.active=true and om.organization_id::text=(storage.foldername(name))[1]));

drop policy if exists "Safe Site admins upload worker documents" on storage.objects;
create policy "Safe Site admins upload worker documents" on storage.objects for insert to authenticated with check (bucket_id='worker-documents' and exists (select 1 from public.organization_memberships om where om.user_id=auth.uid() and om.active=true and om.role in ('administrator','safety_coordinator') and om.organization_id::text=(storage.foldername(name))[1]));

drop policy if exists "Safe Site admins delete worker documents" on storage.objects;
create policy "Safe Site admins delete worker documents" on storage.objects for delete to authenticated using (bucket_id='worker-documents' and exists (select 1 from public.organization_memberships om where om.user_id=auth.uid() and om.active=true and om.role in ('administrator','safety_coordinator') and om.organization_id::text=(storage.foldername(name))[1]));
