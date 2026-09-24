alter policy audit_insert_member on public.audit_log to authenticated with check (organization_id is not null and user_id = (select auth.uid()) and private.is_org_member(organization_id));
