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

export type Estimate = { estimate: number | null; n: number; effectiveN: number; moe: number | null };

export function weightedMean(rows: Weighted[]): Estimate {
  const w = rows.map((r) => r.weight), sum = w.reduce((t, x) => t + x, 0);
  const effectiveN = kishEffectiveN(w);
  return { estimate: sum === 0 ? null : rows.reduce((t, r) => t + r.value * r.weight, 0) / sum, n: rows.length, effectiveN, moe: marginOfError(effectiveN) };
}

/** Share of rows where `hit` is true, as a percentage. */
export function weightedShare(rows: { hit: boolean; weight: number }[]): Estimate {
  const e = weightedMean(rows.map((r) => ({ value: r.hit ? 100 : 0, weight: r.weight })));
  return e;
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
