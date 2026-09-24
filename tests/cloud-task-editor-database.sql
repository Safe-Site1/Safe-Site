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

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('administrator')::text,true);
select public.save_cloud_task(pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site'),'Pilot task','Other',array['Original hazard'],array['Original control'],0);
select public.save_cloud_task(pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site'),'Pilot task','Other',array['Original hazard'],array['Original control'],0);
select pg_temp.ok((select count(*)=1 from public.task_templates where id=pg_temp.f('record')),'new task retry is idempotent');
select set_config('request.jwt.claim.sub',pg_temp.f('safety_coordinator')::text,true);
select public.save_cloud_task(pg_temp.f('pass'),pg_temp.f('org'),pg_temp.f('site'),'Updated task','Other',array['New hazard'],array['New control'],1,pg_temp.f('record'));
select public.save_cloud_task(pg_temp.f('pass'),pg_temp.f('org'),pg_temp.f('site'),'Updated task','Other',array['New hazard'],array['New control'],1,pg_temp.f('record'));
select pg_temp.ok((select version=2 and active from public.task_templates where id=pg_temp.f('pass')),'new version active');
select pg_temp.ok((select not active and version=1 from public.task_templates where id=pg_temp.f('record')),'old version preserved and retired');
select pg_temp.ok((select hazard='Original hazard' from public.task_template_hazards where task_template_id=pg_temp.f('record')),'prior hazards preserved');
select pg_temp.ok((select control='Original control' from public.task_template_controls where task_template_id=pg_temp.f('record')),'prior controls preserved');
select pg_temp.blocked(format('select public.save_cloud_task(gen_random_uuid(),%L,%L,''Stale'',''Other'',array[''Hazard''],array[''Control''],1,%L)',pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('record')),'stale update rejected');
select pg_temp.blocked(format('select public.save_cloud_task(gen_random_uuid(),%L,%L,''Bad'',''Other'',array[]::text[],array[''Control''],0)',pg_temp.f('org'),pg_temp.f('site')),'empty hazards rejected');
select pg_temp.blocked(format('select public.save_cloud_task(gen_random_uuid(),%L,%L,''Bad'',''Other'',array[''Hazard''],array[''Control''],0)',pg_temp.f('org'),pg_temp.f('foreign_site')),'foreign project rejected');
do $$declare member text;begin
 foreach member in array array['worker','supervisor','client_viewer','outsider'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.f(member)::text,true);
  perform pg_temp.blocked(format('select public.save_cloud_task(gen_random_uuid(),%L,%L,''Bad'',''Other'',array[''Hazard''],array[''Control''],0)',pg_temp.f('org'),pg_temp.f('site')),member||' cannot edit templates');
 end loop;
end $$;
reset role;
select count(*) as passed,jsonb_agg(label) as checks from checks;
rollback;

