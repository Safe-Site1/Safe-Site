-- Audit only future committed workflow events. Existing history is not backdated.
create function private.guard_workflow_audit()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP<>'INSERT' then
  if old.action like 'workflow.%' then
   raise exception 'Workflow audit events are immutable' using errcode='42501';
  end if;
  if TG_OP='DELETE' then return old;end if;
  if new.action like 'workflow.%' then
   raise exception 'Workflow events must originate from a source record' using errcode='42501';
  end if;
  return new;
 end if;
 if new.action like 'workflow.%' and pg_catalog.pg_trigger_depth()<2 then
  raise exception 'Workflow events must originate from a source record' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_workflow_audit() from public,anon,authenticated;
create trigger guard_workflow_audit before insert or update or delete on public.audit_log
for each row execute function private.guard_workflow_audit();

create function private.audit_safety_workflow()
returns trigger language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); event text; details jsonb;
begin
 if TG_OP='UPDATE' and new.status is not distinct from old.status then return new;end if;
 if actor is null then raise exception 'Authenticated actor required for workflow audit' using errcode='42501';end if;
 details:=jsonb_build_object('source','database_trigger_v1','site_id',new.site_id,'status',new.status);
 if TG_OP='UPDATE' then details:=details||jsonb_build_object('previous_status',old.status);end if;
 if TG_TABLE_NAME='safety_records' then
  if TG_OP='INSERT' then event:='workflow.safety_record.submitted';
  elsif new.status='approved' then event:='workflow.safety_record.approved';
  else event:='workflow.safety_record.status_changed';end if;
  details:=details||jsonb_build_object('record_type',new.record_type,'title',new.title,'work_area',new.work_area);
  if new.status='approved' then
   details:=details||jsonb_build_object('approved_by',new.approved_by,'approved_at',new.approved_at);
  end if;
 else
  if TG_OP='INSERT' then event:='workflow.corrective_action.created';
  elsif new.status='closed' then event:='workflow.corrective_action.closed';
  else event:='workflow.corrective_action.status_changed';end if;
  details:=details||jsonb_build_object('safety_record_id',new.safety_record_id,'title',new.title);
  if new.status='closed' then
   details:=details||jsonb_build_object('closed_by',new.closed_by,'closed_at',new.closed_at,'closeout_note',new.closeout_note);
  end if;
 end if;
 insert into public.audit_log(organization_id,user_id,action,entity_type,entity_id,metadata,created_at)
 values(new.organization_id,actor,event,TG_TABLE_NAME,new.id,details,clock_timestamp());
 return new;
end $$;
revoke all on function private.audit_safety_workflow() from public,anon,authenticated;
create trigger audit_safety_record_workflow after insert or update on public.safety_records
for each row execute function private.audit_safety_workflow();
create trigger audit_corrective_action_workflow after insert or update on public.corrective_actions
for each row execute function private.audit_safety_workflow();
