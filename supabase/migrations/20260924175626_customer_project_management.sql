-- Admin-only project creation/rename and company name changes in one transaction.
create function public.save_customer_project(p_org uuid,p_id uuid,p_name text,p_new boolean,p_company text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.sites%rowtype;
begin
 if auth.uid() is null or not private.has_org_role(p_org,array['administrator']) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_id is null or p_new is null or nullif(btrim(p_name,E' \t\n\r'),'') is null or length(p_name)>150
  or (p_company is not null and (nullif(btrim(p_company,E' \t\n\r'),'') is null or length(p_company)>150)) then
  raise exception 'Project and company names must contain 1 to 150 characters' using errcode='23514';
 end if;
 -- Serialize project naming within an organization, without granting elevated privileges.
 perform 1 from public.organizations where id=p_org for update;
 if not found then raise exception 'Organization unavailable' using errcode='42501';end if;
 if exists(select 1 from public.sites where organization_id=p_org and active and lower(btrim(name))=lower(btrim(p_name)) and id<>p_id) then
  raise exception 'An active project with that name already exists' using errcode='23514';
 end if;
 if p_new then
  select * into existing from public.sites where id=p_id;
  if found then
   if existing.organization_id<>p_org or existing.name<>btrim(p_name) or not existing.active then
    raise exception 'Project request already used' using errcode='23514';
   end if;
  else
   insert into public.sites(id,organization_id,name) values(p_id,p_org,btrim(p_name));
  end if;
 else
  update public.sites set name=btrim(p_name) where id=p_id and organization_id=p_org and active;
  if not found then raise exception 'Project unavailable' using errcode='42501';end if;
 end if;
 if p_company is not null then update public.organizations set name=btrim(p_company) where id=p_org;end if;
 return p_id;
end $$;
revoke all on function public.save_customer_project(uuid,uuid,text,boolean,text) from public,anon;
grant execute on function public.save_customer_project(uuid,uuid,text,boolean,text) to authenticated;
