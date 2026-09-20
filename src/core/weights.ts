export type StratumCount = { key: string; frame: number; respondents: number };
export type Weighted = { value: number; weight: number };

/** Post-stratification: frame share over respondent share, capped. Empty strata get null. */
export function stratumWeights(strata: StratumCount[], cap = 5): Record<string, number | null> {
  const frame = strata.reduce((t, s) => t + s.frame, 0);
  const resp = strata.reduce((t, s) => t + s.respondents, 0);
  const out: Record<string, number | null> = {};
  for (const s of strata)
    out[s.key] = s.respondents === 0 || resp === 0 ? null : Math.min(cap, (s.frame / frame) / (s.respondents / resp));
  return out;
}

export function kishEffectiveN(weights: number[]): number {
  const sum = weights.reduce((t, w) => t + w, 0), sq = weights.reduce((t, w) => t + w * w, 0);
  return sq === 0 ? 0 : (sum * sum) / sq;
}

/** Conservative 95% margin of error for a proportion, in percentage points. */
export function marginOfError(effectiveN: number): number | null {
  return effectiveN > 0 ? 1.96 * Math.sqrt(0.25 / effectiveN) * 100 : null;
}

/**
 * `moe` is a 95% margin of error, and `moeKind` says what its units are. The two travel
 * together because they have to: a proportion's margin is in percentage points, a mean's is
 * in whatever the mean measures, and rendering one as the other produces a number that is not
 * wrong by a little.
 */
export type MoeKind = "absolute" | "percentage_points";
export type Estimate = {
  estimate: number | null;
  n: number;
  effectiveN: number;
  moe: number | null;
  moeKind: MoeKind;
};

/**
 * The mean of a quantity, weighted.
 *
 * The margin of error comes from how much the values themselves vary, not from a proportion's
 * worst case: "about 19 requests per 1,000 residents, give or take 2" is a statement about
 * request volumes, and nothing about p = 0.5 has anything to say about it.
 */
export function weightedMean(rows: Weighted[]): Estimate {
  const w = rows.map((r) => r.weight);
  const sum = w.reduce((t, x) => t + x, 0);
  const effectiveN = kishEffectiveN(w);
  if (sum === 0) return { estimate: null, n: rows.length, effectiveN, moe: null, moeKind: "absolute" };

  const estimate = rows.reduce((t, r) => t + r.value * r.weight, 0) / sum;

  // Variance of a weighted mean: the spread of the values, scaled by how unevenly the weights
  // fall. One response cannot carry a margin of error, so that case reports none.
  const sumSqWeights = w.reduce((t, x) => t + x * x, 0);
  const variance = rows.reduce((t, r) => t + r.weight * (r.value - estimate) ** 2, 0) / sum;
  const standardError = rows.length < 2 ? null : Math.sqrt((variance * sumSqWeights) / (sum * sum));

  return {
    estimate,
    n: rows.length,
    effectiveN,
    moe: standardError === null ? null : 1.96 * standardError,
    moeKind: "absolute",
  };
}

/**
 * Share of rows where `hit` is true, in percentage points.
 *
 * The margin is the conservative one (p = 0.5), which is never narrower than the truth. A
 * tighter figure using the observed p would flatter a lopsided result.
 */
export function weightedShare(rows: { hit: boolean; weight: number }[]): Estimate {
  const mean = weightedMean(rows.map((r) => ({ value: r.hit ? 100 : 0, weight: r.weight })));
  return { ...mean, moe: marginOfError(mean.effectiveN), moeKind: "percentage_points" };
}

export type EntityResponse = { responseId: string; entityId: string; role: string; completedAt: Date };

/** For entity-level numbers, count each government once: best role first, then earliest. */
export function onePerEntity<T extends EntityResponse>(rows: T[], roleOrder: string[]): T[] {
  const rank = (r: string) => { const i = roleOrder.indexOf(r); return i === -1 ? roleOrder.length : i; };
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.entityId);
    if (!cur || rank(r.role) < rank(cur.role) || (rank(r.role) === rank(cur.role) && r.completedAt < cur.completedAt)) best.set(r.entityId, r);
  }
  return [...best.values()];
}
