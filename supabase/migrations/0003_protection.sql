-- ============================================================================
-- 0003_protection.sql
-- Proteksi lapis database (bukan hanya aplikasi):
--   1. Calculated field pada `ahs` dan `calculation_results` tidak dapat
--      diubah manual oleh user — hanya calculation engine.
--   2. Scenario lama bersifat read-only: begitu scenario anak dibuat,
--      parent otomatis dikunci dan tidak bisa diubah lagi.
--   3. project_history bersifat append-only (UPDATE dilarang, DELETE ditolak).
-- ============================================================================

-- ------------------------------------------------- calculated field guard
create or replace function protect_calculated_fields() returns trigger
language plpgsql as $$
declare
  calc_cols text[] := array[
    'revenue','total_cost','cost_per_liter','ppn_output','ppn_input',
    'ppn_difference','gross_profit','net_profit','net_profit_per_liter',
    'profit_percentage'
  ];
  c text;
begin
  -- Nilai calculated hanya boleh diubah oleh calculation engine
  -- (session yang menandai dirinya lewat GUC berikut).
  if coalesce(current_setting('app.calculation_engine', true), 'off') = 'on' then
    return new;
  end if;

  foreach c in array calc_cols loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception
        'Kolom "%" adalah calculated field dan tidak boleh diubah manual. '
        'Gunakan calculation engine atau buat scenario baru.', c
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

create trigger trg_ahs_protect_calculated
  before update on ahs
  for each row execute function protect_calculated_fields();

-- ------------------------------------------------- scenario immutability
create or replace function enforce_scenario_immutability() returns trigger
language plpgsql as $$
begin
  if old.is_locked then
    raise exception
      'Scenario % sudah dikunci (immutable). Buat scenario baru untuk perubahan.',
      old.id using errcode = 'check_violation';
  end if;
  if old.scenario_type is distinct from new.scenario_type
     or old.parent_scenario_id is distinct from new.parent_scenario_id
     or old.template_id is distinct from new.template_id then
    raise exception
      'Struktur scenario (type/parent/template) tidak boleh diubah setelah dibuat.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_scenario_immutable
  before update on price_scenarios
  for each row execute function enforce_scenario_immutability();

-- Saat scenario anak dibuat, kunci parent-nya otomatis (V1 -> V2 -> V3).
create or replace function lock_parent_scenario() returns trigger
language plpgsql as $$
begin
  if new.parent_scenario_id is not null then
    update price_scenarios
       set is_locked = true
     where id = new.parent_scenario_id
       and is_locked = false;
  end if;
  return new;
end $$;

create trigger trg_lock_parent_scenario
  after insert on price_scenarios
  for each row execute function lock_parent_scenario();

-- ------------------------------------------- scenario inputs / results frozen
create or replace function reject_locked_scenario_write() returns trigger
language plpgsql as $$
declare sid uuid;
begin
  sid := coalesce(new.scenario_id, old.scenario_id);
  if exists (select 1 from price_scenarios where id = sid and is_locked) then
    raise exception
      'Scenario % terkunci: input/hasil tidak boleh diubah lagi.', sid
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_inputs_frozen
  before insert or update or delete on scenario_inputs
  for each row execute function reject_locked_scenario_write();

create trigger trg_cost_items_frozen
  before insert or update or delete on ahs_cost_items
  for each row execute function reject_locked_scenario_write();

-- ------------------------------------------------- history append-only
create or replace function history_is_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'project_history bersifat append-only dan tidak bisa diubah.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'project_history tidak bisa dihapus (audit trail).'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

create trigger trg_history_append_only
  before update or delete on project_history
  for each row execute function history_is_append_only();

-- ------------------------------------------------- audit: scenario changes
-- Mencatat perubahan input harga menjadi project_history secara otomatis.
create or replace function log_scenario_price_change() returns trigger
language plpgsql as $$
declare
  old_v numeric; new_v numeric; pid uuid;
begin
  select project_id into pid from price_scenarios where id = new.scenario_id;
  old_v := case when tg_op = 'UPDATE' then old.value_num else null end;
  new_v := case when tg_op in ('INSERT','UPDATE') then new.value_num else null end;

  if old_v is distinct from new_v then
    -- `action` is the history_action ENUM: PostgreSQL does not implicitly cast
    -- a CASE expression of type text to an enum, so the cast is REQUIRED.
    -- Without it every insert/update on scenario_inputs fails with
    --   42804: column "action" is of type history_action but expression is of type text
    -- (found by the Phase 2.5 local database validation).
    insert into project_history
      (project_id, scenario_id, entity, entity_id, action, field,
       old_value, new_value, changed_by)
    values
      (pid, new.scenario_id, 'scenario_inputs', new.id::text,
       (case when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end)::history_action,
       new.field_key, old_v::text, new_v::text, auth.uid());
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_log_scenario_inputs
  after insert or update on scenario_inputs
  for each row execute function log_scenario_price_change();
