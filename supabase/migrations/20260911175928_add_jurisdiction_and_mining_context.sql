alter table public.sites add column if not exists country_code text not null default 'CA', add column if not exists jurisdiction_code text, add column if not exists regulator text, add column if not exists industry text not null default 'mining', add column if not exists mining_sector text, add column if not exists mine_type text;

update public.sites set country_code='CA', jurisdiction_code='ON', regulator='Ontario', industry='mining', mining_sector='hard_rock', mine_type='underground' where name='Timmins Project';

alter table public.qualification_requirements add column if not exists country_code text, add column if not exists jurisdiction_code text, add column if not exists regulator text, add column if not exists mining_sector text, add column if not exists mine_type text, add column if not exists requirement_source text, add column if not exists warning_days integer not null default 30;

update public.qualification_requirements qr set country_code=s.country_code, jurisdiction_code=s.jurisdiction_code, regulator=s.regulator, mining_sector=s.mining_sector, mine_type=s.mine_type, requirement_source=coalesce(qr.requirement_source,'site') from public.sites s where qr.site_id=s.id;

create index if not exists qualification_requirements_context_idx on public.qualification_requirements(country_code,jurisdiction_code,regulator,mining_sector,mine_type,job_title) where active=true;
