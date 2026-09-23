-- Run as postgres in the Supabase SQL editor after database/pre_shift_approval.sql.
-- All fixtures and writes are rolled back. No real accounts or records are used.
begin;
create temporary table fixture (key text primary key, id uuid not null default gen_random_uuid());
insert into fixture(key) values ('org'),('other_org'),('site'),('other_site'),('foreign_site'),
  ('task'),('wrong_site_task'),('inactive_task'),('shared_task'),
  ('worker'),('other_worker'),('supervisor'),('administrator'),('safety_coordinator'),('client_viewer'),('outsider'),('inactive');
create temporary table checks (label text);
grant select on fixture to authenticated;
grant insert,select on checks to authenticated;
create function pg_temp.f(k text) returns uuid language sql as $$ select id from fixture where key=k $$;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  insert into checks values(label);
end $$;
create function pg_temp.blocked(command text,label text) returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when check_violation or insufficient_privilege then
    insert into checks values(label);return;
  end;
  raise exception 'FAIL (write allowed): %',label;
end $$;
create function pg_temp.no_rows(command text,label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute command;get diagnostics n=row_count;
  perform pg_temp.ok(n=0,label);
end $$;
create function pg_temp.submit(s text default 'pending_review',area text default ' Test bay ',extra jsonb default '{}')
returns uuid language plpgsql as $$
declare result uuid;
begin
  insert into public.safety_records(organization_id,site_id,created_by,record_type,title,task_name,work_area,status,data)
  values(pg_temp.f('org'),pg_temp.f('site'),auth.uid(),'pre_shift','Test task','Test task',area,s,
    jsonb_build_object('crew','Test crew','area',area,'hazards','Falling material','controls','Barricade','taskTemplateId',pg_temp.f('task'))||extra)
  returning id into result;
  return result;
end $$;

insert into auth.users(id) select id from fixture where key in
  ('worker','other_worker','supervisor','administrator','safety_coordinator','client_viewer','outsider','inactive');
insert into public.organizations(id,name) values(pg_temp.f('org'),'Pre-shift test'),(pg_temp.f('other_org'),'Other test org');
insert into public.organization_memberships(organization_id,user_id,role,active)
select pg_temp.f('org'),id,case when key='other_worker' then 'worker' when key='inactive' then 'supervisor' else key end,key<>'inactive'
from fixture where key in ('worker','other_worker','supervisor','administrator','safety_coordinator','client_viewer','inactive');
insert into public.organization_memberships(organization_id,user_id,role) values(pg_temp.f('other_org'),pg_temp.f('outsider'),'administrator');
insert into public.sites(id,organization_id,name) values
  (pg_temp.f('site'),pg_temp.f('org'),'Test site'),(pg_temp.f('other_site'),pg_temp.f('org'),'Other site'),
  (pg_temp.f('foreign_site'),pg_temp.f('other_org'),'Foreign site');
insert into public.task_templates(id,organization_id,site_id,name,active) values
  (pg_temp.f('task'),pg_temp.f('org'),pg_temp.f('site'),'Test task',true),
  (pg_temp.f('wrong_site_task'),pg_temp.f('org'),pg_temp.f('other_site'),'Other task',true),
  (pg_temp.f('inactive_task'),pg_temp.f('org'),pg_temp.f('site'),'Inactive task',false),
  (pg_temp.f('shared_task'),pg_temp.f('org'),null,'Shared task',true);

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
do $$
declare rec uuid; k text;
begin
  rec:=pg_temp.submit();
  perform set_config('test.record',rec::text,true);
  perform pg_temp.ok((select status='pending_review' and approved_by is null and approved_at is null and work_area='Test bay' and data->>'area'='Test bay'
    from public.safety_records where id=rec),'worker submission is pending with trimmed area and no signature');
  perform pg_temp.ok(pg_temp.submit('submitted') is not null,'old submitted status normalizes to pending');
  perform pg_temp.ok(pg_temp.submit(extra=>jsonb_build_object('taskTemplateId',pg_temp.f('shared_task'))) is not null,'shared cloud template accepted');
  foreach k in array array['approved','reviewed','closed','draft'] loop
    perform pg_temp.blocked(format('select pg_temp.submit(%L)',k),'worker cannot insert status '||k);
  end loop;
  perform pg_temp.blocked($q$select pg_temp.submit(area=>E' \t\n\r')$q$,'blank Work Area denied');
  perform pg_temp.blocked($q$select pg_temp.submit(area=>null)$q$,'null Work Area denied');
  perform pg_temp.blocked($q$select pg_temp.submit(extra=>' {"supervisor":"Forged"}')$q$,'typed supervisor signature denied');
  perform pg_temp.blocked($q$select pg_temp.submit(extra=>' {"approved_by":"Forged"}')$q$,'JSON approver spoof denied');
  perform pg_temp.blocked($q$select pg_temp.submit(extra=>' {"status":"approved"}')$q$,'JSON status spoof denied');
  perform pg_temp.blocked($q$select pg_temp.submit(extra=>' {"hazards":" "}')$q$,'blank hazards denied');
  perform pg_temp.blocked($q$select pg_temp.submit(extra=>' {"controls":" "}')$q$,'blank controls denied');
  foreach k in array array['wrong_site_task','inactive_task'] loop
    perform pg_temp.blocked(format('select pg_temp.submit(extra=>jsonb_build_object(''taskTemplateId'',%L))',pg_temp.f(k)),'invalid cloud template denied: '||k);
  end loop;
  perform pg_temp.blocked($q$select pg_temp.submit(extra=>' {"taskTemplateId":"fake"}')$q$,'unknown cloud template denied');
  perform pg_temp.blocked(format('insert into public.safety_records(organization_id,site_id,created_by,record_type,work_area,status,approved_by) values(%L,%L,%L,''pre_shift'',''Area'',''pending_review'',%L)',pg_temp.f('org'),pg_temp.f('site'),auth.uid(),pg_temp.f('supervisor')),'top-level approver spoof denied');
  perform pg_temp.blocked(format('insert into public.safety_records(organization_id,site_id,created_by,record_type,work_area,status) values(%L,%L,%L,''pre_shift'',''Area'',''pending_review'')',pg_temp.f('org'),pg_temp.f('foreign_site'),auth.uid()),'cross-organization site denied');
  perform pg_temp.no_rows(format('update public.safety_records set status=''approved'' where id=%L',rec),'worker cannot approve directly');
  perform pg_temp.no_rows(format('update public.safety_records set data=''{}'' where id=%L',rec),'worker cannot modify submitted content');
  perform pg_temp.no_rows(format('delete from public.safety_records where id=%L',rec),'worker cannot delete submission');
end $$;

select set_config('request.jwt.claim.sub',pg_temp.f('other_worker')::text,true);
select pg_temp.ok(not exists(select 1 from public.safety_records where id=current_setting('test.record')::uuid),'other worker cannot read submission');
select set_config('request.jwt.claim.sub',pg_temp.f('client_viewer')::text,true);
select pg_temp.ok(exists(select 1 from public.safety_records where id=current_setting('test.record')::uuid),'client can read submission');
select pg_temp.blocked('select pg_temp.submit()','client cannot submit');
select pg_temp.no_rows(format('update public.safety_records set status=''approved'' where id=%L',current_setting('test.record')),'client cannot approve');
select set_config('request.jwt.claim.sub',pg_temp.f('outsider')::text,true);
select pg_temp.ok(not exists(select 1 from public.safety_records where id=current_setting('test.record')::uuid),'foreign staff cannot read submission');
select pg_temp.no_rows(format('update public.safety_records set status=''approved'' where id=%L',current_setting('test.record')),'foreign staff cannot approve');
select set_config('request.jwt.claim.sub',pg_temp.f('inactive')::text,true);
select pg_temp.no_rows(format('update public.safety_records set status=''approved'' where id=%L',current_setting('test.record')),'inactive staff cannot approve');

do $$
declare rec uuid; k text; before_stamp timestamptz; before_actor uuid;
begin
  foreach k in array array['supervisor','administrator','safety_coordinator'] loop
    perform set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
    rec:=pg_temp.submit();
    perform set_config('request.jwt.claim.sub',pg_temp.f(k)::text,true);
    perform pg_temp.blocked(format('update public.safety_records set status=''approved'',approved_by=%L where id=%L',pg_temp.f('worker'),rec),k||' cannot forge approver');
    perform pg_temp.blocked(format('update public.safety_records set status=''approved'',approved_at=''2000-01-01'' where id=%L',rec),k||' cannot backdate signature');
    perform pg_temp.blocked(format('update public.safety_records set status=''approved'',work_area=''Changed'' where id=%L',rec),k||' cannot change content while approving');
    perform pg_temp.blocked(format('update public.safety_records set record_type=''flra'',status=''submitted'' where id=%L',rec),k||' cannot bypass by changing type');
    update public.safety_records set status='approved' where id=rec and status='pending_review';
    select approved_at,approved_by into before_stamp,before_actor from public.safety_records where id=rec;
    perform pg_temp.ok(before_actor=auth.uid() and before_stamp>=transaction_timestamp(),k||' approval stamped by database');
    perform pg_temp.no_rows(format('update public.safety_records set status=''approved'' where id=%L and status=''pending_review''',rec),k||' stale conditional approval changes no rows');
    perform pg_temp.blocked(format('update public.safety_records set status=''pending_review'' where id=%L',rec),k||' cannot reopen signed record');
    perform pg_temp.blocked(format('update public.safety_records set approved_by=%L where id=%L',pg_temp.f('worker'),rec),k||' cannot replace signature');
    perform pg_temp.ok((select approved_at=before_stamp and approved_by=before_actor from public.safety_records where id=rec),k||' signature remains unchanged');
  end loop;
end $$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.blocked('select pg_temp.submit()','missing authenticated identity denied');
reset role;
select count(*) as passed,jsonb_agg(label) as checks from checks;
rollback;
