
create or replace function public.stage_enterprise_onboarding(
  p_organization_id uuid,
  p_source_file_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  batch uuid:=gen_random_uuid();
  n_workers integer;
  n_quals integer;
  n_reqs integer;
  n_docs integer;
begin
  if actor is null or not private.has_org_role(p_organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Valid onboarding payload required' using errcode='23514';
  end if;

  if nullif(btrim(p_source_file_name),'') is null then
    raise exception 'Source file name is required' using errcode='23514';
  end if;

  if jsonb_typeof(coalesce(p_payload->'workers','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'qualifications','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'requirements','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'documents','[]'::jsonb))<>'array' then
    raise exception 'Onboarding payload sections must be arrays' using errcode='23514';
  end if;

  n_workers:=jsonb_array_length(coalesce(p_payload->'workers','[]'::jsonb));
  n_quals:=jsonb_array_length(coalesce(p_payload->'qualifications','[]'::jsonb));
  n_reqs:=jsonb_array_length(coalesce(p_payload->'requirements','[]'::jsonb));
  n_docs:=jsonb_array_length(coalesce(p_payload->'documents','[]'::jsonb));

  if n_workers=0 then
    raise exception 'Workers sheet must contain at least one worker' using errcode='23514';
  end if;

  if n_workers>2000 or n_quals>20000 or n_reqs>5000 or n_docs>20000 then
    raise exception 'Onboarding batch exceeds the supported size; split it into smaller batches' using errcode='54000';
  end if;

  insert into public.onboarding_batches(
    id,organization_id,created_by,source_file_name,
    worker_count,qualification_count,requirement_count,document_count
  )
  values(
    batch,p_organization_id,actor,btrim(p_source_file_name),
    n_workers,n_quals,n_reqs,n_docs
  );

  insert into public.onboarding_worker_rows(
    batch_id,row_number,employee_number,first_name,last_name,job_title,site_name,status,notes
  )
  select
    batch,ord::integer,
    coalesce(item->>'employee_number',''),
    coalesce(item->>'first_name',''),
    coalesce(item->>'last_name',''),
    coalesce(item->>'job_title',''),
    coalesce(item->>'site_name',''),
    coalesce(item->>'status','active'),
    item->>'notes'
  from jsonb_array_elements(coalesce(p_payload->'workers','[]'::jsonb))
       with ordinality e(item,ord);

  insert into public.onboarding_qualification_rows(
    batch_id,row_number,employee_number,qualification_name,code,category,
    issued_on_text,expires_on_text,document_file_name,notes
  )
  select
    batch,ord::integer,
    coalesce(item->>'employee_number',''),
    coalesce(item->>'qualification_name',''),
    item->>'code',
    item->>'category',
    item->>'issued_on',
    item->>'expires_on',
    item->>'document_file_name',
    item->>'notes'
  from jsonb_array_elements(coalesce(p_payload->'qualifications','[]'::jsonb))
       with ordinality e(item,ord);

  insert into public.onboarding_requirement_rows(
    batch_id,row_number,site_name,job_title,qualification_name,aliases,
    warning_days_text,country_code,jurisdiction_code,regulator,mining_sector,
    mine_type,requirement_source,active_text
  )
  select
    batch,ord::integer,
    coalesce(item->>'site_name',''),
    coalesce(item->>'job_title',''),
    coalesce(item->>'qualification_name',''),
    case
      when jsonb_typeof(item->'aliases')='array' then
        coalesce((
          select array_agg(btrim(v)) filter(where btrim(v)<>'')
          from jsonb_array_elements_text(item->'aliases') a(v)
        ),'{}'::text[])
      when coalesce(item->>'aliases','')<>'' then
        coalesce((
          select array_agg(btrim(v)) filter(where btrim(v)<>'')
          from unnest(string_to_array(item->>'aliases',';')) a(v)
        ),'{}'::text[])
      else '{}'::text[]
    end,
    item->>'warning_days',
    item->>'country_code',
    item->>'jurisdiction_code',
    item->>'regulator',
    item->>'mining_sector',
    item->>'mine_type',
    item->>'requirement_source',
    coalesce(item->>'active','yes')
  from jsonb_array_elements(coalesce(p_payload->'requirements','[]'::jsonb))
       with ordinality e(item,ord);

  insert into public.onboarding_document_rows(
    batch_id,row_number,employee_number,qualification_name,file_name,document_type,
    issue_date_text,expiry_date_text,notes
  )
  select
    batch,ord::integer,
    coalesce(item->>'employee_number',''),
    item->>'qualification_name',
    coalesce(item->>'file_name',''),
    item->>'document_type',
    item->>'issue_date',
    item->>'expiry_date',
    item->>'notes'
  from jsonb_array_elements(coalesce(p_payload->'documents','[]'::jsonb))
       with ordinality e(item,ord);

  return public.validate_enterprise_onboarding(batch);
end;
$$;
