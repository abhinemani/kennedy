// Turning stored answers into the numbers a report can carry.
//
// Every estimate leaves here with its n, its Kish effective n, and a margin of error, because
// a number without those three is not evidence. Excluded responses are removed before any of
// it is computed, and what was removed is reported alongside.

import { evalFormula, type Scope } from "./expr";
import type { Study } from "./study-schema";
import {
  kishEffectiveN, marginOfError, onePerEntity, stratumWeights, weightedMean, weightedShare,
  type Estimate, type StratumCount,
} from "./weights";

export type AnalysisResponse = {
  responseId: string;
  entityId: string;
  role: string;
  stratumKey: string;
  completedAt: Date;
  reviewStatus: "pending" | "included" | "excluded";
  exclusionReason: string | null;
  answers: Record<string, unknown>;
  attributes: Record<string, unknown>;
};

export type MetricEstimate = Estimate & {
  id: string;
  label: string;
  /** Whether each government counts once, or every respondent does. */
  basis: "entity" | "respondent";
  byStratum: (Estimate & { key: string; label: string; weight: number | null })[];
};

/** A response is in the analysis unless the operator excluded it. Flags never exclude. */
export function included(rows: AnalysisResponse[]): AnalysisResponse[] {
  return rows.filter((r) => r.reviewStatus !== "excluded");
}

export function excluded(rows: AnalysisResponse[]): AnalysisResponse[] {
  return rows.filter((r) => r.reviewStatus === "excluded");
}

const scopeOf = (r: AnalysisResponse): Scope => ({ ...r.attributes, ...r.answers });

/**
 * Entity-level questions describe a government, so counting two people from the same one
 * twice would double it. Attitude questions describe a person, so everyone counts.
 */
export function isEntityLevel(study: Study, metricId: string): boolean {
  const metric = study.benchmark?.metrics.find((m) => m.id === metricId);
  if (!metric) return true;
  // A formula over counts and hours describes the office. A scale describes the respondent.
  const ids = metric.formula.match(/[a-z][a-z0-9_]*/g) ?? [];
  return !ids.some((id) => study.questions.find((q) => q.id === id)?.type === "scale");
}

export function strataCounts(study: Study, frame: Record<string, number>, rows: AnalysisResponse[]): StratumCount[] {
  return study.sample.strata.bands.map((band) => ({
    key: band.key,
    frame: frame[band.key] ?? 0,
    respondents: rows.filter((r) => r.stratumKey === band.key).length,
  }));
}

/**
 * One weighted estimate per benchmark metric, and the same broken out by stratum.
 *
 * `frame` is how many governments of each band exist in the registry, not how many answered:
 * post-stratification is the ratio between those two.
 */
export function metricEstimates(
  study: Study,
  rows: AnalysisResponse[],
  frame: Record<string, number>,
  weightCap = 5,
): MetricEstimate[] {
  const keep = included(rows);
  const counts = strataCounts(study, frame, keep);
  const weights = stratumWeights(counts, weightCap);
  const bandLabel = (key: string) => study.sample.strata.bands.find((b) => b.key === key)?.label ?? key;

  return (study.benchmark?.metrics ?? []).map((metric) => {
    const basis = isEntityLevel(study, metric.id) ? "entity" : "respondent";
    const usable = basis === "entity" ? onePerEntity(keep, [...study.quality.entity_role_order]) : keep;

    const valued = usable
      .map((r) => ({ row: r, value: evalFormula(metric.formula, scopeOf(r)) }))
      .filter((x): x is { row: AnalysisResponse; value: number } => x.value !== null && Number.isFinite(x.value));

    const weighted = valued.map((x) => ({ value: x.value, weight: weights[x.row.stratumKey] ?? 1 }));
    const overall = weightedMean(weighted);

    const byStratum = study.sample.strata.bands.map((band) => {
      const here = valued.filter((x) => x.row.stratumKey === band.key);
      return {
        key: band.key,
        label: band.label,
        weight: weights[band.key] ?? null,
        ...weightedMean(here.map((x) => ({ value: x.value, weight: 1 }))),
      };
    });

    return { id: metric.id, label: metric.id.replace(/_/g, " "), basis, ...overall, byStratum };
  });
}

export type ChoiceShare = {
  questionId: string;
  text: string;
  options: (Estimate & { value: string; label: string })[];
};

/** Weighted share picking each option, for the closed questions that carry the story. */
export function choiceShares(
  study: Study,
  rows: AnalysisResponse[],
  frame: Record<string, number>,
  weightCap = 5,
): ChoiceShare[] {
  const keep = included(rows);
  const weights = stratumWeights(strataCounts(study, frame, keep), weightCap);

  return study.questions
    .filter((q) => q.type === "choice")
    .map((q) => {
      const answered = keep.filter((r) => r.answers[q.id] !== undefined && r.answers[q.id] !== null);
      return {
        questionId: q.id,
        text: q.text,
        options: (q.type === "choice" ? q.options : []).map((o) => ({
          value: String(o.value),
          label: o.label,
          ...weightedShare(
            answered.map((r) => ({
              hit: String(r.answers[q.id]) === String(o.value),
              weight: weights[r.stratumKey] ?? 1,
            })),
          ),
        })),
      };
    });
}

export type Funnel = {
  drawn: number;
  emailed: number;
  loaded: number;
  started: number;
  completed: number;
  included: number;
};

export type Coverage = {
  key: string;
  label: string;
  frame: number;
  target: number;
  responses: number;
  weight: number | null;
  /** Under-responding compared with the target, so the operator can push there. */
  under: boolean;
};

export function coverage(
  study: Study,
  rows: AnalysisResponse[],
  frame: Record<string, number>,
  weightCap = 5,
): Coverage[] {
  const keep = included(rows);
  const counts = strataCounts(study, frame, keep);
  const weights = stratumWeights(counts, weightCap);

  return study.sample.strata.bands.map((band) => {
    const responses = keep.filter((r) => r.stratumKey === band.key).length;
    // A stratum is flagged when it has under two thirds of the responses its target implies.
    const share = band.target === 0 ? 1 : responses / band.target;
    return {
      key: band.key,
      label: band.label,
      frame: frame[band.key] ?? 0,
      target: band.target,
      responses,
      weight: weights[band.key] ?? null,
      under: share < 0.667,
    };
  });
}

export { kishEffectiveN, marginOfError };
