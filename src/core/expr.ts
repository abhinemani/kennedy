// Two tiny, safe languages used by study files. Neither uses eval.
//  1. Formulas: arithmetic over named values, e.g. "volume / population * 1000"
//  2. Conditions: show_if objects, e.g. { tool: { not_in: ["manual"] } }

export type Scope = Record<string, unknown>;

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/()]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected character in formula at position ${i}: "${src}"`);
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "id", v: m[2] });
    else out.push({ t: "op", v: m[3]! });
    i = re.lastIndex;
  }
  return out;
}

/** Names a formula refers to. Used to validate study files before publishing. */
export function formulaIdentifiers(src: string): string[] {
  return [...new Set(lex(src).filter((t) => t.t === "id").map((t) => t.v as string))];
}

/** Returns a finite number, or null when any input is missing or not numeric. */
export function evalFormula(src: string, scope: Scope): number | null {
  const toks = lex(src);
  let p = 0;
  let missing = false;
  const peek = () => toks[p];
  const take = () => toks[p++];

  function primary(): number {
    const t = take();
    if (!t) throw new Error(`Formula ended early: "${src}"`);
    if (t.t === "num") return t.v;
    if (t.t === "id") {
      const raw = scope[t.v];
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) { missing = true; return 0; }
      return n;
    }
    if (t.v === "(") { const v = sum(); const c = take(); if (!c || c.v !== ")") throw new Error(`Missing ")" in "${src}"`); return v; }
    if (t.v === "-") return -primary();
    throw new Error(`Unexpected "${t.v}" in "${src}"`);
  }
  function product(): number {
    let v = primary();
    for (let t = peek(); t && t.t === "op" && (t.v === "*" || t.v === "/"); t = peek()) {
      take(); const r = primary(); v = t.v === "*" ? v * r : v / r;
    }
    return v;
  }
  function sum(): number {
    let v = product();
    for (let t = peek(); t && t.t === "op" && (t.v === "+" || t.v === "-"); t = peek()) {
      take(); const r = product(); v = t.v === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  if (p < toks.length) throw new Error(`Unexpected trailing input in "${src}"`);
  return missing || !Number.isFinite(v) ? null : v;
}

export type Test =
  | { equals: unknown } | { not_equals: unknown }
  | { in: unknown[] } | { not_in: unknown[] }
  | { less_than: number } | { greater_than: number }
  | { answered: boolean };
export type Condition = { all?: Condition[]; any?: Condition[] } | Record<string, Test>;

const same = (a: unknown, b: unknown) => String(a) === String(b);

function test(value: unknown, t: Test): boolean {
  const has = value !== undefined && value !== null && value !== "";
  if ("answered" in t) return has === t.answered;
  if ("equals" in t) return has && same(value, t.equals);
  if ("not_equals" in t) return !has || !same(value, t.not_equals);
  if ("in" in t) return has && t.in.some((x) => same(value, x));
  if ("not_in" in t) return has && !t.not_in.some((x) => same(value, x));
  if ("less_than" in t) return has && Number(value) < t.less_than;
  if ("greater_than" in t) return has && Number(value) > t.greater_than;
  return false;
}

/** Keys of a condition are ANDed. Use { any: [...] } for OR. No condition means visible. */
export function evalCondition(cond: Condition | undefined, scope: Scope): boolean {
  if (!cond) return true;
  return Object.entries(cond).every(([key, val]) => {
    if (key === "all") return (val as Condition[]).every((c) => evalCondition(c, scope));
    if (key === "any") return (val as Condition[]).some((c) => evalCondition(c, scope));
    return test(scope[key], val as Test);
  });
}

export function conditionIdentifiers(cond: Condition | undefined): string[] {
  if (!cond) return [];
  return Object.entries(cond).flatMap(([key, val]) =>
    key === "all" || key === "any" ? (val as Condition[]).flatMap(conditionIdentifiers) : [key],
  );
}
