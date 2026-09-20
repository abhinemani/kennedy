import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkSeeds } from "@/db/schema";
import { evalFormula } from "@/core/expr";
import { choosePeers } from "@/core/benchmark";
import type { Study } from "@/core/study-schema";
import { peerAnswers, peerAttributes } from "@/db/queries/respondent";

export type Peers = {
  byMetric: Record<string, number[]>;
  source: Record<string, "responses" | "seeds">;
  realCount: number;
};

/**
 * Peer values for each metric: included responses in the same stratum, or the seed values
 * until there are enough real ones. The switch happens at the study's min_real_peers.
 */
export async function peersFor(studyId: string, stratumKey: string, study: Study): Promise<Peers> {
  const metrics = study.benchmark?.metrics ?? [];
  const byMetric: Record<string, number[]> = {};
  const source: Record<string, "responses" | "seeds"> = {};
  if (metrics.length === 0) return { byMetric, source, realCount: 0 };

  const questionIds = study.questions.map((q) => q.id);
  const [rows, attrs, seedRows] = await Promise.all([
    peerAnswers(studyId, stratumKey, questionIds),
    peerAttributes(studyId, stratumKey),
    db().select().from(benchmarkSeeds).where(eq(benchmarkSeeds.studyId, studyId)),
  ]);

  // Rebuild each peer's scope: their answers over their link attributes.
  const scopes = new Map<string, Record<string, unknown>>();
  for (const a of attrs) scopes.set(a.response_id, { ...(a.attributes ?? {}) });
  for (const row of rows) {
    const scope = scopes.get(row.response_id);
    if (scope) scope[row.question_id] = row.value;
  }

  const seedsFor = (metricId: string): number[] => {
    const row = seedRows.find((s) => s.metric === metricId && s.stratumKey === stratumKey);
    const values = row?.values;
    return Array.isArray(values) ? values.filter((v): v is number => typeof v === "number") : [];
  };

  for (const m of metrics) {
    const real: number[] = [];
    for (const scope of scopes.values()) {
      const value = evalFormula(m.formula, scope);
      if (value !== null && Number.isFinite(value)) real.push(value);
    }
    const chosen = choosePeers(real, seedsFor(m.id), study.benchmark?.min_real_peers ?? 10);
    byMetric[m.id] = chosen.values;
    source[m.id] = chosen.source;
  }

  return { byMetric, source, realCount: scopes.size };
}

export async function seedsForStudy(studyId: string) {
  return db().select().from(benchmarkSeeds).where(eq(benchmarkSeeds.studyId, studyId));
}

export async function saveSeed(studyId: string, metric: string, stratumKey: string, values: number[], sourceNote: string | null) {
  const existing = await db().select().from(benchmarkSeeds)
    .where(and(eq(benchmarkSeeds.studyId, studyId), eq(benchmarkSeeds.metric, metric), eq(benchmarkSeeds.stratumKey, stratumKey)))
    .limit(1);
  if (existing[0]) {
    await db().update(benchmarkSeeds).set({ values, sourceNote, updatedAt: new Date() }).where(eq(benchmarkSeeds.id, existing[0].id));
  } else {
    await db().insert(benchmarkSeeds).values({ studyId, metric, stratumKey, values, sourceNote });
  }
}
