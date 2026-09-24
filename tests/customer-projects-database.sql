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

insert into public.safety_records(id,organization_id,site_id,created_by,record_type,title,status)
values(pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('worker'),'incident','Test report','submitted');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('administrator')::text,true);
select public.save_customer_project(pg_temp.f('org'),pg_temp.f('site'),'Customer A — East & West',false,'Customer A');
select pg_temp.ok((select name='Customer A — East & West' from public.sites where id=pg_temp.f('site')),'custom project name persisted');
select pg_temp.ok((select name='Customer A' from public.organizations where id=pg_temp.f('org')),'company name persisted');
select pg_temp.ok((select site_id=pg_temp.f('site') from public.safety_records where id=pg_temp.f('record')),'rename preserves report project identity');
select public.save_customer_project(pg_temp.f('org'),pg_temp.f('pass'),'Underground Project',true);
select public.save_customer_project(pg_temp.f('org'),pg_temp.f('pass'),'Underground Project',true);
select pg_temp.ok((select count(*)=1 from public.sites where id=pg_temp.f('pass')),'creation retry has one project');
select pg_temp.blocked(format('select public.save_customer_project(%L,gen_random_uuid(),'' underground project '',true)',pg_temp.f('org')),'duplicate active name rejected');
select pg_temp.blocked(format('select public.save_customer_project(%L,%L,'' '',false)',pg_temp.f('org'),pg_temp.f('site')),'blank project rejected');
select pg_temp.blocked(format('select public.save_customer_project(%L,%L,''Changed'',false)',pg_temp.f('org'),pg_temp.f('foreign_site')),'foreign project cannot be renamed');
do $$declare member text;begin
 foreach member in array array['worker','supervisor','safety_coordinator','client_viewer','outsider'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.f(member)::text,true);
  perform pg_temp.blocked(format('select public.save_customer_project(%L,gen_random_uuid(),''No permission'',true)',pg_temp.f('org')),member||' cannot manage customer projects');
 end loop;
end $$;
reset role;
select pg_temp.ok(not has_function_privilege('anon','public.save_customer_project(uuid,uuid,text,boolean,text)','execute'),'anonymous execution denied');
select count(*) as passed,jsonb_agg(label) as checks from checks;
rollback;

