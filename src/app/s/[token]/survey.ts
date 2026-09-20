import type { Question, Study } from "@/core/study-schema";
import { UNKNOWN } from "@/core/flow";
import { ROLES } from "@/core/lists";
import type { Scope } from "@/core/expr";

// Bookkeeping we keep beside the answers. Prefixed so it never reaches the kernel, an
// export, or an analysis as if it were something the respondent said.
const INTERNAL = "__";
export const confirmedKey = (questionId: string) => `${INTERNAL}confirmed_${questionId}`;

export function respondentAnswers(all: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) if (!k.startsWith(INTERNAL)) out[k] = v;
  return out;
}

export function confirmedImplausible(all: Record<string, unknown>): boolean {
  return Object.entries(all).some(([k, v]) => k.startsWith(`${INTERNAL}confirmed_`) && v === true);
}

/** Link attributes, plus the readable role label the intro text uses. */
export function linkScope(attributes: Record<string, string | number>): Scope {
  const role = String(attributes.role ?? "");
  const label = ROLES.find((r) => r.key === role)?.label ?? "official";
  return {
    ...attributes,
    // "Clerks" reads wrong in a sentence about one person.
    role_label: label.replace(/s$/, "").toLowerCase(),
  };
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/** Fill {name} placeholders in study copy from the link attributes. */
export function fillCopy(template: string, scope: Scope): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = scope[key];
    if (value === undefined || value === null) return whole;
    return typeof value === "number" ? NUMBER_FORMAT.format(value) : String(value);
  });
}

/** Turn what a form sent into the value the kernel expects for this question type. */
export function readAnswer(q: Question, form: FormData): unknown {
  if (q.type === "number") {
    if (form.get("unknown")) return UNKNOWN;
    const raw = String(form.get("value") ?? "").trim();
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  if (q.type === "multi") {
    const values = form.getAll("value").map((v) => String(v));
    return values.length ? coerceAll(q, values) : [];
  }

  const raw = form.get("value");
  if (raw === null) return undefined;
  const text = String(raw);

  if (q.type === "slider" || q.type === "scale") {
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
  }
  if (q.type === "choice") return coerceOne(q, text);
  return text.trim() === "" ? undefined : text;
}

/** Options may be numbers in the study file; forms only carry strings. */
function coerceOne(q: Extract<Question, { type: "choice" | "multi" }>, text: string): string | number | undefined {
  const match = q.options.find((o) => String(o.value) === text);
  return match?.value;
}

function coerceAll(q: Extract<Question, { type: "multi" }>, texts: string[]): (string | number)[] {
  return texts.map((t) => coerceOne(q, t)).filter((v): v is string | number => v !== undefined);
}

export function isFreeText(q: Question): boolean {
  return q.type === "open" || q.type === "short_text";
}

export function questionById(study: Study, id: string): Question | null {
  return study.questions.find((q) => q.id === id) ?? null;
}
