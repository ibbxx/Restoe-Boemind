/**
 * A tiny, safe arithmetic expression evaluator.
 *
 * Purpose: formula business logic must come from the Formula Registry
 * (lib/formulas/formula-registry.json), NOT from hardcoded TypeScript.
 * The engine therefore evaluates the registry `expression` strings here.
 *
 * Supported grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := '-' unary | postfix
 *   postfix := primary '%'*
 *   primary := number | ident | ident '(' args ')' | '(' expr ')'
 *   args    := expr (',' expr)*
 *
 * `%` is a postfix operator meaning "/ 100" (Excel-style).
 * No eval(), no property access, no arbitrary code execution.
 */

import { CalculationError } from "./errors";

export type ScopeValue = number | number[] | null | undefined;
export type Scope = Record<string, ScopeValue>;

type Token =
  | { t: "num"; v: string }
  | { t: "ident"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "comma" }
  | { t: "percent" };

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUM_RE = /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "%") {
      out.push({ t: "percent" });
      i += 1;
      continue;
    }
    if (ch === "(") {
      out.push({ t: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      out.push({ t: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      out.push({ t: "comma" });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      out.push({ t: "op", v: ch });
      i += 1;
      continue;
    }
    NUM_RE.lastIndex = i;
    const nm = NUM_RE.exec(src);
    if (nm) {
      out.push({ t: "num", v: nm[0] });
      i += nm[0].length;
      continue;
    }
    IDENT_RE.lastIndex = i;
    const id = IDENT_RE.exec(src);
    if (id) {
      out.push({ t: "ident", v: id[0] });
      i += id[0].length;
      continue;
    }
    throw new CalculationError(
      "EXPRESSION_ERROR",
      `Karakter tidak dikenal pada ekspresi "${src}": "${ch}"`,
    );
  }
  return out;
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sum: (a) => a.reduce((s, x) => s + x, 0),
  min: (a) => (a.length ? Math.min(...a) : 0),
  max: (a) => (a.length ? Math.max(...a) : 0),
  abs: (a) => Math.abs(a[0] ?? 0),
  round: (a) => Math.round(a[0] ?? 0),
};

function flatten(v: ScopeValue, name: string): number[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "number") return [v];
  throw new CalculationError(
    "EXPRESSION_ERROR",
    `Nilai tidak valid untuk "${name}"`,
    name,
  );
}

/** Evaluate a registry expression against a flat scope of numbers/arrays. */
export function evaluateExpression(expression: string, scope: Scope): number {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];
  const expect = (t: Token["t"]): void => {
    const tok = next();
    if (!tok || tok.t !== t) {
      throw new CalculationError(
        "EXPRESSION_ERROR",
        `Ekspresi "${expression}" tidak lengkap (butuh '${t}').`,
      );
    }
  };

  function parseArgs(): number[] {
    const args: number[] = [];
    expect("lparen");
    if (peek()?.t === "rparen") {
      next();
      return args;
    }
    for (;;) {
      // A bare identifier argument may expand to an ARRAY
      // (e.g. sum(cost_totals) over 18 cost rows).
      const t0 = peek();
      const t1 = tokens[pos + 1];
      if (
        t0 &&
        t0.t === "ident" &&
        FUNCTIONS[t0.v] === undefined &&
        (t1?.t === "comma" || t1?.t === "rparen")
      ) {
        next();
        if (!(t0.v in scope)) {
          throw new CalculationError(
            "MISSING_INPUT",
            `Variabel "${t0.v}" tidak tersedia untuk formula "${expression}".`,
            t0.v,
          );
        }
        args.push(...flatten(scope[t0.v], t0.v));
      } else {
        args.push(parseExpr());
      }
      const tok = next();
      if (!tok) {
        throw new CalculationError(
          "EXPRESSION_ERROR",
          `Ekspresi "${expression}" tidak lengkap (butuh ')').`,
        );
      }
      if (tok.t === "comma") continue;
      if (tok.t === "rparen") break;
      throw new CalculationError(
        "EXPRESSION_ERROR",
        `Ekspresi "${expression}" tidak lengkap (butuh ',' atau ')').`,
      );
    }
    return args;
  }

  function parsePrimary(): number {
    const tok = next();
    if (!tok) {
      throw new CalculationError(
        "EXPRESSION_ERROR",
        `Ekspresi "${expression}" tidak lengkap.`,
      );
    }
    if (tok.t === "num") return Number(tok.v);
    if (tok.t === "lparen") {
      const v = parseExpr();
      expect("rparen");
      return v;
    }
    if (tok.t === "ident") {
      const name = tok.v;
      const fn = FUNCTIONS[name];
      if (fn && peek()?.t === "lparen") {
        const args = parseArgs();
        return fn(args);
      }
      if (!(name in scope)) {
        throw new CalculationError(
          "MISSING_INPUT",
          `Variabel "${name}" tidak tersedia untuk formula "${expression}".`,
          name,
        );
      }
      const values = flatten(scope[name], name);
      if (values.length !== 1) {
        throw new CalculationError(
          "EXPRESSION_ERROR",
          `Variabel "${name}" bukan skalar (${values.length} nilai) pada formula "${expression}". Gunakan sum(...).`,
          name,
        );
      }
      return values[0]!;
    }
    throw new CalculationError(
      "EXPRESSION_ERROR",
      `Token tidak terduga pada ekspresi "${expression}".`,
    );
  }

  function parsePostfix(): number {
    let v = parsePrimary();
    while (peek()?.t === "percent") {
      next();
      v = v / 100;
    }
    return v;
  }

  function parseUnary(): number {
    const tok = peek();
    if (tok && tok.t === "op" && tok.v === "-") {
      next();
      return -parseUnary();
    }
    if (tok && tok.t === "op" && tok.v === "+") {
      next();
      return parseUnary();
    }
    return parsePostfix();
  }

  function parseTerm(): number {
    let left = parseUnary();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== "op" || (tok.v !== "*" && tok.v !== "/")) break;
      next();
      const right = parseUnary();
      if (tok.v === "/" && right === 0) {
        throw new CalculationError(
          "DIVISION_BY_ZERO",
          `Pembagian dengan nol pada formula "${expression}".`,
        );
      }
      left = tok.v === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseExpr(): number {
    let left = parseTerm();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== "op" || (tok.v !== "+" && tok.v !== "-")) break;
      next();
      const right = parseTerm();
      left = tok.v === "+" ? left + right : left - right;
    }
    return left;
  }

  const value = parseExpr();
  if (pos !== tokens.length) {
    throw new CalculationError(
      "EXPRESSION_ERROR",
      `Ekspresi "${expression}" memiliki token berlebih.`,
    );
  }
  if (!Number.isFinite(value)) {
    throw new CalculationError(
      "EXPRESSION_ERROR",
      `Hasil formula "${expression}" tidak terhingga.`,
    );
  }
  return value;
}
