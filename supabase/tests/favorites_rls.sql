-- Run against a local Supabase database with: supabase test db
-- All fixtures and mutations are rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

select has_table('public', 'favorites', 'favorites table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.favorites'::regclass),
  'row-level security is enabled');
select ok(not has_table_privilege('anon', 'public.favorites', 'SELECT'),
  'anonymous role has no SELECT grant');
select ok(not has_table_privilege('anon', 'public.favorites', 'INSERT'),
  'anonymous role has no INSERT grant');
select ok(not has_table_privilege('anon', 'public.favorites', 'UPDATE'),
  'anonymous role has no UPDATE grant');
select ok(not has_table_privilege('anon', 'public.favorites', 'DELETE'),
  'anonymous role has no DELETE grant');
select ok(not (select prosecdef from pg_proc where oid = 'public.set_favorites_updated_at()'::regprocedure),
  'timestamp trigger is not SECURITY DEFINER');
select ok((select proconfig @> array['search_path=""'] from pg_proc
  where oid = 'public.set_favorites_updated_at()'::regprocedure),
  'timestamp trigger fixes its search_path');
select ok((select rolbypassrls from pg_roles where rolname = 'service_role'),
  'service_role bypasses RLS and must never be used as a browser key');

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'favorites-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'favorites-b@example.invalid');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
set local "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.favorites (user_id, repo_id, repository, updated_at)
  values ('11111111-1111-4111-8111-111111111111', 101, '{"full_name":"owner/one"}', '2000-01-01')$$,
  'user A can insert their own favorite');
select is((select count(*) from public.favorites), 1::bigint, 'user A can read their favorite');
select ok((select updated_at > '2000-01-02'::timestamptz from public.favorites where repo_id = 101),
  'INSERT ignores a forged client timestamp');
select throws_ok($$insert into public.favorites (user_id, repo_id)
  values ('22222222-2222-4222-8222-222222222222', 202)$$,
  '42501', null, 'user A cannot insert for user B');
select throws_ok($$insert into public.favorites (user_id, repo_id)
  values ('11111111-1111-4111-8111-111111111111', 0)$$,
  '23514', null, 'repository identifiers must be positive');
select throws_ok($$insert into public.favorites (user_id, repo_id, repository)
  values ('11111111-1111-4111-8111-111111111111', 102, '[]')$$,
  '23514', null, 'repository snapshot must be an object');
select throws_ok($$insert into public.favorites (user_id, repo_id, repository)
  values ('11111111-1111-4111-8111-111111111111', 102, jsonb_build_object('text', repeat('x', 32768)))$$,
  '23514', null, 'oversized repository snapshots are rejected');
select throws_ok($$update public.favorites
  set user_id = '22222222-2222-4222-8222-222222222222' where repo_id = 101$$,
  '42501', null, 'user A cannot transfer a favorite to user B');
select lives_ok($$update public.favorites set deleted = true, repository = '{}', updated_at = '2100-01-01'
  where repo_id = 101$$, 'user A can write a deletion tombstone');
select is((select deleted from public.favorites where repo_id = 101), true,
  'own deletion tombstone remains queryable for synchronization');
select ok((select updated_at < '2100-01-01'::timestamptz from public.favorites where repo_id = 101),
  'UPDATE ignores a forged client timestamp');

set local "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
set local "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*) from public.favorites), 0::bigint,
  'user B cannot read user A favorites or tombstones');
select lives_ok($$insert into public.favorites (user_id, repo_id, repository)
  values ('22222222-2222-4222-8222-222222222222', 101, '{"full_name":"owner/one"}')$$,
  'different users can independently favorite the same repository');
select is((select count(*) from public.favorites), 1::bigint, 'user B reads only their own row');
with changed as (update public.favorites set deleted = false
  where user_id = '11111111-1111-4111-8111-111111111111' returning *)
  select is(count(*), 0::bigint, 'user B cannot update user A row') from changed;
with removed as (delete from public.favorites
  where user_id = '11111111-1111-4111-8111-111111111111' returning *)
  select is(count(*), 0::bigint, 'user B cannot delete user A row') from removed;
with removed as (delete from public.favorites where repo_id = 101 returning *)
  select is(count(*), 1::bigint, 'user B can delete their own row') from removed;

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$select * from public.favorites$$, '42501', null, 'anonymous SELECT is rejected');
select throws_ok($$insert into public.favorites (user_id, repo_id)
  values ('11111111-1111-4111-8111-111111111111', 303)$$,
  '42501', null, 'anonymous INSERT is rejected');
select throws_ok($$update public.favorites set deleted = true$$,
  '42501', null, 'anonymous UPDATE is rejected');
select throws_ok($$delete from public.favorites$$, '42501', null, 'anonymous DELETE is rejected');

reset role;
select is((select count(*) from public.favorites
  where user_id = '11111111-1111-4111-8111-111111111111' and deleted),
  1::bigint, 'other users and anonymous requests did not remove the tombstone');

select * from finish();
rollback;
