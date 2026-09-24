alter table public.workers add column if not exists user_id uuid null references auth.users(id) on delete set null;

create unique index if not exists workers_user_id_unique on public.workers(user_id) where user_id is not null;
create index if not exists workers_org_user_idx on public.workers(organization_id,user_id);

create or replace function private.is_self_worker(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workers w
    where w.id = p_worker_id and w.user_id = auth.uid()
  );
$$;

revoke all on function private.is_self_worker(uuid) from public;
grant execute on function private.is_self_worker(uuid) to authenticated;
