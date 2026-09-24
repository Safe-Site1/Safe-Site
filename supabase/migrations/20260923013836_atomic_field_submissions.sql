-- Atomic, retry-safe field submissions. Existing table RLS remains authoritative.
create or replace function public.submit_field_record(
  p_id uuid,p_organization_id uuid,p_site_id uuid,p_type text,p_title text,p_area text,p_data jsonb
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare actor uuid:=auth.uid(); inserted uuid; existing public.safety_records%rowtype;
begin
  if actor is null or not private.has_org_role(p_organization_id,array['administrator','supervisor','safety_coordinator','worker']) then
    raise exception 'Operational membership required' using errcode='42501';
  end if;
  if p_id is null or p_type is null or p_type not in ('inspection','incident','near_miss')
     or nullif(btrim(p_title,E' \t\n\r'),'') is null or nullif(btrim(p_area,E' \t\n\r'),'') is null
     or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Valid record type, title, Work Area and details required' using errcode='23514';
  end if;
  if not exists(select 1 from public.sites where id=p_site_id and organization_id=p_organization_id) then
    raise exception 'Site must belong to your organization' using errcode='23514';
  end if;
  if p_type='inspection' then
    if p_data->>'condition' is null or p_data->>'condition' not in ('Pass','Deficiency Found','Out of Service') then
      raise exception 'Valid inspection condition required' using errcode='23514';
    end if;
    if p_data->>'condition'<>'Pass' and nullif(btrim(p_data->>'notes',E' \t\n\r'),'') is null then
      raise exception 'Describe the inspection deficiency' using errcode='23514';
    end if;
  elsif nullif(btrim(p_data->>'description',E' \t\n\r'),'') is null then
    raise exception 'Incident description required' using errcode='23514';
  end if;
  insert into public.safety_records(id,organization_id,site_id,created_by,record_type,title,work_area,task_name,data,status)
  values(p_id,p_organization_id,p_site_id,actor,p_type,btrim(p_title),btrim(p_area),
    case when p_type='inspection' then btrim(p_title) else '' end,p_data,'submitted')
  on conflict(id) do nothing returning id into inserted;
  if inserted is null then
    select * into existing from public.safety_records where id=p_id;
    if not found or existing.created_by is distinct from actor or existing.organization_id is distinct from p_organization_id
       or existing.site_id is distinct from p_site_id or existing.record_type is distinct from p_type
       or existing.title is distinct from btrim(p_title) or existing.work_area is distinct from btrim(p_area)
       or existing.data is distinct from p_data then
      raise exception 'Submission ID already used; original submission must be retried unchanged' using errcode='23514';
    end if;
    return p_id;
  end if;
  if p_type='inspection' and p_data->>'condition'<>'Pass' then
    insert into public.corrective_actions(organization_id,site_id,safety_record_id,title,description,priority,status,due_date)
    values(p_organization_id,p_site_id,p_id,'Inspection deficiency: '||btrim(p_title),p_data->>'notes',
      case when p_data->>'condition'='Out of Service' then 'critical' else 'high' end,'open',current_date+7);
  end if;
  return p_id;
end;
$$;
revoke all on function public.submit_field_record(uuid,uuid,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_field_record(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;
