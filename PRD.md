# PRD FINAL — SISTEM DIGITAL ANALISIS HARGA & PROCUREMENT PROJECT

**Versi:** 1.0 Final  
**Status:** Final / Development Blueprint  
**Basis utama:** Excel `ANALISIS HARGA SATUAN (2026).xlsx`  
**Tujuan:** Digitalisasi Excel menjadi aplikasi web terstruktur  
**Frontend:** Next.js + React + TypeScript  
**Backend/Application Layer:** Next.js Server Actions / Route Handlers  
**Database:** Supabase PostgreSQL  
**Authentication:** Supabase Auth  
**Deployment:** Vercel  

---

# 1. Ringkasan Produk

Sistem ini merupakan **digitalisasi dari sistem Excel existing** yang saat ini digunakan untuk menyimpan data project, vendor, harga, AHS, biaya, revenue, profit, dan berbagai analisis harga.

Excel existing menjadi **baseline utama logika perhitungan**. Sistem tidak bertujuan mengganti metode perhitungan perusahaan, melainkan memindahkan struktur input, formula, dependency, dan hasil Excel ke dalam aplikasi web.

Prinsip utamanya:

```text
EXCEL EXISTING
      ↓
Excel Mapping
      ↓
Database Structure
      ↓
Calculation Engine
      ↓
NEXT.JS APPLICATION
      ↓
SUPABASE
      ↓
AUTOMATIC CALCULATION
      ↓
ANALYSIS & REPORT
```

Sistem diharapkan membuat user tidak lagi bergantung pada pengisian dan perhitungan manual di workbook besar.

---

# 2. Problem Statement

Sistem existing berbasis Excel memiliki beberapa karakteristik:

- data project tersebar di banyak sheet;
- data vendor bercampur dengan perhitungan;
- banyak calculation block;
- formula bergantung pada cell lain;
- beberapa project berada dalam satu workbook;
- perubahan harga dapat mengubah hasil perhitungan;
- histori perubahan sulit dilacak;
- perhitungan membutuhkan pengisian formula Excel;
- sulit membuat perbandingan antar-project/scenario secara konsisten.

Workbook juga bukan sekadar satu tabel sederhana. Terdapat sheet seperti `TONASA`, `Eval Vendor TL`, `Perhitungan INU`, `AHAS IGIP`, `INDORAMA`, `Rekap AHAS`, dan sheet regional/market dengan berbagai blok perhitungan. Pasted text

---

# 3. Product Goal

Tujuan utama:

> **Mengubah sistem analisis harga yang saat ini berada di Excel menjadi aplikasi web berbasis project dengan database terstruktur, calculation engine otomatis, vendor evaluation, AHS, commercial analysis, scenario management, dan historical data.**

Target sistem:

1. Memindahkan struktur Excel ke database.
2. Memindahkan input Excel menjadi form aplikasi.
3. Memindahkan formula Excel menjadi calculation engine.
4. Menghasilkan kalkulasi otomatis.
5. Memisahkan data berdasarkan project.
6. Menyimpan vendor dan harga.
7. Menyimpan AHS dan cost items.
8. Menyimpan scenario perubahan harga.
9. Menyimpan histori.
10. Menampilkan hasil commercial analysis secara real-time.
11. Memungkinkan validasi hasil aplikasi terhadap Excel.

---

# 4. Non-Goals

Sistem **tidak bertujuan** untuk:

- membuat SOP procurement baru;
- mengganti prosedur perusahaan;
- membuat workflow procurement baru;
- mengganti formula existing tanpa validasi;
- membuat sistem ERP penuh;
- menggantikan Excel secara langsung pada hari pertama;
- hanya membuat dashboard tanpa calculation engine.

Fokusnya adalah:

> **EXCEL EXISTING → DIGITAL SYSTEM**

---

# 5. Technology Stack

## 5.1 Frontend

**Next.js + React + TypeScript**

Digunakan untuk:

- dashboard;
- project management;
- vendor evaluation;
- AHS;
- scenario;
- history;
- report;
- form input;
- calculation result.

Next.js menjadi framework utama, sedangkan React digunakan sebagai UI layer.

---

## 5.2 Backend

Menggunakan kemampuan backend dari Next.js:

```text
Server Actions
Route Handlers
Server-side business logic
Validation
Calculation Engine
```

Tidak perlu membuat backend Express terpisah untuk MVP kecuali kebutuhan sistem nantinya berkembang.

---

## 5.3 Database

**Supabase PostgreSQL**

Digunakan untuk:

- project;
- vendor;
- vendor price;
- AHS;
- cost item;
- scenario;
- calculation result;
- history;
- formula registry;
- user/access control.

---

## 5.4 Authentication

**Supabase Auth**

Digunakan untuk:

- login;
- user identity;
- session;
- role/access control.

Contoh role:

```text
ADMIN
PROCUREMENT
PIC
VIEWER
```

Role dapat dikembangkan kemudian sesuai kebutuhan aktual perusahaan.

---

## 5.5 Deployment

**Vercel**

```text
GitHub
   ↓
Vercel
   ↓
Next.js Application
   ↓
Supabase
```

Setiap perubahan code dapat melalui Git-based deployment.

---

# 6. Product Architecture

```text
                    USER
                     │
                     ▼
              NEXT.JS / REACT
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   PROJECT UI   VENDOR UI     AHS UI
        │            │            │
        └────────────┼────────────┘
                     ▼
             NEXT.JS BACKEND
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
   VALIDATION   CALCULATION     HISTORY
                 ENGINE
       │             │             │
       └─────────────┼─────────────┘
                     ▼
              SUPABASE POSTGRES
```

---

# 7. Struktur Modul Sistem

```text
SYSTEM
│
├── Dashboard
│
├── Projects
│   ├── Project Overview
│   ├── Vendor Evaluation
│   ├── AHS
│   ├── Commercial Analysis
│   ├── Scenarios
│   └── History
│
├── Vendors
│
├── Price Database
│
├── Formula Registry
│
├── Reports
│
└── Settings
```

---

# 8. Dashboard

Dashboard menjadi halaman awal setelah login.

## KPI utama

```text
Total Project
Active Project
Completed Project
Total Volume
Total Revenue
Total Cost
Total Profit
Average Profit/Liter
```

## Project Table

| Project | Customer | Volume | Vendor | Selling Price | Cost | Profit | Profit % | Status |
|---|---|---:|---|---:|---:|---:|---:|---|

Dashboard hanya menampilkan hasil dari database dan calculation engine.

---

# 9. Project Management

Project menjadi **container utama sistem**.

Contoh:

```text
TONASA
IGIP
INDORAMA
WIKA
PAR
```

Setiap project mempunyai data sendiri.

## Project Information

Minimal:

```text
Project ID
Project Code
Project Name
Customer
Product
Location
Volume
Period
PIC
Status
Notes
Created At
Updated At
```

Struktur ini mempertahankan konsep project-based yang sebelumnya terdapat dalam rancangan digitalisasi Excel. Pasted text

---

# 10. Vendor Master

Vendor disimpan sebagai master data.

## Field

```text
Vendor ID
Vendor Name
Contact
Armada
Stock
Permit
Address
Notes
Status
```

Vendor dapat digunakan di banyak project.

Contoh:

```text
BLASDU
MEGA UTAMA
PT BEB
```

---

# 11. Vendor Price

Harga vendor harus dipisahkan dari master vendor.

## Field

```text
Project ID
Vendor ID
Base Price
PPN
PBBKB
PPH
OAT
PPN OAT
BPH
All In
Note
Scenario ID
Created At
```

Contoh:

| Component | Blasdu | Mega Utama | PT BEB |
|---|---:|---:|---:|
| Harga Dasar | 14.500 | 16.396,39 | - |
| PPN | 11% | 11% | - |
| PBBKB | 0 | 0 | - |
| PPH | 0 | 0 | - |
| OAT | 0 | 0 | - |
| PPN OAT | 11% | 11% | - |
| BPH | 0 | - | - |
| ALL IN | Auto | Auto | - |

**Data kosong tidak boleh otomatis dianggap Rp0.**

---

# 12. Vendor Evaluation

Sistem harus dapat membandingkan beberapa vendor dalam satu project.

```text
Project TONASA

Vendor A
Vendor B
Vendor C
Vendor D
```

Perbandingan minimal:

```text
Base Price
Tax
Cost Component
All In
Availability
Notes
```

Tujuannya adalah memindahkan fungsi evaluasi harga vendor yang saat ini terdapat di Excel menjadi tampilan digital.

---

# 13. Calculation Engine

Calculation Engine merupakan **core system**.

Formula tidak boleh tersebar di berbagai component frontend.

Struktur:

```text
INPUT
 ↓
VALIDATION
 ↓
CALCULATION ENGINE
 ↓
RESULT
 ↓
DATABASE
 ↓
UI
```

Contoh:

```typescript
calculateVendorPPN()
calculateVendorAllIn()
calculateRevenue()
calculateTotalCost()
calculateGrossProfit()
calculatePPNDifference()
calculateNetProfit()
calculateNetProfitPerLiter()
calculateProfitPercentage()
```

Formula harus mengikuti Excel existing.

---

# 14. Vendor Calculation

## PPN

Baseline Excel:

```text
PPN = Base Price × 11%
```

Contoh:

```excel
=H11*11%
```

---

## All In

Baseline Excel:

```excel
=SUM(H11:H17)
```

Secara konseptual:

```text
ALL IN =
Harga Dasar
+ PPN
+ PBBKB
+ PPH
+ OAT
+ PPN OAT
+ BPH
```

Sistem harus mempertahankan formula sesuai block Excel masing-masing, bukan memaksakan satu formula universal apabila terdapat variasi antar-block. Pasted text

---

# 15. AHS Module

AHS merupakan salah satu core module.

Struktur:

```text
AHS
│
├── Selling Price
├── Revenue
├── HPP
├── Tax
├── Cost of Fund
├── Operational Cost
├── Asset Cost
├── Coordination
├── Relation
├── Risk
└── Other Cost
```

Nama dan komponen tetap mengacu pada workbook existing.

---

# 16. AHS Input

Input utama:

```text
Volume
Customer Selling Price
Vendor
Vendor Price
Tax Parameters
Cost Items
```

Calculated fields:

```text
Revenue
Total Cost
Gross Profit
PPN Difference
Net Profit
Net Profit/Liter
Profit %
```

Calculated fields **read-only**.

---

# 17. Revenue Calculation

Baseline Excel:

```text
Revenue = Selling Price × Volume
```

Contoh Excel:

```excel
=Q11*O12
```

Sistem menyimpan:

```text
Selling Price
Volume
Revenue
```

Selling price dan revenue bukan input yang sama.

---

# 18. Harga Jual

Harga customer merupakan field independen dari harga vendor.

```text
CUSTOMER PRICE
       ↓
    REVENUE
```

Sedangkan:

```text
VENDOR PRICE
       ↓
      HPP
       ↓
     COST
```

Perubahan harga vendor **tidak otomatis mengubah harga customer**.

---

# 19. Cost Engine

Cost item harus disimpan sebagai data dinamis.

Contoh:

```text
HPP
OAT
PBBKB
PPH INU
BPH Migas
PPN
PPH Penjualan
Investor
Bunga Bank
Diskonto SKBDN
Biaya Operasional
Bonus Marketing
Tangki Solar
Ormas/Lainnya
Biaya Proyek
Biaya Investor
Biaya Partner
Biaya Keagenan
```

Struktur cost:

| Field | Description |
|---|---|
| Cost ID | ID biaya |
| AHS ID | Parent AHS |
| Category | Kategori |
| Description | Nama biaya |
| Rate | Rate |
| Quantity | Quantity |
| Total | Hasil |
| Formula | Formula |
| Scenario ID | Scenario |

---

# 20. Total Cost

Baseline Excel:

```excel
=SUM(P17:P34)
```

Sistem:

```text
Total Cost
=
SUM(All Cost Items)
```

Cost tidak disimpan hanya sebagai satu angka.

Sistem harus dapat mengetahui:

```text
Total Cost
   ├── HPP
   ├── PBBKB
   ├── PPH
   ├── Operational
   ├── Investor
   └── Other
```

---

# 21. Cost per Liter

Setiap cost item dapat memiliki:

```text
Rate / Liter
×
Volume
=
Total Cost
```

Sistem membedakan:

```text
Cost per Liter
```

dengan:

```text
Total Cost
```

---

# 22. Gross Profit

Baseline Excel:

```excel
=Q10-Q15
```

Sistem:

```text
Gross Profit
=
Revenue - Total Cost
```

---

# 23. PPN Difference

Baseline Excel:

```excel
=P14-P22
```

Sistem:

```text
PPN Difference
=
PPN Output - PPN Input
```

Field:

```text
PPN Output
PPN Input
PPN Difference
```

---

# 24. Net Profit

Baseline:

```excel
=Q35-Q36
```

Sistem:

```text
Net Profit
=
Gross Profit - PPN Difference
```

---

# 25. Net Profit per Liter

Baseline:

```excel
=Q37/O12
```

Sistem:

```text
Net Profit/Liter
=
Net Profit / Volume
```

---

# 26. Profit Percentage

**Penting:** sistem mengikuti formula existing, bukan formula margin standar yang dibuat developer.

Baseline:

```excel
=Q37/Q15
```

Sehingga:

```text
Profit %
=
Net Profit / Total Cost
```

Formula ini menjadi source of truth selama mapping Excel belum menetapkan perubahan. Pasted text

---

# 27. Formula Registry

Semua formula harus mempunyai registry.

| ID | Formula | Source |
|---|---|---|
| F001 | Base Price × 11% | Excel |
| F002 | SUM Vendor Components | Excel |
| F003 | Selling Price × Volume | Excel |
| F004 | SUM Cost Items | Excel |
| F005 | Revenue − Cost | Excel |
| F006 | Output PPN − Input PPN | Excel |
| F007 | Gross Profit − PPN Difference | Excel |
| F008 | Net Profit ÷ Volume | Excel |
| F009 | Net Profit ÷ Total Cost | Excel |

Tambahkan metadata:

```text
Formula ID
Formula Name
Formula Expression
Source Sheet
Source Cell
Version
Description
Active
```

Ini akan menjadi **single source of truth calculation engine**.

---

# 28. Excel Mapping Layer

Karena workbook memiliki banyak calculation block, sistem membutuhkan mapping document.

Struktur:

| Sheet | Cell | Type | Field | Formula | Dependency | Output |
|---|---|---|---|---|---|---|
| Eval Vendor TL | H11 | Input | Vendor Base Price | - | - | Base Price |
| Eval Vendor TL | H12 | Formula | Vendor PPN | H11×11% | H11 | PPN |
| Eval Vendor TL | H18 | Formula | Vendor All In | SUM | H11:H17 | All In |
| Eval Vendor TL | Q35 | Formula | Gross Profit | Q10-Q15 | Revenue, Cost | Gross Profit |

Mapping harus dilakukan sebelum implementasi seluruh calculation engine.

---

# 29. Multiple Calculation Template

Karena Excel memiliki banyak block dan tidak seluruh block menggunakan formula identik, sistem tidak boleh memaksakan satu template secara buta.

Konsep:

```text
Calculation Template
│
├── Template A
├── Template B
├── Template C
└── Template D
```

Setiap template memiliki:

```text
Input
Formula
Dependency
Output
```

Dengan demikian formula asli Excel tetap dapat dipertahankan.

---

# 30. Scenario Management

Setiap perubahan commercial input dapat menjadi scenario baru.

Contoh:

```text
TONASA

V1
Vendor = 16.396
Customer = 21.800

V2
Vendor = 16.000
Customer = 21.800

V3
Vendor = 16.000
Customer = 21.500
```

Scenario menyimpan:

```text
Scenario ID
Project ID
Parent Scenario
Scenario Name
Scenario Type
Reason
Vendor Price
Customer Price
Volume
Cost Assumption
Calculation Result
Created By
Created At
```

---

# 31. Scenario Tidak Menghapus Data Lama

Tidak boleh:

```text
V1 → UPDATE → menjadi V2
```

Tetapi:

```text
V1
 ↓
V2
 ↓
V3
```

V1 tetap immutable/read-only.

Dengan demikian user dapat melihat:

```text
Old Price
New Price
Price Difference
Cost Difference
Profit Difference
```

---

# 32. Scenario Comparison

Sistem menyediakan perbandingan:

| Metric | V1 | V2 | Δ |
|---|---:|---:|---:|
| Vendor Price | | | |
| Customer Price | | | |
| Volume | | | |
| Revenue | | | |
| Total Cost | | | |
| Gross Profit | | | |
| PPN Difference | | | |
| Net Profit | | | |
| Profit/Liter | | | |
| Profit % | | | |

---

# 33. Price Change Logic

## Vendor Price turun

```text
Vendor Price ↓
      ↓
HPP ↓
      ↓
Total Cost ↓
      ↓
Profit ↑
```

Customer Price **tetap**.

---

## Vendor Price naik

```text
Vendor Price ↑
      ↓
HPP ↑
      ↓
Total Cost ↑
      ↓
Profit ↓
```

Sistem dapat memberikan **warning/review**, tetapi tidak otomatis mengubah customer price.

---

## Customer Price turun

```text
Customer Price ↓
      ↓
Revenue ↓
      ↓
Profit ↓
```

---

# 34. History

History harus dapat menjawab:

```text
WHAT changed?
WHO changed it?
WHEN?
WHY?
WHAT was the old value?
WHAT is the new value?
WHAT was the impact?
```

Contoh:

```text
TONASA
Scenario V2

Vendor Price
16.396 → 16.000

Total Cost
297M → 291M

Net Profit
24M → 30M
```

---

# 35. Database Schema Supabase

Struktur minimum:

```text
users
profiles

projects

vendors
project_vendors
vendor_prices

ahs
ahs_cost_items

price_scenarios
scenario_inputs
calculation_results

formula_registry
calculation_templates

project_history
```

Relasi utama:

```text
projects
   │
   ├── project_vendors
   │       └── vendors
   │
   ├── vendor_prices
   │
   ├── ahs
   │       └── ahs_cost_items
   │
   ├── price_scenarios
   │       ├── scenario_inputs
   │       └── calculation_results
   │
   └── project_history
```

---

# 36. Supabase Security

Database harus menggunakan **Row Level Security (RLS)**.

Prinsip:

```text
User
 ↓
Supabase Auth
 ↓
Role
 ↓
Permission
 ↓
Project Data
```

Minimal:

- authenticated user dapat membaca data sesuai permission;
- hanya role tertentu yang dapat membuat/mengubah project;
- calculated result tidak dapat diedit langsung;
- history tidak dapat dihapus sembarangan;
- scenario lama bersifat read-only.

---

# 37. Next.js Application Structure

Struktur yang disarankan:

```text
/app
│
├── dashboard/
│
├── projects/
│   └── [id]/
│       ├── page.tsx
│       ├── vendors/
│       ├── ahs/
│       ├── scenarios/
│       └── history/
│
├── vendors/
│
├── reports/
│
└── settings/

/components
├── dashboard/
├── project/
├── vendor/
├── ahs/
├── scenario/
└── shared/

/lib
├── supabase/
├── calculations/
├── validation/
├── formulas/
└── utils/
```

---

# 38. Calculation Engine Structure

```text
/lib/calculations

vendor.ts
ahs.ts
revenue.ts
cost.ts
profit.ts
tax.ts
scenario.ts
cross-check.ts
```

Contoh:

```typescript
calculateVendorPPN()
calculateVendorAllIn()

calculateRevenue()
calculateTotalCost()
calculateGrossProfit()
calculatePPNDifference()
calculateNetProfit()
calculateNetProfitPerLiter()
calculateProfitPercentage()

calculateScenario()
compareScenario()
```

Semua fungsi harus mempunyai test terhadap hasil Excel.

---

# 39. Input vs Calculated Field

### Input

```text
Volume
Vendor
Vendor Price
Customer Price
Tax Rate
Cost Rate
Cost Quantity
Notes
```

### Calculated

```text
PPN
All In
Revenue
Total Cost
Gross Profit
PPN Difference
Net Profit
Net Profit/Liter
Profit %
```

Calculated field:

> **Tidak boleh diedit manual oleh user.**

---

# 40. Real-Time Recalculation

Ketika input berubah:

```text
User changes Vendor Price
        ↓
Validation
        ↓
Calculation Engine
        ↓
New Result
        ↓
UI Update
```

Contoh:

```text
Vendor Price
16.396 → 16.000

Total Cost
297M → recalculated

Net Profit
24M → recalculated

Profit/Liter
1.639 → recalculated
```

---

# 41. Cross Check

Sistem harus memiliki mekanisme validasi terhadap formula Excel.

```text
Excel Input
     ↓
Expected Result

System Input
     ↓
Actual Result

Expected
   =
Actual
```

Status:

```text
VALID
WARNING
ERROR
```

Cross-check juga diperlukan karena workbook mempunyai formula yang saling mereferensikan antar-cell. Pasted text

---

# 42. Report

## Project Commercial Report

Menampilkan:

```text
Project
Customer
Vendor
Vendor Price
Customer Price
Volume
Revenue
Total Cost
Gross Profit
PPN Difference
Net Profit
Profit/Liter
Profit %
```

## Vendor Comparison

```text
Vendor A
Vendor B
Vendor C
```

## Scenario Comparison

```text
V1 vs V2
V2 vs V3
```

---

# 43. Project Detail UI

Contoh:

```text
┌──────────────────────────────────────┐
│ TONASA                               │
│ Customer: PT Tonasa                 │
│ Location: Medan                     │
│ Volume: 15,000 L                    │
└──────────────────────────────────────┘

COMMERCIAL RESULT

Revenue             Rp xxx
Total Cost          Rp xxx
Gross Profit        Rp xxx
PPN Difference      Rp xxx
Net Profit          Rp xxx
Net Profit/L        Rp xxx
Profit %            xx%

──────────────────────────────────────

VENDOR EVALUATION

Blasdu          Rp xx.xxx
Mega Utama      Rp xx.xxx
PT BEB          -

──────────────────────────────────────

SCENARIO

V1  Initial
V2  Vendor Revision
V3  Customer Revision
```

---

# 44. API / Server Action Concept

Contoh operation:

```text
createProject()
updateProject()

createVendor()
addVendorToProject()
createVendorPrice()

createAHS()
addCostItem()

createScenario()
calculateScenario()
compareScenario()

getProjectHistory()
generateReport()
```

Perhitungan sensitif sebaiknya dijalankan pada server/application layer, bukan dipercayakan hanya kepada frontend.

---

# 45. Data Flow

Contoh lengkap:

```text
USER INPUT
   │
   ▼
Next.js Form
   │
   ▼
Validation
   │
   ▼
Server Action
   │
   ├──────────────► Supabase
   │
   ▼
Calculation Engine
   │
   ▼
Calculation Result
   │
   ├──────────────► Supabase
   │
   ▼
Next.js UI
   │
   ▼
Commercial Result
```

---

# 46. Source of Truth

Urutan source of truth:

```text
1. Existing Excel
        ↓
2. Excel Mapping Document
        ↓
3. Formula Registry
        ↓
4. Calculation Engine
        ↓
5. Database Result
        ↓
6. UI
```

**UI bukan source of truth.**

Database menyimpan data dan result, sedangkan Calculation Engine bertanggung jawab menghasilkan kalkulasi berdasarkan formula yang telah dimapping.

---

# 47. Development Phase

## Phase 1 — Excel Mapping

Inventarisasi:

```text
Sheet
 ↓
Block
 ↓
Cell
 ↓
Input / Formula
 ↓
Dependency
 ↓
Business Meaning
 ↓
Database Field
```

Ini menjadi blueprint teknis.

---

## Phase 2 — Supabase

Build:

```text
Database
Relations
RLS
Auth
```

---

## Phase 3 — Calculation Engine

Implement:

```text
Vendor
Tax
AHS
Cost
Revenue
Profit
Scenario
Cross Check
```

---

## Phase 4 — Core UI

Build:

```text
Login
Dashboard
Projects
Project Detail
Vendor
AHS
```

---

## Phase 5 — Scenario & History

Build:

```text
Scenario Creation
Versioning
Comparison
History
Audit
```

---

## Phase 6 — Reports

Build:

```text
Commercial Report
Vendor Comparison
Scenario Comparison
```

---

## Phase 7 — Validation

Gunakan data asli Excel:

```text
Excel Input
      ↓
Expected

System Input
      ↓
Actual

Expected = Actual
```

Semua calculation block yang dipindahkan harus diuji.

---

## Phase 8 — Deployment

```text
GitHub
   ↓
Vercel
   ↓
Production
   ↓
Supabase Production DB
```

---

# 48. Acceptance Criteria

## A. Project

- User dapat membuat project.
- Project memiliki data sendiri.
- Project tidak tercampur dengan project lain.

## B. Vendor

- User dapat menambahkan vendor.
- User dapat memasukkan harga vendor.
- Sistem dapat membandingkan vendor.

## C. Calculation

Input:

```text
Vendor Price
Customer Price
Volume
Cost
Tax
```

Output:

```text
Revenue
Total Cost
Gross Profit
PPN Difference
Net Profit
Net Profit/Liter
Profit %
```

---

## D. Formula

Untuk input yang sama:

```text
Excel Result
     =
System Result
```

---

## E. Dynamic Calculation

Jika:

```text
Vendor Price berubah
```

maka sistem otomatis menghitung ulang:

```text
Cost
Gross Profit
Net Profit
Profit/Liter
Profit %
```

---

## F. Scenario

Perubahan input tidak menghapus scenario lama.

```text
V1 tetap
V2 baru
```

---

## G. History

Sistem mampu mengetahui:

```text
Who
When
What
Old Value
New Value
Reason
Impact
```

---

## H. Security

- User wajib login.
- Data project terlindungi RLS.
- Calculated fields tidak dapat diedit langsung.
- History/scenario lama tidak dapat diubah sembarangan.

---

# 49. Definition of Done

Sistem dianggap mencapai MVP apabila:

```text
✓ Login
✓ Dashboard
✓ Project Management
✓ Vendor Master
✓ Vendor Evaluation
✓ Vendor Price
✓ AHS
✓ Dynamic Cost Items
✓ Calculation Engine
✓ Revenue
✓ Cost
✓ Gross Profit
✓ PPN Difference
✓ Net Profit
✓ Profit/Liter
✓ Profit %
✓ Scenario
✓ History
✓ Supabase Database
✓ Formula Registry
✓ Excel vs System Validation
✓ Vercel Deployment
```

---

# 50. Final Product Definition

> **Sistem Digital Analisis Harga & Procurement Project adalah aplikasi web berbasis Next.js/React, Supabase PostgreSQL, dan Vercel yang mendigitalisasi struktur serta formula existing Excel `ANALISIS HARGA SATUAN (2026).xlsx` menjadi sistem berbasis project. Sistem menyediakan pengelolaan project, vendor, harga vendor, AHS, cost item, commercial calculation, scenario, history, dan reporting dengan calculation engine yang mempertahankan formula Excel sebagai source of truth.**

Arsitektur final:

```text
                         ┌──────────────┐
                         │     USER     │
                         └──────┬───────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │   NEXT.JS + REACT   │
                    │    TYPESCRIPT UI    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   NEXT.JS SERVER    │
                    │ Server Actions/API  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐  ┌──────────────┐  ┌────────────┐
       │ Validation │  │ Calculation  │  │  History   │
       │            │  │    Engine    │  │  Scenario  │
       └────────────┘  └──────┬───────┘  └────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │      SUPABASE       │
                    │ PostgreSQL + Auth   │
                    │ RLS + Database      │
                    └──────────┬──────────┘
                               │
                               ▼
                         ┌───────────┐
                         │  VERCEL   │
                         │ Production│
                         └───────────┘
```

Dan prinsip yang **tidak boleh berubah**:

> **Excel Existing → Mapping → Database → Formula Registry → Calculation Engine → Next.js UI**

Bukan membuat sistem procurement baru, tetapi **mengubah Excel existing menjadi aplikasi yang terstruktur, otomatis, scalable, dan memiliki histori**. Pasted text
