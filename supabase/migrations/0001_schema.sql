-- ============================================================================
-- 0001_schema.sql
-- Digitalisasi `ANALISIS HARGA SATUAN (2026).xlsx`
-- Struktur diturunkan dari docs/EXCEL_MAPPING.md (Phase 1), bukan dari PRD saja.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type user_role as enum ('ADMIN', 'PROCUREMENT', 'PIC', 'VIEWER');

-- scenario_type nilainya diambil dari label blok nyata di workbook:
--   CASH / TEMPO  -> 'ANALISIS HARGA SATUAN (CASH 26.626)' / '(TEMPO 29.000)'
--   dll. lihat docs/EXCEL_MAPPING.md §B.3
create type scenario_type as enum (
  'STANDARD', 'CASH', 'TEMPO', 'INTERNAL_FIX', 'KROS_CEK',
  'REAL_COST', 'KOMBINASI', 'BAGI_HASIL', 'OPSI_VOLUME'
);

create type formula_resolution as enum ('RESOLVED', 'UNRESOLVED');

create type cross_check_status as enum ('VALID', 'WARNING', 'ERROR', 'UNRESOLVED');

create type history_action as enum ('INSERT', 'UPDATE', 'DELETE', 'CLONE', 'CALCULATE');

-- ---------------------------------------------------------------- identity
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  role         user_role not null default 'VIEWER',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- master data
create table markets (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  province        text,
  location        text,
  maps_url        text,
  priority_class  text,          -- 'Proyek Prioritas' / 'Intensitas Tinggi' / 'Sedang'
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (name)
);

create table vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text,
  armada      text,
  stock       text,
  permit      text,
  address     text,
  notes       text,
  status      text not null default 'ACTIVE',
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name)
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,   -- HSD, B40, MFO
  name        text not null,
  unit        text not null default 'liter',
  created_at  timestamptz not null default now()
);

create table customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  customer_type text,                 -- BUMN / BUMS / SWASTA
  default_term  text,                 -- '30 Hari', 'CBD', 'COD'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- projects
create table projects (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  customer_id  uuid references customers (id),
  product_id   uuid references products (id),
  market_id    uuid references markets (id),
  location     text,
  period_label text,                  -- 'P2 SEP-26' (label baris 1 pada Excel)
  pic_id       uuid references profiles (id),
  status       text not null default 'ACTIVE',
  notes        text,
  created_by   uuid references profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table project_members (
  project_id   uuid not null references projects (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  access_level text not null default 'EDIT',   -- EDIT / VIEW
  created_at   timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create table project_vendors (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects (id) on delete cascade,
  vendor_id      uuid not null references vendors (id),
  is_selected    boolean not null default false,
  evaluation_note text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, vendor_id)
);

-- ------------------------------------------------- calculation templates
-- Merepresentasikan blok Excel nyata (Template A/B/C/D).
create table calculation_templates (
  template_id          text primary key,      -- T_A_AHS_STANDARD, T_B_...
  template_name        text not null,
  source_sheet         text not null,         -- sheet Excel asal
  source_block         text not null,         -- range blok asal
  input_definition     jsonb not null,        -- [{key,label,data_type,required,default}]
  formula_definition   jsonb not null,        -- {step: formula_id}
  dependency_definition jsonb not null,       -- {step: [operand...]}
  output_definition    jsonb not null,        -- [output keys]
  coverage_note        text,
  version              integer not null default 1,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ------------------------------------------------- formula registry
create table formula_registry (
  formula_id           text primary key,      -- F001, F002A, F002B, ...
  formula_name         text not null,
  expression           text not null,         -- dievaluasi oleh calculation engine
  excel_formula        text not null,         -- formula Excel ASLI (tidak diubah)
  source_sheet         text not null,
  source_cell          text not null,
  source_block         text not null,
  version              integer not null default 1,
  description          text,
  resolution           formula_resolution not null default 'RESOLVED',
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Formula yang belum jelas TIDAK boleh diaktifkan (lihat Phase 1 §G).
  constraint formula_unresolved_must_be_inactive
    check (resolution = 'RESOLVED' or active = false)
);

-- Template hanya boleh mereferensikan formula yang benar-benar ada.
create table template_formulas (
  template_id  text not null references calculation_templates (template_id) on delete cascade,
  step         text not null,
  formula_id   text not null references formula_registry (formula_id),
  primary key (template_id, step)
);

-- ------------------------------------------------- AHS
create table ahs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects (id) on delete cascade,
  template_id    text not null references calculation_templates (template_id),
  code           text,
  title          text,                        -- 'ANALISIS HARGA SATUAN (AHS)'
  product_id     uuid references products (id),
  -- input
  volume               numeric(18,4),
  harga_jual_include   numeric(18,4),
  include_divisor      numeric(10,6) default 1.11,
  ppn_rate             numeric(10,6) default 0.11,
  pbbkb_rate           numeric(10,6),
  pph_inu_rate         numeric(10,6),
  bph_migas_rate       numeric(10,6),
  harga_keekonomian    numeric(18,4),
  marketing            text,
  payment_term         text,
  document_scheme      text,
  analysis_date        date,
  notes                text,
  -- calculated (ditulis HANYA oleh calculation engine)
  revenue              numeric(20,4),
  total_cost           numeric(20,4),
  cost_per_liter       numeric(20,6),
  ppn_output           numeric(20,4),
  ppn_input            numeric(20,4),
  ppn_difference       numeric(20,4),
  gross_profit         numeric(20,4),
  net_profit           numeric(20,4),
  net_profit_per_liter numeric(20,6),
  profit_percentage    numeric(20,10),
  calculated_at        timestamptz,
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- "18 cost line items" hasil normalisasi dari cost engine Excel (JATENG!J15:L32).
create table ahs_cost_items (
  id           uuid primary key default gen_random_uuid(),
  ahs_id       uuid not null references ahs (id) on delete cascade,
  scenario_id  uuid,                          -- FK ditambahkan setelah price_scenarios
  line_no      integer not null,
  category     text,                          -- HPP / PAJAK / COST OF FUND / ...
  description  text not null,                 -- 'Harga Dasar', 'PPN 11%', ...
  unit         text,
  rate         numeric(20,8),                 -- NULL = TIDAK BERLAKU (bukan 0)
  qty          numeric(20,8),                 -- NULL = TIDAK BERLAKU
  total        numeric(20,4),                 -- hasil rate x qty
  formula_id   text references formula_registry (formula_id),
  is_summed_in_total boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (ahs_id, line_no)
);

-- ------------------------------------------------- vendor prices
create table vendor_prices (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects (id) on delete cascade,
  vendor_id         uuid not null references vendors (id),
  scenario_id       uuid,
  -- komponen (sama dengan blok EVALUASI HARGA VENDOR)
  base_price        numeric(18,4),
  ppn_rate          numeric(10,6),
  ppn_amount        numeric(18,4),
  pbbkb_rate        numeric(10,6),
  pbbkb_amount      numeric(18,4),
  pph_amount        numeric(18,4),
  oat_amount        numeric(18,4),
  ppn_oat_amount    numeric(18,4),
  bph_amount        numeric(18,4),            -- bisa berlabel BPH/SIB/PMKU/Izin bunker
  extra_component_label text,
  all_in_amount     numeric(18,4),
  all_in_formula_id text references formula_registry (formula_id), -- F002A / F002B
  raw_include_price numeric(18,4),
  divisor           numeric(10,6),
  -- PPN yang diketik manual di Excel adalah DATA, bukan hasil formula.
  ppn_is_formula    boolean not null default true,
  note              text,
  created_by        uuid references profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------- scenarios
create table price_scenarios (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects (id) on delete cascade,
  parent_scenario_id uuid references price_scenarios (id),
  name               text not null,
  scenario_type      scenario_type not null default 'STANDARD',
  template_id        text not null references calculation_templates (template_id),
  reason             text,
  is_locked          boolean not null default false,   -- scenario lama read-only
  created_by         uuid references profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (project_id, name)
);

alter table ahs_cost_items
  add constraint ahs_cost_items_scenario_fk
  foreign key (scenario_id) references price_scenarios (id) on delete cascade;

alter table vendor_prices
  add constraint vendor_prices_scenario_fk
  foreign key (scenario_id) references price_scenarios (id) on delete cascade;

-- Snapshot INPUT (EAV) — jumlah & nama input berbeda antar template.
create table scenario_inputs (
  id          uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references price_scenarios (id) on delete cascade,
  field_key   text not null,
  value_num   numeric(24,10),
  value_text  text,
  value_date  date,
  created_at  timestamptz not null default now(),
  unique (scenario_id, field_key)
);

create table calculation_results (
  id                   uuid primary key default gen_random_uuid(),
  scenario_id          uuid not null references price_scenarios (id) on delete cascade,
  template_id          text not null references calculation_templates (template_id),
  harga_jual_dpp       numeric(20,6),
  harga_jual_setelah_pajak numeric(20,6),
  revenue              numeric(20,4),
  total_cost           numeric(20,4),
  cost_per_liter       numeric(20,6),
  ppn_output           numeric(20,4),
  ppn_input            numeric(20,4),
  ppn_difference       numeric(20,4),
  gross_profit         numeric(20,4),
  net_profit           numeric(20,4),
  net_profit_per_liter numeric(20,6),
  profit_percentage    numeric(20,10),
  formulas_used        jsonb,                 -- {step: formula_id} untuk audit
  engine_version       text,
  computed_at          timestamptz not null default now(),
  is_valid             boolean not null default true,
  unique (scenario_id)
);

create table profit_shares (
  id                uuid primary key default gen_random_uuid(),
  scenario_id       uuid not null references price_scenarios (id) on delete cascade,
  party             text not null,
  role              text,
  share_percent     numeric(10,6) not null,   -- INPUT, bukan konstanta (§G6)
  profit_per_liter  numeric(20,6),
  profit_amount     numeric(20,4),
  capital_amount    numeric(20,4),
  notes             text,
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------- delivery log
create table delivery_logs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects (id) on delete cascade,
  source              text,
  transporter         text,
  nopol               text,
  arrived_at          text,
  finished_sounding_at text,
  finished_unloading_at text,
  volume_surat_jalan  numeric(18,4),
  volume_flowmeter    numeric(18,4),
  solar_status        text,                   -- DITERIMA / DITOLAK
  remark              text,
  created_by          uuid references profiles (id),
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------- governance
-- Append-only. Tidak boleh dihapus oleh user biasa (lihat RLS).
create table project_history (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  scenario_id  uuid references price_scenarios (id),
  entity       text not null,
  entity_id    text,
  action       history_action not null,
  field        text,
  old_value    text,
  new_value    text,
  reason       text,
  impact_json  jsonb,                         -- {metric: {before, after, delta}}
  changed_by   uuid references profiles (id),
  changed_at   timestamptz not null default now()
);

create table cross_check_runs (
  id            uuid primary key default gen_random_uuid(),
  scenario_id   uuid references price_scenarios (id) on delete set null,
  formula_id    text references formula_registry (formula_id),
  source_ref    text,                         -- 'JATENG!M37'
  expected      numeric(24,10),
  actual        numeric(24,10),
  difference    numeric(24,10),
  rel_difference numeric(20,12),
  status        cross_check_status not null,
  run_at        timestamptz not null default now()
);

-- ------------------------------------------------- indexes
create index idx_projects_status          on projects (status);
create index idx_ahs_project              on ahs (project_id);
create index idx_ahs_cost_items_ahs       on ahs_cost_items (ahs_id);
create index idx_vendor_prices_project    on vendor_prices (project_id, vendor_id);
create index idx_scenarios_project        on price_scenarios (project_id);
create index idx_scenarios_parent         on price_scenarios (parent_scenario_id);
create index idx_results_scenario         on calculation_results (scenario_id);
create index idx_history_project_time     on project_history (project_id, changed_at desc);
create index idx_crosscheck_scenario      on cross_check_runs (scenario_id);
create index idx_formula_active           on formula_registry (active);

-- ------------------------------------------------- updated_at triggers
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','markets','vendors','customers','projects','project_vendors',
    'calculation_templates','formula_registry','ahs','vendor_prices',
    'price_scenarios'
  ]
  loop
    execute format(
      'create trigger trg_%s_updated before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
