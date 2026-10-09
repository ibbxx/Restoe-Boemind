# PHASE 3 — APPLICATION UI & USER WORKFLOW

**Status:** implemented, typechecked, tested and production-built.
**Rule respected:** no validated formula was touched. The UI only calls the
existing Formula Registry / Calculation Engine / Scenario Engine, and the
database keeps enforcing RLS, calculated-field protection and scenario
immutability.

```
USER → NEXT.JS UI → FORM VALIDATION → SERVER ACTION → CALCULATION ENGINE → SUPABASE → RESULT → UI
```

Frontend = interface. Server + database = source of truth.

---

## 0. How to run

```bash
cp .env.example .env.local          # fill NEXT_PUBLIC_SUPABASE_URL + ANON KEY
npm install
npm run dev                         # http://localhost:3000
```

Apply `supabase/tests/0000_local_auth_stub.sql` **only locally**; on a hosted
project apply `supabase/migrations/0001..0003` then `supabase/seed/0001..0003`,
and create the first `ADMIN` profile (see `.env.example`).

Verification commands (all green — see §E):

```bash
npm run typecheck && npm test
npm run crosscheck:report && npm run coverage:report && npm run validate:supabase
npm run build
```

---

## A. Application Routes

`app/` — Next.js 15 App Router. `(app)` is the authenticated route group
(shell + sidebar + header); everything inside requires a Supabase session.

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Redirect → `/dashboard` (or `/login`) |
| `/login` | `app/login/page.tsx` | Supabase Auth sign-in; shows the configuration error when env is missing |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Real KPIs, recent projects, status breakdown, latest scenario, latest commercial result |
| `/projects` | `app/(app)/projects/page.tsx` | List + search + status filter + sort + pagination |
| `/projects/new` | `app/(app)/projects/new/page.tsx` | Create form (validation before write) |
| `/projects/[id]` | `app/(app)/projects/[id]/page.tsx` | **Overview** — revenue…profit % from the stored calculation result |
| `/projects/[id]/vendors` | `.../vendors/page.tsx` | Vendor of project, price input, comparison matrix |
| `/projects/[id]/ahs` | `.../ahs/page.tsx` | Selling price, revenue, dynamic cost items, cost breakdown, result |
| `/projects/[id]/commercial` | `.../commercial/page.tsx` | INPUT → CALCULATION → COMMERCIAL RESULT hierarchy |
| `/projects/[id]/scenarios` | `.../scenarios/page.tsx` | Version list, create/clone, rename, comparison |
| `/projects/[id]/history` | `.../history/page.tsx` | Append-only audit trail (date, user, action, field, old, new, reason, impact) |
| `/reports` | `app/(app)/reports/page.tsx` | Commercial report + vendor comparison + scenario comparison, filterable |
| `/reports/export` | `app/reports/export/route.ts` | GET → CSV (`type=commercial|vendor|scenario`) with raw numbers |
| `/vendors` | `app/(app)/vendors/page.tsx` | Vendor master list + create |
| `/vendors/[id]` | `app/(app)/vendors/[id]/page.tsx` | Vendor detail, projects using it, stored prices, edit |
| `/settings` | `app/(app)/settings/page.tsx` | Session, environment, **role matrix**, Formula Registry status, Calculation Templates |
| `_not-found`, error | `app/not-found.tsx`, `app/error.tsx` | Explicit 404 / error boundary |
| `middleware.ts` | root | Session refresh + protected-route redirect (UX only) |

`next build` output: **17 routes**, middleware 65 kB, zero build errors.

---

## B. Component Structure (`/components`)

```
components/
├── ahs/          ahs-inputs-form.tsx (client, live recalc)  cost-items-panel.tsx  result-panel.tsx
├── auth/         login-form.tsx
├── commercial/   commercial-summary.tsx   (result block + input→calculation→result breakdown)
├── dashboard/    kpi-grid.tsx  dashboard-panels.tsx  (recent projects, status, latest scenario/result)
├── history/      history-table.tsx        (read-only by construction)
├── layout/       app-shell.tsx            (sidebar + header + nav + logout)
├── project/      project-header.tsx  project-table.tsx  project-form.tsx
├── scenario/     scenario-panels.tsx  scenario-form.tsx
├── shared/       primitives.tsx (Card/Badge/StatCard/Field/ReadOnlyValue)
│                 states.tsx (EmptyState/ErrorState/WarningState/TableSkeleton/CalculationErrorState)
│                 data-table.tsx (DataTable + Pagination)  forms.tsx (SubmitButton/AsyncActionButton/ConfirmDialog)
│                 nav.tsx (NavTabs + SidebarNav)
└── vendor/       vendor-tables.tsx  vendor-forms.tsx  vendor-master.tsx
```

Server components read through the services; only forms/interactive pieces are
`"use client"` and they receive plain props — no client component imports a
service or the database.

Supporting layers:

```
lib/
├── auth/        permissions.ts (role → capability, mirrors RLS)   session.ts (Supabase Auth actor)
├── data/        db.ts (Database port)  supabase-db.ts (PostgREST)  memory-db.ts (tests only)  context.ts
├── services/    projects  vendors  ahs  scenarios  commercial  dashboard  reports  history  references  access  pagination  result
├── actions/     projects  vendors  ahs  scenarios  auth  form  context     ("use server")
├── supabase/    server.ts  client.ts  middleware.ts
├── types/       domain.ts  history.ts
└── calculations/  ← UNCHANGED Phase 2/2.5 engine + Formula Registry
```

---

## C. Data Flow

```
USER INPUT (form)
   ↓  FormData → lib/actions/form.ts        (empty field ⇒ null, NEVER 0)
SERVER ACTION ("use server")
   ↓  requestContext()                       re-reads the Supabase session + builds the Database port
SERVICE (lib/services/*)
   ↓  validate*()                            field-level errors, no write yet
   ↓  access guard                           mirror of has_project_access()/can_write_project()
CALCULATION ENGINE (lib/calculations)
   ↓  calculateAhs / calculateVendor*        registry-driven, never throws, never NaN
SUPABASE (RLS + triggers)
   ↓  scenario_inputs + calculation_results + project_history
UI (server component)
   ↓  stored result rendered read-only       null ⇒ "—"
```

Concrete example — *vendor price revision*:

1. `/projects/[id]/vendors` → `saveVendorPriceAction` → `saveVendorPrice()`
2. engine `F001` computes PPN, `F002A/F002B` computes ALL IN (variant is a parameter)
3. `vendor_prices` upserted (one row per vendor+project) + `project_history` row with impact
4. `/projects/[id]/scenarios` → `commitScenarioAction` → `commitScenario()`
5. engine recomputes Revenue/Cost/Profit; `price_scenarios` (parent = previous),
   `scenario_inputs`, scenario-owned `ahs_cost_items`, one `calculation_results` row
6. `trg_lock_parent_scenario` locks V1 → V1 becomes read-only in the database
7. `/projects/[id]/commercial` and `/dashboard` read the stored result — never recompute

**Live recalculation (§14)** is `previewAhsAction` → `previewAhsCalculation()`:
validation → engine → result returned to the UI with **no write**. Persisting a
new number requires a new scenario, because `calculation_results` intentionally
has no UPDATE policy.

### Deliberate architectural decisions (all documented in code)

| Decision | Reason |
|---|---|
| The app never writes `ahs` calculated columns; results live in `calculation_results` | `trg_ahs_protect_calculated` requires the `app.calculation_engine` GUC, which PostgREST cannot set — so `calculation_results` is the only honest place for an engine result |
| Vendor price = the HPP “Harga Dasar” cost line (explicit override wins) | That is the mapping's own definition (`docs/EXCEL_MAPPING.md §C.1.2`, `lib/calculations/tax.ts`) |
| `calculation_results` write-once per scenario | Schema has no UPDATE policy: immutability by design |
| Sale-side vs cost-side PPN are separate scenario inputs | Excel has genuine 0 % “Non-PPN” blocks |
| Dashboard “Average Profit/Liter” = Σ net profit ÷ Σ volume | Aggregate of engine outputs (volume-weighted); null when volume is 0 |
| Comparison indicator polarity table | Derived from the engine's own arithmetic (F017/F019A/F019B); `volume` is flagged NEUTRAL instead of being interpreted |
| Scenario-input audit rows are written by `trg_log_scenario_inputs` | Avoids duplicate history rows |

---

## D. Role Matrix

Verified against PostgreSQL by `npm run validate:supabase`
(`supabase/tests/rls_role_matrix.sql` → **47 rows, 0 failures**) and asserted
row-by-row in `tests/permissions.test.ts`.

| Capability | ADMIN | PROCUREMENT | PIC | VIEWER | RLS policy |
|---|:--:|:--:|:--:|:--:|---|
| Read every project | ✅ | ✅ | — | — | `has_project_access()` |
| Read assigned project | ✅ | ✅ | ✅ (EDIT/VIEW) | ✅ (member) | `project_members` |
| Create project | ✅ | ✅ | ❌ | ❌ | `projects_insert using (can_write())` |
| Update project | ✅ | ✅ | ✅ own (EDIT) | ❌ | `projects_update using (can_write_project(id))` |
| Delete project | ✅ | ❌ | ❌ | ❌ | `projects_delete using (is_admin())` |
| Master data (vendors/products/customers/markets) | ✅ | ✅ | ❌ | ❌ | `*_write using (can_write())` |
| Project vendors, vendor prices, AHS, cost items, scenarios | ✅ | ✅ | ✅ own (EDIT) | ❌ | `*_write using (can_write_project())` |
| Formula Registry / Templates | ✅ | ❌ | ❌ | ❌ | `formula_registry_write using (is_admin())` |
| Delete scenario | ✅ | ❌ | ❌ | ❌ | `price_scenarios_delete using (is_admin())` |
| Edit calculated field | ❌ | ❌ | ❌ | ❌ | `trg_ahs_protect_calculated` |
| Edit/delete history | ❌ | ❌ | ❌ | ❌ | `trg_history_append_only` |
| Edit a locked scenario | ❌ | ❌ | ❌ | ❌ | `trg_scenario_immutable` + `trg_inputs_frozen` |

UI consequences: buttons are hidden/labelled for the current role **and** every
server action re-checks the actor; hiding a button is never the security
boundary. `getProjectDetail()` returns NOT_FOUND for a project the actor cannot
read, so project isolation is not leaked through error messages.

---

## E. Test Result

```
npm test                        →  10 files, 226 tests, ALL PASS
npm run typecheck               →  exit 0
npm run crosscheck:report       →  VALID 5738, PRECISION_VARIANCE 1025, FORMULA_MISMATCH 0, SKIPPED 132 (total 6895)
npm run coverage:report         →  coverage 96.1 % (466/485), variants 25, #REF! 18, mismatched blocks 0
npm run validate:supabase       →  47 RLS/protection rows, 0 failures
npm run build                   →  17 routes, exit 0
```

### Existing → new

| Suite | Tests | Status |
|---|---:|---|
| `tests/excel-crosscheck.test.ts` (Phase 2) | 39 | PASS (untouched) |
| `tests/engine-behaviour.test.ts` (Phase 2) | 28 | PASS (untouched) |
| **existing total** | **67** | **PASS — none removed or weakened** |
| `tests/permissions.test.ts` — role/access vs the 47 verified SQL rows | 54 | PASS |
| `tests/services-projects.test.ts` — create/read/update/isolation/audit | 18 | PASS |
| `tests/services-vendors.test.ts` — assign/price/comparison | 16 | PASS |
| `tests/services-ahs.test.ts` — inputs, cost items, live recalc | 17 | PASS |
| `tests/services-scenarios.test.ts` — V1 untouched / V2 created / comparable | 15 | PASS |
| `tests/services-dashboard-reports.test.ts` — KPI aggregates, CSV | 14 | PASS |
| `tests/components.test.tsx` — component + state rendering (jsdom) | 20 | PASS |
| `tests/calculation-integration.test.ts` — Excel → DB → service → engine → DB | 5 | PASS |
| **new total** | **159** | **PASS** |
| **grand total** | **226** | **ALL PASS** |

### Calculation integration (the “Excel Result = System Result” criterion)

Every extracted Excel block is replayed **through the application path**, not
just through the engine:

```
cases committed : 466/466
rows compared   : 1864   (Revenue, Total Cost, Gross Profit, Net Profit)
VALID           : 1394
PRECISION_VAR   : 470    (Excel cache rounding, reported not hidden)
FORMULA_MISMATCH: 0
```

Plus PPN keluaran/masukan, Selisih PPN, Profit/Liter and Profit % for the first
200 blocks (PPN variants F008A/B/C, F019A/B, F005B/F005C included), also with
zero mismatches. The test also asserts the app leaves `ahs` calculated columns
null and that `getScenarioDetail()` reproduces the stored snapshot.

### Verified UI/API behaviours (non-Excel)

- login required / protected route (`/dashboard` → `307 /login?next=…`),
  logout, unauthorized state, unconfigured-environment state
- project isolation per role (NOT_FOUND instead of data leakage)
- missing vendor price ⇒ structured `MISSING_VENDOR_PRICE`, nothing written
- missing cost components stay `null` and render “—” (never Rp 0)
- locked scenario cannot be renamed; scenario-owned cost items are read-only
- empty database ⇒ real empty states, never NaN and never a fake 0
- simulated database failure ⇒ `DATABASE_ERROR` state, no exception to the user
- CSV export contains raw numbers (no “Rp”, no thousand separators)

Runtime smoke test (production server): `/login` renders the configuration error
state when Supabase is absent; with an unreachable Supabase the app redirects
instead of crashing (`/dashboard` → 307, `/reports/export` → 307, no server
errors in the log).

---

## F. Remaining Issues (nothing hidden)

### 1. Formula-registry / engine leftovers from Phase 2 (unchanged, still open)

| Item | Count | Detail |
|---|---:|---|
| Skipped Excel blocks | **19** of 485 (coverage 96.1 %) | `PPN_INPUT_VARIANT` 8 (basis/rate not derivable from the block, per-liter often 0), `INCOMPLETE` 5 (missing `ppn_difference` / `gross_profit` / `net_profit_per_liter` / `total_cost` cells), `CUSTOM_FORMULA_BLOCK` 2 (`TONASA!V289`, `TONASA!V333` — literal total + literal cost/liter), `ANNOTATION_TITLE` 2, `NO_LABEL_COL` 1 (`INDORAMA!AY46`), `SALE_FORMULA_VARIANT` 1 (`SULTRA!BW94 = BK144*1.1`) |
| `#REF!` cells | **18** | 12 dependent formulas identified; none is silently treated as 0 |
| Divisors not fully explained | sale side **3** (`1.11 ×411`, `1.185 ×8`, `1.16 ×7`); vendor base side **9** (`1.11 ×719`, `1.16 ×38`, `1.185 ×21`, `1.188 ×21`, `1.213 ×8`, `1.163 ×7`, `1.21 ×5`, `1.165 ×2`, `1.18 ×1`) | Why each block picks its divisor is not documented in the workbook; the engine takes the divisor as an INPUT per block and never assumes 1.11 |
| Formerly unresolved formulas | `F019B` (68 workbook cells) and `F021B` (10 cells) | Resolved in Phase 2.5 with workbook evidence; `F021B` is return-on-investor-capital, **not** a display variant of `F021A` |
| Supabase **hosted** validation | not done | Everything is validated against local PostgreSQL + RLS. `auth.users`/JWT behaviour, PostgREST `numeric`-as-string handling and connection pooling have **not** been exercised on a hosted project |

### 2. New limitations introduced by Phase 3 (explicit)

| Item | Status | Detail |
|---|---|---|
| Hosted end-to-end browser run | **NOT DONE** | No Supabase project was available, so no real login + click-through was performed. Verification is: typecheck, 226 tests, `next build`, and an HTTP smoke test of the unconfigured/unreachable-Supabase paths |
| RLS/triggers in tests | **not emulated** | The in-memory adapter runs *after* the RLS gate. Permission tests assert the application mirror; the database guarantee stays with `npm run validate:supabase` |
| AHS working-set PPN | single rate | The `ahs` table has one `ppn_rate`; the sale/cost split and the remaining Excel variants (`F005B/F005C`, `F027B`, `F019B`, `F008A/C`) are carried by the **scenario snapshot**. The pre-scenario preview therefore uses the single rate |
| Preview vs persistence | by design | “Hitung ulang (preview)” never writes. A new number requires a new scenario version (`calculation_results` has no UPDATE policy) |
| `ahs.calculated_at` | unused | Calculated values are never written to `ahs`, so the column stays null; `calculation_results.computed_at` is authoritative |
| Project list search | code + name only | Customer/product names are not searchable without a SQL-side join; sorting is offered for code/name/status/period/updated_at (not for the derived volume) |
| Formula Registry editing UI | not built | Registry/Templates are read-only in `/settings`; the write policy is ADMIN-only and no editor was in Phase 3 scope |
| Dashboard “Total Volume” | latest scenario only | A project without a scenario contributes no volume; Σ over latest versions prevents double counting |
| Dependency audit | not reviewed | `npm audit` reports 11 advisories in the dependency tree (transitive). Not triaged in this phase |
| Next.js version | 15.5.27 | 15.1.6 was rejected because npm flagged CVE-2025-66478 |
| Component tests | 20 (jsdom) | Cover states, read-only values, tables, indicators and formatting. No browser E2E (Playwright) suite |

---

## G. Acceptance criteria checklist (Phase 3 §26)

```
Authentication      Login PASS · Logout PASS · Protected route PASS · Role enforcement PASS (47/47 SQL rows consistent)
Project             Create PASS · Read PASS · Update PASS · Isolation PASS
Vendor              Create PASS (master) · Assign PASS · Price PASS · Comparison PASS
Calculation         Excel Result = System Result  →  466/466 blocks, 0 FORMULA_MISMATCH
Scenario            V1 untouched PASS · V2 created PASS · V1 vs V2 comparable PASS
History             Who/When/What/Old/New/Reason/Impact PASS
Security            UI permission ↔ database RLS consistent PASS (tests/permissions.test.ts)
```
