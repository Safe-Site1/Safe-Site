create function public.save_cloud_task(p_id uuid,p_org uuid,p_site uuid,p_name text,p_category text,p_hazards text[],p_controls text[],p_version integer,p_previous uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.task_templates%rowtype;next_version integer:=1;
begin
 if auth.uid() is null or not private.has_org_role(p_org,array['administrator','safety_coordinator']) then
  raise exception 'Administrator or Safety Coordinator required' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_id=p_previous or nullif(btrim(p_name),'') is null
  or coalesce(cardinality(p_hazards),0)=0 or coalesce(cardinality(p_controls),0)=0
  or exists(select 1 from unnest(p_hazards||p_controls) v where nullif(btrim(v),'') is null) then
  raise exception 'Task name, hazards and controls are required' using errcode='23514';end if;
 if not exists(select 1 from public.sites where id=p_site and organization_id=p_org and active) then
  raise exception 'Active project required' using errcode='23514';end if;
 -- Serialize new-ID retries as well as edits without bypassing RLS.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into t from public.task_templates where id=p_id;
 if found then
  if t.organization_id=p_org and t.site_id=p_site and t.name=btrim(p_name) and t.category is not distinct from p_category
    and (select array_agg(hazard order by sort_order) from public.task_template_hazards where task_template_id=p_id)=p_hazards
    and (select array_agg(control order by sort_order) from public.task_template_controls where task_template_id=p_id)=p_controls then return p_id;end if;
  raise exception 'Save request already used. Reopen the task.' using errcode='23514';
 end if;
 if p_previous is not null then
  select * into t from public.task_templates where id=p_previous for update;
  if not found or t.organization_id<>p_org or t.site_id is distinct from p_site or not t.active or t.version<>p_version then
   raise exception 'Task changed. Reopen it before editing.' using errcode='23514';end if;
  next_version:=t.version+1;
  update public.task_templates set active=false,updated_at=clock_timestamp() where id=p_previous;
 elsif p_version<>0 then raise exception 'Previous task version required' using errcode='23514';
 end if;
 insert into public.task_templates(id,organization_id,site_id,name,category,version) values(p_id,p_org,p_site,btrim(p_name),p_category,next_version);
 insert into public.task_template_hazards(task_template_id,hazard,sort_order) select p_id,v,n::integer from unnest(p_hazards) with ordinality as x(v,n);
 insert into public.task_template_controls(task_template_id,control,sort_order) select p_id,v,n::integer from unnest(p_controls) with ordinality as x(v,n);
 return p_id;
end $$;
revoke all on function public.save_cloud_task(uuid,uuid,uuid,text,text,text[],text[],integer,uuid) from public,anon;
grant execute on function public.save_cloud_task(uuid,uuid,uuid,text,text,text[],text[],integer,uuid) to authenticated;
