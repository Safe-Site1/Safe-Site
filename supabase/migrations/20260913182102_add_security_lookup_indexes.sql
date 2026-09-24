create index if not exists organization_memberships_user_active_org_role_idx on public.organization_memberships(user_id, active, organization_id, role);
create index if not exists site_memberships_user_site_idx on public.site_memberships(user_id, site_id);
create index if not exists documents_org_worker_idx on public.documents(organization_id, worker_id);
create index if not exists team_invitations_org_email_status_idx on public.team_invitations(organization_id, lower(email), status);
create index if not exists corrective_actions_site_status_due_idx on public.corrective_actions(site_id, status, due_date);
