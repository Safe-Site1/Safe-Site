create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('administrator','supervisor','safety_coordinator','worker','client_viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.site_memberships (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, user_id)
);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  job_title text,
  status text not null default 'active' check (status in ('active','inactive','on_leave')),
  ready_for_work boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_number)
);

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  name text not null,
  code text,
  category text,
  issued_on date,
  expires_on date,
  status text not null default 'valid' check (status in ('valid','expiring','expired','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  name text not null,
  category text,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_id, name, version)
);

create table public.task_template_hazards (
  id uuid primary key default gen_random_uuid(),
  task_template_id uuid not null references public.task_templates(id) on delete cascade,
  hazard text not null,
  sort_order integer not null default 0
);

create table public.task_template_controls (
  id uuid primary key default gen_random_uuid(),
  task_template_id uuid not null references public.task_templates(id) on delete cascade,
  control text not null,
  sort_order integer not null default 0
);

create table public.safety_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  record_type text not null check (record_type in ('pre_shift','flra','pre_task_risk_assessment','inspection','incident','near_miss')),
  title text,
  work_area text,
  task_name text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('draft','submitted','reviewed','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  safety_record_id uuid references public.safety_records(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','closed','cancelled')),
  due_date date,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete cascade,
  safety_record_id uuid references public.safety_records(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated by default as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = any(allowed_roles)
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.sites enable row level security;
alter table public.site_memberships enable row level security;
alter table public.workers enable row level security;
alter table public.qualifications enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_template_hazards enable row level security;
alter table public.task_template_controls enable row level security;
alter table public.safety_records enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_self" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "org_select_member" on public.organizations for select using (public.is_org_member(id));
create policy "org_update_admin" on public.organizations for update using (public.has_org_role(id, array['administrator'])) with check (public.has_org_role(id, array['administrator']));

create policy "memberships_select_member" on public.organization_memberships for select using (public.is_org_member(organization_id));
create policy "memberships_manage_admin" on public.organization_memberships for all using (public.has_org_role(organization_id, array['administrator'])) with check (public.has_org_role(organization_id, array['administrator']));

create policy "sites_select_member" on public.sites for select using (public.is_org_member(organization_id));
create policy "sites_manage_leads" on public.sites for all using (public.has_org_role(organization_id, array['administrator','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','safety_coordinator']));

create policy "site_memberships_select_self_or_admin" on public.site_memberships for select using (user_id = auth.uid() or exists (select 1 from public.sites s where s.id = site_id and public.has_org_role(s.organization_id, array['administrator','safety_coordinator'])));
create policy "site_memberships_manage_admin" on public.site_memberships for all using (exists (select 1 from public.sites s where s.id = site_id and public.has_org_role(s.organization_id, array['administrator','safety_coordinator']))) with check (exists (select 1 from public.sites s where s.id = site_id and public.has_org_role(s.organization_id, array['administrator','safety_coordinator'])));

create policy "workers_select_member" on public.workers for select using (public.is_org_member(organization_id));
create policy "workers_manage_staff" on public.workers for all using (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator']));

create policy "qualifications_select_member" on public.qualifications for select using (public.is_org_member(organization_id));
create policy "qualifications_manage_staff" on public.qualifications for all using (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator']));

create policy "task_templates_select_member" on public.task_templates for select using (public.is_org_member(organization_id));
create policy "task_templates_manage_staff" on public.task_templates for all using (public.has_org_role(organization_id, array['administrator','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','safety_coordinator']));
create policy "task_hazards_select_member" on public.task_template_hazards for select using (exists (select 1 from public.task_templates t where t.id = task_template_id and public.is_org_member(t.organization_id)));
create policy "task_hazards_manage_staff" on public.task_template_hazards for all using (exists (select 1 from public.task_templates t where t.id = task_template_id and public.has_org_role(t.organization_id, array['administrator','safety_coordinator']))) with check (exists (select 1 from public.task_templates t where t.id = task_template_id and public.has_org_role(t.organization_id, array['administrator','safety_coordinator'])));
create policy "task_controls_select_member" on public.task_template_controls for select using (exists (select 1 from public.task_templates t where t.id = task_template_id and public.is_org_member(t.organization_id)));
create policy "task_controls_manage_staff" on public.task_template_controls for all using (exists (select 1 from public.task_templates t where t.id = task_template_id and public.has_org_role(t.organization_id, array['administrator','safety_coordinator']))) with check (exists (select 1 from public.task_templates t where t.id = task_template_id and public.has_org_role(t.organization_id, array['administrator','safety_coordinator'])));

create policy "safety_records_select_member" on public.safety_records for select using (public.is_org_member(organization_id));
create policy "safety_records_insert_member" on public.safety_records for insert with check (public.is_org_member(organization_id));
create policy "safety_records_update_staff" on public.safety_records for update using (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator']));

create policy "actions_select_member" on public.corrective_actions for select using (public.is_org_member(organization_id));
create policy "actions_manage_staff" on public.corrective_actions for all using (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator']));

create policy "documents_select_member" on public.documents for select using (public.is_org_member(organization_id));
create policy "documents_manage_staff" on public.documents for all using (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator'])) with check (public.has_org_role(organization_id, array['administrator','supervisor','safety_coordinator']));

create policy "audit_select_admin" on public.audit_log for select using (public.has_org_role(organization_id, array['administrator','safety_coordinator']));
create policy "audit_insert_member" on public.audit_log for insert with check (organization_id is null or public.is_org_member(organization_id));

create index workers_org_site_idx on public.workers(organization_id, site_id);
create index qualifications_worker_idx on public.qualifications(worker_id);
create index qualifications_expiry_idx on public.qualifications(expires_on);
create index safety_records_org_site_idx on public.safety_records(organization_id, site_id, created_at desc);
create index corrective_actions_org_status_idx on public.corrective_actions(organization_id, status);
create index task_templates_org_site_idx on public.task_templates(organization_id, site_id);
