#!/usr/bin/env python3
"""
Extract real calculation blocks from `ANALISIS HARGA SATUAN (2026).xlsx`
into a golden-test fixture (tests/fixtures/excel-cases.json).

NO MOCKING. Every value is read from the workbook:
  - values   : data_only=True  (cached results Excel wrote)
  - formulas : data_only=False (original Excel formulas)

The extractor is FORMULA-DRIVEN (Phase 2.5 §6):
  * every calculation range (TOTAL BIAYA / BIAYA PERLITER) is read out of the
    real formula, never inferred from the visual position;
  * the sale-side divisor is read out of the HARGA JUAL formula, and a cell
    reference is followed to its source formula before deciding the variant;
  * the block census classifies ALL title cells, so nothing is silently dropped.

Phase 2.5 additions:
  * label normalisation  -> recovers the `LABA KOTOR (RP)` / `LABA BERSIH (RP)`
    variant (the previous exact-match extractor dropped ~89 blocks);
  * sale DPP variants    -> F005 (=include/divisor, literal or referenced),
                            F005B (=literal DPP, divisor absent);
  * total cost variants  -> F015A (SUM range), F015B (selected rows), F015C (literal);
  * division-by-#REF!    -> audited, never resolved to 0;
  * formula-variant census + divisor census + #REF! audit + unresolved-cell audit.
"""
from __future__ import annotations

import collections
import json
import os
import re
import sys

import openpyxl

XLSX = "ANALISIS HARGA SATUAN (2026).xlsx"
OUT = os.path.join("tests", "fixtures", "excel-cases.json")

TITLE_KEY = "ANALISIS HARGA SATUAN"
CELL = r"([A-Z]{1,3})(\d+)"
CELL_RE = re.compile(r"^([A-Z]{1,3})(\d+)$")
# A sheet prefix REQUIRES '!' — without it, 'AF57' would parse as sheet 'A' + cell 'F57'.
REF_RE = re.compile(
    r"^=\s*(?:'([^']+)'!|([A-Za-z0-9_\u00C0-\uFFFF ]+)!)?\$?([A-Z]{1,3})\$?(\d+)$"
)
NUMDIV_RE = re.compile(r"^=\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$")
REFDIV_RE = re.compile(r"^=\s*\$?([A-Z]{1,3})\$?(\d+)\s*/\s*(\d+(?:\.\d+)?)$")
DIVBY_REFERR_RE = re.compile(r"/\s*#REF!", re.I)

# Output labels, keyed by their NORMALISED form (parentheticals stripped,
# whitespace collapsed, upper-cased). See norm_label().
OUT_LABELS = {
    "TOTAL PENDAPATAN": "revenue",
    "HARGA JUAL SETELAH PAJAK": "harga_jual_setelah_pajak",
    "TOTAL BIAYA": "total_cost",
    "BIAYA PERLITER": "cost_per_liter",
    "LABA KOTOR": "gross_profit",
    "SELISIH PPN": "ppn_difference",
    "LABA BERSIH": "net_profit",
    "LABA BERSIH PERLITER": "net_profit_per_liter",
    "PERSENTASE": "profit_percentage",
}

# The 8 metrics every block must expose to be fully testable. `profit_percentage`
# is NOT required: a real Excel variant (e.g. `TONASA!CJ49`) replaces it with
# `PROFIT 50% PATNER PERLITER` rows and has no PERSENTASE at all.
CORE_LABELS = [
    "revenue", "harga_jual_setelah_pajak", "total_cost", "cost_per_liter",
    "gross_profit", "ppn_difference", "net_profit", "net_profit_per_liter",
]


def norm(s):
    return re.sub(r"\s+", " ", str(s).strip())


def normup(s):
    return norm(s).upper()


def norm_label(s):
    """'LABA BERSIH (RP)' -> 'LABA BERSIH'; 'LABA BERSIH PERLITER ' -> 'LABA BERSIH PERLITER'."""
    t = re.sub(r"\(.*?\)", " ", normup(s))
    return re.sub(r"\s+", " ", t).strip()


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def col_of(ref):
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def split_ref(ref):
    m = CELL_RE.match(ref)
    return (m.group(1), int(m.group(2))) if m else None


def parse_sum_range(formula):
    """'=sum(CY15:CY33)' -> (col_index, r1, r2). None if not a plain SUM of one column."""
    if not isinstance(formula, str):
        return None
    m = re.fullmatch(r"=\s*[Ss][Uu][Mm]\s*\(\s*" + CELL + r"\s*:\s*" + CELL + r"\s*\)", formula)
    if not m:
        return None
    c1, r1, c2, r2 = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
    if c1 != c2:
        return None
    return col_of(c1), r1, r2


def parse_sum_span(formula):
    """Rows spanned by a 'sum(COL r1:COL r2)' anywhere in a formula, e.g. '=sum(G15:G16)*11%'."""
    if not isinstance(formula, str):
        return None
    m = re.search(r"[Ss][Uu][Mm]\s*\(\s*" + CELL + r"\s*:\s*" + CELL + r"\s*\)", formula)
    if not m:
        return None
    return int(m.group(4)) - int(m.group(2)) + 1


def parse_effective_rate(formula):
    """Effective rate of a levy formula. '=J10*7.5%*0' -> 0.0; '=J10*11%' -> 0.11."""
    if not isinstance(formula, str) or not formula.startswith("="):
        return None
    body = formula.lstrip("=")
    parts = [p.strip() for p in body.split("*")]
    rate = None
    literals = []
    for i, p in enumerate(parts):
        if p.endswith("%"):
            try:
                rate = float(p[:-1]) / 100.0
            except ValueError:
                pass
            continue
        if i == 0:
            continue
        try:
            literals.append(float(p))
        except ValueError:
            continue
    if rate is None:
        decimals = [x for x in literals if 0 < x < 1]
        if not decimals:
            return None
        rate = decimals[0]
        literals = [x for x in literals if x != rate]
    factor = 1.0
    for x in literals:
        factor *= x
    return rate * factor


def resolve_rate_formula(sheet, formula):
    """Resolve a *rate* cell the way the workbook does.

    Returns (kind, value):
      ('rate', r)    the cell (or a cell it references) is a percentage product,
                     e.g. '=J10*11%*0' -> 0.0, '=J10*11%' -> 0.11
      ('amount', a)  the cell is a plain rupiah amount (literal, or a literal
                     reached through references). Its effective RATE is
                     amount / basis and must be derived by the caller.
      (None, None)   cannot be determined from the formula.

    This is what lets the cross-check see that a block whose document scheme is
    'Non-PPN' really charges 0% (e.g. JATENG!BS222: BU232 = 0, BU240 = =BP251 = 0)
    instead of silently assuming the universal 11%.
    """
    f = formula
    for _ in range(10):
        if isinstance(f, (int, float)) and not isinstance(f, bool):
            return ("amount", float(f))
        if not isinstance(f, str) or not f.startswith("="):
            return (None, None)
        m = REF_RE.match(f)
        if m:
            tgt_sheet = m.group(1) or m.group(2) or sheet
            tgt = m.group(3) + m.group(4)
            if tgt_sheet not in wbf.sheetnames:
                return (None, None)
            sheet, _, f = follow_ref(tgt_sheet, tgt)
            continue
        r = parse_effective_rate(f)
        if r is not None:
            return ("rate", r)
        m2 = re.fullmatch(r"=\s*(\d+(?:\.\d+)?)\s*", f)
        if m2:
            return ("amount", float(m2.group(1)))
        return (None, None)
    return (None, None)


def classify_formula_shape(formula):
    """A coarse, stable shape label for variant discovery (Phase 2.5 §3)."""
    if formula is None:
        return "<empty>"
    if not isinstance(formula, str):
        return "<literal>"
    if not formula.startswith("="):
        return "<literal>"
    body = formula[1:]
    shape = re.sub(r"'[^']+'!", "", body)
    shape = re.sub(r"[A-Z]{1,3}\d+", "R", shape)          # cell refs -> R
    shape = re.sub(r"\d+(?:\.\d+)?%", "N%", shape)         # percents
    shape = re.sub(r"\d+(?:\.\d+)?", "N", shape)           # numbers
    shape = re.sub(r"\s+", "", shape)
    return "=" + shape


# --------------------------------------------------------------- workbook
wbf = openpyxl.load_workbook(XLSX, data_only=False)
wfv = openpyxl.load_workbook(XLSX, data_only=True)


def formula_cell(sheet, coord):
    return wbf[sheet][coord].value


def value_cell(sheet, coord):
    return wfv[sheet][coord].value


def follow_ref(sheet, coord, depth=0):
    """Follow a chain of single-cell references, across sheets.
    Returns final (sheet, coord, formula)."""
    if depth > 12:
        return sheet, coord, None
    f = formula_cell(sheet, coord)
    if isinstance(f, str):
        m = REF_RE.match(f)
        if m:
            tgt_sheet = m.group(1) or m.group(2) or sheet
            tgt = m.group(3) + m.group(4)
            if tgt_sheet in wbf.sheetnames:
                return follow_ref(tgt_sheet, tgt, depth + 1)
    return sheet, coord, f


def classify_sale_dpp(sheet, formula):
    """
    Resolve the HARGA JUAL (DPP) variant from the ORIGINAL formula.

    Returns dict(kind, variant_id, include, divisor, dpp_literal, evidence):
      kind = INCLUDE_DIVISOR | LITERAL_DPP | OTHER
    """
    raw = formula
    if raw is None:
        return {"kind": "OTHER", "variant_id": None, "include": None, "divisor": None,
                "dpp_literal": None, "evidence": "<empty>"}
    if not isinstance(raw, str):  # plain numeric DPP typed into the cell
        return {"kind": "LITERAL_DPP", "variant_id": "F005B", "include": None, "divisor": None,
                "dpp_literal": num(raw), "evidence": str(raw)}
    if not raw.startswith("="):
        return {"kind": "OTHER", "variant_id": None, "include": None, "divisor": None,
                "dpp_literal": None, "evidence": raw}

    # number / number  (a literal include price divided by a divisor)
    m = NUMDIV_RE.match(raw)
    if m:
        return {"kind": "INCLUDE_DIVISOR", "variant_id": "F005", "include": float(m.group(1)),
                "divisor": float(m.group(2)), "dpp_literal": None, "evidence": raw}

    # ref / number  (include price lives in a referenced cell)
    m = REFDIV_RE.match(raw)
    if m:
        tgt = m.group(1) + m.group(2)
        include = num(value_cell(sheet, tgt))
        if include is not None:
            return {"kind": "INCLUDE_DIVISOR", "variant_id": "F005", "include": include,
                    "divisor": float(m.group(3)), "dpp_literal": None,
                    "evidence": f"{raw}  ({sheet}!{tgt})"}
        return {"kind": "OTHER", "variant_id": None, "include": None, "divisor": None,
                "dpp_literal": None, "evidence": raw}

    # bare reference -> follow the chain to its source formula
    m = REF_RE.match(raw)
    if m:
        start = m.group(3) + m.group(4)
        fs, fc, ff = follow_ref(sheet, start)
        if ff is not None:
            resolved = classify_sale_dpp(fs, ff)
            if resolved["kind"] != "OTHER":
                resolved = dict(resolved)
                resolved["evidence"] = f"{raw} -> {resolved['evidence']}"
                return resolved
        # The reference resolves to a DERIVED price (e.g. `=BK141-BK143`, a
        # discounted economic price). That arithmetic lives outside this block,
        # so — instead of guessing it — the DPP is taken as the referenced
        # cell's cached value and flagged as variant F005C.
        cached = num(value_cell(fs, fc))
        if cached is not None:
            return {"kind": "LITERAL_DPP", "variant_id": "F005C", "include": None,
                    "divisor": None, "dpp_literal": cached,
                    "evidence": f"{raw} -> {fs}!{fc} ({ff}) [cached DPP]"}
        return {"kind": "OTHER", "variant_id": None, "include": None, "divisor": None,
                "dpp_literal": None, "evidence": raw}

    # a single literal number via '=N'
    m = re.fullmatch(r"=\s*(\d+(?:\.\d+)?)\s*", raw)
    if m:
        return {"kind": "LITERAL_DPP", "variant_id": "F005B", "include": None, "divisor": None,
                "dpp_literal": float(m.group(1)), "evidence": raw}

    return {"kind": "OTHER", "variant_id": None, "include": None, "divisor": None,
            "dpp_literal": None, "evidence": raw}


def classify_total_cost(formula):
    """
    Classify the TOTAL BIAYA formula:
      SUM_RANGE   -> F015A (sum of a contiguous column range)
      SELECTED    -> F015B (sum of an explicit list of cells / ranges)
      LITERAL     -> F015C (hardcoded number)
      OTHER
    """
    rng = parse_sum_range(formula)
    if rng is not None:
        return "SUM_RANGE", rng, None, "F015A"
    if formula is None:
        return "OTHER", None, None, None
    if isinstance(formula, (int, float)) and not isinstance(formula, bool):
        return "LITERAL", None, float(formula), "F015C"
    if isinstance(formula, str) and formula.startswith("="):
        body = formula[1:]
        # explicit list of cell refs / ranges, e.g. '=K16+K17+K18+K21+K30+K33'
        tokens = [t for t in re.split(r"[+\-]", body) if t.strip()]
        if tokens and all(re.fullmatch(r"\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?", t.strip())
                          for t in tokens):
            return "SELECTED", None, None, "F015B"
    if isinstance(formula, str) and re.fullmatch(r"=\s*\d+(?:\.\d+)?\s*", formula):
        return "LITERAL", None, float(formula[1:]), "F015C"
    return "OTHER", None, None, None


def main():
    if not os.path.exists(XLSX):
        sys.exit(f"workbook not found: {XLSX}")

    cases = []
    census = []
    divisor_census = collections.Counter()
    divisor_examples = collections.defaultdict(list)
    total_cost_shapes = collections.Counter()
    sale_shapes = collections.Counter()
    sale_shape_examples = collections.defaultdict(list)
    ppn_input_shapes = collections.Counter()
    net_profit_shapes = collections.Counter()
    pct_shapes = collections.Counter()
    unresolved_cells = {"F019B": [], "F021B": []}

    for sheet in wbf.sheetnames:
        wsf, wsv = wbf[sheet], wfv[sheet]
        maxr, maxc = wsf.max_row, wsf.max_column

        for row in wsf.iter_rows():
            for cell in row:
                v = cell.value
                if not (isinstance(v, str) and TITLE_KEY in v.upper()):
                    continue
                trow, tcol = cell.row, cell.column
                block_id = f"{sheet}::{cell.coordinate}"
                rec = {"id": block_id, "sheet": sheet, "title_cell": cell.coordinate,
                       "title": norm(v), "classification": None, "detail": None}

                # (1) label column. In every real block the title cell sits IN
                # the label column, so prefer `tcol`; only search outward if the
                # title column itself lacks the core markers. (Scoring purely by
                # label count let a neighbouring block's column win, which made
                # a complete block look empty — see Phase 2.5 §2B.)
                def has_core(c):
                    seen = set()
                    for r in range(trow, min(trow + 130, maxr) + 1):
                        lv = wsf.cell(row=r, column=c).value
                        if isinstance(lv, str):
                            seen.add(norm_label(lv))
                    return {"TOTAL PENDAPATAN", "LABA BERSIH PERLITER"} <= seen

                lab_col = tcol if has_core(tcol) else None
                if lab_col is None:
                    for off in range(1, 7):
                        for c in (tcol - off, tcol + off):
                            if 1 <= c <= maxc and has_core(c):
                                lab_col = c
                                break
                        if lab_col is not None:
                            break
                if lab_col is None:
                    standard = re.match(r"^ANALISIS HARGA SATUAN", normup(v))
                    rec["classification"] = "NO_LABEL_COL" if standard else "ANNOTATION_TITLE"
                    census.append(rec)
                    continue

                # (1b) block boundary: next AHS title in the same label column
                block_end = min(trow + 130, maxr)
                for r in range(trow + 1, min(trow + 400, maxr) + 1):
                    lv = wsf.cell(row=r, column=lab_col).value
                    if isinstance(lv, str) and TITLE_KEY in lv.upper():
                        block_end = r - 1
                        break

                # (2) output rows by NORMALISED label
                slots, order = {}, []
                for r in range(trow, block_end + 1):
                    lv = wsf.cell(row=r, column=lab_col).value
                    if isinstance(lv, str) and norm_label(lv) in OUT_LABELS:
                        key = OUT_LABELS[norm_label(lv)]
                        if key not in slots:
                            slots[key] = r
                            order.append(key)
                if not slots:
                    # A title with no output labels at all is a free-text
                    # annotation, not a calculation block (e.g. Market Bu Ve!W50).
                    rec["classification"] = "ANNOTATION_TITLE"
                    census.append(rec)
                    continue
                missing = [k for k in CORE_LABELS if k not in slots]
                if missing:
                    rec["classification"] = "INCOMPLETE"
                    rec["detail"] = "missing=" + ",".join(missing)
                    census.append(rec)
                    continue
                rec["has_profit_percentage"] = "profit_percentage" in slots

                out_col = lab_col + 5
                if out_col > maxc:
                    rec["classification"] = "INCOMPLETE"
                    rec["detail"] = "out_col out of range"
                    census.append(rec)
                    continue

                # (3) REAL ranges from the TOTAL BIAYA / BIAYA PERLITER formulas
                total_f = wsf.cell(row=slots["total_cost"], column=out_col).value
                tc_kind, rng, tc_literal, tc_variant = classify_total_cost(total_f)
                total_cost_shapes[classify_formula_shape(total_f)] += 1
                rec["total_cost_variant"] = tc_variant

                rate_f = wsf.cell(row=slots["cost_per_liter"], column=out_col).value
                rrate = parse_sum_range(rate_f)

                if rng is None and tc_kind != "LITERAL":
                    # variants F015B (selected rows) / OTHER have no single range
                    rec["classification"] = "TOTAL_COST_VARIANT"
                    rec["detail"] = f"{tc_variant}: {str(total_f)[:40]}"
                    census.append(rec)
                    continue
                if tc_kind == "LITERAL" and rrate is None:
                    # Both TOTAL BIAYA and BIAYA PERLITER are hardcoded numbers:
                    # the cost range is not derivable from any formula.
                    rec["classification"] = "CUSTOM_FORMULA_BLOCK"
                    rec["detail"] = f"literal total {tc_literal} + literal cost/liter"
                    census.append(rec)
                    continue

                if rng is not None:
                    total_col, cr1, cr2 = rng
                else:
                    # literal total: cost rows are still in the BIAYA PERLITER range
                    total_col = (rrate[0] + 2) if rrate else None
                    cr1, cr2 = (rrate[1], rrate[2]) if rrate else (None, None)
                if total_col is None or cr1 is None:
                    rec["classification"] = "TOTAL_COST_VARIANT"
                    rec["detail"] = f"{tc_variant} (no recoverable cost range)"
                    census.append(rec)
                    continue

                rate_col = rrate[0] if rrate else total_col - 2
                desc_col = rate_col - 1
                qty_col = total_col - 1

                # (4) sale DPP variant from the HARGA JUAL (Harga Dasar) formula
                sale_formula = None
                for r in range(slots["harga_jual_setelah_pajak"], slots["total_cost"]):
                    if normup(wsf.cell(row=r, column=desc_col).value or "") == "HARGA DASAR":
                        sale_formula = wsf.cell(row=r, column=rate_col).value
                        break
                if sale_formula is None:
                    rec["classification"] = "SALE_ROW_NOT_FOUND"
                    census.append(rec)
                    continue

                sale = classify_sale_dpp(sheet, sale_formula)
                sale_shapes[classify_formula_shape(sale_formula)] += 1
                if len(sale_shape_examples[classify_formula_shape(sale_formula)]) < 3:
                    sale_shape_examples[classify_formula_shape(sale_formula)].append(block_id)
                if sale["kind"] == "OTHER":
                    rec["classification"] = "SALE_FORMULA_VARIANT"
                    rec["detail"] = str(sale_formula)[:40]
                    census.append(rec)
                    continue

                if sale["kind"] == "INCLUDE_DIVISOR":
                    divisor_census[sale["divisor"]] += 1
                    if len(divisor_examples[sale["divisor"]]) < 4:
                        divisor_examples[sale["divisor"]].append(
                            f"{block_id} {sale['evidence'][:48]}")

                # cached DPP = the sale Harga Dasar row's own value
                dpp_cached = None
                for r in range(slots["harga_jual_setelah_pajak"], slots["total_cost"]):
                    if normup(wsf.cell(row=r, column=desc_col).value or "") == "HARGA DASAR":
                        dpp_cached = num(wsv.cell(row=r, column=rate_col).value)
                        break
                rate_basis = dpp_cached if dpp_cached else (
                    sale["dpp_literal"] if sale["dpp_literal"] else None)

                # (5) cost lines inside the real range
                cost_lines = []
                for r in range(cr1, cr2 + 1):
                    rate = num(wsv.cell(row=r, column=rate_col).value)
                    qty = num(wsv.cell(row=r, column=qty_col).value)
                    tot = num(wsv.cell(row=r, column=total_col).value)
                    if rate is None and tot is None:
                        continue
                    cost_lines.append({
                        "row": r,
                        "category": norm(wsf.cell(row=r, column=desc_col - 1).value or ""),
                        "description": norm(wsf.cell(row=r, column=desc_col).value or ""),
                        "rate": rate,
                        "qty": qty,
                        "total_excel": tot,
                        "rate_formula": str(wsf.cell(row=r, column=rate_col).value),
                    })
                if len(cost_lines) < 5:
                    rec["classification"] = "INCOMPLETE_COST_ROWS"
                    census.append(rec)
                    continue

                # (5b) sale-side tax rates, read from the FORMULA (never assumed).
                #      Excel has genuinely 0% blocks ('Non-PPN' scheme), so the
                #      rate is an INPUT of the block, not the constant 11%.
                def sale_rate_for(label):
                    for r in range(slots["harga_jual_setelah_pajak"], slots["total_cost"]):
                        if normup(wsf.cell(row=r, column=desc_col).value or "") == label:
                            kind, val = resolve_rate_formula(
                                sheet, wsf.cell(row=r, column=rate_col).value)
                            if kind == "rate":
                                return val
                            if kind == "amount":
                                return (val / rate_basis) if rate_basis else 0.0
                            return None
                    return None

                sale_pbbkb = sale_rate_for("PBBKB")
                sale_ppn = sale_rate_for("PPN 11%")
                if sale_pbbkb is None:
                    sale_pbbkb = 0.0
                if sale_ppn is None:
                    sale_ppn = 0.0

                # (6) volume = qty on the sale Harga Dasar row
                volume = None
                for r in range(slots["harga_jual_setelah_pajak"], slots["total_cost"]):
                    q = num(wsv.cell(row=r, column=qty_col).value)
                    if q:
                        volume = q
                        break

                excel = {k: num(wsv.cell(row=r, column=out_col).value)
                         for k, r in slots.items()}
                if "profit_percentage" not in slots:
                    excel["profit_percentage"] = None

                # (6b) HARGA JUAL SETELAH PAJAK variant: Excel usually sums the
                # sale rows, but some blocks TYPE the value directly (e.g.
                # AHAS Prioritas!W3: AB10 = 22000 while the rows sum to 21999.525).
                hjsp_cell = wsf.cell(row=slots["harga_jual_setelah_pajak"], column=out_col)
                hjsp_variant = "F027A"
                hjsp_literal = None
                hv = hjsp_cell.value
                if isinstance(hv, (int, float)) and not isinstance(hv, bool):
                    hjsp_variant, hjsp_literal = "F027B", float(hv)
                elif isinstance(hv, str) and re.fullmatch(r"=\s*\d+(?:\.\d+)?\s*", hv):
                    hjsp_variant, hjsp_literal = "F027B", float(hv[1:])

                ppn_out = None
                for r in range(slots["harga_jual_setelah_pajak"], slots["total_cost"]):
                    if normup(wsf.cell(row=r, column=desc_col).value or "") == "PPN 11%":
                        ppn_out = num(wsv.cell(row=r, column=total_col).value)
                # cost-side PPN masukan: basis variant AND effective rate, both
                # read from the block's own formula.
                ppn_in = None
                ppn_in_basis = None
                ppn_in_rate = None
                ppn_basis_source = "FORMULA"
                for cl in cost_lines:
                    if cl["category"].upper() == "PAJAK" and cl["description"].upper() == "PPN 11%":
                        ppn_in = cl["total_excel"]
                        span = parse_sum_span(cl["rate_formula"])
                        shape = classify_formula_shape(cl["rate_formula"])
                        ppn_input_shapes[shape] += 1
                        if span is None:
                            ppn_in_basis = "F008A"
                        elif span <= 2:
                            ppn_in_basis = "F008C"
                        else:
                            ppn_in_basis = "F008B"
                        # the rate itself
                        def rate_of_line(desc):
                            for l in cost_lines:
                                if l["description"].strip().upper() == desc:
                                    return l["rate"] or 0.0
                            return 0.0
                        base_r = rate_of_line("HARGA DASAR") or (cost_lines[0]["rate"] or 0.0)
                        basisA = base_r
                        basisC = base_r + rate_of_line("OAT")
                        basisB = (base_r + rate_of_line("OAT") + rate_of_line("PBBKB")
                                  + rate_of_line("PPH INU 0,3%") + rate_of_line("BPH MIGAS 0,25%"))
                        if ppn_in_basis == "F008A":
                            basis_pl = basisA
                        elif ppn_in_basis == "F008C":
                            basis_pl = basisC
                        else:
                            basis_pl = basisB
                        kind, val = resolve_rate_formula(sheet, cl["rate_formula"])
                        if kind == "rate":
                            ppn_in_rate = val
                        elif kind == "amount":
                            ppn_in_rate = (val / basis_pl) if basis_pl else 0.0
                        else:
                            ppn_in_rate = None
                        # When the rate cell is a CROSS-REFERENCE (no local SUM),
                        # the basis variant is not visible in this block's formula.
                        # Disambiguate it against the workbook's own cached
                        # per-liter value instead of guessing, and record that the
                        # choice was derived from the value, not from the formula.
                        ppn_basis_source = "FORMULA" if span is not None else "DERIVED_FROM_VALUE"
                        if span is None and ppn_in_rate is not None and cl["rate"] is not None:
                            if cl["rate"] == 0 and ppn_in_rate == 0:
                                # nothing charged on either side: basis irrelevant
                                ppn_basis_source = "FORMULA"
                            else:
                                cands = [("F008A", basisA), ("F008B", basisB), ("F008C", basisC)]
                                m = [v for v, b in cands
                                     if b > 0 and abs(b * ppn_in_rate - cl["rate"])
                                     <= max(0.01, abs(cl["rate"]) * 1e-9)]
                                if not m:
                                    ppn_basis_source = "UNRESOLVED"
                                elif ppn_in_basis in m:
                                    # the formula's own shape is consistent — keep it
                                    ppn_basis_source = "FORMULA" if len(m) == 3 else ppn_basis_source
                                else:
                                    # cross-reference: pick the (unique) matching basis
                                    ppn_in_basis = m[0]
                                    ppn_basis_source = "DERIVED_FROM_VALUE"
                excel["ppn_output"] = ppn_out
                excel["ppn_input"] = ppn_in

                # net profit / percentage shapes (variant discovery + §4)
                nf = wsf.cell(row=slots["net_profit"], column=out_col).value
                net_profit_shapes[classify_formula_shape(nf)] += 1
                is_three_term = bool(
                    isinstance(nf, str)
                    and re.fullmatch(
                        r"=\s*\$?[A-Z]{1,3}\$?\d+\s*-\s*\$?[A-Z]{1,3}\$?\d+\s*-\s*\$?[A-Z]{1,3}\$?\d+\s*",
                        nf,
                    )
                )
                if is_three_term:
                    unresolved_cells["F019B"].append(
                        f"{sheet}!{wsf.cell(row=slots['net_profit'], column=out_col).coordinate} {nf}")
                # The 3rd term of F019B is SELISIH PBBKB. Excel leaves that cell
                # EMPTY in most blocks, and `= x - <empty>` is 0 in Excel's own
                # arithmetic — so whether the term is *computed* is a block input.
                pbbkb_diff_applicable = True
                third_operand_cell = None
                if is_three_term:
                    ops = re.findall(r"(\$?[A-Z]{1,3}\$?\d+)", nf.replace(" ", ""))
                    if len(ops) >= 3:
                        third_operand_cell = ops[2].replace("$", "")
                        third_val = wsf[third_operand_cell].value
                        pbbkb_diff_applicable = isinstance(third_val, str) and third_val.startswith("=")

                if ppn_in_rate is None or ppn_basis_source == "UNRESOLVED":
                    rec["classification"] = "PPN_INPUT_VARIANT"
                    rec["detail"] = (
                        f"basis/rate tidak dapat ditentukan dari formula/ilai blok "
                        f"(per-liter={ppn_in and ppn_in})"
                    )
                    census.append(rec)
                    continue
                if "profit_percentage" in slots:
                    pf = wsf.cell(row=slots["profit_percentage"], column=out_col).value
                    pct_shapes[classify_formula_shape(pf)] += 1
                    if isinstance(pf, str) and re.search(r"\*\s*100\s*%", pf):
                        unresolved_cells["F021B"].append(f"{sheet}!{wsf.cell(row=slots['profit_percentage'], column=out_col).coordinate} {pf}")

                if volume is None or not all(
                    isinstance(excel.get(k), (int, float))
                    for k in ("revenue", "total_cost", "gross_profit", "net_profit")
                ):
                    rec["classification"] = "INCOMPLETE_VALUES"
                    census.append(rec)
                    continue

                base_price = None
                for cl in cost_lines:
                    if cl["category"].upper() == "HPP" and cl["rate"] is not None:
                        base_price = cl["rate"]
                        break
                if base_price is None:
                    for cl in cost_lines:
                        if cl["rate"]:
                            base_price = cl["rate"]
                            break

                cases.append({
                    "id": block_id,
                    "sheet": sheet,
                    # A = standard, B = title offset from the label column
                    # (Eval Vendor TL style), E = profit-share layout without
                    # the PERSENTASE row.
                    "template": (
                        "B" if lab_col != tcol
                        else ("A" if "profit_percentage" in slots else "E")
                    ),
                    "title_cell": cell.coordinate,
                    "title": norm(v),
                    "label_col": lab_col,
                    "out_col": out_col,
                    "sale_variant": sale["variant_id"],
                    "harga_jual_include": sale["include"],
                    "include_divisor": sale["divisor"],
                    "harga_jual_dpp_input": sale["dpp_literal"],
                    "sale_formula": sale["evidence"],
                    "sale_pbbkb_rate": sale_pbbkb,
                    "sale_ppn_rate": sale_ppn,
                    "hjsp_variant": hjsp_variant,
                    "harga_jual_setelah_pajak_input": hjsp_literal,
                    "ppn_input_rate": ppn_in_rate,
                    "volume": volume,
                    "base_price": base_price,
                    "ppn_input_formula_id": ppn_in_basis,
                    "ppn_input_basis_source": ppn_basis_source,
                    "net_profit_formula_id": "F019B" if is_three_term else "F019A",
                    "pbbkb_difference_applicable": pbbkb_diff_applicable,
                    "net_profit_third_operand": third_operand_cell,
                    "total_cost_variant": tc_variant,
                    "total_cost_formula": str(total_f),
                    "total_cost_override": tc_literal,
                    "has_profit_percentage": "profit_percentage" in slots,
                    "cost_lines": cost_lines,
                    "excel": excel,
                })
                rec["classification"] = "TESTED"
                rec["sale_variant"] = sale["variant_id"]
                census.append(rec)

    # ---------------- vendor evaluation blocks ----------------
    VENDOR_COMPONENTS = [
        ("base_price", "HARGA DASAR"), ("ppn", "PPN"), ("pbbkb", "PBBKB"),
        ("pph", "PPH"), ("oat", "OAT"), ("ppn_oat", "PPN OAT"), ("bph", "BPH"),
    ]
    vendor_cases = []
    for sheet in wbf.sheetnames:
        wsf, wsv = wbf[sheet], wfv[sheet]
        maxr, maxc = wsf.max_row, wsf.max_column
        for row in wsf.iter_rows():
            for cell in row:
                if not (isinstance(cell.value, str) and normup(cell.value) == "URAIAN"):
                    continue
                r, c = cell.row, cell.column
                if c + 1 > maxc or r + 8 > maxr:
                    continue
                vendors = []
                for dc in range(c + 1, min(c + 6, maxc) + 1):
                    nm = wsf.cell(row=r, column=dc).value
                    if not (isinstance(nm, str) and norm(nm)):
                        continue
                    if normup(nm) in ("HARGA INU", "BIAYA"):
                        continue
                    if norm(nm).startswith("="):
                        continue
                    vendors.append((dc, norm(nm)))
                if not vendors:
                    continue
                comp_row = {}
                for rr in range(r + 1, r + 9):
                    lv = normup(wsf.cell(row=rr, column=c).value or "")
                    for key, want in VENDOR_COMPONENTS:
                        if lv == want and key not in comp_row:
                            comp_row[key] = rr
                if "base_price" not in comp_row or "ppn" not in comp_row:
                    continue
                allin_row = r + 8
                allin_f = wsf.cell(row=allin_row, column=c + 1).value
                span = parse_sum_range(allin_f)
                sum_rows = [span[1], span[2]] if span else [None, None]

                def sum_range_value(dc):
                    if not span:
                        return None
                    vals = [num(wsv.cell(row=rr, column=dc).value)
                            for rr in range(span[1], span[2] + 1)]
                    if all(v is None for v in vals):
                        return None
                    return sum(v or 0 for v in vals)
                for dc, vname in vendors:
                    base = num(wsv.cell(row=comp_row["base_price"], column=dc).value)
                    ppn = num(wsv.cell(row=comp_row["ppn"], column=dc).value)
                    allin = num(wsv.cell(row=allin_row, column=dc).value)
                    if base is None and ppn is None and allin is None:
                        continue
                    comp_values = [num(wsv.cell(row=r + i, column=dc).value) for i in range(1, 8)]
                    comp_labels = [norm(wsf.cell(row=r + i, column=c).value or "") for i in range(1, 8)]
                    comps = {k: (num(wsv.cell(row=rr, column=dc).value) if rr else None)
                             for k, rr in comp_row.items()}
                    comps["slot7"] = comp_values[6]
                    ppn_f = str(wsf.cell(row=comp_row["ppn"], column=dc).value)
                    ppn_is_formula = ppn_f.startswith("=")
                    eff = parse_effective_rate(ppn_f)
                    if eff is None:
                        eff = 0.0
                    vendor_cases.append({
                        "id": f"{sheet}::{cell.coordinate}::{vname}",
                        "sheet": sheet,
                        "uraian_cell": cell.coordinate,
                        "vendor": vname,
                        "base_price": base,
                        "ppn_rate_effective": eff,
                        "ppn_is_formula": ppn_is_formula,
                        "components": comps,
                        "component_values": comp_values,
                        "component_labels": comp_labels,
                        "excel": {"ppn": ppn, "all_in": allin},
                        "all_in_formula": str(allin_f) if isinstance(allin_f, str) else None,
                        "all_in_component_rows": (span[2] - span[1] + 1 if span else None),
                        "all_in_from_row": sum_rows[0],
                        "all_in_to_row": sum_rows[1],
                        "all_in_formula_value": sum_range_value(dc),
                        "uraian_row": r,
                        "includes_bph": (bool(span and comp_row.get("bph")
                                         and span[1] <= comp_row["bph"] <= span[2])),
                        "ppn_formula": str(wsf.cell(row=comp_row["ppn"], column=dc).value),
                        "base_formula": str(wsf.cell(row=comp_row["base_price"], column=dc).value),
                    })

    # ---------------- vendor base divisor census (F003 variants) ----------------
    vendor_divisors = collections.Counter()
    vendor_divisor_examples = collections.defaultdict(list)
    for sheet in wbf.sheetnames:
        wsf = wbf[sheet]
        for row in wsf.iter_rows():
            for cell in row:
                v = cell.value
                if not isinstance(v, str) or not v.startswith("="):
                    continue
                m = re.fullmatch(r"=\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", v)
                if not m:
                    continue
                d = float(m.group(2))
                if d <= 1 or d > 2:
                    continue
                vendor_divisors[d] += 1
                if len(vendor_divisor_examples[d]) < 4:
                    vendor_divisor_examples[d].append(f"{sheet}!{cell.coordinate} {v}")

    # ---------------- workbook-wide unresolved-formula scan (Phase 2.5 §4) ----------------
    wb_unresolved = {"F019B": [], "F021B": []}
    for sheet in wbf.sheetnames:
        wsf = wbf[sheet]
        for row in wsf.iter_rows():
            for cell in row:
                v = cell.value
                if not isinstance(v, str) or not v.startswith("="):
                    continue
                body = v[1:]
                # net profit with 3 terms:  =R-R-R
                if re.fullmatch(r"\s*[A-Z]{1,3}\d+\s*-\s*[A-Z]{1,3}\d+\s*-\s*[A-Z]{1,3}\d+\s*", body.replace("$", "")):
                    wb_unresolved["F019B"].append(f"{sheet}!{cell.coordinate} {v}")
                # percentage: =R/R*100%   (with or without the *100%)
                m = re.fullmatch(r"\s*([A-Z]{1,3}\d+)\s*/\s*([A-Z]{1,3}\d+)\s*\*\s*100\s*%\s*", body.replace("$", ""))
                if m:
                    wb_unresolved["F021B"].append(f"{sheet}!{cell.coordinate} {v}")

    # ---------------- #REF! audit (Phase 2.5 §5) ----------------
    ref_errors = []
    for sheet in wbf.sheetnames:
        wsf = wbf[sheet]
        for row in wsf.iter_rows():
            for cell in row:
                v = cell.value
                if isinstance(v, str) and "#REF!" in v.upper():
                    ref_errors.append({"sheet": sheet, "cell": cell.coordinate, "formula": v})
    # dependents: cells whose formula references an error cell coordinate
    ref_deps = []
    err_by_sheet = collections.defaultdict(set)
    for e in ref_errors:
        err_by_sheet[e["sheet"]].add(e["cell"])
    for sheet in wbf.sheetnames:
        wsf = wbf[sheet]
        for row in wsf.iter_rows():
            for cell in row:
                v = cell.value
                if isinstance(v, str) and v.startswith("=") and "#REF!" not in v.upper():
                    for es, cells in err_by_sheet.items():
                        for ec in cells:
                            if es == sheet and re.search(r"(?<![A-Z0-9])" + ec + r"(?![0-9])", v):
                                ref_deps.append({"sheet": sheet, "cell": cell.coordinate,
                                                 "formula": v, "references": f"{es}!{ec}"})

    # ---------------- write fixture ----------------
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    summary = collections.Counter(r["classification"] for r in census)
    payload = {
        "source": XLSX,
        "case_count": len(cases),
        "cases": cases,
        "vendor_case_count": len(vendor_cases),
        "vendor_cases": vendor_cases,
        "census_count": len(census),
        "census": census,
        "census_summary": dict(summary),
        "divisor_census": [
            {"divisor": d, "count": n, "examples": divisor_examples[d]}
            for d, n in sorted(divisor_census.items(), key=lambda kv: -kv[1])
        ],
        "total_cost_shapes": dict(total_cost_shapes),
        "sale_shapes": [
            {"pattern": p, "count": n, "examples": sale_shape_examples[p]}
            for p, n in sorted(sale_shapes.items(), key=lambda kv: -kv[1])
        ],
        "ppn_input_shapes": dict(ppn_input_shapes),
        "net_profit_shapes": dict(net_profit_shapes),
        "percentage_shapes": dict(pct_shapes),
        "ref_errors": ref_errors,
        "ref_error_dependents": ref_deps,
        "unresolved_cells": unresolved_cells,
        "workbook_unresolved_cells": wb_unresolved,
        "vendor_base_divisors": [
            {"divisor": d, "count": n, "examples": vendor_divisor_examples[d]}
            for d, n in sorted(vendor_divisors.items(), key=lambda kv: -kv[1])
        ],
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=1, default=str)

    print(f"wrote {len(cases)} cases + {len(vendor_cases)} vendor cases -> {OUT}")
    print("census:", len(census), dict(summary))
    print("divisors:", dict(divisor_census))
    print("total cost shapes:", dict(total_cost_shapes))
    print("#REF! cells:", len(ref_errors), "dependents:", len(ref_deps))
    print("unresolved F019B cells:", len(unresolved_cells["F019B"]),
          "F021B cells:", len(unresolved_cells["F021B"]))
    print("workbook-wide F019B:", len(wb_unresolved["F019B"]),
          "F021B:", len(wb_unresolved["F021B"]))
    print("vendor base divisors:", dict(vendor_divisors))


if __name__ == "__main__":
    main()
