import { toCsv, type Row } from "@/core/csv";
import type { Study } from "@/core/study-schema";
import type { Analysis } from "./study-analysis";

/**
 * Exports.
 *
 * The default exports are anonymised: no names, no email addresses, no government names. A
 * respondent is a size band, a state, and a role, because that is everything an analysis needs
 * and nothing it does not. Hand-raises are the single identified export, and they exist only
 * because those people asked to be contacted.
 */

export type ExportFile = { filename: string; contentType: string; body: string };

const STATE_ONLY = "state";

/** Answers, one row per response, one column per question. Nothing identifying. */
export function answersCsv(study: Study, a: Analysis): ExportFile {
  const questionIds = study.questions.map((q) => q.id);
  const headers = ["response_id", "population_band", STATE_ONLY, "role", "review_status", ...questionIds];

  const rows: Row[] = a.rows.map((r) => {
    const row: Row = {
      response_id: r.responseId,
      population_band: r.stratumKey,
      state: String(r.attributes.state ?? ""),
      role: r.role,
      review_status: r.reviewStatus,
    };
    for (const id of questionIds) {
      const value = r.answers[id];
      row[id] = value === undefined || value === null ? "" : Array.isArray(value) ? value.join("|") : String(value);
    }
    return row;
  });

  return { filename: "answers.csv", contentType: "text/csv; charset=utf-8", body: toCsv(headers, rows) };
}

/**
 * Written answers, kept in their own file and joined to identity by nothing at all. The
 * response id is here so a quote can be traced back by someone with the database, and no
 * further.
 */
export function freeTextCsv(rows: { responseId: string; questionId: string; text: string; stratumKey: string; reviewStatus: string }[]): ExportFile {
  const headers = ["response_id", "question_id", "population_band", "review_status", "text"];
  return {
    filename: "free-text.csv",
    contentType: "text/csv; charset=utf-8",
    body: toCsv(
      headers,
      rows.map((r) => ({
        response_id: r.responseId,
        question_id: r.questionId,
        population_band: r.stratumKey,
        review_status: r.reviewStatus,
        text: r.text,
      })),
    ),
  };
}

/** Chart-ready: every estimate with its n, effective n, and margin, overall and per band. */
export function estimatesJson(study: Study, a: Analysis): ExportFile {
  const body = {
    study: study.slug,
    generated_at: new Date().toISOString(),
    responses_included: a.included.length,
    responses_excluded: a.rows.length - a.included.length,
    metrics: a.estimates.map((e) => ({
      id: e.id,
      basis: e.basis,
      estimate: e.estimate,
      margin_of_error: e.moe,
      margin_of_error_units: e.moeKind,
      n: e.n,
      effective_n: e.effectiveN,
      by_stratum: e.byStratum.map((s) => ({
        key: s.key,
        label: s.label,
        estimate: s.estimate,
        n: s.n,
        weight: s.weight,
      })),
    })),
    shares: a.shares.map((s) => ({
      question_id: s.questionId,
      text: s.text,
      options: s.options.map((o) => ({
        value: o.value,
        label: o.label,
        percent: o.estimate,
        margin_of_error_points: o.moe,
        n: o.n,
      })),
    })),
    coverage: a.coverage,
  };
  return {
    filename: "estimates.json",
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body, null, 2),
  };
}

/** The one identified export, and only for people who asked to hear from someone. */
export function handRaisesCsv(
  rows: { type: string; email: string; domainMatch: boolean; verifiedAt: Date | null; entityName: string; state: string; role: string; fullName: string | null }[],
): ExportFile {
  const headers = ["asked_for", "name", "email", "government", "state", "role", "work_email_matches", "verified"];
  return {
    filename: "hand-raises.csv",
    contentType: "text/csv; charset=utf-8",
    body: toCsv(
      headers,
      rows.map((r) => ({
        asked_for: r.type,
        name: r.fullName ?? "",
        email: r.email,
        government: r.entityName,
        state: r.state,
        role: r.role,
        work_email_matches: r.domainMatch ? "yes" : "no",
        verified: r.verifiedAt ? "yes" : "no",
      })),
    ),
  };
}

export function methodsFile(note: string): ExportFile {
  return { filename: "methods.md", contentType: "text/markdown; charset=utf-8", body: note };
}

/**
 * Anything that would identify a respondent, for the test that guards the default exports.
 * Kept here so the rule and its check live in the same place.
 */
export function looksIdentifying(csv: string, forbidden: { emails: string[]; names: string[]; entities: string[] }): string[] {
  const found: string[] = [];
  const haystack = csv.toLowerCase();
  for (const email of forbidden.emails) if (email && haystack.includes(email.toLowerCase())) found.push(email);
  for (const name of forbidden.names) if (name && haystack.includes(name.toLowerCase())) found.push(name);
  for (const entity of forbidden.entities) if (entity && haystack.includes(entity.toLowerCase())) found.push(entity);
  return [...new Set(found)];
}
