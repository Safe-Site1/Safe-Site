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
values(pg_temp.f('record'),pg_temp.f('org'),pg_temp.f('site'),pg_temp.f('worker'),'inspection','PILOT PHOTO TEST','submitted');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
insert into storage.objects(bucket_id,name,owner_id) values('record-photos',pg_temp.f('org')||'/'||pg_temp.f('record')||'/'||repeat('a',64)||'.png',auth.uid()::text);
select pg_temp.ok((select count(*)=1 from storage.objects where bucket_id='record-photos' and name like pg_temp.f('org')||'/%'),'worker reads own evidence');
select pg_temp.blocked(format('insert into storage.objects(bucket_id,name,owner_id) values(''record-photos'',%L,%L)',pg_temp.f('org')||'/'||gen_random_uuid()||'/'||repeat('b',64)||'.png',auth.uid()),'cannot upload without existing record');
select pg_temp.blocked(format('insert into storage.objects(bucket_id,name,owner_id) values(''record-photos'',%L,%L)',pg_temp.f('org')||'/'||pg_temp.f('record')||'/bad.svg',auth.uid()),'invalid photo path blocked');
with changed as(update storage.objects set name=name||'x' where bucket_id='record-photos' returning id)
select pg_temp.ok((select count(*)=0 from changed),'evidence cannot be overwritten');
select set_config('request.jwt.claim.sub',pg_temp.f('other_worker')::text,true);
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id='record-photos' and name like pg_temp.f('org')||'/%'),'worker cannot read another worker evidence');
select pg_temp.blocked(format('insert into storage.objects(bucket_id,name,owner_id) values(''record-photos'',%L,%L)',pg_temp.f('org')||'/'||pg_temp.f('record')||'/'||repeat('b',64)||'.png',auth.uid()),'worker cannot attach to another worker report');
select set_config('request.jwt.claim.sub',pg_temp.f('client_viewer')::text,true);
select pg_temp.ok(exists(select 1 from storage.objects where bucket_id='record-photos' and name like pg_temp.f('org')||'/%'),'client viewer reads evidence');
select pg_temp.blocked(format('insert into storage.objects(bucket_id,name,owner_id) values(''record-photos'',%L,%L)',pg_temp.f('org')||'/'||pg_temp.f('record')||'/'||repeat('c',64)||'.png',auth.uid()),'client viewer cannot upload');
do $$declare staff text;i integer:=0;begin
 foreach staff in array array['supervisor','administrator','safety_coordinator'] loop
  i:=i+1;perform set_config('request.jwt.claim.sub',pg_temp.f(staff)::text,true);
  insert into storage.objects(bucket_id,name,owner_id) values('record-photos',pg_temp.f('org')||'/'||pg_temp.f('record')||'/'||repeat(i::text,64)||'.jpg',auth.uid()::text);
  perform pg_temp.ok(exists(select 1 from storage.objects where name=pg_temp.f('org')||'/'||pg_temp.f('record')||'/'||repeat(i::text,64)||'.jpg'),staff||' uploads and reads evidence');
 end loop;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.f('outsider')::text,true);
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id='record-photos' and name like pg_temp.f('org')||'/%'),'foreign staff cannot read');
select pg_temp.blocked(format('insert into storage.objects(bucket_id,name,owner_id) values(''record-photos'',%L,%L)',pg_temp.f('org')||'/'||pg_temp.f('record')||'/'||repeat('f',64)||'.png',auth.uid()),'foreign staff cannot upload');
reset role;
update public.organization_memberships set active=false where user_id=pg_temp.f('worker');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f('worker')::text,true);
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id='record-photos' and name like pg_temp.f('org')||'/%'),'inactive owner cannot read evidence');
reset role;
grant select on fixture to anon;
grant select,insert on checks to anon;
set local role anon;
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id='record-photos' and name like pg_temp.f('org')||'/%'),'anonymous read denied');
reset role;
select pg_temp.ok((select not public and file_size_limit=10485760 and allowed_mime_types=array['image/jpeg','image/png','image/webp'] from storage.buckets where id='record-photos'),'private bucket and limits configured');
select count(*) as passed,jsonb_agg(label) as checks from checks;
rollback;

