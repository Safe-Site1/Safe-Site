
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
  item jsonb;
  ord bigint;
  aliases_value text[];
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
  ) values (
    batch,p_organization_id,actor,btrim(p_source_file_name),
    n_workers,n_quals,n_reqs,n_docs
  );

  for item,ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(p_payload->'workers','[]'::jsonb)) with ordinality
  loop
    insert into public.onboarding_worker_rows(
      batch_id,row_number,employee_number,first_name,last_name,job_title,site_name,status,notes
    ) values (
      batch,ord,
      coalesce(item->>'employee_number',''),
      coalesce(item->>'first_name',''),
      coalesce(item->>'last_name',''),
      coalesce(item->>'job_title',''),
      coalesce(item->>'site_name',''),
      coalesce(item->>'status','active'),
      item->>'notes'
    );
  end loop;

  for item,ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(p_payload->'qualifications','[]'::jsonb)) with ordinality
  loop
    insert into public.onboarding_qualification_rows(
      batch_id,row_number,employee_number,qualification_name,code,category,
      issued_on_text,expires_on_text,document_file_name,notes
    ) values (
      batch,ord,
      coalesce(item->>'employee_number',''),
      coalesce(item->>'qualification_name',''),
      item->>'code',
      item->>'category',
      item->>'issued_on',
      item->>'expires_on',
      item->>'document_file_name',
      item->>'notes'
    );
  end loop;

  for item,ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(p_payload->'requirements','[]'::jsonb)) with ordinality
  loop
    aliases_value:='{}'::text[];

    if jsonb_typeof(item->'aliases')='array' then
      select coalesce(array_agg(btrim(x)) filter(where btrim(x)<>''),'{}'::text[])
      into aliases_value
      from jsonb_array_elements_text(item->'aliases') t(x);
    elsif coalesce(item->>'aliases','')<>'' then
      select coalesce(array_agg(btrim(x)) filter(where btrim(x)<>''),'{}'::text[])
      into aliases_value
      from unnest(string_to_array(item->>'aliases',';')) t(x);
    end if;

    insert into public.onboarding_requirement_rows(
      batch_id,row_number,site_name,job_title,qualification_name,aliases,
      warning_days_text,country_code,jurisdiction_code,regulator,mining_sector,
      mine_type,requirement_source,active_text
    ) values (
      batch,ord,
      coalesce(item->>'site_name',''),
      coalesce(item->>'job_title',''),
      coalesce(item->>'qualification_name',''),
      aliases_value,
      item->>'warning_days',
      item->>'country_code',
      item->>'jurisdiction_code',
      item->>'regulator',
      item->>'mining_sector',
      item->>'mine_type',
      item->>'requirement_source',
      coalesce(item->>'active','yes')
    );
  end loop;

  for item,ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(p_payload->'documents','[]'::jsonb)) with ordinality
  loop
    insert into public.onboarding_document_rows(
      batch_id,row_number,employee_number,qualification_name,file_name,document_type,
      issue_date_text,expiry_date_text,notes
    ) values (
      batch,ord,
      coalesce(item->>'employee_number',''),
      item->>'qualification_name',
      coalesce(item->>'file_name',''),
      item->>'document_type',
      item->>'issue_date',
      item->>'expiry_date',
      item->>'notes'
    );
  end loop;

  return public.validate_enterprise_onboarding(batch);
end;
$$;

revoke all on function public.stage_enterprise_onboarding(uuid,text,jsonb) from public,anon;
grant execute on function public.stage_enterprise_onboarding(uuid,text,jsonb) to authenticated;
