
create table if not exists public.onboarding_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  source_file_name text not null,
  status text not null default 'staged'
    check (status in ('staged','validated','committed','documents_pending','complete','cancelled','failed')),
  worker_count integer not null default 0,
  qualification_count integer not null default 0,
  requirement_count integer not null default 0,
  document_count integer not null default 0,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  committed_at timestamptz,
  completed_at timestamptz
);

create index if not exists onboarding_batches_org_created_idx
  on public.onboarding_batches(organization_id, created_at desc);

create table if not exists public.onboarding_worker_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.onboarding_batches(id) on delete cascade,
  row_number integer not null,
  employee_number text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  job_title text not null default '',
  site_name text not null default '',
  status text not null default 'active',
  notes text,
  validation_errors text[] not null default '{}',
  validation_warnings text[] not null default '{}',
  proposed_action text not null default 'pending'
    check (proposed_action in ('pending','insert','update','skip','error')),
  unique(batch_id,row_number)
);

create index if not exists onboarding_worker_rows_batch_employee_idx
  on public.onboarding_worker_rows(batch_id, lower(employee_number));

create table if not exists public.onboarding_qualification_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.onboarding_batches(id) on delete cascade,
  row_number integer not null,
  employee_number text not null default '',
  qualification_name text not null default '',
  code text,
  category text,
  issued_on_text text,
  expires_on_text text,
  document_file_name text,
  notes text,
  validation_errors text[] not null default '{}',
  validation_warnings text[] not null default '{}',
  proposed_action text not null default 'pending'
    check (proposed_action in ('pending','insert','update','skip','error')),
  unique(batch_id,row_number)
);

create index if not exists onboarding_qualification_rows_batch_key_idx
  on public.onboarding_qualification_rows(batch_id, lower(employee_number), lower(qualification_name));

create table if not exists public.onboarding_requirement_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.onboarding_batches(id) on delete cascade,
  row_number integer not null,
  site_name text not null default '',
  job_title text not null default '',
  qualification_name text not null default '',
  aliases text[] not null default '{}',
  warning_days_text text,
  country_code text,
  jurisdiction_code text,
  regulator text,
  mining_sector text,
  mine_type text,
  requirement_source text,
  active_text text,
  validation_errors text[] not null default '{}',
  validation_warnings text[] not null default '{}',
  proposed_action text not null default 'pending'
    check (proposed_action in ('pending','insert','update','skip','error')),
  unique(batch_id,row_number)
);

create index if not exists onboarding_requirement_rows_batch_key_idx
  on public.onboarding_requirement_rows(batch_id, lower(site_name), lower(job_title), lower(qualification_name));

create table if not exists public.onboarding_document_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.onboarding_batches(id) on delete cascade,
  row_number integer not null,
  employee_number text not null default '',
  qualification_name text,
  file_name text not null default '',
  document_type text,
  issue_date_text text,
  expiry_date_text text,
  notes text,
  validation_errors text[] not null default '{}',
  validation_warnings text[] not null default '{}',
  proposed_action text not null default 'pending'
    check (proposed_action in ('pending','upload','skip','error')),
  uploaded_document_id uuid,
  uploaded_at timestamptz,
  unique(batch_id,row_number)
);

create index if not exists onboarding_document_rows_batch_file_idx
  on public.onboarding_document_rows(batch_id, lower(file_name));

create table if not exists public.onboarding_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.onboarding_batches(id) on delete cascade,
  row_kind text not null check (row_kind in ('worker','qualification','requirement','document')),
  row_number integer not null,
  action text not null,
  record_id uuid,
  message text,
  created_at timestamptz not null default now(),
  unique(batch_id,row_kind,row_number)
);

alter table public.documents
  add column if not exists qualification_id uuid references public.qualifications(id) on delete set null,
  add column if not exists onboarding_batch_id uuid references public.onboarding_batches(id) on delete set null,
  add column if not exists onboarding_row_number integer;

create index if not exists documents_qualification_id_idx
  on public.documents(qualification_id);

create unique index if not exists documents_onboarding_row_uq
  on public.documents(onboarding_batch_id,onboarding_row_number)
  where onboarding_batch_id is not null and onboarding_row_number is not null;

alter table public.onboarding_batches enable row level security;
alter table public.onboarding_worker_rows enable row level security;
alter table public.onboarding_qualification_rows enable row level security;
alter table public.onboarding_requirement_rows enable row level security;
alter table public.onboarding_document_rows enable row level security;
alter table public.onboarding_results enable row level security;

drop policy if exists onboarding_batches_manage on public.onboarding_batches;
create policy onboarding_batches_manage on public.onboarding_batches
for all to authenticated
using (private.has_org_role(organization_id,array['administrator','safety_coordinator']))
with check (
  created_by=auth.uid()
  and private.has_org_role(organization_id,array['administrator','safety_coordinator'])
);

drop policy if exists onboarding_worker_rows_manage on public.onboarding_worker_rows;
create policy onboarding_worker_rows_manage on public.onboarding_worker_rows
for all to authenticated
using (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
)
with check (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
);

drop policy if exists onboarding_qualification_rows_manage on public.onboarding_qualification_rows;
create policy onboarding_qualification_rows_manage on public.onboarding_qualification_rows
for all to authenticated
using (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
)
with check (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
);

drop policy if exists onboarding_requirement_rows_manage on public.onboarding_requirement_rows;
create policy onboarding_requirement_rows_manage on public.onboarding_requirement_rows
for all to authenticated
using (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
)
with check (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
);

drop policy if exists onboarding_document_rows_manage on public.onboarding_document_rows;
create policy onboarding_document_rows_manage on public.onboarding_document_rows
for all to authenticated
using (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
)
with check (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
);

drop policy if exists onboarding_results_manage on public.onboarding_results;
create policy onboarding_results_manage on public.onboarding_results
for all to authenticated
using (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
)
with check (
  exists (
    select 1 from public.onboarding_batches b
    where b.id=batch_id
      and private.has_org_role(b.organization_id,array['administrator','safety_coordinator'])
  )
);

grant select,insert,update,delete on public.onboarding_batches to authenticated;
grant select,insert,update,delete on public.onboarding_worker_rows to authenticated;
grant select,insert,update,delete on public.onboarding_qualification_rows to authenticated;
grant select,insert,update,delete on public.onboarding_requirement_rows to authenticated;
grant select,insert,update,delete on public.onboarding_document_rows to authenticated;
grant select,insert,update,delete on public.onboarding_results to authenticated;

create or replace function private.safe_iso_date(p_value text)
returns date
language plpgsql
immutable
set search_path=''
as $$
declare d date;
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  if btrim(p_value) !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin
    d := btrim(p_value)::date;
  exception when others then
    return null;
  end;
  if to_char(d,'YYYY-MM-DD')<>btrim(p_value) then return null; end if;
  return d;
end;
$$;
