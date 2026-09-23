-- Run as postgres after database/corrective_action_closeout.sql. Everything rolls back.
begin;
create temporary table fixture(key text primary key,id uuid default gen_random_uuid());
insert into fixture(key) values('org'),('other_org'),('site'),('foreign_site'),('source'),('action'),
 ('worker'),('other_worker'),('supervisor'),('administrator'),('safety_coordinator'),('client_viewer'),('outsider');
create temporary table checks(label text);
grant select on fixture to authenticated;
grant select,insert on checks to authenticated;
create function pg_temp.f(k text) returns uuid language sql as $$select id from fixture where key=k$$;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;insert into checks values(label);end $$;
create function pg_temp.blocked(command text,label text) returns void language plpgsql as $$
begin
 begin execute command;
 exception when check_violation or insufficient_privilege then insert into checks values(label);return;end;
 raise exception 'FAIL (write allowed): %',label;
end $$;
create function pg_temp.no_rows(command text,label text) returns void language plpgsql as $$
declare n bigint;begin execute command;get diagnostics n=row_count;perform pg_temp.ok(n=0,label);end $$;
insert into auth.users(id) select id from fixture where key in('worker','other_worker','supervisor','administrator','safety_coordinator','client_viewer','outsider');
insert into public.organizations(id,name) values(pg_temp.f('org'),'Closeout rollback test'),(pg_temp.f('other_org'),'Foreign closeout rollback test');
insert into public.sites(id,organization_id,name) values(pg_temp.f('site'),pg_temp.f('org'),'Test'),(pg_temp.f('foreign_site'),pg_temp.f('other_org'),'Foreign');
insert into public.organization_memberships(organization_id,user_id,role)
select pg_temp.f(case when key='outsider' then 'other_org' else 'org' end),id,
 case when key='outsider' then 'administrator' when key='other_worker' then 'worker' else key end
from fixture where key in('worker','other_worker','supervisor','administrator','safety_coordinator','client_viewer','outsider');
insert into public.safety_records(id,organization_id,site_id,created_by,record_type,title,status)
values(pg_temp.f('source'),pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('worker'),'inspection','Pilot inspection','submitted');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
insert into public.corrective_actions(id,organization_id,site_id,safety_record_id,title,status)
values(pg_temp.f('action'),pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('source'),'Duplicate title','open');
select pg_temp.ok(exists(select 1 from public.corrective_actions where id=pg_temp.f('action')),'worker can create/read own inspection action');
select pg_temp.no_rows(format('update public.corrective_actions set status=''closed'',closeout_note=''Fake'' where id=%L',pg_temp.f('action')),'worker cannot close own action');
select pg_temp.no_rows(format('update public.corrective_actions set status=''in_progress'' where id=%L',pg_temp.f('action')),'worker cannot change action status');
select pg_temp.blocked(format('insert into public.corrective_actions(organization_id,site_id,safety_record_id,title,status,closed_by) values(%L,%L,%L,''Spoof'',''open'',%L)',pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('source'),auth.uid()),'worker cannot inject closer on creation');
select set_config('request.jwt.claim.sub',pg_temp.f('other_worker')::text,true);
select pg_temp.ok(not exists(select 1 from public.corrective_actions where id=pg_temp.f('action')),'worker cannot read another worker action');
select set_config('request.jwt.claim.sub',pg_temp.f('client_viewer')::text,true);
select pg_temp.ok(exists(select 1 from public.corrective_actions where id=pg_temp.f('action')),'client may read action');
select pg_temp.no_rows(format('update public.corrective_actions set status=''closed'',closeout_note=''Fake'' where id=%L',pg_temp.f('action')),'client cannot close');
select set_config('request.jwt.claim.sub',pg_temp.f('outsider')::text,true);
select pg_temp.ok(not exists(select 1 from public.corrective_actions where id=pg_temp.f('action')),'foreign staff cannot read action');
select pg_temp.no_rows(format('update public.corrective_actions set status=''closed'',closeout_note=''Fake'' where id=%L',pg_temp.f('action')),'foreign staff cannot close');
do $$
declare role_name text;rec uuid;stamp timestamptz;
begin
 foreach role_name in array array['supervisor','administrator','safety_coordinator'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.f(role_name)::text,true);
  insert into public.corrective_actions(organization_id,site_id,safety_record_id,title,description,status)
   values(pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('source'),'Duplicate title','Original description','open') returning id into rec;
  perform pg_temp.blocked(format('update public.corrective_actions set status=''closed'' where id=%L',rec),role_name||' missing note rejected');
  perform pg_temp.blocked(format('update public.corrective_actions set status=''closed'',closeout_note=E'' \t\n\r'' where id=%L',rec),role_name||' whitespace note rejected');
  perform pg_temp.blocked(format('update public.corrective_actions set status=''closed'',closeout_note=''Done'',closed_by=%L where id=%L',pg_temp.f('worker'),rec),role_name||' cannot forge closer');
  perform pg_temp.blocked(format('update public.corrective_actions set status=''closed'',closeout_note=''Done'',closed_at=''2000-01-01'' where id=%L',rec),role_name||' cannot backdate closeout');
  perform pg_temp.blocked(format('update public.corrective_actions set status=''closed'',closeout_note=''Done'',description=''Rewritten'' where id=%L',rec),role_name||' cannot rewrite details while closing');
  perform pg_temp.blocked(format('update public.corrective_actions set closeout_note=''Fake'' where id=%L',rec),role_name||' cannot attach closure to open record');
  perform pg_temp.blocked(format('update public.corrective_actions set site_id=%L where id=%L',pg_temp.f('foreign_site'),rec),role_name||' cannot change source site');
  update public.corrective_actions set status='in_progress' where id=rec;
  perform pg_temp.ok((select status='in_progress' and closed_by is null and closed_at is null from public.corrective_actions where id=rec),role_name||' can start action');
  update public.corrective_actions set status='closed',closeout_note='  Pilot verified  ' where id=rec and status='in_progress';
  perform pg_temp.ok((select closed_by=auth.uid() and closed_at>=transaction_timestamp() and closeout_note='Pilot verified' and description='Original description' from public.corrective_actions where id=rec),role_name||' server-stamped closeout preserves description');
  select closed_at into stamp from public.corrective_actions where id=rec;
  perform pg_temp.no_rows(format('update public.corrective_actions set status=''closed'',closeout_note=''Second'' where id=%L and status=''in_progress''',rec),role_name||' stale closeout updates zero rows');
  perform pg_temp.blocked(format('update public.corrective_actions set closeout_note=''Rewrite'' where id=%L',rec),role_name||' cannot overwrite closed note');
  perform pg_temp.blocked(format('update public.corrective_actions set status=''open'',closed_at=null,closed_by=null,closeout_note=null where id=%L',rec),role_name||' cannot reopen signed closeout');
  perform pg_temp.ok((select closed_at=stamp and closed_by=auth.uid() from public.corrective_actions where id=rec),role_name||' closure identity/time unchanged');
 end loop;
end $$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.blocked(format('insert into public.corrective_actions(organization_id,site_id,title) values(%L,%L,''No identity'')',pg_temp.f('org'),pg_temp.f('site')),'missing identity rejected');
reset role;
select count(*) as passed,jsonb_agg(label) as checks from checks;
rollback;
