-- Synthetic records only. Every fixture and write is rolled back.
begin;
set local statement_timeout='110s';
create temporary table fixture(key text primary key,id uuid default gen_random_uuid());
insert into fixture(key) values('org'),('other_org'),('site'),('administrator'),('safety_coordinator'),('worker'),('supervisor'),('client_viewer'),('outsider');
create temporary table checks(label text);
grant select on fixture to authenticated;
grant select,insert on checks to authenticated;
create function pg_temp.f(k text) returns uuid language sql as $$select id from fixture where key=k$$;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;insert into checks values(label);end$$;
insert into auth.users(id) select id from fixture where key in('administrator','safety_coordinator','worker','supervisor','client_viewer','outsider');
insert into public.organizations(id,name) values(pg_temp.f('org'),'Enterprise rollback fixture'),(pg_temp.f('other_org'),'Other rollback fixture');
insert into public.sites(id,organization_id,name) values(pg_temp.f('site'),pg_temp.f('org'),'Enterprise Test Site');
insert into public.organization_memberships(organization_id,user_id,role)
select pg_temp.f(case when key='outsider' then 'other_org' else 'org' end),id,case when key='outsider' then 'administrator' else key end
from fixture where key in('administrator','safety_coordinator','worker','supervisor','client_viewer','outsider');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('administrator')::text,true);
do $$
declare payload jsonb;p jsonb;b uuid;b2 uuid;staff text;started timestamptz:=clock_timestamp();rejected boolean;inv uuid;
begin
 select jsonb_build_object(
  'workers',jsonb_agg(jsonb_build_object('employee_number','ENT-'||lpad(n::text,5,'0'),'first_name','Test','last_name','Worker '||n,'job_title','Miner','site_name','Enterprise Test Site','email','worker'||n||'@example.test')),
  'qualifications',jsonb_agg(jsonb_build_object('employee_number','ENT-'||lpad(n::text,5,'0'),'qualification_name','Test Training','issued_on','2026-01-01','expires_on','2028-01-01')),
  'requirements',jsonb_build_array(jsonb_build_object('site_name','Enterprise Test Site','job_title','Miner','qualification_name','Test Training','warning_days','30','active','yes')),
  'documents',jsonb_build_array(jsonb_build_object('employee_number','ENT-00001','qualification_name','Test Training','file_name','test.pdf'))
 ) into payload from generate_series(1,500) n;
 p:=public.stage_enterprise_onboarding(pg_temp.f('org'),'500-worker-test.xlsx',payload);b:=(p#>>'{batch,id}')::uuid;
 perform pg_temp.ok((p#>>'{counts,errors}')::int=0,'500 workers stage without validation errors');
 perform pg_temp.ok((p#>>'{counts,inserts}')::int=1001,'500 workers + 500 qualifications + one requirement preview inserts');
 perform pg_temp.ok(not exists(select 1 from public.workers where organization_id=pg_temp.f('org')),'stage does not modify workers');
 p:=public.commit_enterprise_onboarding(b,false);
 perform pg_temp.ok(p#>>'{batch,status}'='documents_pending','commit distinguishes pending documents');
 perform pg_temp.ok((select count(*)=500 from public.workers where organization_id=pg_temp.f('org')),'commit inserts exactly 500 workers');
 perform pg_temp.ok((select count(*)=500 from public.qualifications where organization_id=pg_temp.f('org')),'commit inserts exactly 500 qualifications');
 perform pg_temp.ok((select count(*)=500 from public.workers where organization_id=pg_temp.f('org') and email like '%@example.test'),'worker emails survive staging and commit');
 p:=public.commit_enterprise_onboarding(b,false);
 perform pg_temp.ok((select count(*)=500 from public.workers where organization_id=pg_temp.f('org')),'repeated commit is idempotent');
 perform pg_temp.ok((select count(*)=1 from public.get_enterprise_onboarding_document_targets(b)),'document target resolves employee and qualification');
 rejected:=false;
 begin perform public.register_enterprise_onboarding_document(b,1,'wrong/path','application/pdf');exception when check_violation then rejected:=true;end;
 perform pg_temp.ok(rejected,'registration rejects foreign path');
 rejected:=false;
 begin perform public.register_enterprise_onboarding_document(b,1,pg_temp.f('org')||'/'||(select id from public.workers where organization_id=pg_temp.f('org') and employee_number='ENT-00001')||'/'||b||'/missing.pdf','application/pdf');exception when check_violation then rejected:=true;end;
 perform pg_temp.ok(rejected,'registration rejects missing storage object');
 payload:=jsonb_set(payload,'{workers,0,first_name}','"Changed"');
 payload:=jsonb_set(payload,'{workers,0,email}','"changed@example.test"');
 p:=public.stage_enterprise_onboarding(pg_temp.f('org'),'update-test.xlsx',payload);b2:=(p#>>'{batch,id}')::uuid;
 perform pg_temp.ok((p#>>'{counts,updates}')::int=1,'one existing worker update is previewed');
 rejected:=false;
 begin perform public.commit_enterprise_onboarding(b2,false);exception when check_violation then rejected:=true;end;
 perform pg_temp.ok(rejected,'updates require explicit confirmation');
 perform pg_temp.ok((select first_name='Test' from public.workers where organization_id=pg_temp.f('org') and employee_number='ENT-00001'),'rejected commit leaves original record untouched');
 p:=public.commit_enterprise_onboarding(b2,true);
 perform pg_temp.ok((select first_name='Changed' and email='changed@example.test' from public.workers where organization_id=pg_temp.f('org') and employee_number='ENT-00001'),'confirmed worker/email update applied');
 payload:=jsonb_set(payload,'{workers,1,employee_number}','"ENT-00001"');
 p:=public.stage_enterprise_onboarding(pg_temp.f('org'),'duplicate-test.xlsx',payload);
 perform pg_temp.ok((p#>>'{counts,errors}')::int>0,'duplicate employee numbers produce errors');
 rejected:=false;
 begin perform public.commit_enterprise_onboarding((p#>>'{batch,id}')::uuid,true);exception when check_violation then rejected:=true;end;
 perform pg_temp.ok(rejected,'invalid batch cannot partially commit');
 foreach staff in array array['worker','supervisor','client_viewer','outsider'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.f(staff)::text,true);rejected:=false;
  begin perform public.stage_enterprise_onboarding(pg_temp.f('org'),'denied.xlsx',payload);exception when insufficient_privilege then rejected:=true;end;
  perform pg_temp.ok(rejected,staff||' cannot stage in organization');
  perform pg_temp.ok(not exists(select 1 from public.onboarding_batches where id=b),staff||' cannot read batch through RLS');
 end loop;
 perform set_config('request.jwt.claim.sub',pg_temp.f('safety_coordinator')::text,true);
 p:=public.get_enterprise_onboarding_preview(b);
 perform pg_temp.ok(p#>>'{batch,id}'=b::text,'Safety Coordinator can resume batch');
 insert into checks values('500-worker database workflow elapsed '||(clock_timestamp()-started)::text);
end $$;
reset role;
insert into storage.objects(bucket_id,name)
select 'worker-documents',b.organization_id||'/'||w.id||'/'||b.id||'/fixture.pdf'
from public.onboarding_batches b join public.workers w on w.organization_id=b.organization_id
where b.organization_id=pg_temp.f('org') and b.source_file_name='500-worker-test.xlsx' and w.employee_number='ENT-00001';
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('administrator')::text,true);
do $$declare b uuid;wid uuid;doc uuid;again uuid;token uuid;begin
 select id into b from public.onboarding_batches where organization_id=pg_temp.f('org') and source_file_name='500-worker-test.xlsx';
 select id into wid from public.workers where organization_id=pg_temp.f('org') and employee_number='ENT-00001';
 doc:=public.register_enterprise_onboarding_document(b,1,pg_temp.f('org')||'/'||wid||'/'||b||'/fixture.pdf','application/pdf');
 again:=public.register_enterprise_onboarding_document(b,1,pg_temp.f('org')||'/'||wid||'/'||b||'/fixture.pdf','application/pdf');
 perform pg_temp.ok(doc=again,'document registration retries return same ID');
 perform pg_temp.ok((select status='complete' from public.onboarding_batches where id=b),'final document registration completes batch');
 perform pg_temp.ok((select count(*)=1 from public.documents where onboarding_batch_id=b),'document retry cannot duplicate registration');
 select invitation_token into token from public.create_team_invitation('changed@example.test','Different Display Name','worker',pg_temp.f('site'),'ENT-00001');
 perform set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.f('worker'),'email','changed@example.test')::text,true);
 perform public.accept_team_invitation(token);
 perform public.accept_team_invitation(token);
 perform pg_temp.ok(true,'accepted invitation retries recover a lost response');
 perform pg_temp.ok((select user_id=pg_temp.f('worker') and email='changed@example.test' from public.workers where id=wid),'employee-number invitation links existing passport despite different display name');
 perform pg_temp.ok((select count(*)=1 from public.workers where organization_id=pg_temp.f('org')),'worker sees only own passport');
 perform pg_temp.ok((select count(*)=1 from public.qualifications where organization_id=pg_temp.f('org')),'worker sees only own training');
 perform pg_temp.ok((select count(*)=1 from public.documents where organization_id=pg_temp.f('org')),'worker can read own certificate metadata');
 perform pg_temp.ok((select count(*)=1 from public.qualification_requirements where organization_id=pg_temp.f('org')),'worker can read site training requirements');
 perform set_config('request.jwt.claim.sub',pg_temp.f('outsider')::text,true);
 begin
   perform public.accept_team_invitation(token);
   raise exception 'FAIL: accepted token allowed another account';
 exception when raise_exception then
   if SQLERRM<>'Invitation is no longer active' then raise; end if;
 end;
 perform pg_temp.ok(true,'accepted token cannot be replayed by another account with same email claim');
 perform set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.f('worker'),'email','wrong@example.test')::text,true);
 begin
   perform public.accept_team_invitation(token);
   raise exception 'FAIL: accepted token allowed changed email';
 exception when raise_exception then
   if SQLERRM<>'Invitation is no longer active' then raise; end if;
 end;
 perform pg_temp.ok(true,'accepted token still checks invited email');
end $$;
reset role;
update public.organization_memberships set active=false where organization_id=pg_temp.f('org') and user_id=pg_temp.f('worker');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.f('worker'),'email','changed@example.test')::text,true);
reset role;
-- Capture the receipt as fixture owner; worker RLS intentionally hides invitation tokens.
insert into fixture(key,id) select 'accepted_token',token from public.team_invitations where organization_id=pg_temp.f('org') and accepted_by=pg_temp.f('worker');
set local role authenticated;
do $$begin
 begin
   perform public.accept_team_invitation(pg_temp.f('accepted_token'));
   raise exception 'FAIL: retry restored revoked membership';
 exception when raise_exception then
   if SQLERRM<>'Invitation access has changed. Contact your administrator.' then raise; end if;
 end;
 perform pg_temp.ok(true,'invitation retry cannot reactivate revoked membership');
end $$;
reset role;
select pg_temp.ok((select not active from public.organization_memberships where organization_id=pg_temp.f('org') and user_id=pg_temp.f('worker')),'revoked membership remains inactive after retry');
select label from checks;
rollback;
