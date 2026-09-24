-- Apply once after pre_shift_approval.sql, before deploying the matching frontend.
-- Existing role and tenant RLS policies remain unchanged.
alter table public.sites add column risk_stop_work_threshold integer not null default 10
  check (risk_stop_work_threshold between 1 and 25);
comment on column public.sites.risk_stop_work_threshold is
  'Residual scores at or above this threshold cannot be submitted or approved. Default preserves the pilot threshold; administrators configure site policy.';

alter table public.safety_records drop constraint safety_records_approval_consistency;
update public.safety_records
set status='pending_review',
  data=(coalesce(data,'{}'::jsonb)-array['supervisor','aiAudit']) ||
    case when data ? 'supervisor' then jsonb_build_object('legacy_unverified_supervisor',data->'supervisor') else '{}'::jsonb end ||
    case when data ? 'aiAudit' then jsonb_build_object('legacy_unverified_ai_draft',data->'aiAudit') else '{}'::jsonb end,
  updated_at=clock_timestamp()
where record_type='pre_task_risk_assessment';
alter table public.safety_records add constraint safety_records_approval_consistency check (
  (record_type in ('pre_shift','pre_task_risk_assessment') and
    ((status='pending_review' and approved_by is null and approved_at is null) or
     (status='approved' and approved_by is not null and approved_at is not null))) or
  (record_type not in ('pre_shift','pre_task_risk_assessment') and approved_by is null and approved_at is null
    and status not in ('pending_review','approved'))
);

create or replace function private.enforce_risk_assessment_review()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
  actor uuid := auth.uid();
  threshold integer;
  rating text;
  initial_score integer;
  residual_score integer;
begin
  if TG_OP='UPDATE' and old.record_type='pre_task_risk_assessment' and new.record_type<>'pre_task_risk_assessment' then
    raise exception 'Risk assessment record type is immutable' using errcode='23514';
  end if;
  if new.record_type<>'pre_task_risk_assessment' then return new; end if;
  if actor is null then raise exception 'Authenticated account required' using errcode='42501'; end if;
  if nullif(btrim(new.work_area,E' \t\n\r'),'') is null then
    raise exception 'Work Area is required' using errcode='23514';
  end if;
  select s.risk_stop_work_threshold into threshold from public.sites s
    where s.id=new.site_id and s.organization_id=new.organization_id;
  if threshold is null then raise exception 'Site must belong to the organization' using errcode='23514'; end if;
  if jsonb_typeof(new.data) is distinct from 'object' or
     jsonb_typeof(new.data->'hazards') is distinct from 'string' or
     jsonb_typeof(new.data->'controls') is distinct from 'string' or
     nullif(btrim(new.data->>'hazards',E' \t\n\r'),'') is null or
     nullif(btrim(new.data->>'controls',E' \t\n\r'),'') is null then
    raise exception 'Hazards and controls are required' using errcode='23514';
  end if;
  foreach rating in array array['initialLikelihood','initialSeverity','residualLikelihood','residualSeverity'] loop
    if jsonb_typeof(new.data->rating) is distinct from 'number' or coalesce(new.data->>rating,'') !~ '^[1-5]$' then
      raise exception 'Likelihood and severity must be integers from 1 to 5' using errcode='23514';
    end if;
  end loop;
  initial_score := (new.data->>'initialLikelihood')::integer * (new.data->>'initialSeverity')::integer;
  residual_score := (new.data->>'residualLikelihood')::integer * (new.data->>'residualSeverity')::integer;
  if residual_score>=threshold then
    raise exception 'STOP: additional controls and reassessment required before submission or approval' using errcode='23514';
  end if;
  if TG_OP='INSERT' then
    if new.created_by is distinct from actor or not private.has_org_role(new.organization_id,
      array['administrator','supervisor','safety_coordinator','worker']) then
      raise exception 'Operational membership required' using errcode='42501';
    end if;
    if new.status not in ('pending_review','submitted') or new.status is null or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Risk assessments must be submitted pending supervisor review' using errcode='23514';
    end if;
    if (new.data-array['crew','area','hazards','controls','taskTemplateId','initialLikelihood','initialSeverity','initialScore','initialLevel',
      'residualLikelihood','residualSeverity','residualScore','residualLevel','aiAudit'])<>'{}'::jsonb then
      raise exception 'Risk data cannot include a supervisor signature or review metadata' using errcode='23514';
    end if;
    if new.data ? 'aiAudit' and (
      jsonb_typeof(new.data->'aiAudit') is distinct from 'object' or
      ((new.data->'aiAudit')-array['version','aiUsed','source','generatedAt','originalDraft','preparerDraftCheckedAt','stopWorkTriggered','stopWorkEvents','finalReviewed'])<>'{}'::jsonb
    ) then raise exception 'AI preparation history is not a supervisor approval' using errcode='23514'; end if;
    if not exists (select 1 from public.task_templates t where t.id::text=new.data->>'taskTemplateId'
      and t.organization_id=new.organization_id and t.active and (t.site_id=new.site_id or t.site_id is null)) then
      raise exception 'An active cloud task template for this site is required' using errcode='23514';
    end if;
    new.work_area := btrim(new.work_area,E' \t\n\r');
    -- Recompute scores/labels; client-provided scores and thresholds never authorize work.
    new.data := new.data || jsonb_build_object('area',new.work_area,'initialScore',initial_score,'residualScore',residual_score,
      'initialLevel',case when initial_score<=4 then 'Low' when initial_score<=9 then 'Medium' when initial_score<=16 then 'High' else 'Critical' end,
      'residualLevel',case when residual_score<=4 then 'Low' when residual_score<=9 then 'Medium' when residual_score<=16 then 'High' else 'Critical' end,
      'stopWorkThresholdAtSubmission',threshold);
    new.status := 'pending_review';
    new.created_at := clock_timestamp();
  else
    if old.record_type<>'pre_task_risk_assessment' then
      raise exception 'Cannot convert a record into a risk assessment' using errcode='23514';
    end if;
    if not private.has_org_role(old.organization_id,array['administrator','supervisor','safety_coordinator']) then
      raise exception 'Authorized supervisor review required' using errcode='42501';
    end if;
    if old.status<>'pending_review' or new.status<>'approved' or new.status is null then
      raise exception 'Only a pending risk assessment can be approved' using errcode='23514';
    end if;
    if (to_jsonb(new)-array['status','updated_at','approved_by','approved_at']) is distinct from
       (to_jsonb(old)-array['status','updated_at','approved_by','approved_at']) then
      raise exception 'Submitted risk assessment content is immutable' using errcode='23514';
    end if;
    if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
      raise exception 'Approver identity and timestamp are assigned by the database' using errcode='23514';
    end if;
    -- Legacy records must also have truthful calculated scores before signing.
    if (new.data->'initialScore') is distinct from to_jsonb(initial_score) or
       (new.data->'residualScore') is distinct from to_jsonb(residual_score) then
      raise exception 'Legacy risk scores require a corrected submission' using errcode='23514';
    end if;
    new.approved_by := actor;
    new.approved_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.enforce_risk_assessment_review() from public,anon,authenticated;
create trigger enforce_risk_assessment_review before insert or update on public.safety_records
for each row execute function private.enforce_risk_assessment_review();
