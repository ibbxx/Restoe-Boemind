-- ============================================================================
-- LOCAL-ONLY stand-in for Supabase's `auth` schema.
--
-- Supabase provides `auth.users` and `auth.uid()`. A plain PostgreSQL instance
-- does not, so the migrations cannot run there without this shim.
--
-- THIS FILE MUST NEVER BE APPLIED TO A REAL SUPABASE PROJECT.
-- It exists so the RLS policies can be exercised against real SQL with real
-- roles instead of being claimed "validated" without evidence.
--
-- Impersonation works through a GUC:
--     set_config('test.uid', '<uuid>', false);
-- which `auth.uid()` reads. Supabase's own `auth.uid()` reads the JWT instead.
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- The role Supabase uses for signed-in requests.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
