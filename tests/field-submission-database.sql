begin;
create temporary table fixture(key text primary key,id uuid default gen_random_uuid());
insert into fixture(key) values('org'),('other_org'),('site'),('foreign_site'),('record'),('pass'),('incident'),('near_miss'),('failure'),
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
insert into auth.users(id) select id from fixture where key in('worker','other_worker','supervisor','administrator','safety_coordinator','client_viewer','outsider');
insert into public.organizations(id,name) values(pg_temp.f('org'),'Field rollback test'),(pg_temp.f('other_org'),'Foreign rollback test');
insert into public.sites(id,organization_id,name) values(pg_temp.f('site'),pg_temp.f('org'),'Test'),(pg_temp.f('foreign_site'),pg_temp.f('other_org'),'Foreign');
insert into public.organization_memberships(organization_id,user_id,role)
select pg_temp.f(case when key='outsider' then 'other_org' else 'org' end),id,
 case when key='outsider' then 'administrator' when key='other_worker' then 'worker' else key end
from fixture where key in('worker','other_worker','supervisor','administrator','safety_coordinator','client_viewer','outsider');
-- Test-only failure injection; the trigger and all fixture rows roll back.
create function pg_temp.fail_action() returns trigger language plpgsql as $$
begin if new.description='FORCED FAILURE' then raise exception 'Test action failure' using errcode='23514';end if;return new;end $$;
create trigger test_field_failure before insert on public.corrective_actions for each row execute function pg_temp.fail_action();
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
select public.submit_field_record(pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site'),'inspection','Test equipment',' Area ', '{"condition":"Out of Service","notes":"Pilot defect"}');
select public.submit_field_record(pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site'),'inspection','Test equipment',' Area ', '{"condition":"Out of Service","notes":"Pilot defect"}');
select pg_temp.ok((select count(*)=1 from public.safety_records where id=pg_temp.f('record')),'identical retry saves one record');
select pg_temp.ok((select count(*)=1 from public.corrective_actions where safety_record_id=pg_temp.f('record')),'identical retry saves one action');
select pg_temp.ok((select work_area='Area' and created_by=auth.uid() from public.safety_records where id=pg_temp.f('record')),'area and authenticated creator saved');
select pg_temp.ok((select priority='critical' and status='open' from public.corrective_actions where safety_record_id=pg_temp.f('record')),'out of service creates critical open action');
select pg_temp.blocked(format('select public.submit_field_record(%L,%L,%L,''inspection'',''Changed'',''Area'',''{"condition":"Pass"}'')',pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site')),'cannot reuse ID for changed content');
select public.submit_field_record(pg_temp.f('pass'),pg_temp.f('org'),pg_temp.f('site'),'inspection','Pass equipment','Area','{"condition":"Pass"}');
select pg_temp.ok(not exists(select 1 from public.corrective_actions where safety_record_id=pg_temp.f('pass')),'pass has no corrective action');
select pg_temp.blocked(format('select public.submit_field_record(%L,%L,%L,''inspection'',''Failed'',''Area'',''{"condition":"Deficiency Found","notes":"FORCED FAILURE"}'')',pg_temp.f('failure'),pg_temp.f('org'),pg_temp.f('site')),'action failure surfaces');
select pg_temp.ok(not exists(select 1 from public.safety_records where id=pg_temp.f('failure')),'action failure rolls back inspection');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''inspection'',''Test'','' '',''{"condition":"Pass"}'')',pg_temp.f('org'),pg_temp.f('site')),'blank area rejected');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''inspection'',''Test'',''Area'',''{"condition":"Deficiency Found"}'')',pg_temp.f('org'),pg_temp.f('site')),'deficiency notes required');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''inspection'',''Test'',''Area'',''{"condition":"Unknown"}'')',pg_temp.f('org'),pg_temp.f('site')),'invalid condition rejected');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''incident'',''Test'',''Area'',''{}'')',pg_temp.f('org'),pg_temp.f('site')),'incident description required');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''incident'',''Test'',''Area'',''{"description":"Test"}'')',pg_temp.f('org'),pg_temp.f('foreign_site')),'foreign site rejected');
do $$declare kind text;staff text;rec uuid;begin
 foreach kind in array array['incident','near_miss'] loop
  perform public.submit_field_record(pg_temp.f(kind),pg_temp.f('org'),pg_temp.f('site'),kind,'Report','Area','{"description":"Pilot report"}');
  perform public.submit_field_record(pg_temp.f(kind),pg_temp.f('org'),pg_temp.f('site'),kind,'Report','Area','{"description":"Pilot report"}');
  perform pg_temp.ok((select count(*)=1 from public.safety_records where id=pg_temp.f(kind)),kind||' retry deduplicated');
 end loop;
 foreach staff in array array['supervisor','administrator','safety_coordinator'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.f(staff)::text,true);rec:=gen_random_uuid();
  perform public.submit_field_record(rec,pg_temp.f('org'),pg_temp.f('site'),'inspection','Staff equipment','Area','{"condition":"Deficiency Found","notes":"Test"}');
  perform pg_temp.ok(exists(select 1 from public.corrective_actions where safety_record_id=rec),staff||' creates linked action');
 end loop;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.f('other_worker')::text,true);
select pg_temp.ok(not exists(select 1 from public.safety_records where id=pg_temp.f('record')),'worker cannot read another worker inspection');
select pg_temp.ok(not exists(select 1 from public.corrective_actions where safety_record_id=pg_temp.f('record')),'worker cannot read another worker action');
select pg_temp.ok(not exists(select 1 from public.safety_records where id in(pg_temp.f('incident'),pg_temp.f('near_miss'))),'worker cannot read another worker incidents');
select set_config('request.jwt.claim.sub',pg_temp.f('client_viewer')::text,true);
select pg_temp.ok((select count(*)=3 from public.safety_records where id in(pg_temp.f('record'),pg_temp.f('incident'),pg_temp.f('near_miss'))),'client viewer can read reports');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''incident'',''Test'',''Area'',''{"description":"Test"}'')',pg_temp.f('org'),pg_temp.f('site')),'client viewer cannot submit');
with changed as(update public.safety_records set title='Tampered' where id=pg_temp.f('incident') returning id)
select pg_temp.ok((select count(*)=0 from changed),'client viewer cannot update');
select set_config('request.jwt.claim.sub',pg_temp.f('outsider')::text,true);
select pg_temp.ok(not exists(select 1 from public.safety_records where id=pg_temp.f('incident')),'foreign staff cannot read reports');
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''incident'',''Test'',''Area'',''{"description":"Test"}'')',pg_temp.f('org'),pg_temp.f('site')),'foreign staff cannot submit');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.blocked(format('select public.submit_field_record(gen_random_uuid(),%L,%L,''incident'',''Test'',''Area'',''{"description":"Test"}'')',pg_temp.f('org'),pg_temp.f('site')),'missing auth rejected');
reset role;
select pg_temp.ok(not has_function_privilege('anon','public.submit_field_record(uuid,uuid,uuid,text,text,text,jsonb)','execute'),'anonymous execution denied');
select count(*) as passed,jsonb_agg(label) as checks from checks;
rollback;
