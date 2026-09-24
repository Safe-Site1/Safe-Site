create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function private.has_org_role(org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid,text[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;

alter policy org_select_member on public.organizations using (private.is_org_member(id));
alter policy org_update_admin on public.organizations using (private.has_org_role(id,array['administrator'])) with check (private.has_org_role(id,array['administrator']));

alter policy memberships_select_member on public.organization_memberships using (private.is_org_member(organization_id));
alter policy memberships_manage_admin on public.organization_memberships using (private.has_org_role(organization_id,array['administrator'])) with check (private.has_org_role(organization_id,array['administrator']));

alter policy sites_select_member on public.sites using (private.is_org_member(organization_id));
alter policy sites_manage_leads on public.sites using (private.has_org_role(organization_id,array['administrator','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','safety_coordinator']));

alter policy site_memberships_select_self_or_admin on public.site_memberships using (
  user_id = auth.uid() or exists (
    select 1 from public.sites s
    where s.id = site_id
      and private.has_org_role(s.organization_id,array['administrator','safety_coordinator'])
  )
);
alter policy site_memberships_manage_admin on public.site_memberships using (
  exists (select 1 from public.sites s where s.id = site_id and private.has_org_role(s.organization_id,array['administrator','safety_coordinator']))
) with check (
  exists (select 1 from public.sites s where s.id = site_id and private.has_org_role(s.organization_id,array['administrator','safety_coordinator']))
);
alter policy site_memberships_insert_self on public.site_memberships with check (
  user_id = auth.uid() and exists (
    select 1 from public.sites s
    where s.id = site_id and private.has_org_role(s.organization_id,array['administrator'])
  )
);

alter policy workers_select_member on public.workers using (private.is_org_member(organization_id));
alter policy workers_manage_staff on public.workers using (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator']));

alter policy qualifications_select_member on public.qualifications using (private.is_org_member(organization_id));
alter policy qualifications_manage_staff on public.qualifications using (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator']));

alter policy task_templates_select_member on public.task_templates using (private.is_org_member(organization_id));
alter policy task_templates_manage_staff on public.task_templates using (private.has_org_role(organization_id,array['administrator','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','safety_coordinator']));
alter policy task_hazards_select_member on public.task_template_hazards using (
  exists (select 1 from public.task_templates t where t.id=task_template_id and private.is_org_member(t.organization_id))
);
alter policy task_hazards_manage_staff on public.task_template_hazards using (
  exists (select 1 from public.task_templates t where t.id=task_template_id and private.has_org_role(t.organization_id,array['administrator','safety_coordinator']))
) with check (
  exists (select 1 from public.task_templates t where t.id=task_template_id and private.has_org_role(t.organization_id,array['administrator','safety_coordinator']))
);
alter policy task_controls_select_member on public.task_template_controls using (
  exists (select 1 from public.task_templates t where t.id=task_template_id and private.is_org_member(t.organization_id))
);
alter policy task_controls_manage_staff on public.task_template_controls using (
  exists (select 1 from public.task_templates t where t.id=task_template_id and private.has_org_role(t.organization_id,array['administrator','safety_coordinator']))
) with check (
  exists (select 1 from public.task_templates t where t.id=task_template_id and private.has_org_role(t.organization_id,array['administrator','safety_coordinator']))
);

alter policy safety_records_select_member on public.safety_records using (private.is_org_member(organization_id));
alter policy safety_records_insert_member on public.safety_records with check (private.is_org_member(organization_id));
alter policy safety_records_update_staff on public.safety_records using (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator']));

alter policy actions_select_member on public.corrective_actions using (private.is_org_member(organization_id));
alter policy actions_manage_staff on public.corrective_actions using (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator']));

alter policy documents_select_member on public.documents using (private.is_org_member(organization_id));
alter policy documents_manage_staff on public.documents using (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator'])) with check (private.has_org_role(organization_id,array['administrator','supervisor','safety_coordinator']));

alter policy audit_select_admin on public.audit_log using (private.has_org_role(organization_id,array['administrator','safety_coordinator']));
alter policy audit_insert_member on public.audit_log with check (organization_id is null or private.is_org_member(organization_id));

revoke execute on function public.is_org_member(uuid) from anon, authenticated;
revoke execute on function public.has_org_role(uuid,text[]) from anon, authenticated;
