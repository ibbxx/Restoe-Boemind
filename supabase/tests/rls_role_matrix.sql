-- ============================================================================
-- RLS + PROTECTION ROLE MATRIX (Phase 2.5 §11)
--
-- Runs against a LOCAL PostgreSQL with the auth stub applied. Every row of the
-- output is the RESULT OF AN ACTUAL SQL STATEMENT, not a claim.
--
--   ADMIN        : full control
--   PROCUREMENT  : full write on projects they can access
--   PIC          : member of ONE project with EDIT on it only
--   VIEWER       : read-only
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_role_matrix.sql
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- fixtures
create table if not exists _rls_results (
  seq      serial,
  role     text,
  operation text,
  expected text,
  actual   text,
  ok       boolean,
  note     text
);

truncate _rls_results;

-- Deterministic ids so the script is re-runnable.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@test.local'),
  ('00000000-0000-0000-0000-000000000a02', 'proc@test.local'),
  ('00000000-0000-0000-0000-000000000a03', 'pic@test.local'),
  ('00000000-0000-0000-0000-000000000a04', 'viewer@test.local')
on conflict (id) do nothing;

insert into profiles (id, email, full_name, role) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@test.local',  'Admin',       'ADMIN'),
  ('00000000-0000-0000-0000-000000000a02', 'proc@test.local',   'Procurement', 'PROCUREMENT'),
  ('00000000-0000-0000-0000-000000000a03', 'pic@test.local',    'PIC',         'PIC'),
  ('00000000-0000-0000-0000-000000000a04', 'viewer@test.local', 'Viewer',      'VIEWER')
on conflict (id) do update set role = excluded.role, email = excluded.email;

-- deterministic cleanup so the script can be re-run
-- (still superuser here: RLS does not apply yet)
delete from projects where code in ('PRJ-ADM', 'PRJ-PRC', 'PRJ-PIC', 'PRJ-VWR');

insert into projects (id, code, name) values
  ('00000000-0000-0000-0000-00000000e001', 'PRJ-OWN', 'Project Milik PIC'),
  ('00000000-0000-0000-0000-00000000e002', 'PRJ-OTH', 'Project Lain')
on conflict (code) do nothing;

insert into project_members (project_id, profile_id, access_level)
select p.id, '00000000-0000-0000-0000-000000000a03', 'EDIT'
from projects p where p.code = 'PRJ-OWN'
on conflict do nothing;

insert into vendors (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Vendor Uji')
on conflict (name) do nothing;

-- NOTE: no synthetic template row is inserted here on purpose. The harness
-- uses a REAL seeded template so that it cannot add a row which later looks
-- like seed data (`select count(*) from calculation_templates` would otherwise
-- read 6 instead of the real 5).
do $$
begin
  if not exists (select 1 from calculation_templates
                  where template_id = 'T_A_AHS_STANDARD') then
    raise exception 'Template seed belum dijalankan: T_A_AHS_STANDARD tidak ada. '
                    'Jalankan supabase/seed/*.sql sebelum matrix ini.';
  end if;
end $$;

-- ============================================================================
-- harness
-- ============================================================================
-- NOTE: `_rls_try` is SECURITY INVOKER on purpose. If it were SECURITY
-- DEFINER the dynamic SQL would run as the table owner and RLS would be
-- bypassed — every test would pass for the wrong reason.
create or replace function _rls_try(
  p_role text, p_op text, p_expected text, p_sql text, p_note text default null,
  p_engine boolean default false
) returns void language plpgsql as $$
declare
  actual text;
  n      bigint;
  blocked boolean := false;
  ok     boolean;
begin
  -- p_engine: the SQL under test must run with the calculation-engine GUC set.
  -- It is set here (and cleared afterwards, in this block only) so that the
  -- UPDATE under test is the LAST statement — see the note on ROW_COUNT below.
  if p_engine then
    perform set_config('app.calculation_engine', 'on', true);
  end if;
  begin
    execute p_sql;
    -- GET DIAGNOSTICS reports the ROW_COUNT of the MOST RECENT statement. A
    -- multi-statement string whose final statement is `set local ... = 'off'`
    -- therefore reports 0 rows even when the UPDATE affected a row. Never put
    -- bookkeeping statements after the statement under test.
    get diagnostics n = row_count;
  exception when others then
    blocked := true;
    n := 0;
    p_note := coalesce(p_note, '') || '[' || sqlstate || ': ' || left(sqlerrm, 120) || '] ';
  end;
  if p_engine then
    perform set_config('app.calculation_engine', 'off', true);
  end if;
  -- A policy that denies an UPDATE/DELETE does NOT raise: it silently affects
  -- 0 rows. So "ALLOWED" requires an actual EFFECT (>=1 row), not merely the
  -- absence of an exception — otherwise every denial would look like a pass.
  actual := case
              when blocked then 'DENIED'
              when n > 0    then 'ALLOWED'
              else 'DENIED (0 rows)'
            end;
  -- Both DENIED spellings are a denial: a raised exception (42501/23514, ...)
  -- and a silent row-filter by a USING clause. They are NOT interchangeable
  -- with ALLOWED — this only stops the verdict from depending on WHICH way
  -- PostgreSQL chose to refuse.
  ok := case
          when p_expected = actual                       then true
          when p_expected = 'DENIED' and actual = 'DENIED (0 rows)' then true
          else false
        end;
  insert into _rls_results (role, operation, expected, actual, ok, note)
  values (p_role, p_op, p_expected, actual, ok, p_note);
end $$;

-- the impersonated role must be able to record its own result
-- (but has no privilege to change the expectation)
grant insert, select on _rls_results to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function _rls_try(text, text, text, text, text, boolean) to authenticated;

-- ============================================================================
-- ADMIN
-- ============================================================================
select set_config('test.uid', '00000000-0000-0000-0000-000000000a01', false);
set role authenticated;

do $$
begin
  perform _rls_try('ADMIN', 'SELECT projects (semua)   ', 'ALLOWED',
    'select 1 from projects');
  perform _rls_try('ADMIN', 'INSERT project            ', 'ALLOWED',
    'insert into projects (code, name) values (''PRJ-ADM'',''Admin Project'')');
  perform _rls_try('ADMIN', 'UPDATE project            ', 'ALLOWED',
    'update projects set notes = ''ok'' where code = ''PRJ-ADM''');
  perform _rls_try('ADMIN', 'DELETE project            ', 'ALLOWED',
    'delete from projects where code = ''PRJ-ADM''');
  perform _rls_try('ADMIN', 'INSERT vendor             ', 'ALLOWED',
    'insert into vendors (name) values (''Vendor Admin'')');
  perform _rls_try('ADMIN', 'INSERT formula_registry   ', 'ALLOWED',
    'insert into formula_registry (formula_id, formula_name, expression, excel_formula, source_sheet, source_cell, source_block) values (''F999'',''Probe'',''a+b'',''=A1+B1'',''X'',''A1'',''probe'')');
  perform _rls_try('ADMIN', 'DELETE formula_registry   ', 'ALLOWED',
    'delete from formula_registry where formula_id = ''F999''');
  perform _rls_try('ADMIN', 'INSERT project_history    ', 'ALLOWED',
    'insert into project_history (project_id, entity, action) select id, ''probe'', ''INSERT'' from projects where code = ''PRJ-OWN''');
end $$;

-- ============================================================================
-- PROCUREMENT
-- ============================================================================
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-000000000a02', false);
set role authenticated;

do $$
declare v_scen uuid; v_ahs uuid;
begin
  perform _rls_try('PROCUREMENT', 'SELECT projects (semua)   ', 'ALLOWED',
    'select 1 from projects');
  perform _rls_try('PROCUREMENT', 'INSERT project            ', 'ALLOWED',
    'insert into projects (code, name) values (''PRJ-PRC'',''Proc Project'')');
  perform _rls_try('PROCUREMENT', 'INSERT vendor_prices      ', 'ALLOWED',
    'insert into vendor_prices (project_id, vendor_id, base_price) select p.id, v.id, 15000 from projects p, vendors v where p.code = ''PRJ-PRC'' and v.name = ''Vendor Uji''');
  perform _rls_try('PROCUREMENT', 'INSERT price_scenarios    ', 'ALLOWED',
    'insert into price_scenarios (project_id, name, template_id) select id, ''V1'', ''T_A_AHS_STANDARD'' from projects where code = ''PRJ-PRC''');
  perform _rls_try('PROCUREMENT', 'INSERT ahs                ', 'ALLOWED',
    'insert into ahs (project_id, template_id, volume, harga_jual_include) select id, ''T_A_AHS_STANDARD'', 1000, 20000 from projects where code = ''PRJ-PRC''');
  perform _rls_try('PROCUREMENT', 'INSERT project_sheets     ', 'ALLOWED',
    'insert into project_sheets (project_id, doc) select id, ''{"version":3,"sheets":[],"workbookFormulas":{}}''::jsonb from projects where code = ''PRJ-PRC''');
  perform _rls_try('PROCUREMENT', 'INSERT formula_registry   ', 'DENIED',
    'insert into formula_registry (formula_id, formula_name, expression, excel_formula, source_sheet, source_cell, source_block) values (''F998'',''Probe'',''a+b'',''=A1+B1'',''X'',''A1'',''probe'')');
  perform _rls_try('PROCUREMENT', 'DELETE project            ', 'DENIED',
    'delete from projects where code = ''PRJ-PRC''');
  -- calculated field guard
  perform _rls_try('PROCUREMENT', 'UPDATE ahs calculated col ', 'DENIED',
    'update ahs set revenue = 1 where harga_jual_include = 20000');
  perform _rls_try('PROCUREMENT', 'UPDATE ahs NON-calc col   ', 'ALLOWED',
    'update ahs set notes = ''edit input'' where harga_jual_include = 20000');
  perform _rls_try('PROCUREMENT', 'UPDATE ahs AS ENGINE      ', 'ALLOWED',
    'update ahs set revenue = 1000000 where harga_jual_include = 20000',
    null, true);
  -- independent confirmation that the engine write actually PERSISTED
  perform _rls_try('PROCUREMENT', 'ENGINE value persisted    ', 'ALLOWED',
    'select 1 from ahs where revenue = 1000000 and harga_jual_include = 20000');

  -- scenario immutability chain
  select id into v_scen from price_scenarios where name = 'V1' limit 1;
  perform _rls_try('PROCUREMENT', 'INSERT scenario_inputs    ', 'ALLOWED',
    format('insert into scenario_inputs (scenario_id, field_key, value_num) values (%L, ''volume'', 1000)', v_scen));
  perform _rls_try('PROCUREMENT', 'INSERT child scenario V2  ', 'ALLOWED',
    format('insert into price_scenarios (project_id, parent_scenario_id, name, template_id) select project_id, id, ''V2'', ''T_A_AHS_STANDARD'' from price_scenarios where id = %L', v_scen));
  perform _rls_try('PROCUREMENT', 'PARENT auto-locked (V1)   ', 'ALLOWED',
    format('select 1 from price_scenarios where id = %L and is_locked', v_scen));
  perform _rls_try('PROCUREMENT', 'UPDATE locked scenario    ', 'DENIED',
    format('update price_scenarios set name = ''diubah'' where id = %L', v_scen));
  perform _rls_try('PROCUREMENT', 'INSERT input ke locked V1 ', 'DENIED',
    format('insert into scenario_inputs (scenario_id, field_key, value_num) values (%L, ''harga'', 1)', v_scen));
  perform _rls_try('PROCUREMENT', 'DELETE scenario           ', 'DENIED',
    format('delete from price_scenarios where id = %L', v_scen));
end $$;

-- ============================================================================
-- PIC (member of ONE project only)
-- ============================================================================
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-000000000a03', false);
set role authenticated;

do $$
declare v_own uuid; v_oth uuid;
begin
  select id into v_own from projects where code = 'PRJ-OWN';
  select id into v_oth from projects where code = 'PRJ-OTH';
  perform _rls_try('PIC', 'SELECT project sendiri    ', 'ALLOWED',
    format('select 1 from projects where id = %L', v_own));
  perform _rls_try('PIC', 'SELECT project LAIN       ', 'DENIED',
    format('select 1 from projects where id = %L', v_oth));
  perform _rls_try('PIC', 'INSERT project            ', 'DENIED',
    'insert into projects (code, name) values (''PRJ-PIC'',''Pic Project'')');
  perform _rls_try('PIC', 'UPDATE project sendiri    ', 'ALLOWED',
    format('update projects set notes = ''pic'' where id = %L', v_own));
  perform _rls_try('PIC', 'UPDATE project LAIN       ', 'DENIED',
    format('update projects set notes = ''x'' where id = %L', v_oth));
  perform _rls_try('PIC', 'INSERT sheet sendiri      ', 'ALLOWED',
    format('insert into project_sheets (project_id, doc) values (%L, ''{"version":3,"sheets":[],"workbookFormulas":{}}''::jsonb)', v_own));
  perform _rls_try('PIC', 'INSERT sheet project LAIN ', 'DENIED',
    format('insert into project_sheets (project_id, doc) values (%L, ''{"version":3,"sheets":[],"workbookFormulas":{}}''::jsonb)', v_oth));
  perform _rls_try('PIC', 'INSERT vendor_prices LAIN ', 'DENIED',
    format('insert into vendor_prices (project_id, vendor_id, base_price) select %L, id, 1 from vendors limit 1', v_oth));
  perform _rls_try('PIC', 'DELETE project            ', 'DENIED',
    format('delete from projects where id = %L', v_own));
end $$;

-- ============================================================================
-- VIEWER
-- ============================================================================
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-000000000a04', false);
set role authenticated;

do $$
declare v_proc uuid;
begin
  select id into v_proc from projects where code = 'PRJ-PRC';
  perform _rls_try('VIEWER', 'SELECT master (vendors)   ', 'ALLOWED',
    'select 1 from vendors');
  perform _rls_try('VIEWER', 'SELECT project orang lain ', 'DENIED',
    format('select 1 from projects where id = %L', v_proc));
  perform _rls_try('VIEWER', 'INSERT project            ', 'DENIED',
    'insert into projects (code, name) values (''PRJ-VWR'',''Viewer'')');
  perform _rls_try('VIEWER', 'INSERT vendor             ', 'DENIED',
    'insert into vendors (name) values (''Vendor Viewer'')');
  perform _rls_try('VIEWER', 'INSERT project_sheets     ', 'DENIED',
    format('insert into project_sheets (project_id, doc) values (%L, ''{"version":3,"sheets":[],"workbookFormulas":{}}''::jsonb)', v_proc));
  perform _rls_try('VIEWER', 'UPDATE vendor             ', 'DENIED',
    'update vendors set notes = ''x'' where name = ''Vendor Uji''');
  perform _rls_try('VIEWER', 'DELETE vendor             ', 'DENIED',
    'delete from vendors where name = ''Vendor Viewer''');
  perform _rls_try('VIEWER', 'INSERT formula_registry   ', 'DENIED',
    'insert into formula_registry (formula_id, formula_name, expression, excel_formula, source_sheet, source_cell, source_block) values (''F997'',''Probe'',''a+b'',''=A1+B1'',''X'',''A1'',''probe'')');
end $$;

reset role;

-- ============================================================================
-- TRIGGER CHECKS (run as table owner so RLS cannot mask the trigger)
-- ============================================================================
do $$
begin
  perform _rls_try('TRIGGER', 'UPDATE project_history    ', 'DENIED',
    'update project_history set reason = ''ubah'' where entity = ''probe''');
  perform _rls_try('TRIGGER', 'DELETE project_history    ', 'DENIED',
    'delete from project_history where entity = ''probe''');
  perform _rls_try('TRIGGER', 'UPDATE ahs calculated col ', 'DENIED',
    'update ahs set revenue = 5 where harga_jual_include = 20000');
  perform _rls_try('TRIGGER', 'UPDATE locked scenario    ', 'DENIED',
    'update price_scenarios set name = ''x'' where is_locked');
  perform _rls_try('TRIGGER', 'INSERT input ke locked V1 ', 'DENIED',
    'insert into scenario_inputs (scenario_id, field_key, value_num) select id, ''x'', 1 from price_scenarios where is_locked limit 1');
end $$;

-- ============================================================================
-- CONSTRAINT CHECKS (independent of role)
-- ============================================================================
do $$
begin
  perform _rls_try('SCHEMA', 'UNRESOLVED formula aktif  ', 'DENIED',
    'insert into formula_registry (formula_id, formula_name, expression, excel_formula, source_sheet, source_cell, source_block, resolution, active) values (''F996'',''Probe'',''a+b'',''=A1+B1'',''X'',''A1'',''p'', ''UNRESOLVED'', true)');
  perform _rls_try('SCHEMA', 'UNRESOLVED formula NONAKTIF', 'ALLOWED',
    'insert into formula_registry (formula_id, formula_name, expression, excel_formula, source_sheet, source_cell, source_block, resolution, active) values (''F996'',''Probe'',''a+b'',''=A1+B1'',''X'',''A1'',''p'', ''UNRESOLVED'', false)');
  perform _rls_try('SCHEMA', 'duplikat (project,name)   ', 'DENIED',
    'insert into price_scenarios (project_id, name, template_id) select project_id, ''V1'', ''T_A_AHS_STANDARD'' from price_scenarios where name = ''V1'' limit 1');
end $$;

delete from formula_registry where formula_id in ('F996', 'F997', 'F998', 'F999');

-- ============================================================================
-- REPORT
-- ============================================================================
\echo ''
\echo '================ RLS / PROTECTION ROLE MATRIX ================'
select role, operation, expected, actual,
       case when ok then 'PASS' else 'FAIL' end as verdict,
       coalesce(nullif(left(note, 110), ''), '') as note
  from _rls_results order by seq;

\echo ''
\echo '================ SUMMARY ================'
select role,
       count(*) filter (where ok)     as pass,
       count(*) filter (where not ok) as fail
  from _rls_results group by role order by role;

select count(*) filter (where not ok) as total_failures from _rls_results;
