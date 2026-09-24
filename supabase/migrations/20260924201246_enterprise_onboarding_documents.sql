
create or replace function public.get_enterprise_onboarding_document_targets(p_batch_id uuid)
returns table(
  row_number integer,
  employee_number text,
  worker_id uuid,
  qualification_name text,
  qualification_id uuid,
  file_name text,
  document_type text,
  uploaded_document_id uuid
)
language plpgsql
security invoker
set search_path=''
as $$
declare
  b public.onboarding_batches%rowtype;
begin
  select * into b from public.onboarding_batches where id=p_batch_id;
  if not found then raise exception 'Onboarding batch not found' using errcode='P0002'; end if;
  if not private.has_org_role(b.organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  return query
  select d.row_number,d.employee_number,w.id,d.qualification_name,q.id,d.file_name,d.document_type,d.uploaded_document_id
  from public.onboarding_document_rows d
  join public.workers w
    on w.organization_id=b.organization_id
   and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(d.employee_number))
  left join lateral (
    select qq.id
    from public.qualifications qq
    where qq.organization_id=b.organization_id
      and qq.worker_id=w.id
      and d.qualification_name is not null
      and lower(btrim(qq.name))=lower(btrim(d.qualification_name))
    order by qq.expires_on desc nulls last,qq.created_at desc
    limit 1
  ) q on true
  where d.batch_id=p_batch_id
    and cardinality(d.validation_errors)=0
  order by d.row_number;
end;
$$;

create or replace function public.register_enterprise_onboarding_document(
  p_batch_id uuid,
  p_row_number integer,
  p_storage_path text,
  p_mime_type text
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  b public.onboarding_batches%rowtype;
  d public.onboarding_document_rows%rowtype;
  wid uuid;
  qid uuid;
  docid uuid;
  remaining integer;
begin
  select * into b from public.onboarding_batches where id=p_batch_id for update;
  if not found then raise exception 'Onboarding batch not found' using errcode='P0002'; end if;
  if not private.has_org_role(b.organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;
  if b.status not in ('documents_pending','complete') then
    raise exception 'Commit the validated onboarding batch before uploading documents' using errcode='23514';
  end if;

  select * into d
  from public.onboarding_document_rows
  where batch_id=p_batch_id and row_number=p_row_number
  for update;

  if not found then raise exception 'Document index row not found' using errcode='P0002'; end if;
  if cardinality(d.validation_errors)>0 then
    raise exception 'Document index row has validation errors' using errcode='23514';
  end if;

  if d.uploaded_document_id is not null then
    return d.uploaded_document_id;
  end if;

  select w.id into wid
  from public.workers w
  where w.organization_id=b.organization_id
    and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(d.employee_number))
  limit 1;

  if wid is null then
    raise exception 'Worker could not be resolved for document' using errcode='23514';
  end if;

  if d.qualification_name is not null then
    select q.id into qid
    from public.qualifications q
    where q.organization_id=b.organization_id
      and q.worker_id=wid
      and lower(btrim(q.name))=lower(btrim(d.qualification_name))
    order by q.expires_on desc nulls last,q.created_at desc
    limit 1;

    if qid is null then
      raise exception 'Qualification could not be resolved for document' using errcode='23514';
    end if;
  end if;

  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then
    raise exception 'Unsupported document type' using errcode='23514';
  end if;

  if p_storage_path is null
     or split_part(p_storage_path,'/',1)<>b.organization_id::text
     or split_part(p_storage_path,'/',2)<>wid::text
     or split_part(p_storage_path,'/',3)<>p_batch_id::text then
    raise exception 'Document storage path does not match the onboarding batch and worker' using errcode='23514';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id='worker-documents'
      and o.name=p_storage_path
  ) then
    raise exception 'Uploaded document file was not found in secure storage' using errcode='23514';
  end if;

  insert into public.documents(
    organization_id,worker_id,qualification_id,file_name,storage_path,mime_type,
    uploaded_by,onboarding_batch_id,onboarding_row_number
  )
  values(
    b.organization_id,wid,qid,d.file_name,p_storage_path,p_mime_type,
    auth.uid(),p_batch_id,p_row_number
  )
  on conflict (onboarding_batch_id,onboarding_row_number)
  where onboarding_batch_id is not null and onboarding_row_number is not null
  do update
  set storage_path=excluded.storage_path,
      mime_type=excluded.mime_type
  returning id into docid;

  update public.onboarding_document_rows
  set uploaded_document_id=docid,
      uploaded_at=clock_timestamp(),
      proposed_action='skip'
  where id=d.id;

  insert into public.onboarding_results(
    batch_id,row_kind,row_number,action,record_id,message
  )
  values(
    p_batch_id,'document',p_row_number,'upload',docid,'Document uploaded and linked'
  )
  on conflict(batch_id,row_kind,row_number) do update
    set action=excluded.action,
        record_id=excluded.record_id,
        message=excluded.message,
        created_at=clock_timestamp();

  select count(*) into remaining
  from public.onboarding_document_rows
  where batch_id=p_batch_id
    and uploaded_document_id is null;

  if remaining=0 then
    update public.onboarding_batches
    set status='complete',
        completed_at=clock_timestamp()
    where id=p_batch_id;
  end if;

  return docid;
end;
$$;

revoke all on function public.get_enterprise_onboarding_document_targets(uuid) from public,anon;
revoke all on function public.register_enterprise_onboarding_document(uuid,integer,text,text) from public,anon;
grant execute on function public.get_enterprise_onboarding_document_targets(uuid) to authenticated;
grant execute on function public.register_enterprise_onboarding_document(uuid,integer,text,text) to authenticated;
