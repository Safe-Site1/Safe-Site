
create or replace function public.commit_enterprise_onboarding(
  p_batch_id uuid,
  p_confirm_updates boolean default false
)
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
  sid uuid;
  wid uuid;
  qid uuid;
  rid uuid;
  existing_id uuid;
  issued date;
  expires date;
  updates_count integer;
  docs_count integer;
begin
  select * into b from public.onboarding_batches where id=p_batch_id for update;
  if not found then raise exception 'Onboarding batch not found' using errcode='P0002'; end if;
  if not private.has_org_role(b.organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  if b.status in ('committed','documents_pending','complete') then
    return public.get_enterprise_onboarding_preview(p_batch_id);
  end if;
  if b.status='cancelled' then
    raise exception 'Cancelled onboarding batch cannot be committed' using errcode='23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(b.organization_id::text,20260924));
  perform public.validate_enterprise_onboarding(p_batch_id);

  select * into b from public.onboarding_batches where id=p_batch_id for update;
  if b.error_count>0 then
    raise exception 'Resolve all onboarding validation errors before import' using errcode='23514';
  end if;

  select count(*) into updates_count from (
    select proposed_action from public.onboarding_worker_rows where batch_id=p_batch_id
    union all
    select proposed_action from public.onboarding_qualification_rows where batch_id=p_batch_id
    union all
    select proposed_action from public.onboarding_requirement_rows where batch_id=p_batch_id
  ) x where proposed_action='update';

  if updates_count>0 and not p_confirm_updates then
    raise exception 'This batch will update existing records; explicit confirmation is required' using errcode='23514';
  end if;

  delete from public.onboarding_results
  where batch_id=p_batch_id and row_kind<>'document';

  for wr in
    select * from public.onboarding_worker_rows
    where batch_id=p_batch_id
    order by row_number
  loop
    select s.id into sid
    from public.sites s
    where s.organization_id=b.organization_id
      and s.active=true
      and lower(btrim(s.name))=lower(btrim(wr.site_name))
    limit 1;

    select w.id into wid
    from public.workers w
    where w.organization_id=b.organization_id
      and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(wr.employee_number))
    limit 1;

    if wr.proposed_action='insert' then
      insert into public.workers(
        organization_id,site_id,employee_number,first_name,last_name,job_title,status,ready_for_work
      ) values (
        b.organization_id,sid,wr.employee_number,wr.first_name,wr.last_name,wr.job_title,wr.status,false
      )
      returning id into wid;
    elsif wr.proposed_action='update' then
      update public.workers
      set site_id=sid,
          first_name=wr.first_name,
          last_name=wr.last_name,
          job_title=wr.job_title,
          status=wr.status,
          updated_at=clock_timestamp()
      where id=wid
      returning id into wid;
    end if;

    insert into public.onboarding_results(
      batch_id,row_kind,row_number,action,record_id,message
    )
    values(
      p_batch_id,'worker',wr.row_number,wr.proposed_action,wid,
      case wr.proposed_action
        when 'skip' then 'Existing worker kept'
        when 'update' then 'Existing worker updated'
        else 'Worker created'
      end
    )
    on conflict(batch_id,row_kind,row_number) do update
      set action=excluded.action,
          record_id=excluded.record_id,
          message=excluded.message,
          created_at=clock_timestamp();
  end loop;

  for rr in
    select * from public.onboarding_requirement_rows
    where batch_id=p_batch_id
    order by row_number
  loop
    select s.id into sid
    from public.sites s
    where s.organization_id=b.organization_id
      and s.active=true
      and lower(btrim(s.name))=lower(btrim(rr.site_name))
    limit 1;

    select x.id into existing_id
    from public.qualification_requirements x
    where x.site_id=sid
      and lower(btrim(x.job_title))=lower(btrim(rr.job_title))
      and lower(btrim(x.qualification_name))=lower(btrim(rr.qualification_name))
    limit 1;

    if rr.proposed_action='skip' then
      rid:=existing_id;
    elsif existing_id is null then
      insert into public.qualification_requirements(
        organization_id,site_id,job_title,qualification_name,aliases,active,
        country_code,jurisdiction_code,regulator,mining_sector,mine_type,
        requirement_source,warning_days
      )
      values(
        b.organization_id,sid,rr.job_title,rr.qualification_name,rr.aliases,
        rr.active_text='yes',
        rr.country_code,rr.jurisdiction_code,rr.regulator,rr.mining_sector,
        rr.mine_type,rr.requirement_source,rr.warning_days_text::integer
      )
      returning id into rid;
    else
      update public.qualification_requirements
      set aliases=rr.aliases,
          active=(rr.active_text='yes'),
          country_code=rr.country_code,
          jurisdiction_code=rr.jurisdiction_code,
          regulator=rr.regulator,
          mining_sector=rr.mining_sector,
          mine_type=rr.mine_type,
          requirement_source=rr.requirement_source,
          warning_days=rr.warning_days_text::integer
      where id=existing_id
      returning id into rid;
    end if;

    insert into public.onboarding_results(
      batch_id,row_kind,row_number,action,record_id,message
    )
    values(
      p_batch_id,'requirement',rr.row_number,rr.proposed_action,rid,
      case rr.proposed_action
        when 'skip' then 'Existing requirement kept'
        when 'update' then 'Existing requirement updated'
        else 'Requirement created'
      end
    )
    on conflict(batch_id,row_kind,row_number) do update
      set action=excluded.action,
          record_id=excluded.record_id,
          message=excluded.message,
          created_at=clock_timestamp();
  end loop;

  for qr in
    select * from public.onboarding_qualification_rows
    where batch_id=p_batch_id
    order by row_number
  loop
    select w.id into wid
    from public.workers w
    where w.organization_id=b.organization_id
      and lower(btrim(coalesce(w.employee_number,'')))=lower(btrim(qr.employee_number))
    limit 1;

    issued:=private.safe_iso_date(qr.issued_on_text);
    expires:=private.safe_iso_date(qr.expires_on_text);

    select q.id into existing_id
    from public.qualifications q
    where q.organization_id=b.organization_id
      and q.worker_id=wid
      and lower(btrim(q.name))=lower(btrim(qr.qualification_name))
    limit 1;

    if qr.proposed_action='skip' then
      qid:=existing_id;
    elsif qr.proposed_action='insert' then
      insert into public.qualifications(
        organization_id,worker_id,name,code,category,issued_on,expires_on,status
      )
      values(
        b.organization_id,wid,qr.qualification_name,qr.code,qr.category,
        issued,expires,
        case when expires is not null and expires<current_date then 'expired' else 'valid' end
      )
      returning id into qid;
    else
      update public.qualifications
      set code=qr.code,
          category=qr.category,
          issued_on=issued,
          expires_on=expires,
          status=case when expires is not null and expires<current_date then 'expired' else 'valid' end,
          updated_at=clock_timestamp()
      where id=existing_id
      returning id into qid;
    end if;

    insert into public.onboarding_results(
      batch_id,row_kind,row_number,action,record_id,message
    )
    values(
      p_batch_id,'qualification',qr.row_number,qr.proposed_action,qid,
      case qr.proposed_action
        when 'skip' then 'Existing qualification kept'
        when 'update' then 'Existing qualification updated with newer evidence'
        else 'Qualification created'
      end
    )
    on conflict(batch_id,row_kind,row_number) do update
      set action=excluded.action,
          record_id=excluded.record_id,
          message=excluded.message,
          created_at=clock_timestamp();
  end loop;

  select count(*) into docs_count
  from public.onboarding_document_rows
  where batch_id=p_batch_id;

  update public.onboarding_batches
  set status=case when docs_count>0 then 'documents_pending' else 'complete' end,
      committed_at=clock_timestamp(),
      completed_at=case when docs_count=0 then clock_timestamp() else null end
  where id=p_batch_id;

  return public.get_enterprise_onboarding_preview(p_batch_id);
end;
$$;

revoke all on function public.commit_enterprise_onboarding(uuid,boolean) from public,anon;
grant execute on function public.commit_enterprise_onboarding(uuid,boolean) to authenticated;
