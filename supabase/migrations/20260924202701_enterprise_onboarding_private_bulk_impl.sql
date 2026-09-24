
alter function public.get_enterprise_onboarding_preview(uuid) set schema private;
alter function public.validate_enterprise_onboarding(uuid) set schema private;
alter function public.stage_enterprise_onboarding(uuid,text,jsonb) set schema private;
alter function public.commit_enterprise_onboarding(uuid,boolean) set schema private;

alter function private.get_enterprise_onboarding_preview(uuid) security definer;
alter function private.validate_enterprise_onboarding(uuid) security definer;
alter function private.stage_enterprise_onboarding(uuid,text,jsonb) security definer;
alter function private.commit_enterprise_onboarding(uuid,boolean) security definer;

revoke all on function private.get_enterprise_onboarding_preview(uuid) from public,anon;
revoke all on function private.validate_enterprise_onboarding(uuid) from public,anon;
revoke all on function private.stage_enterprise_onboarding(uuid,text,jsonb) from public,anon;
revoke all on function private.commit_enterprise_onboarding(uuid,boolean) from public,anon;

grant execute on function private.get_enterprise_onboarding_preview(uuid) to authenticated;
grant execute on function private.validate_enterprise_onboarding(uuid) to authenticated;
grant execute on function private.stage_enterprise_onboarding(uuid,text,jsonb) to authenticated;
grant execute on function private.commit_enterprise_onboarding(uuid,boolean) to authenticated;

create or replace function public.get_enterprise_onboarding_preview(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  org uuid;
begin
  select organization_id into org
  from public.onboarding_batches
  where id=p_batch_id;

  if org is null then
    raise exception 'Onboarding batch not found' using errcode='P0002';
  end if;

  if not private.has_org_role(org,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  return private.get_enterprise_onboarding_preview(p_batch_id);
end;
$$;

create or replace function public.validate_enterprise_onboarding(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  org uuid;
begin
  select organization_id into org
  from public.onboarding_batches
  where id=p_batch_id;

  if org is null then
    raise exception 'Onboarding batch not found' using errcode='P0002';
  end if;

  if not private.has_org_role(org,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  return private.validate_enterprise_onboarding(p_batch_id);
end;
$$;

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
begin
  if auth.uid() is null
     or not private.has_org_role(p_organization_id,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  return private.stage_enterprise_onboarding(
    p_organization_id,
    p_source_file_name,
    p_payload
  );
end;
$$;

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
  org uuid;
begin
  select organization_id into org
  from public.onboarding_batches
  where id=p_batch_id;

  if org is null then
    raise exception 'Onboarding batch not found' using errcode='P0002';
  end if;

  if not private.has_org_role(org,array['administrator','safety_coordinator']) then
    raise exception 'Administrator or Safety Coordinator access required' using errcode='42501';
  end if;

  return private.commit_enterprise_onboarding(p_batch_id,p_confirm_updates);
end;
$$;

revoke all on function public.get_enterprise_onboarding_preview(uuid) from public,anon;
revoke all on function public.validate_enterprise_onboarding(uuid) from public,anon;
revoke all on function public.stage_enterprise_onboarding(uuid,text,jsonb) from public,anon;
revoke all on function public.commit_enterprise_onboarding(uuid,boolean) from public,anon;

grant execute on function public.get_enterprise_onboarding_preview(uuid) to authenticated;
grant execute on function public.validate_enterprise_onboarding(uuid) to authenticated;
grant execute on function public.stage_enterprise_onboarding(uuid,text,jsonb) to authenticated;
grant execute on function public.commit_enterprise_onboarding(uuid,boolean) to authenticated;
