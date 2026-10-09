#!/usr/bin/env node
/**
 * Generates Supabase seed SQL from the SAME JSON that the calculation engine
 * imports (lib/formulas/*.json). This guarantees the database registry can never
 * drift from the engine registry.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  readFileSync(resolve(root, "lib/formulas/formula-registry.json"), "utf8"),
);
const templates = JSON.parse(
  readFileSync(resolve(root, "lib/formulas/calculation-templates.json"), "utf8"),
);

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const n = (v) => (v === null || v === undefined ? "null" : String(v));
const b = (v) => (v ? "true" : "false");

mkdirSync(resolve(root, "supabase/seed"), { recursive: true });

// ---------------------------------------------------------------- registry
const formulaRows = registry.formulas
  .map(
    (f) =>
      `  (${q(f.formula_id)}, ${q(f.formula_name)}, ${q(f.expression)}, ${q(f.excel_formula)},\n` +
      `   ${q(f.source_sheet)}, ${q(f.source_cell)}, ${q(f.source_block)}, ${n(f.version)},\n` +
      `   ${q(f.description)}, ${q(f.resolution)}, ${b(f.active)})`,
  )
  .join(",\n");

const formulaSql = `-- GENERATED FILE - do not edit by hand.
-- Source: lib/formulas/formula-registry.json
-- Regenerate with: npm run seed:sql
--
-- Setiap VARIASI formula Excel disimpan sebagai formula_id terpisah
-- (F002A/F002B, F008A/F008B/F008C, F015A/F015B, F019A/F019B, F021A/F021B).
-- Formula berstatus UNRESOLVED tidak diaktifkan (constraint enforce di 0001).

insert into formula_registry
  (formula_id, formula_name, expression, excel_formula,
   source_sheet, source_cell, source_block, version,
   description, resolution, active)
values
${formulaRows}
on conflict (formula_id) do update set
  formula_name  = excluded.formula_name,
  expression    = excluded.expression,
  excel_formula = excluded.excel_formula,
  source_sheet  = excluded.source_sheet,
  source_cell   = excluded.source_cell,
  source_block  = excluded.source_block,
  version       = excluded.version,
  description   = excluded.description,
  resolution    = excluded.resolution,
  active        = excluded.active,
  updated_at    = now();
`;

// ---------------------------------------------------------------- templates
const templateRows = templates.templates
  .map(
    (t) =>
      `  (${q(t.template_id)}, ${q(t.template_name)}, ${q(t.source_sheet)}, ${q(t.source_block)},\n` +
      `   ${j(t.input_definition)}, ${j(t.formula_definition)}, ${j(t.dependency_definition)},\n` +
      `   ${j(t.output_definition)}, ${q(t.coverage_note ?? null)}, ${n(t.version)}, ${b(t.active)})`,
  )
  .join(",\n");

const templateSql = `-- GENERATED FILE - do not edit by hand.
-- Source: lib/formulas/calculation-templates.json
-- Regenerate with: npm run seed:sql

insert into calculation_templates
  (template_id, template_name, source_sheet, source_block,
   input_definition, formula_definition, dependency_definition,
   output_definition, coverage_note, version, active)
values
${templateRows}
on conflict (template_id) do update set
  template_name         = excluded.template_name,
  source_sheet          = excluded.source_sheet,
  source_block          = excluded.source_block,
  input_definition      = excluded.input_definition,
  formula_definition    = excluded.formula_definition,
  dependency_definition = excluded.dependency_definition,
  output_definition     = excluded.output_definition,
  coverage_note         = excluded.coverage_note,
  version               = excluded.version,
  active                = excluded.active,
  updated_at            = now();
`;

// ------------------------------------------------- template_formulas links
const linkRows = [];
for (const t of templates.templates) {
  for (const [step, formulaId] of Object.entries(t.formula_definition)) {
    linkRows.push(`  (${q(t.template_id)}, ${q(step)}, ${q(formulaId)})`);
  }
}
const linkSql = `-- GENERATED FILE - do not edit by hand.
insert into template_formulas (template_id, step, formula_id)
values
${linkRows.join(",\n")}
on conflict (template_id, step) do update set formula_id = excluded.formula_id;
`;

writeFileSync(resolve(root, "supabase/seed/0001_formula_registry.sql"), formulaSql);
writeFileSync(resolve(root, "supabase/seed/0002_calculation_templates.sql"), templateSql);
writeFileSync(resolve(root, "supabase/seed/0003_template_formulas.sql"), linkSql);

console.log(
  `seed SQL written: ${registry.formulas.length} formulas, ` +
    `${templates.templates.length} templates, ${linkRows.length} template_formulas`,
);
