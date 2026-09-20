import { choiceShares, coverage, included, metricEstimates, type AnalysisResponse } from "@/core/analysis";
import { methodsNote } from "@/core/methods";
import type { Study } from "@/core/study-schema";
import { analysisRows, fieldingDates, frameByBand, funnel } from "@/db/queries/analysis";
import { drawnSummary } from "@/db/queries/sample";
import { touchesSoFar } from "@/db/queries/sending";
import { alreadyDrawn, countEntities } from "@/db/queries/contacts";
import { codingAgreement } from "@/db/queries/coding";

/** Everything the results screen, the exports, and the methods note all need, gathered once. */
export async function analyse(study: Study, studyId: string) {
  const bands = study.sample.strata.bands.map((b) => ({ key: b.key, max: b.max }));

  const [rows, frame, counts, drawn, touches, dates, frameTotal, agreement, perBand] = await Promise.all([
    analysisRows(studyId),
    frameByBand(bands),
    funnel(studyId),
    alreadyDrawn(studyId),
    touchesSoFar(studyId),
    fieldingDates(studyId),
    countEntities(),
    codingAgreement(studyId).catch(() => null),
    drawnSummary(studyId).catch(() => []),
  ]);

  // How many contacts were drawn into each band, which is what a response rate is measured
  // against. The study file's per-band target is this number, not a number of completes.
  const drawnByBand: Record<string, number> = {};
  for (const row of perBand) drawnByBand[row.stratumKey] = row.n;

  const cap = study.quality.weight_cap;
  return {
    rows,
    frame,
    frameTotal,
    funnel: counts,
    drawn,
    emailed: touches.reduce((n, t) => n + t.n, 0),
    fieldedFrom: dates.from,
    fieldedTo: dates.to,
    coverage: coverage(study, rows, frame, drawnByBand, cap),
    estimates: metricEstimates(study, rows, frame, cap),
    shares: choiceShares(study, rows, frame, cap),
    included: included(rows),
    agreement,
  };
}

export type Analysis = Awaited<ReturnType<typeof analyse>>;

export function noteFor(study: Study, version: number, publishedAt: Date | null, a: Analysis): string {
  return methodsNote({
    study,
    version,
    publishedAt,
    rows: a.rows,
    coverage: a.coverage,
    estimates: a.estimates,
    frameTotal: a.frameTotal,
    drawn: a.drawn,
    emailed: a.emailed,
    fieldedFrom: a.fieldedFrom,
    fieldedTo: a.fieldedTo,
    codingAgreement: a.agreement,
    generatedAt: new Date(),
  });
}
