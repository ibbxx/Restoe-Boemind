// Explicit local schema. Unknown legacy attributes are preserved separately.
const text = (names) => Object.fromEntries(names.split(" ").filter(Boolean).map((name) => [name, "TEXT"]));
const real = (names) => Object.fromEntries(names.split(" ").filter(Boolean).map((name) => [name, "REAL"]));
const integer = (names) => Object.fromEntries(names.split(" ").filter(Boolean).map((name) => [name, "INTEGER"]));
const common = text("id created_at updated_at");
export const schema = {
  profiles: { ...common, ...text("email full_name role"), ...integer("is_active") },
  markets: { ...common, ...text("name province location maps_url priority_class notes code") },
  vendors: { ...common, ...text("name contact armada stock permit address notes status created_by") },
  products: { ...common, ...text("code name unit") },
  customers: { ...common, ...text("name customer_type default_term") },
  projects: { ...common, ...text("code name customer_id product_id market_id location period_label pic_id status notes created_by"), ...real("volume") },
  project_members: { ...common, ...text("project_id profile_id access_level") },
  project_vendors: { ...common, ...text("project_id vendor_id evaluation_note"), ...integer("is_selected") },
  calculation_templates: { ...common, ...text("template_id template_name source_sheet source_block input_definition formula_definition dependency_definition output_definition coverage_note"), ...integer("version active") },
  formula_registry: { ...common, ...text("formula_id formula_name expression excel_formula source_sheet source_cell source_block description resolution"), ...integer("version active") },
  vendor_prices: { ...common, ...text("project_id vendor_id scenario_id extra_component_label all_in_formula_id note created_by"), ...real("base_price ppn_rate ppn_amount pbbkb_rate pbbkb_amount pph_amount oat_amount ppn_oat_amount bph_amount all_in_amount raw_include_price divisor"), ...integer("ppn_is_formula") },
  project_sheets: { ...common, ...text("project_id doc"), ...integer("revision") },
};
export const jsonColumns = new Set(["doc", "input_definition", "formula_definition", "dependency_definition", "output_definition"]);
export const booleanColumns = new Set(["is_active", "active", "is_selected", "is_summed_in_total", "ppn_is_formula"]);
export const relations = {
  projects: { customer_id: "customers", product_id: "products", market_id: "markets", pic_id: "profiles", created_by: "profiles" },
  project_members: { project_id: "projects", profile_id: "profiles" },
  project_vendors: { project_id: "projects", vendor_id: "vendors" },
  vendor_prices: { project_id: "projects", vendor_id: "vendors", created_by: "profiles" },
  project_sheets: { project_id: "projects" },
};
export const unique = {
  projects: [["code"]], products: [["code"]], customers: [["name"]], markets: [["name"]], vendors: [["name"]],
  project_members: [["project_id", "profile_id"]], project_vendors: [["project_id", "vendor_id"]],
  project_sheets: [["project_id"]],
  calculation_templates: [["template_id"]], formula_registry: [["formula_id"]],
};
