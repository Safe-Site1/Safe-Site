drop policy if exists actions_manage_staff on public.corrective_actions;
create policy actions_insert_staff on public.corrective_actions for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
create policy actions_update_staff on public.corrective_actions for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
create policy actions_delete_staff on public.corrective_actions for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));

drop policy if exists documents_manage_admin_safety on public.documents;
create policy documents_insert_admin_safety on public.documents for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy documents_update_admin_safety on public.documents for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy documents_delete_admin_safety on public.documents for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));

drop policy if exists memberships_manage_admin on public.organization_memberships;
create policy memberships_insert_admin on public.organization_memberships for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text]));
create policy memberships_update_admin on public.organization_memberships for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text]));
create policy memberships_delete_admin on public.organization_memberships for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text]));

drop policy if exists qualification_requirements_manage_admin on public.qualification_requirements;
create policy qualification_requirements_insert_admin_safety on public.qualification_requirements for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy qualification_requirements_update_admin_safety on public.qualification_requirements for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy qualification_requirements_delete_admin_safety on public.qualification_requirements for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));

drop policy if exists qualifications_manage_staff on public.qualifications;
create policy qualifications_insert_admin_safety on public.qualifications for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy qualifications_update_admin_safety on public.qualifications for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy qualifications_delete_admin_safety on public.qualifications for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));

drop policy if exists site_memberships_manage_admin on public.site_memberships;
create policy site_memberships_insert_admin on public.site_memberships for insert to authenticated with check (exists (select 1 from public.sites s where s.id=site_memberships.site_id and private.has_org_role(s.organization_id,array['administrator'::text])));
create policy site_memberships_update_admin on public.site_memberships for update to authenticated using (exists (select 1 from public.sites s where s.id=site_memberships.site_id and private.has_org_role(s.organization_id,array['administrator'::text]))) with check (exists (select 1 from public.sites s where s.id=site_memberships.site_id and private.has_org_role(s.organization_id,array['administrator'::text])));
create policy site_memberships_delete_admin on public.site_memberships for delete to authenticated using (exists (select 1 from public.sites s where s.id=site_memberships.site_id and private.has_org_role(s.organization_id,array['administrator'::text])));

drop policy if exists sites_manage_leads on public.sites;
create policy sites_insert_admin on public.sites for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text]));
create policy sites_update_admin on public.sites for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text]));
create policy sites_delete_admin on public.sites for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text]));

drop policy if exists task_controls_manage_staff on public.task_template_controls;
create policy task_controls_insert_admin_safety on public.task_template_controls for insert to authenticated with check (exists (select 1 from public.task_templates t where t.id=task_template_controls.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text])));
create policy task_controls_update_admin_safety on public.task_template_controls for update to authenticated using (exists (select 1 from public.task_templates t where t.id=task_template_controls.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text]))) with check (exists (select 1 from public.task_templates t where t.id=task_template_controls.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text])));
create policy task_controls_delete_admin_safety on public.task_template_controls for delete to authenticated using (exists (select 1 from public.task_templates t where t.id=task_template_controls.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text])));

drop policy if exists task_hazards_manage_staff on public.task_template_hazards;
create policy task_hazards_insert_admin_safety on public.task_template_hazards for insert to authenticated with check (exists (select 1 from public.task_templates t where t.id=task_template_hazards.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text])));
create policy task_hazards_update_admin_safety on public.task_template_hazards for update to authenticated using (exists (select 1 from public.task_templates t where t.id=task_template_hazards.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text]))) with check (exists (select 1 from public.task_templates t where t.id=task_template_hazards.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text])));
create policy task_hazards_delete_admin_safety on public.task_template_hazards for delete to authenticated using (exists (select 1 from public.task_templates t where t.id=task_template_hazards.task_template_id and private.has_org_role(t.organization_id,array['administrator'::text,'safety_coordinator'::text])));

drop policy if exists task_templates_manage_staff on public.task_templates;
create policy task_templates_insert_admin_safety on public.task_templates for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy task_templates_update_admin_safety on public.task_templates for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy task_templates_delete_admin_safety on public.task_templates for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));

drop policy if exists worker_passes_manage_admin_safety on public.worker_passes;
create policy worker_passes_insert_admin_safety on public.worker_passes for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy worker_passes_update_admin_safety on public.worker_passes for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));
create policy worker_passes_delete_admin_safety on public.worker_passes for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'safety_coordinator'::text]));

drop policy if exists workers_manage_staff on public.workers;
create policy workers_insert_staff on public.workers for insert to authenticated with check (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
create policy workers_update_staff on public.workers for update to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
create policy workers_delete_staff on public.workers for delete to authenticated using (private.has_org_role(organization_id,array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
