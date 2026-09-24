
create or replace function public.get_enterprise_onboarding_preview(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  b public.onboarding_batches%rowtype;
  result jsonb;
begin
  select * into b from public.onboarding_batches where id=p_batch_id;
  if not found then raise exception 'Onboarding batch not found' using errcode='P0002'; end if;
  if not private.has_org_role(b.organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'batch', jsonb_build_object(
      'id',b.id,'status',b.status,'sourceFileName',b.source_file_name,
      'createdAt',b.created_at,'validatedAt',b.validated_at,'committedAt',b.committed_at,'completedAt',b.completed_at
    ),
    'counts', jsonb_build_object(
      'workers',(select count(*) from public.onboarding_worker_rows where batch_id=p_batch_id),
      'qualifications',(select count(*) from public.onboarding_qualification_rows where batch_id=p_batch_id),
      'requirements',(select count(*) from public.onboarding_requirement_rows where batch_id=p_batch_id),
      'documents',(select count(*) from public.onboarding_document_rows where batch_id=p_batch_id),
      'errors',b.error_count,
      'warnings',b.warning_count,
      'inserts',(
        select count(*) from (
          select proposed_action from public.onboarding_worker_rows where batch_id=p_batch_id
          union all select proposed_action from public.onboarding_qualification_rows where batch_id=p_batch_id
          union all select proposed_action from public.onboarding_requirement_rows where batch_id=p_batch_id
        ) a where proposed_action='insert'
      ),
      'updates',(
        select count(*) from (
          select proposed_action from public.onboarding_worker_rows where batch_id=p_batch_id
          union all select proposed_action from public.onboarding_qualification_rows where batch_id=p_batch_id
          union all select proposed_action from public.onboarding_requirement_rows where batch_id=p_batch_id
        ) a where proposed_action='update'
      ),
      'skips',(
        select count(*) from (
          select proposed_action from public.onboarding_worker_rows where batch_id=p_batch_id
          union all select proposed_action from public.onboarding_qualification_rows where batch_id=p_batch_id
          union all select proposed_action from public.onboarding_requirement_rows where batch_id=p_batch_id
        ) a where proposed_action='skip'
      ),
      'documentsUploaded',(select count(*) from public.onboarding_document_rows where batch_id=p_batch_id and uploaded_document_id is not null)
    ),
    'issues',coalesce((
      select jsonb_agg(to_jsonb(i) order by case severity when 'error' then 0 else 1 end,row_kind,row_number)
      from (
        select 'worker'::text row_kind,row_number,employee_number::text row_key,
               case when cardinality(validation_errors)>0 then 'error' else 'warning' end severity,
               validation_errors,validation_warnings
        from public.onboarding_worker_rows
        where batch_id=p_batch_id and (cardinality(validation_errors)>0 or cardinality(validation_warnings)>0)
        union all
        select 'qualification',row_number,employee_number||' — '||qualification_name,
               case when cardinality(validation_errors)>0 then 'error' else 'warning' end,
               validation_errors,validation_warnings
        from public.onboarding_qualification_rows
        where batch_id=p_batch_id and (cardinality(validation_errors)>0 or cardinality(validation_warnings)>0)
        union all
        select 'requirement',row_number,site_name||' — '||job_title||' — '||qualification_name,
               case when cardinality(validation_errors)>0 then 'error' else 'warning' end,
               validation_errors,validation_warnings
        from public.onboarding_requirement_rows
        where batch_id=p_batch_id and (cardinality(validation_errors)>0 or cardinality(validation_warnings)>0)
        union all
        select 'document',row_number,employee_number||' — '||file_name,
               case when cardinality(validation_errors)>0 then 'error' else 'warning' end,
               validation_errors,validation_warnings
        from public.onboarding_document_rows
        where batch_id=p_batch_id and (cardinality(validation_errors)>0 or cardinality(validation_warnings)>0)
        order by severity,row_kind,row_number
        limit 200
      ) i
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_enterprise_onboarding_preview(uuid) from public,anon;
grant execute on function public.get_enterprise_onboarding_preview(uuid) to authenticated;
