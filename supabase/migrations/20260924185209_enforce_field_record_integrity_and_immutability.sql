
create or replace function private.enforce_field_record_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.record_type in ('flra','inspection','incident','near_miss')
       or new.record_type in ('flra','inspection','incident','near_miss') then
      raise exception 'Submitted field safety records are immutable; create a new submission to correct them'
        using errcode='23514';
    end if;
    return new;
  end if;

  if new.record_type in ('inspection','incident','near_miss') then
    if coalesce(current_setting('safesite.field_submission_rpc', true),'') <> '1' then
      raise exception 'Inspection, Incident and Near Miss records must use the verified submission workflow'
        using errcode='42501';
    end if;
    return new;
  end if;

  if new.record_type = 'flra' then
    if auth.uid() is null
       or new.created_by is distinct from auth.uid()
       or not private.has_org_role(
         new.organization_id,
         array['administrator','supervisor','safety_coordinator','worker']
       ) then
      raise exception 'Operational membership required' using errcode='42501';
    end if;

    if nullif(btrim(new.work_area, E' \t\n\r'),'') is null
       or nullif(btrim(new.task_name, E' \t\n\r'),'') is null
       or new.status <> 'submitted'
       or jsonb_typeof(new.data) is distinct from 'object'
       or nullif(btrim(new.data->>'hazards', E' \t\n\r'),'') is null
       or nullif(btrim(new.data->>'controls', E' \t\n\r'),'') is null then
      raise exception 'FLRA requires a Work Area, active task, hazards and controls'
        using errcode='23514';
    end if;

    if not exists (
      select 1
      from public.sites s
      where s.id = new.site_id
        and s.organization_id = new.organization_id
        and s.active = true
    ) then
      raise exception 'FLRA site must be an active site in the organization'
        using errcode='23514';
    end if;

    if not exists (
      select 1
      from public.task_templates t
      where t.organization_id = new.organization_id
        and t.active = true
        and lower(btrim(t.name)) = lower(btrim(new.task_name))
        and (t.site_id = new.site_id or t.site_id is null)
    ) then
      raise exception 'FLRA must use an active cloud task template for this site'
        using errcode='23514';
    end if;

    new.work_area := btrim(new.work_area, E' \t\n\r');
    new.task_name := btrim(new.task_name, E' \t\n\r');
    new.title := new.task_name;
    new.data := jsonb_set(coalesce(new.data,'{}'::jsonb), '{area}', to_jsonb(new.work_area));
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_field_record_integrity on public.safety_records;
create trigger enforce_field_record_integrity
before insert or update on public.safety_records
for each row execute function private.enforce_field_record_integrity();

create or replace function public.submit_field_record(
  p_id uuid,
  p_organization_id uuid,
  p_site_id uuid,
  p_type text,
  p_title text,
  p_area text,
  p_data jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inserted uuid;
  existing public.safety_records%rowtype;
begin
  if actor is null or not private.has_org_role(
    p_organization_id,
    array['administrator','supervisor','safety_coordinator','worker']
  ) then
    raise exception 'Operational membership required' using errcode='42501';
  end if;

  if p_id is null or p_type is null or p_type not in ('inspection','incident','near_miss')
     or nullif(btrim(p_title,E' \t\n\r'),'') is null
     or nullif(btrim(p_area,E' \t\n\r'),'') is null
     or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Valid record type, title, Work Area and details required' using errcode='23514';
  end if;

  if not exists (
    select 1 from public.sites
    where id=p_site_id and organization_id=p_organization_id and active=true
  ) then
    raise exception 'Site must belong to your organization' using errcode='23514';
  end if;

  if p_type='inspection' then
    if p_data->>'condition' is null
       or p_data->>'condition' not in ('Pass','Deficiency Found','Out of Service') then
      raise exception 'Valid inspection condition required' using errcode='23514';
    end if;
    if p_data->>'condition'<>'Pass'
       and nullif(btrim(p_data->>'notes',E' \t\n\r'),'') is null then
      raise exception 'Describe the inspection deficiency' using errcode='23514';
    end if;
  elsif nullif(btrim(p_data->>'description',E' \t\n\r'),'') is null then
    raise exception 'Incident description required' using errcode='23514';
  end if;

  perform set_config('safesite.field_submission_rpc','1',true);

  insert into public.safety_records(
    id,organization_id,site_id,created_by,record_type,title,work_area,task_name,data,status
  )
  values(
    p_id,p_organization_id,p_site_id,actor,p_type,btrim(p_title),btrim(p_area),
    case when p_type='inspection' then btrim(p_title) else '' end,p_data,'submitted'
  )
  on conflict(id) do nothing
  returning id into inserted;

  if inserted is null then
    select * into existing from public.safety_records where id=p_id;
    if not found
       or existing.created_by is distinct from actor
       or existing.organization_id is distinct from p_organization_id
       or existing.site_id is distinct from p_site_id
       or existing.record_type is distinct from p_type
       or existing.title is distinct from btrim(p_title)
       or existing.work_area is distinct from btrim(p_area)
       or existing.data is distinct from p_data then
      raise exception 'Submission ID already used; original submission must be retried unchanged'
        using errcode='23514';
    end if;
    return p_id;
  end if;

  if p_type='inspection' and p_data->>'condition'<>'Pass' then
    insert into public.corrective_actions(
      organization_id,site_id,safety_record_id,title,description,priority,status,due_date
    )
    values(
      p_organization_id,p_site_id,p_id,
      'Inspection deficiency: '||btrim(p_title),
      p_data->>'notes',
      case when p_data->>'condition'='Out of Service' then 'critical' else 'high' end,
      'open',
      current_date+7
    );
  end if;

  return p_id;
end;
$$;
