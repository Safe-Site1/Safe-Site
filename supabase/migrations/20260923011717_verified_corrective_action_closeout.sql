-- Apply once before deploying the matching closeout UI. Existing RLS is preserved.
alter table public.corrective_actions add column closed_by uuid, add column closeout_note text;
comment on column public.corrective_actions.closed_by is
  'Authenticated closer UUID, server-assigned and retained for audit history. Null on legacy closures.';
create or replace function private.enforce_corrective_action_closeout()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authenticated account required' using errcode='42501'; end if;
  if TG_OP='UPDATE' then
    if old.status='closed' then raise exception 'Closed actions are immutable' using errcode='23514'; end if;
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
       or new.site_id is distinct from old.site_id or new.safety_record_id is distinct from old.safety_record_id then
      raise exception 'Action identity and source are immutable' using errcode='23514';
    end if;
  end if;
  if new.site_id is not null and not exists(select 1 from public.sites s where s.id=new.site_id and s.organization_id=new.organization_id) then
    raise exception 'Action site must belong to the organization' using errcode='23514';
  end if;
  if new.safety_record_id is not null and not exists(select 1 from public.safety_records r
    where r.id=new.safety_record_id and r.organization_id=new.organization_id and r.site_id is not distinct from new.site_id) then
    raise exception 'Action source must belong to the same organization and site' using errcode='23514';
  end if;
  if TG_OP='INSERT' then
    if new.status='closed' or new.closed_at is not null or new.closed_by is not null or new.closeout_note is not null then
      raise exception 'Create the action before authenticated closeout' using errcode='23514';
    end if;
  elsif new.status='closed' then
    if old.status not in ('open','in_progress') then
      raise exception 'Only an active action can be closed' using errcode='23514';
    end if;
    if not private.has_org_role(old.organization_id,array['administrator','supervisor','safety_coordinator']) then
      raise exception 'Staff membership required for closeout' using errcode='42501';
    end if;
    if nullif(btrim(new.closeout_note,E' \t\n\r'),'') is null then
      raise exception 'Closeout Note is required' using errcode='23514';
    end if;
    if new.closed_by is distinct from old.closed_by or new.closed_at is distinct from old.closed_at then
      raise exception 'Closer identity and timestamp are assigned by the database' using errcode='23514';
    end if;
    if (to_jsonb(new)-array['status','closeout_note','closed_by','closed_at']) is distinct from
       (to_jsonb(old)-array['status','closeout_note','closed_by','closed_at']) then
      raise exception 'Closeout cannot rewrite action details' using errcode='23514';
    end if;
    new.closeout_note:=btrim(new.closeout_note,E' \t\n\r');
    new.closed_by:=actor;
    new.closed_at:=clock_timestamp();
  elsif new.closed_by is not null or new.closed_at is not null or new.closeout_note is not null then
    raise exception 'Closeout fields require a verified closed transition' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_corrective_action_closeout() from public,anon,authenticated;
create trigger enforce_corrective_action_closeout before insert or update on public.corrective_actions
for each row execute function private.enforce_corrective_action_closeout();
