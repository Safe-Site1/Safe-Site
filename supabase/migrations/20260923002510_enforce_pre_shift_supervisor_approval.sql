-- Apply with Supabase apply_migration before deploying the matching frontend.
-- Existing SELECT/INSERT/UPDATE RLS policies remain in force.
alter table public.safety_records
  add column approved_by uuid,
  add column approved_at timestamptz;

-- Keep the immutable auth UUID even if the account is later deleted.
comment on column public.safety_records.approved_by is
  'Authenticated approver UUID assigned by the database; retained for audit history.';

alter table public.safety_records drop constraint safety_records_status_check;
alter table public.safety_records add constraint safety_records_status_check
  check (status in ('draft','submitted','reviewed','closed','pending_review','approved'));

-- A previously typed name is not a verified signature. Preserve it explicitly
-- as historical, unverified text, and require authenticated review of old records.
update public.safety_records
set status='pending_review',
    data=(coalesce(data,'{}'::jsonb)-'supervisor') ||
      case when data ? 'supervisor' then jsonb_build_object('legacy_unverified_supervisor',data->'supervisor') else '{}'::jsonb end,
    updated_at=clock_timestamp()
where record_type='pre_shift';

alter table public.safety_records add constraint safety_records_approval_consistency check (
  (record_type='pre_shift' and
    ((status='pending_review' and approved_by is null and approved_at is null) or
     (status='approved' and approved_by is not null and approved_at is not null))) or
  (record_type<>'pre_shift' and approved_by is null and approved_at is null
    and status not in ('pending_review','approved'))
);

create or replace function private.enforce_pre_shift_review()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid := auth.uid();
begin
  -- Prevent converting a pre-shift into another record type to bypass review.
  if TG_OP='UPDATE' and old.record_type='pre_shift' and new.record_type<>'pre_shift' then
    raise exception 'Pre-shift record type is immutable' using errcode='23514';
  end if;
  if new.record_type<>'pre_shift' then
    return new;
  end if;
  if actor is null then
    raise exception 'Authenticated account required' using errcode='42501';
  end if;
  if nullif(btrim(new.work_area, E' \t\n\r'),'') is null then
    raise exception 'Work Area is required' using errcode='23514';
  end if;
  if not exists (select 1 from public.sites s where s.id=new.site_id and s.organization_id=new.organization_id) then
    raise exception 'Pre-shift site must belong to its organization' using errcode='23514';
  end if;
  if TG_OP='INSERT' then
    if new.created_by is distinct from actor or not private.has_org_role(new.organization_id,
      array['administrator','supervisor','safety_coordinator','worker']) then
      raise exception 'Operational membership required' using errcode='42501';
    end if;
    if new.status not in ('pending_review','submitted') or new.status is null
       or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Pre-shifts must be submitted pending supervisor review' using errcode='23514';
    end if;
    if jsonb_typeof(new.data) is distinct from 'object' or
       (new.data - array['crew','area','hazards','controls','taskTemplateId']) <> '{}'::jsonb then
      raise exception 'Pre-shift data cannot include a supervisor signature or review metadata' using errcode='23514';
    end if;
    if nullif(btrim(new.data->>'hazards', E' \t\n\r'),'') is null or
       nullif(btrim(new.data->>'controls', E' \t\n\r'),'') is null then
      raise exception 'Hazards and controls are required' using errcode='23514';
    end if;
    if not exists (select 1 from public.task_templates t
      where t.id::text=new.data->>'taskTemplateId' and t.organization_id=new.organization_id
        and t.active and (t.site_id=new.site_id or t.site_id is null)) then
      raise exception 'An active cloud task template for this site is required' using errcode='23514';
    end if;
    new.work_area := btrim(new.work_area, E' \t\n\r');
    new.data := jsonb_set(new.data,'{area}',to_jsonb(new.work_area));
    new.status := 'pending_review';
    new.created_at := clock_timestamp();
  else
    if old.record_type<>'pre_shift' then
      raise exception 'Cannot convert a record into a pre-shift' using errcode='23514';
    end if;
    if not private.has_org_role(old.organization_id,array['administrator','supervisor','safety_coordinator']) then
      raise exception 'Authorized supervisor review required' using errcode='42501';
    end if;
    if old.status<>'pending_review' or new.status<>'approved' or new.status is null then
      raise exception 'Only a pending pre-shift can be approved' using errcode='23514';
    end if;
    -- The signature covers the exact submitted record. Corrections need a new submission.
    if (to_jsonb(new)-array['status','updated_at','approved_by','approved_at']) is distinct from
       (to_jsonb(old)-array['status','updated_at','approved_by','approved_at']) then
      raise exception 'Submitted pre-shift content is immutable' using errcode='23514';
    end if;
    if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
      raise exception 'Approver identity and timestamp are assigned by the database' using errcode='23514';
    end if;
    new.approved_by := actor;
    new.approved_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.enforce_pre_shift_review() from public,anon,authenticated;
create trigger enforce_pre_shift_review
before insert or update on public.safety_records
for each row execute function private.enforce_pre_shift_review();
