/**
 * DASHBOARD + REPORT TESTS (Phase 3 §5 / §18 / §22).
 *
 * The dashboard must never invent a KPI: every figure is an aggregate of stored
 * calculation results. A project without a scenario contributes to the project
 * counts but not to the money KPIs, and an empty database produces a real empty
 * state — never zeros pretending to be data, never NaN.
 */

import { describe, expect, it } from "vitest";

import { loadDashboard } from "../lib/services/dashboard";
import {
  buildCommercialReport,
  buildScenarioComparisonReport,
  buildVendorComparisonReport,
  commercialReportToCsv,
  csvCell,
  scenarioComparisonToCsv,
  toCsv,
  vendorComparisonToCsv,
} from "../lib/services/reports";
import { commitScenario } from "../lib/services/scenarios";
import { addVendorToProject, saveVendorPrice } from "../lib/services/vendors";
import { actor, makeDb, seedAhs, seedBase, UUIDS } from "./helpers/db";

const ADMIN = actor("ADMIN", UUIDS.admin);

describe("Dashboard empty state", () => {
  it("returns a real empty state on an empty database", async () => {
    const db = makeDb({});
    const dashboard = await loadDashboard(db, ADMIN);
    expect(dashboard.ok).toBe(true);
    if (!dashboard.ok) return;
    expect(dashboard.data.is_empty).toBe(true);
    expect(dashboard.data.kpis.total_projects).toBe(0);
    expect(dashboard.data.kpis.total_revenue).toBeNull();
    expect(dashboard.data.kpis.total_profit).toBeNull();
    expect(dashboard.data.kpis.average_profit_per_liter).toBeNull();
    expect(dashboard.data.recent_projects).toEqual([]);
    expect(dashboard.data.latest_scenario).toBeNull();
  });

  it("counts projects without a scenario but leaves money KPIs null", async () => {
    const db = makeDb(seedBase());
    const dashboard = await loadDashboard(db, ADMIN);
    if (!dashboard.ok) return;

    expect(dashboard.data.is_empty).toBe(false);
    expect(dashboard.data.kpis.total_projects).toBe(2);
    expect(dashboard.data.kpis.active_projects).toBe(1);
    expect(dashboard.data.kpis.completed_projects).toBe(0);
    expect(dashboard.data.kpis.projects_with_result).toBe(0);
    expect(dashboard.data.kpis.projects_without_result).toBe(2);
    expect(dashboard.data.kpis.total_revenue).toBeNull();
    expect(dashboard.data.kpis.total_volume).toBeNull();
    expect(dashboard.data.kpis.average_profit_per_liter).toBeNull();
  });
});

describe("Dashboard KPIs come from stored results", () => {
  it("sums revenue/cost/profit of the LATEST scenario per project only", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA, { volume: 15000, hargaJualInclude: 22626 });

    const v1 = await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "initial",
      input: {},
    });
    if (!v1.ok) throw new Error(v1.error);

    const afterV1 = await loadDashboard(db, ADMIN);
    if (!afterV1.ok) throw new Error(afterV1.error);
    const kpiV1 = afterV1.data.kpis;

    const v2 = await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V2",
      scenario_type: "STANDARD",
      reason: "vendor turun",
      input: {},
      cost_rate_overrides: [{ description: "Harga Dasar", rate: 16000 }],
    });
    if (!v2.ok) throw new Error(v2.error);

    const afterV2 = await loadDashboard(db, ADMIN);
    if (!afterV2.ok) throw new Error(afterV2.error);
    const kpiV2 = afterV2.data.kpis;

    // Only the latest version counts: profit must improve without doubling.
    expect(kpiV2.total_projects).toBe(2);
    expect(kpiV2.projects_with_result).toBe(1);
    expect(kpiV2.total_profit).toBeCloseTo(Number(v2.data.result.net_profit), 6);
    expect(kpiV2.total_profit!).toBeGreaterThan(kpiV1.total_profit!);
    expect(kpiV2.total_revenue).toBeCloseTo(Number(v2.data.result.revenue), 6);
    expect(kpiV2.total_volume).toBe(15000);

    // Average profit/liter is volume-weighted: total profit / total volume.
    expect(kpiV2.average_profit_per_liter).toBeCloseTo(kpiV2.total_profit! / 15000, 8);

    // Latest scenario/result panels point at the newest version.
    expect(afterV2.data.latest_scenario?.scenario_name).toBe("V2");
    expect(afterV2.data.latest_result?.scenario_name).toBe("V2");
    expect(afterV2.data.recent_projects[0]?.code).toBe("TONASA");
  });

  it("never returns NaN/Infinity in any KPI", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "initial",
      input: {},
    });
    const dashboard = await loadDashboard(db, ADMIN);
    if (!dashboard.ok) return;
    for (const [key, value] of Object.entries(dashboard.data.kpis)) {
      if (typeof value === "number") expect(Number.isFinite(value), key).toBe(true);
    }
  });

  it("reports a database failure as a structured error", async () => {
    const db = makeDb({}, );
    // Simulate a failed request (Phase 3 §23).
    const failing = {
      ...db,
      select: async () => {
        throw new Error("simulated network failure");
      },
    };
    const dashboard = await loadDashboard(failing as typeof db, ADMIN);
    expect(dashboard.ok).toBe(false);
    if (!dashboard.ok) expect(dashboard.errorCode).toBe("DATABASE_ERROR");
  });
});

describe("Commercial report", () => {
  it("renders one row per project, with '-' semantics for missing results", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "initial",
      input: {},
    });

    const report = await buildCommercialReport(db, ADMIN, {});
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    expect(report.data.rows.map((r) => r.project_code)).toEqual(["IGIP", "TONASA"]);
    const tonasa = report.data.rows.find((r) => r.project_code === "TONASA")!;
    expect(tonasa.scenario_name).toBe("V1");
    expect(tonasa.without_result).toBe(false);
    expect(tonasa.revenue).toBeGreaterThan(0);
    expect(tonasa.vendor_price).toBeCloseTo(16396.39, 4);
    expect(tonasa.customer_price).toBe(22626);

    const igip = report.data.rows.find((r) => r.project_code === "IGIP")!;
    expect(igip.without_result).toBe(true);
    expect(igip.revenue).toBeNull();
    expect(igip.net_profit).toBeNull();
  });

  it("filters by status, search and only_with_result", async () => {
    const db = makeDb(seedBase());
    const only = await buildCommercialReport(db, ADMIN, { only_with_result: true });
    if (only.ok) expect(only.data.rows).toHaveLength(0);

    const active = await buildCommercialReport(db, ADMIN, { status: "ACTIVE" });
    if (active.ok) expect(active.data.rows.map((r) => r.project_code)).toEqual(["TONASA"]);

    const search = await buildCommercialReport(db, ADMIN, { search: "igip" });
    if (search.ok) expect(search.data.rows.map((r) => r.project_code)).toEqual(["IGIP"]);
  });

  it("exports raw numbers (not formatted strings) as CSV", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    const scenario = await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "initial",
      input: {},
    });
    if (!scenario.ok) throw new Error(scenario.error);

    const report = await buildCommercialReport(db, ADMIN, {});
    if (!report.ok) throw new Error(report.error);
    const csv = commercialReportToCsv(report.data);
    const lines = csv.trim().split("\r\n");

    expect(lines[0]).toBe(
      "Project Code,Project Name,Customer,Location,Status,Scenario,Vendor Price,Customer Price,Volume,Revenue,Total Cost,Gross Profit,PPN Difference,Net Profit,Net Profit/Liter,Profit %",
    );

    const tonasaLine = lines.find((l) => l.startsWith("TONASA"));
    expect(tonasaLine).toBeTruthy();
    expect(tonasaLine).toContain(String(Number(scenario.data.result.revenue)));
    expect(tonasaLine).not.toContain("Rp");
    // A project without a result exports an empty cell, not 0.
    const igipLine = lines.find((l) => l.startsWith("IGIP"))!;
    const cells = igipLine.split(",");
    expect(cells[9]).toBe("");
  });
});

describe("CSV helper", () => {
  it("escapes quotes, commas and newlines (RFC4180)", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(16396.39)).toBe("16396.39");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("writes a header even without rows", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B\r\n");
  });

  it("uses a semicolon delimiter when asked (Excel id-ID locale)", () => {
    expect(toCsv(["A", "B"], [[1, 2]], ";")).toBe("A;B\r\n1;2\r\n");
  });
});

describe("Vendor and scenario comparison reports", () => {
  it("builds a vendor comparison report with availability and notes", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, ADMIN, UUIDS.projectA, UUIDS.vendor1, "armada siap");
    await saveVendorPrice(db, ADMIN, UUIDS.projectA, UUIDS.vendor1, { base_price: 16396.39 });

    const report = await buildVendorComparisonReport(db, ADMIN, UUIDS.projectA);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.data.project_name).toContain("Tonasa");
    expect(report.data.comparison.vendors[0]?.name).toBe("BLASDU");

    const csv = vendorComparisonToCsv(report.data.project_name, report.data.comparison);
    expect(csv.split("\r\n")[0]).toContain("BLASDU");
    expect(csv).toContain("Availability");
    expect(csv).toContain("Notes");
  });

  it("builds a scenario comparison report from the last versions", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "initial",
      input: {},
    });
    await commitScenario(db, ADMIN, UUIDS.projectA, {
      name: "V2",
      scenario_type: "STANDARD",
      reason: "revisi",
      input: {},
      cost_rate_overrides: [{ description: "Harga Dasar", rate: 16000 }],
    });

    const report = await buildScenarioComparisonReport(db, ADMIN, UUIDS.projectA);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.data.columns.map((c) => c.name)).toEqual(["V1", "V2"]);
    expect(report.data.rows).toHaveLength(10);

    const csv = scenarioComparisonToCsv(report.data);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Metric,V1,V2,Δ (last vs first),Indicator");
    expect(lines).toContainEqual(expect.stringContaining("Net Profit"));
  });

  it("refuses a report for a project the actor cannot read", async () => {
    const db = makeDb(seedBase());
    const report = await buildVendorComparisonReport(db, actor("PIC", UUIDS.pic), UUIDS.projectB);
    expect(report.ok).toBe(false);
    if (!report.ok) expect(report.errorCode).toBe("NOT_FOUND");
  });
});
