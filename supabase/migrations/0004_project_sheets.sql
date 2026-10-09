-- ============================================================================
-- 0004_project_sheets.sql
-- Tabel dinamis (spreadsheet) per project: kolom, baris dan FORMULA ditentukan
-- user (procurement), bukan template. Satu dokumen JSONB per project.
--
-- Catatan arsitektur:
--   * Calculation Engine TIDAK berubah. Dokumen ini tidak menyimpan hasil
--     komersial: nilai baris/kolom dihitung di application layer memakai
--     evaluator ekspresi yang sama (lib/calculations/expression.ts) dan
--     AhsResult tetap sumber kebenaran angka AHS.
-- ============================================================================

create table project_sheets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references projects (id) on delete cascade,
  doc         jsonb not null default '{"version":1,"sheets":[]}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index project_sheets_project_idx on project_sheets (project_id);

-- -------------------------------------------------------------------- RLS
alter table project_sheets enable row level security;

create policy project_sheets_select on project_sheets
  for select to authenticated using (has_project_access(project_id));

create policy project_sheets_write on project_sheets
  for all to authenticated
  using (can_write_project(project_id))
  with check (can_write_project(project_id));
