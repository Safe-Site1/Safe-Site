
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='stage_enterprise_onboarding'
    and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_source_file_name text, p_payload jsonb';

  def:=replace(
    def,
    'batch_id,row_number,employee_number,first_name,last_name,job_title,site_name,status,notes',
    'batch_id,row_number,employee_number,first_name,last_name,job_title,site_name,email,status,notes'
  );
  def:=replace(
    def,
    E'    coalesce(item->>''site_name'',''''),\n    coalesce(item->>''status'',''active''),',
    E'    coalesce(item->>''site_name'',''''),\n    nullif(lower(btrim(item->>''email'')),''''),\n    coalesce(item->>''status'',''active''),'
  );
  execute def;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='validate_enterprise_onboarding'
    and pg_get_function_identity_arguments(p.oid)='p_batch_id uuid';

  def:=replace(
    def,
    E'    if btrim(wr.site_name)='''' then errs:=array_append(errs,''Site / Project is required''); end if;\n    if lower(btrim(wr.status)) not in (''active'',''inactive'')',
    E'    if btrim(wr.site_name)='''' then errs:=array_append(errs,''Site / Project is required''); end if;\n    if nullif(btrim(wr.email),'''') is not null\n       and lower(btrim(wr.email)) !~ ''^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'' then\n      errs:=array_append(errs,''Email must be a valid email address'');\n    end if;\n    if lower(btrim(wr.status)) not in (''active'',''inactive'')'
  );

  def:=replace(
    def,
    E'           or existing_worker.site_id is distinct from sid\n           or existing_worker.status is distinct from lower(btrim(wr.status)) then',
    E'           or existing_worker.site_id is distinct from sid\n           or (nullif(btrim(wr.email),'''') is not null\n               and coalesce(existing_worker.email,'''') is distinct from lower(btrim(wr.email)))\n           or existing_worker.status is distinct from lower(btrim(wr.status)) then'
  );

  def:=replace(
    def,
    E'        site_name=btrim(wr.site_name),\n        status=lower(btrim(wr.status)),',
    E'        site_name=btrim(wr.site_name),\n        email=nullif(lower(btrim(wr.email)),''''),\n        status=lower(btrim(wr.status)),'
  );
  execute def;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='commit_enterprise_onboarding'
    and pg_get_function_identity_arguments(p.oid)='p_batch_id uuid, p_confirm_updates boolean';

  def:=replace(
    def,
    'organization_id,site_id,employee_number,first_name,last_name,job_title,status,ready_for_work',
    'organization_id,site_id,employee_number,first_name,last_name,job_title,email,status,ready_for_work'
  );

  def:=replace(
    def,
    'b.organization_id,sid,wr.employee_number,wr.first_name,wr.last_name,wr.job_title,wr.status,false',
    'b.organization_id,sid,wr.employee_number,wr.first_name,wr.last_name,wr.job_title,wr.email,wr.status,false'
  );

  def:=replace(
    def,
    E'          job_title=wr.job_title,\n          status=wr.status,',
    E'          job_title=wr.job_title,\n          email=coalesce(wr.email,email),\n          status=wr.status,'
  );
  execute def;
end $$;
