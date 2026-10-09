-- ============================================================================
-- LOCAL-ONLY table privileges.
--
-- Supabase grants table privileges to `authenticated` out of the box; a plain
-- PostgreSQL instance does not. Without these grants the RLS test would fail
-- with "permission denied" before the policy is ever evaluated, which would
-- prove nothing.
--
-- Run AFTER the migrations (the tables must exist).
-- NEVER apply to a real Supabase project.
-- ============================================================================

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
