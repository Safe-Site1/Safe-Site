alter policy audit_insert_member on public.audit_log to authenticated with check (organization_id is not null and private.is_org_member(organization_id));
alter policy audit_select_admin on public.audit_log to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text]));

alter policy actions_manage_staff on public.corrective_actions to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
alter policy actions_select_member on public.corrective_actions to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text,'client_viewer'::text]));

alter policy memberships_manage_admin on public.organization_memberships to authenticated using (private.has_org_role(organization_id, array['administrator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text]));
alter policy memberships_select_member on public.organization_memberships to authenticated using (private.is_org_member(organization_id));

alter policy org_select_member on public.organizations to authenticated using (private.is_org_member(id));
alter policy org_update_admin on public.organizations to authenticated using (private.has_org_role(id, array['administrator'::text])) with check (private.has_org_role(id, array['administrator'::text]));

alter policy profiles_select_self on public.profiles to authenticated using (id = auth.uid());
alter policy profiles_update_self on public.profiles to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter policy qualifications_manage_staff on public.qualifications to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text]));

alter policy safety_records_update_staff on public.safety_records to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));

alter policy site_memberships_manage_admin on public.site_memberships to authenticated using (exists (select 1 from public.sites s where s.id = site_memberships.site_id and private.has_org_role(s.organization_id, array['administrator'::text]))) with check (exists (select 1 from public.sites s where s.id = site_memberships.site_id and private.has_org_role(s.organization_id, array['administrator'::text])));
alter policy site_memberships_select_self_or_admin on public.site_memberships to authenticated using ((user_id = auth.uid()) or exists (select 1 from public.sites s where s.id = site_memberships.site_id and private.has_org_role(s.organization_id, array['administrator'::text])));

alter policy sites_manage_leads on public.sites to authenticated using (private.has_org_role(organization_id, array['administrator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text]));
alter policy sites_select_member on public.sites to authenticated using (private.is_org_member(organization_id));

alter policy task_controls_manage_staff on public.task_template_controls to authenticated using (exists (select 1 from public.task_templates t where t.id = task_template_controls.task_template_id and private.has_org_role(t.organization_id, array['administrator'::text,'safety_coordinator'::text]))) with check (exists (select 1 from public.task_templates t where t.id = task_template_controls.task_template_id and private.has_org_role(t.organization_id, array['administrator'::text,'safety_coordinator'::text])));
alter policy task_controls_select_member on public.task_template_controls to authenticated using (exists (select 1 from public.task_templates t where t.id = task_template_controls.task_template_id and private.is_org_member(t.organization_id)));
alter policy task_hazards_manage_staff on public.task_template_hazards to authenticated using (exists (select 1 from public.task_templates t where t.id = task_template_hazards.task_template_id and private.has_org_role(t.organization_id, array['administrator'::text,'safety_coordinator'::text]))) with check (exists (select 1 from public.task_templates t where t.id = task_template_hazards.task_template_id and private.has_org_role(t.organization_id, array['administrator'::text,'safety_coordinator'::text])));
alter policy task_hazards_select_member on public.task_template_hazards to authenticated using (exists (select 1 from public.task_templates t where t.id = task_template_hazards.task_template_id and private.is_org_member(t.organization_id)));
alter policy task_templates_manage_staff on public.task_templates to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text,'safety_coordinator'::text]));
alter policy task_templates_select_member on public.task_templates to authenticated using (private.is_org_member(organization_id));

alter policy workers_manage_staff on public.workers to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text])) with check (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text]));
alter policy workers_select_authorized on public.workers to authenticated using (private.has_org_role(organization_id, array['administrator'::text,'supervisor'::text,'safety_coordinator'::text,'client_viewer'::text]) or (user_id = auth.uid()));
