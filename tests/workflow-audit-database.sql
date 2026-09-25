-- All fixtures, failure injection and writes roll back.
begin;
create temporary table fixture(key text primary key,id uuid default gen_random_uuid());
insert into fixture(key) values('org'),('foreign_org'),('site'),('task'),('worker'),('administrator'),('safety_coordinator'),('outsider'),('pre'),('inspection'),('failure');
create temporary table checks(label text);
grant select on fixture to authenticated;
grant select,insert on checks to authenticated;
create function pg_temp.f(k text) returns uuid language sql as $$select id from fixture where key=k$$;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;insert into checks values(label);end$$;
insert into auth.users(id) select id from fixture where key in('worker','administrator','safety_coordinator','outsider');
insert into public.organizations(id,name) values(pg_temp.f('org'),'Audit rollback fixture'),(pg_temp.f('foreign_org'),'Foreign audit fixture');
insert into public.sites(id,organization_id,name) values(pg_temp.f('site'),pg_temp.f('org'),'Audit test site');
insert into public.organization_memberships(organization_id,user_id,role)
 select pg_temp.f(case when key='outsider' then 'foreign_org' else 'org' end),id,
 case when key='outsider' then 'administrator' else key end from fixture where key in('worker','administrator','safety_coordinator','outsider');
insert into public.task_templates(id,organization_id,site_id,name) values(pg_temp.f('task'),pg_temp.f('org'),pg_temp.f('site'),'Audit test task');
create function pg_temp.reject_test_audit() returns trigger language plpgsql as $$begin
 if new.metadata->>'title'='FORCED AUDIT FAILURE' then raise exception 'Test audit unavailable' using errcode='23514';end if;
 return new;end$$;
create trigger reject_test_audit before insert on public.audit_log for each row execute function pg_temp.reject_test_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
insert into public.safety_records(id,organization_id,site_id,created_by,record_type,title,task_name,work_area,status,data)
 values(pg_temp.f('pre'),pg_temp.f('org'),pg_temp.f('site'),auth.uid(),'pre_shift','Audit test task','Audit test task','Demo bay','pending_review',
 jsonb_build_object('crew','Test','hazards','Sample hazard','controls','Sample control','taskTemplateId',pg_temp.f('task')));
select public.submit_field_record(pg_temp.f('inspection'),pg_temp.f('org'),pg_temp.f('site'),'inspection','Demo equipment','Demo bay','{"condition":"Deficiency Found","notes":"Test-only deficiency"}');
select public.submit_field_record(pg_temp.f('inspection'),pg_temp.f('org'),pg_temp.f('site'),'inspection','Demo equipment','Demo bay','{"condition":"Deficiency Found","notes":"Test-only deficiency"}');
select pg_temp.ok(not exists(select 1 from public.audit_log where organization_id=pg_temp.f('org')),'worker cannot read central audit');
do $$declare n integer;begin
 update public.safety_records set status='approved' where id=pg_temp.f('pre');get diagnostics n=row_count;
 perform pg_temp.ok(n=0,'worker cannot approve or generate approval event');
end$$;
select set_config('request.jwt.claim.sub',pg_temp.f('administrator')::text,true);
select pg_temp.ok((select count(*)=3 from public.audit_log where organization_id=pg_temp.f('org') and action like 'workflow.%'),'submission retry creates exactly three initial events');
select pg_temp.ok((select bool_and(user_id=pg_temp.f('worker')) from public.audit_log where organization_id=pg_temp.f('org')),'creation events retain authenticated worker actor');
update public.safety_records set status='approved' where id=pg_temp.f('pre') and status='pending_review';
update public.safety_records set status='approved' where id=pg_temp.f('pre') and status='pending_review';
update public.corrective_actions set status='open' where safety_record_id=pg_temp.f('inspection');
select pg_temp.ok((select count(*)=4 from public.audit_log where organization_id=pg_temp.f('org')),'stale approval and unchanged status do not duplicate audit');
update public.corrective_actions set status='in_progress' where safety_record_id=pg_temp.f('inspection');
update public.corrective_actions set status='closed',closeout_note='Fictional verified closeout' where safety_record_id=pg_temp.f('inspection');
select pg_temp.ok((select count(*)=6 from public.audit_log where organization_id=pg_temp.f('org')),'six lifecycle events recorded');
select pg_temp.ok((select count(*)=1 from public.audit_log where entity_id=pg_temp.f('pre') and action='workflow.safety_record.approved'
 and user_id=auth.uid() and metadata->>'previous_status'='pending_review' and metadata->>'status'='approved'
 and (metadata->>'approved_by')::uuid=auth.uid() and metadata->>'approved_at' is not null),'approval event contains actor, transition and signature');
select pg_temp.ok((select count(*)=1 from public.audit_log where action='workflow.corrective_action.closed' and organization_id=pg_temp.f('org')
 and metadata->>'closeout_note'='Fictional verified closeout' and (metadata->>'safety_record_id')::uuid=pg_temp.f('inspection')
 and (metadata->>'closed_by')::uuid=auth.uid() and metadata->>'closed_at' is not null),'closeout audit contains source link, note and signature');
do $$begin
 begin
  insert into public.audit_log(organization_id,user_id,action,entity_id) values(pg_temp.f('org'),auth.uid(),'workflow.safety_record.approved',pg_temp.f('pre'));
  raise exception 'FAIL: forged event allowed';
 exception when insufficient_privilege then perform pg_temp.ok(true,'direct forged workflow event rejected');end;
 begin
  perform public.submit_field_record(pg_temp.f('failure'),pg_temp.f('org'),pg_temp.f('site'),'inspection','FORCED AUDIT FAILURE','Demo bay','{"condition":"Pass"}');
  raise exception 'FAIL: audit failure did not abort submission';
 exception when check_violation then perform pg_temp.ok(true,'audit-write failure aborts submission');end;
end$$;
select pg_temp.ok(not exists(select 1 from public.safety_records where id=pg_temp.f('failure')),'audit failure leaves no source record');
select pg_temp.ok(not exists(select 1 from public.audit_log where entity_id=pg_temp.f('failure')),'audit failure leaves no event');
do $$declare n integer;begin
 begin update public.audit_log set action='tampered' where organization_id=pg_temp.f('org');get diagnostics n=row_count;
 perform pg_temp.ok(n=0,'administrator cannot alter audit history');
 exception when insufficient_privilege then perform pg_temp.ok(true,'administrator cannot alter audit history');end;
 begin delete from public.audit_log where organization_id=pg_temp.f('org');get diagnostics n=row_count;
 perform pg_temp.ok(n=0,'administrator cannot delete audit history');
 exception when insufficient_privilege then perform pg_temp.ok(true,'administrator cannot delete audit history');end;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.f('outsider')::text,true);
select pg_temp.ok(not exists(select 1 from public.audit_log where organization_id=pg_temp.f('org')),'foreign administrator cannot read events');
select set_config('request.jwt.claim.sub',pg_temp.f('safety_coordinator')::text,true);
select pg_temp.ok((select count(*)=6 from public.audit_log where organization_id=pg_temp.f('org')),'Safety Coordinator can read all six events');
reset role;
select count(*) passed,jsonb_agg(label) checks from checks;
rollback;
