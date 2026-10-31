-- Website favorites are private to the signed-in Supabase user.
-- GitHub is the identity provider; this table does not change GitHub Stars.
begin;

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  repo_id bigint not null,
  repository jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint favorites_pkey primary key (user_id, repo_id),
  constraint favorites_positive_repo_id check (repo_id > 0),
  constraint favorites_repository_object check (pg_catalog.jsonb_typeof(repository) = 'object'),
  constraint favorites_repository_size check (pg_catalog.octet_length(repository::text) <= 32768)
);

create index favorites_user_updated_idx
  on public.favorites (user_id, updated_at, repo_id);

-- The client may send updated_at, but cannot choose its persisted value.
-- This runs with the caller's privileges and cannot bypass row-level security.
create function public.set_favorites_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_favorites_updated_at() from public, anon, authenticated;

create trigger favorites_set_updated_at
  before insert or update on public.favorites
  for each row execute function public.set_favorites_updated_at();

alter table public.favorites enable row level security;

revoke all on table public.favorites from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.favorites to authenticated;

create policy favorites_select_own on public.favorites
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy favorites_update_own on public.favorites
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.favorites is
  'Private website favorites. deleted=true is a synchronization tombstone, not a visible favorite.';
comment on column public.favorites.repository is
  'Public repository display snapshot, limited to a JSON object of at most 32768 UTF-8 bytes.';
comment on column public.favorites.updated_at is
  'Server-assigned time on every INSERT or UPDATE; client timestamps are overwritten.';

commit;
