-- ============================================================================
-- 0002_rls.sql
-- Row Level Security + proteksi calculated field + immutability.
-- Prinsip PRD §36 / Phase 2 §2:
--   * tidak ada policy 'allow all' untuk production
--   * calculated result tidak dapat diubah langsung oleh user
--   * history tidak dapat dihapus user biasa
--   * scenario lama bersifat read-only
-- ============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'VIEWER'::user_role)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_name() = 'ADMIN'
$$;

-- Procurement & Admin boleh menulis data project.
create or replace function can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_name() in ('ADMIN', 'PROCUREMENT')
$$;

-- Akses project: admin/procurement lewat role, lainnya harus jadi member.
create or replace function has_project_access(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    current_role_name() in ('ADMIN', 'PROCUREMENT')
    or exists (
      select 1 from project_members m
      where m.project_id = p_project_id and m.profile_id = auth.uid()
    )
$$;

create or replace function can_write_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    current_role_name() in ('ADMIN', 'PROCUREMENT')
    or exists (
      select 1 from project_members m
      where m.project_id = p_project_id
        and m.profile_id = auth.uid()
        and m.access_level = 'EDIT'
    )
$$;

-- ---------------------------------------------------------------- enable RLS
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','markets','vendors','products','customers','projects',
    'project_members','project_vendors','calculation_templates',
    'formula_registry','template_formulas','ahs','ahs_cost_items',
    'vendor_prices','price_scenarios','scenario_inputs','calculation_results',
    'profit_shares','delivery_logs','project_history','cross_check_runs'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- profiles
create policy profiles_select_self_or_admin on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- Hanya admin yang boleh membuat/menghapus profil.
create policy profiles_insert_admin on profiles
  for insert to authenticated with check (is_admin());

create policy profiles_delete_admin on profiles
  for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------- master data
create policy markets_read on markets
  for select to authenticated using (true);
create policy markets_write on markets
  for all to authenticated using (can_write()) with check (can_write());

create policy vendors_read on vendors
  for select to authenticated using (true);
create policy vendors_write on vendors
  for all to authenticated using (can_write()) with check (can_write());

create policy products_read on products
  for select to authenticated using (true);
create policy products_write on products
  for all to authenticated using (can_write()) with check (can_write());

create policy customers_read on customers
  for select to authenticated using (true);
create policy customers_write on customers
  for all to authenticated using (can_write()) with check (can_write());

-- ---------------------------------------------------------------- projects
create policy projects_select on projects
  for select to authenticated using (has_project_access(id));

create policy projects_insert on projects
  for insert to authenticated with check (can_write());

create policy projects_update on projects
  for update to authenticated
  using (can_write_project(id)) with check (can_write_project(id));

-- Hapus project hanya ADMIN (menghapus cascade data turunannya).
create policy projects_delete on projects
  for delete to authenticated using (is_admin());

create policy project_members_select on project_members
  for select to authenticated using (has_project_access(project_id));
create policy project_members_write on project_members
  for all to authenticated
  using (is_admin() or can_write_project(project_id))
  with check (is_admin() or can_write_project(project_id));

create policy project_vendors_select on project_vendors
  for select to authenticated using (has_project_access(project_id));
create policy project_vendors_write on project_vendors
  for all to authenticated
  using (can_write_project(project_id)) with check (can_write_project(project_id));

-- ------------------------------------------- registry & templates (read-only)
create policy formula_registry_read on formula_registry
  for select to authenticated using (true);
create policy formula_registry_write on formula_registry
  for all to authenticated using (is_admin()) with check (is_admin());

create policy calculation_templates_read on calculation_templates
  for select to authenticated using (true);
create policy calculation_templates_write on calculation_templates
  for all to authenticated using (is_admin()) with check (is_admin());

create policy template_formulas_read on template_formulas
  for select to authenticated using (true);
create policy template_formulas_write on template_formulas
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- AHS
create policy ahs_select on ahs
  for select to authenticated using (has_project_access(project_id));
-- INSERT/UPDATE diizinkan; kolom calculated diproteksi trigger di 0003.
create policy ahs_insert on ahs
  for insert to authenticated with check (can_write_project(project_id));
create policy ahs_update on ahs
  for update to authenticated
  using (can_write_project(project_id)) with check (can_write_project(project_id));
create policy ahs_delete on ahs
  for delete to authenticated using (is_admin());

create policy ahs_cost_items_select on ahs_cost_items
  for select to authenticated
  using (exists (select 1 from ahs a where a.id = ahs_id and has_project_access(a.project_id)));
create policy ahs_cost_items_write on ahs_cost_items
  for all to authenticated
  using (exists (select 1 from ahs a where a.id = ahs_id and can_write_project(a.project_id)))
  with check (exists (select 1 from ahs a where a.id = ahs_id and can_write_project(a.project_id)));

-- ---------------------------------------------------------------- vendor prices
create policy vendor_prices_select on vendor_prices
  for select to authenticated using (has_project_access(project_id));
create policy vendor_prices_write on vendor_prices
  for all to authenticated
  using (can_write_project(project_id)) with check (can_write_project(project_id));

-- ---------------------------------------------------------------- scenarios
create policy price_scenarios_select on price_scenarios
  for select to authenticated using (has_project_access(project_id));
create policy price_scenarios_insert on price_scenarios
  for insert to authenticated with check (can_write_project(project_id));
-- UPDATE dibatasi: scenario terkunci tidak boleh diubah (trigger di 0003).
create policy price_scenarios_update on price_scenarios
  for update to authenticated
  using (can_write_project(project_id)) with check (can_write_project(project_id));
-- Scenario TIDAK boleh dihapus kecuali ADMIN (anti "menghapus historical").
create policy price_scenarios_delete on price_scenarios
  for delete to authenticated using (is_admin());

create policy scenario_inputs_select on scenario_inputs
  for select to authenticated
  using (exists (select 1 from price_scenarios s
                 where s.id = scenario_id and has_project_access(s.project_id)));
create policy scenario_inputs_insert on scenario_inputs
  for insert to authenticated
  with check (exists (select 1 from price_scenarios s
                      where s.id = scenario_id
                        and can_write_project(s.project_id) and not s.is_locked));
create policy scenario_inputs_update on scenario_inputs
  for update to authenticated
  using (exists (select 1 from price_scenarios s
                 where s.id = scenario_id
                   and can_write_project(s.project_id) and not s.is_locked))
  with check (exists (select 1 from price_scenarios s
                      where s.id = scenario_id
                        and can_write_project(s.project_id) and not s.is_locked));
create policy scenario_inputs_delete on scenario_inputs
  for delete to authenticated using (is_admin());

-- ------------------------------------- calculation_results (engine-only writes)
-- Hanya role ADMIN/PROCUREMENT yang boleh menulis, dan nilainya WAJIB berasal
-- dari calculation engine. User biasa hanya bisa membaca.
create policy calculation_results_select on calculation_results
  for select to authenticated
  using (exists (select 1 from price_scenarios s
                 where s.id = scenario_id and has_project_access(s.project_id)));
create policy calculation_results_insert on calculation_results
  for insert to authenticated
  with check (exists (select 1 from price_scenarios s
                      where s.id = scenario_id
                        and can_write_project(s.project_id) and not s.is_locked));
-- DELETE hanya ADMIN. Tidak ada policy UPDATE: hasil perhitungan tidak bisa
-- diubah in-place, harus scenario baru (immutability).
create policy calculation_results_delete on calculation_results
  for delete to authenticated using (is_admin());

create policy profit_shares_select on profit_shares
  for select to authenticated
  using (exists (select 1 from price_scenarios s
                 where s.id = scenario_id and has_project_access(s.project_id)));
create policy profit_shares_write on profit_shares
  for all to authenticated
  using (exists (select 1 from price_scenarios s
                 where s.id = scenario_id
                   and can_write_project(s.project_id) and not s.is_locked))
  with check (exists (select 1 from price_scenarios s
                      where s.id = scenario_id
                        and can_write_project(s.project_id) and not s.is_locked));

-- ---------------------------------------------------------------- delivery log
create policy delivery_logs_select on delivery_logs
  for select to authenticated using (has_project_access(project_id));
create policy delivery_logs_write on delivery_logs
  for all to authenticated
  using (can_write_project(project_id)) with check (can_write_project(project_id));

-- ---------------------------------------------------------------- history
create policy project_history_select on project_history
  for select to authenticated using (has_project_access(project_id));
-- Append-only: siapa pun yang boleh menulis project boleh menambah baris.
create policy project_history_insert on project_history
  for insert to authenticated with check (can_write_project(project_id));
-- Update DILARANG total (tidak ada policy update) -> audit trail tidak berubah.
-- Delete hanya ADMIN dan tetap tercatat oleh trigger audit (0003).
create policy project_history_delete on project_history
  for delete to authenticated using (is_admin());

create policy cross_check_runs_select on cross_check_runs
  for select to authenticated
  using (
    scenario_id is null
    or exists (select 1 from price_scenarios s
               where s.id = scenario_id and has_project_access(s.project_id))
  );
create policy cross_check_runs_write on cross_check_runs
  for all to authenticated using (can_write()) with check (can_write());
