// @vitest-environment jsdom

/**
 * COMPONENT TESTS (Phase 3 §27).
 *
 * The UI must render three states correctly and must never show NaN or a fake
 * zero for a missing value. These tests render the real components.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Badge, ReadOnlyValue, StatCard, ValuePair } from "../components/shared/primitives";
import {
  CalculationErrorState,
  EmptyState,
  ErrorState,
  InlineSpinner,
  TableSkeleton,
  WarningState,
} from "../components/shared/states";
import { DataTable, Pagination } from "../components/shared/data-table";
import { CommercialBreakdown, CommercialResultBlock } from "../components/commercial/commercial-summary";
import { KpiGrid } from "../components/dashboard/kpi-grid";
import { otherCost } from "../components/vendor/vendor-tables";
import { IndicatorChip } from "../components/scenario/scenario-panels";
import { ProjectForm } from "../components/project/project-form";
import { blankProjectForm } from "../lib/services/projects";
import { formatCurrency, formatPercentFromRatio, parseNumericInput, toNumber } from "../lib/format";
import type { DashboardKpis } from "../lib/services/dashboard";
import { buildPage } from "../lib/services/pagination";

const EMPTY_METRICS = {
  harga_jual_dpp: null,
  harga_jual_setelah_pajak: null,
  revenue: null,
  total_cost: null,
  cost_per_liter: null,
  ppn_output: null,
  ppn_input: null,
  ppn_difference: null,
  gross_profit: null,
  net_profit: null,
  net_profit_per_liter: null,
  profit_percentage: null,
};

const EMPTY_KPIS: DashboardKpis = {
  total_projects: 0,
  active_projects: 0,
  completed_projects: 0,
  total_volume: null,
  total_revenue: null,
  total_cost: null,
  total_profit: null,
  average_profit_per_liter: null,
  projects_with_result: 0,
  projects_without_result: 0,
};

describe("Empty / error / loading states", () => {
  it("renders the empty state with its message and action", () => {
    render(<EmptyState title="No vendor added yet." description="Tambahkan vendor." />);
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.getByText("No vendor added yet.")).toBeTruthy();
  });

  it("renders a structured error with its code", () => {
    render(<ErrorState title="Gagal" message="Permintaan database gagal." code="DATABASE_ERROR" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Gagal");
    expect(alert.textContent).toContain("DATABASE_ERROR");
  });

  it("renders a calculation error without a number", () => {
    render(
      <CalculationErrorState
        message="Volume wajib diisi (di Excel: sel kosong — bukan 0)."
        code="MISSING_INPUT"
        field="volume"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("MISSING_INPUT");
    expect(alert.textContent).toContain("volume");
    expect(alert.textContent).not.toContain("NaN");
  });

  it("shows loading indicators", () => {
    render(
      <>
        <InlineSpinner label="Calculating…" />
        <TableSkeleton rows={2} columns={2} />
      </>,
    );
    expect(screen.getByText("Calculating…")).toBeTruthy();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("shows warnings only when present", () => {
    const { container: empty } = render(<WarningState messages={[]} />);
    expect(empty.textContent).toBe("");
    render(<WarningState messages={["History tidak dapat ditulis."]} />);
    expect(screen.getByText("History tidak dapat ditulis.")).toBeTruthy();
  });
});

describe("Calculated values are read-only and never NaN", () => {
  it("marks a calculated value as read-only output", () => {
    render(<ReadOnlyValue label="Net Profit" value="Rp 24.000.000" />);
    const output = screen.getByRole("status");
    expect(output.getAttribute("aria-readonly")).toBe("true");
    expect(output.textContent).toContain("Rp 24.000.000");
    expect(output.textContent).toContain("auto");
  });

  it("renders a missing commercial result as '—', never 0 or NaN", () => {
    const { container } = render(<CommercialResultBlock metrics={EMPTY_METRICS} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(text).toContain("—");
    expect(text).not.toContain("Rp 0");
  });

  it("renders a real commercial result and the one-line answer", () => {
    render(
      <CommercialResultBlock
        metrics={{
          ...EMPTY_METRICS,
          revenue: 339_390_000,
          total_cost: 297_000_000,
          gross_profit: 42_390_000,
          ppn_difference: 18_000_000,
          net_profit: 24_390_000,
          net_profit_per_liter: 1626,
          profit_percentage: 0.08212,
        }}
      />,
    );
    // Shown twice on purpose: in the read-only metric and in the summary block.
    expect(screen.getAllByText("Rp 24.390.000").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("8,21%")).toBeTruthy();
    expect(
      screen.getByText("Dengan harga/vendor ini project menghasilkan"),
    ).toBeTruthy();
  });

  it("shows the input → calculation → result hierarchy", () => {
    render(<CommercialBreakdown metrics={{ ...EMPTY_METRICS, revenue: 1000 }} />);
    expect(screen.getByText("1 · Harga")).toBeTruthy();
    expect(screen.getByText("2 · Pajak")).toBeTruthy();
    expect(screen.getByText("3 · Hasil")).toBeTruthy();
    expect(screen.getByText("Revenue (F006)")).toBeTruthy();
  });

  it("keeps the same '—' rule inside the KPI grid", () => {
    const { container } = render(<KpiGrid kpis={EMPTY_KPIS} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(text).toContain("—");
    expect(text).toContain("Total Project");
    expect(text).toContain("Average Profit/Liter");
  });

  it("renders badges and value pairs", () => {
    render(
      <>
        <Badge tone="positive">ACTIVE</Badge>
        <ValuePair label="Volume" value="15.000 L" />
      </>,
    );
    expect(screen.getByText("ACTIVE")).toBeTruthy();
    expect(screen.getByText("15.000 L")).toBeTruthy();
  });

  it("renders a stat card as a link when href is given", () => {
    render(<StatCard label="Projects" value="2" href="/projects" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/projects");
  });
});

describe("Data table", () => {
  interface Row {
    id: string;
    name: string;
  }
  const rows: Row[] = [
    { id: "1", name: "Tonasa" },
    { id: "2", name: "IGIP" },
  ];
  const columns = [
    { key: "name", header: "Project", cell: (row: Row) => row.name },
    { key: "id", header: "ID", cell: (row: Row) => row.id },
  ];

  it("renders rows and links the first column", () => {
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/projects/${r.id}`} />,
    );
    expect(screen.getByText("Tonasa")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("/projects/1");
  });

  it("renders the table empty message when there are no rows", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyMessage="Belum ada data." />);
    expect(screen.getByTestId("table-empty").textContent).toContain("Belum ada data.");
  });

  it("renders pagination links with the preserved filters", () => {
    render(
      <Pagination
        page={buildPage(rows, 40, 2, 25)}
        basePath="/projects"
        params={{ q: "to", status: "ACTIVE", sort: "name", dir: "asc", size: "25" }}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe(
      "/projects?q=to&status=ACTIVE&sort=name&dir=asc&size=25&page=1",
    );
    expect(screen.getByText(/Menampilkan/)).toBeTruthy();
  });
});

describe("Vendor and scenario indicators", () => {
  it("aggregates other-cost components and reports null when there are none", () => {
    expect(
      otherCost({
        id: "1",
        project_id: "p",
        vendor_id: "v",
        scenario_id: null,
        base_price: 100,
        ppn_rate: 0.11,
        ppn_amount: 11,
        pbbkb_amount: 5,
        pph_amount: null,
        oat_amount: 2,
        ppn_oat_amount: null,
        bph_amount: null,
        extra_component_label: null,
        all_in_amount: 118,
        all_in_formula_id: "F002B",
        ppn_is_formula: true,
        note: null,
        updated_at: "",
      }),
    ).toBe(7);

    expect(
      otherCost({
        id: "1",
        project_id: "p",
        vendor_id: "v",
        scenario_id: null,
        base_price: 100,
        ppn_rate: 0.11,
        ppn_amount: 11,
        pbbkb_amount: null,
        pph_amount: null,
        oat_amount: null,
        ppn_oat_amount: null,
        bph_amount: null,
        extra_component_label: null,
        all_in_amount: 111,
        all_in_formula_id: "F002A",
        ppn_is_formula: true,
        note: null,
        updated_at: "",
      }),
    ).toBeNull();
  });

  it("renders the comparison indicators", () => {
    render(
      <>
        <IndicatorChip indicator="IMPROVEMENT" />
        <IndicatorChip indicator="DECLINE" />
        <IndicatorChip indicator="NO_CHANGE" />
        <IndicatorChip indicator="NEUTRAL" />
      </>,
    );
    expect(screen.getByText("▲ Improvement")).toBeTruthy();
    expect(screen.getByText("▼ Decline")).toBeTruthy();
    expect(screen.getByText("= No change")).toBeTruthy();
    expect(screen.getByText("— tidak diinterpretasi")).toBeTruthy();
  });
});

describe("Project form: project context is entered manually", () => {
  it("renders Customer/Product/Market/PIC as plain free-text inputs", () => {
    render(<ProjectForm mode="create" initial={blankProjectForm()} />);

    for (const name of ["customer", "product", "market", "pic"]) {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
      expect(input, name).toBeTruthy();
      expect(input!.tagName).toBe("INPUT");
      expect(input!.getAttribute("list")).toBeNull();
    }

    // Only the Status enum stays a dropdown.
    const selects = document.querySelectorAll("select");
    expect(selects).toHaveLength(1);
    expect(selects[0]?.getAttribute("name")).toBe("status");

    expect(document.querySelector("datalist")).toBeNull();
  });
});

describe("Formatting rules that the components rely on", () => {
  it("renders missing numbers as '—'", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
    expect(formatPercentFromRatio(null)).toBe("—");
  });

  it("formats engine outputs for id-ID", () => {
    expect(formatCurrency(16396.39)).toBe("Rp 16.396");
    expect(formatPercentFromRatio(0.0821)).toBe("8,21%");
  });

  it("treats an empty form field as null, not 0 (data kosong ≠ Rp0)", () => {
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("   ")).toBeNull();
    expect(parseNumericInput("0")).toBe(0);
    expect(parseNumericInput("16.396,39")).toBeCloseTo(16396.39, 6);
    expect(parseNumericInput("abb")).toBeNull();
    expect(toNumber("16396.39")).toBeCloseTo(16396.39, 6);
    expect(toNumber(null)).toBeNull();
    expect(toNumber("")).toBeNull();
  });
});
