
create or replace function public.validate_enterprise_onboarding(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  b public.onboarding_batches%rowtype;
  wr public.onboarding_worker_rows%rowtype;
  qr public.onboarding_qualification_rows%rowtype;
  rr public.onboarding_requirement_rows%rowtype;
  dr public.onboarding_document_rows%rowtype;
  errs text[];
  warns text[];
  action text;
  sid uuid;
  site_count integer;
  wid uuid;
  dup_count integer;
  existing_count integer;
  existing_worker public.workers%rowtype;
  existing_qual public.qualifications%rowtype;
  existing_req public.qualification_requirements%rowtype;
  issued date;
  expires date;
  warning_days integer;
  active_value boolean;
  total_errors integer;
  total_warnings integer;
begin
  select * into b from public.onboarding_batches where id=p_batch_id;
  if not found then raise exception 'Onboarding batch not found' using errcode='P0002'; end if;
  if not private.has_org_role(b.organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;
  if b.status in ('committed','documents_pending','complete','cancelled') then
    raise exception 'This onboarding batch can no longer be revalidated' using errcode='23514';
  end if;

  for wr in select * from public.onboarding_worker_rows where batch_id=p_batch_id order by row_number loop
    errs := '{}'::text[];
    warns := '{}'::text[];
    action := 'pending';
    sid := null;
    site_count := 0;

    if btrim(wr.employee_number)='' then errs:=array_append(errs,'Employee Number is required'); end if;
    if btrim(wr.first_name)='' then errs:=array_append(errs,'First Name is required'); end if;
    if btrim(wr.last_name)='' then errs:=array_append(errs,'Last Name is required'); end if;
    if btrim(wr.job_title)='' then errs:=array_append(errs,'Job Title is required'); end if;
    if btrim(wr.site_name)='' then errs:=array_append(errs,'Site / Project is required'); end if;
    if lower(btrim(wr.status)) not in ('active','inactive') then errs:=array_append(errs,'Status must be active or inactive'); end if;

    if btrim(wr.site_name)<>'' then
      select count(*), (array_agg(s.id order by s.created_at))[1]
        into site_count,sid
      from public.sites s
      where s.organization_id=b.organization_id and s.active=true
        and lower(btrim(s.name))=lower(btrim(wr.site_name));
      if site_count=0 then errs:=array_append(errs,'Site / Project does not match an active Safe Site project');
      elsif site_count>1 then errs:=array_append(errs,'Site / Project name is ambiguous');
      end if;
    end if;

    if btrim(wr.employee_number)<>'' then
      select count(*) into dup_count
      from public.onboarding_worker_rows x
      where x.batch_id=p_batch_id
        and lower(btrim(x.employee_number))=lower(btrim(wr.employee_number));
      if dup_count>1 then errs:=array_append(errs,'Duplicate Employee Number in Workers sheet'); end if;
    end if;

    if cardinality(errs)>0 then
      action:='error';
    else
      select * into existing_worker
      from public.workers w
      where w.organization_id=b.organization_id
        and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(wr.employee_number))
      limit 1;
      if found then
        if existing_worker.first_name is distinct from btrim(wr.first_name)
           or existing_worker.last_name is distinct from btrim(wr.last_name)
           or coalesce(existing_worker.job_title,'') is distinct from btrim(wr.job_title)
           or existing_worker.site_id is distinct from sid
           or existing_worker.status is distinct from lower(btrim(wr.status)) then
          action:='update';
          warns:=array_append(warns,'Existing worker will be updated after explicit batch confirmation');
        else
          action:='skip';
        end if;
      else
        action:='insert';
      end if;
    end if;

    update public.onboarding_worker_rows
      set employee_number=btrim(wr.employee_number),
          first_name=btrim(wr.first_name),
          last_name=btrim(wr.last_name),
          job_title=btrim(wr.job_title),
          site_name=btrim(wr.site_name),
          status=lower(btrim(wr.status)),
          validation_errors=errs,
          validation_warnings=warns,
          proposed_action=action
    where id=wr.id;
  end loop;

  for qr in select * from public.onboarding_qualification_rows where batch_id=p_batch_id order by row_number loop
    errs := '{}'::text[];
    warns := '{}'::text[];
    action := 'pending';
    wid := null;
    issued := private.safe_iso_date(qr.issued_on_text);
    expires := private.safe_iso_date(qr.expires_on_text);

    if btrim(qr.employee_number)='' then errs:=array_append(errs,'Employee Number is required'); end if;
    if btrim(qr.qualification_name)='' then errs:=array_append(errs,'Qualification Name is required'); end if;
    if coalesce(btrim(qr.issued_on_text),'')<>'' and issued is null then errs:=array_append(errs,'Issued On must be a valid YYYY-MM-DD date'); end if;
    if coalesce(btrim(qr.expires_on_text),'')<>'' and expires is null then errs:=array_append(errs,'Expires On must be a valid YYYY-MM-DD date'); end if;
    if issued is not null and expires is not null and issued>expires then errs:=array_append(errs,'Issued On cannot be after Expires On'); end if;

    if btrim(qr.employee_number)<>'' and btrim(qr.qualification_name)<>'' then
      select count(*) into dup_count
      from public.onboarding_qualification_rows x
      where x.batch_id=p_batch_id
        and lower(btrim(x.employee_number))=lower(btrim(qr.employee_number))
        and lower(btrim(x.qualification_name))=lower(btrim(qr.qualification_name));
      if dup_count>1 then errs:=array_append(errs,'Duplicate worker + qualification in Qualifications sheet'); end if;
    end if;

    select w.id into wid
    from public.workers w
    where w.organization_id=b.organization_id
      and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(qr.employee_number))
    limit 1;

    if wid is null then
      select count(*) into dup_count
      from public.onboarding_worker_rows x
      where x.batch_id=p_batch_id
        and lower(btrim(x.employee_number))=lower(btrim(qr.employee_number))
        and cardinality(x.validation_errors)=0;
      if dup_count=0 then errs:=array_append(errs,'Employee Number does not match an existing worker or a valid Workers row');
      elsif dup_count>1 then errs:=array_append(errs,'Employee Number matches multiple staged Workers rows');
      end if;
    end if;

    if cardinality(errs)=0 then
      if wid is null then
        action:='insert';
      else
        select count(*) into existing_count
        from public.qualifications q
        where q.organization_id=b.organization_id and q.worker_id=wid
          and lower(btrim(q.name))=lower(btrim(qr.qualification_name));

        if existing_count>1 then
          errs:=array_append(errs,'Multiple existing qualifications with this name require manual cleanup before bulk import');
          action:='error';
        elsif existing_count=0 then
          action:='insert';
        else
          select * into existing_qual
          from public.qualifications q
          where q.organization_id=b.organization_id and q.worker_id=wid
            and lower(btrim(q.name))=lower(btrim(qr.qualification_name))
          limit 1;

          if existing_qual.issued_on is not distinct from issued
             and existing_qual.expires_on is not distinct from expires
             and coalesce(existing_qual.code,'') is not distinct from coalesce(nullif(btrim(qr.code),''),'')
             and coalesce(existing_qual.category,'') is not distinct from coalesce(nullif(btrim(qr.category),''),'') then
            action:='skip';
          elsif (expires is not null and (existing_qual.expires_on is null or expires>existing_qual.expires_on))
             or (expires is null and existing_qual.expires_on is null and issued is not null
                 and (existing_qual.issued_on is null or issued>existing_qual.issued_on)) then
            action:='update';
            warns:=array_append(warns,'Existing qualification will be updated because imported evidence is newer');
          else
            action:='skip';
            warns:=array_append(warns,'Existing qualification is the same age or newer; existing record will be kept');
          end if;
        end if;
      end if;
    else
      action:='error';
    end if;

    update public.onboarding_qualification_rows
      set employee_number=btrim(qr.employee_number),
          qualification_name=btrim(qr.qualification_name),
          code=nullif(btrim(qr.code),''),
          category=nullif(btrim(qr.category),''),
          issued_on_text=nullif(btrim(qr.issued_on_text),''),
          expires_on_text=nullif(btrim(qr.expires_on_text),''),
          document_file_name=nullif(btrim(qr.document_file_name),''),
          validation_errors=errs,
          validation_warnings=warns,
          proposed_action=action
    where id=qr.id;
  end loop;

  for rr in select * from public.onboarding_requirement_rows where batch_id=p_batch_id order by row_number loop
    errs := '{}'::text[];
    warns := '{}'::text[];
    action := 'pending';
    sid := null;
    site_count := 0;
    warning_days := 30;

    if btrim(rr.site_name)='' then errs:=array_append(errs,'Site / Project is required'); end if;
    if btrim(rr.job_title)='' then errs:=array_append(errs,'Job Title is required'); end if;
    if btrim(rr.qualification_name)='' then errs:=array_append(errs,'Qualification Name is required'); end if;

    if coalesce(btrim(rr.warning_days_text),'')<>'' then
      if btrim(rr.warning_days_text) !~ '^\d+$' then
        errs:=array_append(errs,'Warning Days must be a whole number');
      else
        warning_days:=btrim(rr.warning_days_text)::integer;
        if warning_days<0 or warning_days>3650 then errs:=array_append(errs,'Warning Days must be between 0 and 3650'); end if;
      end if;
    end if;

    if lower(coalesce(nullif(btrim(rr.active_text),''),'yes')) in ('yes','true','1','active') then active_value:=true;
    elsif lower(btrim(rr.active_text)) in ('no','false','0','inactive') then active_value:=false;
    else errs:=array_append(errs,'Active must be yes/no or true/false'); active_value:=true;
    end if;

    if btrim(rr.site_name)<>'' then
      select count(*), (array_agg(s.id order by s.created_at))[1]
        into site_count,sid
      from public.sites s
      where s.organization_id=b.organization_id and s.active=true
        and lower(btrim(s.name))=lower(btrim(rr.site_name));
      if site_count=0 then errs:=array_append(errs,'Site / Project does not match an active Safe Site project');
      elsif site_count>1 then errs:=array_append(errs,'Site / Project name is ambiguous');
      end if;
    end if;

    if btrim(rr.site_name)<>'' and btrim(rr.job_title)<>'' and btrim(rr.qualification_name)<>'' then
      select count(*) into dup_count
      from public.onboarding_requirement_rows x
      where x.batch_id=p_batch_id
        and lower(btrim(x.site_name))=lower(btrim(rr.site_name))
        and lower(btrim(x.job_title))=lower(btrim(rr.job_title))
        and lower(btrim(x.qualification_name))=lower(btrim(rr.qualification_name));
      if dup_count>1 then errs:=array_append(errs,'Duplicate site + job + qualification in Site Requirements sheet'); end if;
    end if;

    if cardinality(errs)>0 then
      action:='error';
    else
      select * into existing_req
      from public.qualification_requirements x
      where x.site_id=sid
        and lower(btrim(x.job_title))=lower(btrim(rr.job_title))
        and lower(btrim(x.qualification_name))=lower(btrim(rr.qualification_name))
      limit 1;

      if found then
        if existing_req.aliases is distinct from rr.aliases
           or existing_req.warning_days is distinct from warning_days
           or coalesce(existing_req.country_code,'') is distinct from coalesce(nullif(btrim(rr.country_code),''),'')
           or coalesce(existing_req.jurisdiction_code,'') is distinct from coalesce(nullif(btrim(rr.jurisdiction_code),''),'')
           or coalesce(existing_req.regulator,'') is distinct from coalesce(nullif(btrim(rr.regulator),''),'')
           or coalesce(existing_req.mining_sector,'') is distinct from coalesce(nullif(btrim(rr.mining_sector),''),'')
           or coalesce(existing_req.mine_type,'') is distinct from coalesce(nullif(btrim(rr.mine_type),''),'')
           or coalesce(existing_req.requirement_source,'') is distinct from coalesce(nullif(btrim(rr.requirement_source),''),'')
           or existing_req.active is distinct from active_value then
          action:='update';
          warns:=array_append(warns,'Existing site requirement will be updated after explicit batch confirmation');
        else
          action:='skip';
        end if;
      else
        action:='insert';
      end if;
    end if;

    update public.onboarding_requirement_rows
      set site_name=btrim(rr.site_name),
          job_title=btrim(rr.job_title),
          qualification_name=btrim(rr.qualification_name),
          aliases=coalesce(rr.aliases,'{}'::text[]),
          warning_days_text=warning_days::text,
          country_code=nullif(upper(btrim(rr.country_code)),''),
          jurisdiction_code=nullif(upper(btrim(rr.jurisdiction_code)),''),
          regulator=nullif(btrim(rr.regulator),''),
          mining_sector=nullif(btrim(rr.mining_sector),''),
          mine_type=nullif(btrim(rr.mine_type),''),
          requirement_source=nullif(btrim(rr.requirement_source),''),
          active_text=case when active_value then 'yes' else 'no' end,
          validation_errors=errs,
          validation_warnings=warns,
          proposed_action=action
    where id=rr.id;
  end loop;

  for dr in select * from public.onboarding_document_rows where batch_id=p_batch_id order by row_number loop
    errs := '{}'::text[];
    warns := '{}'::text[];
    action := 'pending';
    wid := null;
    issued := private.safe_iso_date(dr.issue_date_text);
    expires := private.safe_iso_date(dr.expiry_date_text);

    if btrim(dr.employee_number)='' then errs:=array_append(errs,'Employee Number is required'); end if;
    if btrim(dr.file_name)='' then errs:=array_append(errs,'File Name is required'); end if;
    if coalesce(btrim(dr.issue_date_text),'')<>'' and issued is null then errs:=array_append(errs,'Issue Date must be a valid YYYY-MM-DD date'); end if;
    if coalesce(btrim(dr.expiry_date_text),'')<>'' and expires is null then errs:=array_append(errs,'Expiry Date must be a valid YYYY-MM-DD date'); end if;
    if issued is not null and expires is not null and issued>expires then errs:=array_append(errs,'Issue Date cannot be after Expiry Date'); end if;

    if btrim(dr.file_name)<>'' then
      select count(*) into dup_count
      from public.onboarding_document_rows x
      where x.batch_id=p_batch_id and lower(btrim(x.file_name))=lower(btrim(dr.file_name));
      if dup_count>1 then errs:=array_append(errs,'Duplicate File Name in Document Index'); end if;
    end if;

    select w.id into wid
    from public.workers w
    where w.organization_id=b.organization_id
      and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(dr.employee_number))
    limit 1;

    if wid is null then
      select count(*) into dup_count
      from public.onboarding_worker_rows x
      where x.batch_id=p_batch_id
        and lower(btrim(x.employee_number))=lower(btrim(dr.employee_number))
        and cardinality(x.validation_errors)=0;
      if dup_count=0 then errs:=array_append(errs,'Employee Number does not match an existing worker or a valid Workers row');
      elsif dup_count>1 then errs:=array_append(errs,'Employee Number matches multiple staged Workers rows');
      end if;
    end if;

    if coalesce(btrim(dr.qualification_name),'')<>'' then
      if wid is not null then
        select count(*) into existing_count
        from public.qualifications q
        where q.organization_id=b.organization_id and q.worker_id=wid
          and lower(btrim(q.name))=lower(btrim(dr.qualification_name));
      else
        existing_count:=0;
      end if;

      select count(*) into dup_count
      from public.onboarding_qualification_rows q
      where q.batch_id=p_batch_id
        and lower(btrim(q.employee_number))=lower(btrim(dr.employee_number))
        and lower(btrim(q.qualification_name))=lower(btrim(dr.qualification_name))
        and cardinality(q.validation_errors)=0;

      if existing_count+dup_count=0 then
        errs:=array_append(errs,'Qualification Name does not match an existing or staged qualification for this employee');
      end if;
    end if;

    if cardinality(errs)>0 then action:='error'; else action:='upload'; end if;

    update public.onboarding_document_rows
      set employee_number=btrim(dr.employee_number),
          qualification_name=nullif(btrim(dr.qualification_name),''),
          file_name=btrim(dr.file_name),
          document_type=nullif(btrim(dr.document_type),''),
          issue_date_text=nullif(btrim(dr.issue_date_text),''),
          expiry_date_text=nullif(btrim(dr.expiry_date_text),''),
          validation_errors=errs,
          validation_warnings=warns,
          proposed_action=action
    where id=dr.id;
  end loop;

  select
    coalesce(sum(cardinality(validation_errors)),0),
    coalesce(sum(cardinality(validation_warnings)),0)
  into total_errors,total_warnings
  from (
    select validation_errors,validation_warnings from public.onboarding_worker_rows where batch_id=p_batch_id
    union all
    select validation_errors,validation_warnings from public.onboarding_qualification_rows where batch_id=p_batch_id
    union all
    select validation_errors,validation_warnings from public.onboarding_requirement_rows where batch_id=p_batch_id
    union all
    select validation_errors,validation_warnings from public.onboarding_document_rows where batch_id=p_batch_id
  ) x;

  update public.onboarding_batches
  set status='validated',
      error_count=total_errors,
      warning_count=total_warnings,
      validated_at=clock_timestamp()
  where id=p_batch_id;

  return public.get_enterprise_onboarding_preview(p_batch_id);
end;
$$;

revoke all on function public.validate_enterprise_onboarding(uuid) from public,anon;
grant execute on function public.validate_enterprise_onboarding(uuid) to authenticated;
