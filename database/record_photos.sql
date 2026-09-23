-- Private, append-only photo evidence for saved field reports. No overwrite/delete policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('record-photos','record-photos',false,10485760,array['image/jpeg','image/png','image/webp']);

create policy record_photos_read on storage.objects for select to authenticated using (
 bucket_id='record-photos' and exists(
  select 1 from public.safety_records r
  where r.organization_id::text=(storage.foldername(name))[1] and r.id::text=(storage.foldername(name))[2]
   and r.record_type in ('inspection','incident','near_miss')
   and private.has_org_role(r.organization_id,array['administrator','supervisor','safety_coordinator','worker','client_viewer'])
  -- The safety_records SELECT policy further limits workers to their visible records.
 )
);
create policy record_photos_insert on storage.objects for insert to authenticated with check (
 bucket_id='record-photos' and array_length(storage.foldername(name),1)=2
 and storage.filename(name) ~ '^[a-f0-9]{64}\.(jpg|png|webp)$'
 and owner_id=(select auth.uid())::text
 and exists(
  select 1 from public.safety_records r
  where r.organization_id::text=(storage.foldername(name))[1] and r.id::text=(storage.foldername(name))[2]
   and r.record_type in ('inspection','incident','near_miss') and r.status='submitted'
   and (private.has_org_role(r.organization_id,array['administrator','supervisor','safety_coordinator'])
     or (r.created_by=(select auth.uid()) and private.has_org_role(r.organization_id,array['worker'])))
 )
);
