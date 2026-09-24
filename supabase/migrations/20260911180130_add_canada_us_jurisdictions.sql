create table if not exists public.jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  code text not null,
  name text not null,
  jurisdiction_type text not null,
  active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  unique(country_code, code)
);

alter table public.jurisdictions enable row level security;

drop policy if exists jurisdictions_read_authenticated on public.jurisdictions;
create policy jurisdictions_read_authenticated
on public.jurisdictions
for select
to authenticated
using (active = true);

insert into public.jurisdictions (country_code,country_name,code,name,jurisdiction_type,sort_order) values
('CA','Canada','AB','Alberta','province',10),
('CA','Canada','BC','British Columbia','province',20),
('CA','Canada','MB','Manitoba','province',30),
('CA','Canada','NB','New Brunswick','province',40),
('CA','Canada','NL','Newfoundland and Labrador','province',50),
('CA','Canada','NS','Nova Scotia','province',60),
('CA','Canada','ON','Ontario','province',70),
('CA','Canada','PE','Prince Edward Island','province',80),
('CA','Canada','QC','Quebec','province',90),
('CA','Canada','SK','Saskatchewan','province',100),
('CA','Canada','NT','Northwest Territories','territory',110),
('CA','Canada','NU','Nunavut','territory',120),
('CA','Canada','YT','Yukon','territory',130),
('US','United States','AL','Alabama','state',210),
('US','United States','AK','Alaska','state',220),
('US','United States','AZ','Arizona','state',230),
('US','United States','AR','Arkansas','state',240),
('US','United States','CA','California','state',250),
('US','United States','CO','Colorado','state',260),
('US','United States','CT','Connecticut','state',270),
('US','United States','DE','Delaware','state',280),
('US','United States','FL','Florida','state',290),
('US','United States','GA','Georgia','state',300),
('US','United States','HI','Hawaii','state',310),
('US','United States','ID','Idaho','state',320),
('US','United States','IL','Illinois','state',330),
('US','United States','IN','Indiana','state',340),
('US','United States','IA','Iowa','state',350),
('US','United States','KS','Kansas','state',360),
('US','United States','KY','Kentucky','state',370),
('US','United States','LA','Louisiana','state',380),
('US','United States','ME','Maine','state',390),
('US','United States','MD','Maryland','state',400),
('US','United States','MA','Massachusetts','state',410),
('US','United States','MI','Michigan','state',420),
('US','United States','MN','Minnesota','state',430),
('US','United States','MS','Mississippi','state',440),
('US','United States','MO','Missouri','state',450),
('US','United States','MT','Montana','state',460),
('US','United States','NE','Nebraska','state',470),
('US','United States','NV','Nevada','state',480),
('US','United States','NH','New Hampshire','state',490),
('US','United States','NJ','New Jersey','state',500),
('US','United States','NM','New Mexico','state',510),
('US','United States','NY','New York','state',520),
('US','United States','NC','North Carolina','state',530),
('US','United States','ND','North Dakota','state',540),
('US','United States','OH','Ohio','state',550),
('US','United States','OK','Oklahoma','state',560),
('US','United States','OR','Oregon','state',570),
('US','United States','PA','Pennsylvania','state',580),
('US','United States','RI','Rhode Island','state',590),
('US','United States','SC','South Carolina','state',600),
('US','United States','SD','South Dakota','state',610),
('US','United States','TN','Tennessee','state',620),
('US','United States','TX','Texas','state',630),
('US','United States','UT','Utah','state',640),
('US','United States','VT','Vermont','state',650),
('US','United States','VA','Virginia','state',660),
('US','United States','WA','Washington','state',670),
('US','United States','WV','West Virginia','state',680),
('US','United States','WI','Wisconsin','state',690),
('US','United States','WY','Wyoming','state',700),
('US','United States','DC','District of Columbia','district',710)
on conflict (country_code, code) do update set
  country_name = excluded.country_name,
  name = excluded.name,
  jurisdiction_type = excluded.jurisdiction_type,
  sort_order = excluded.sort_order,
  active = true;

create index if not exists jurisdictions_country_type_idx on public.jurisdictions(country_code, jurisdiction_type, sort_order);
