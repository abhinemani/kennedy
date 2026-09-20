import { evalFormula, type Scope } from "./expr";
import type { Study } from "./study-schema";

export type MetricResult = { id: string; value: number | null; headline?: string; sentence?: string };

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Real peers replace seed values once there are enough of them in the stratum. */
export function choosePeers(real: number[], seeds: number[], minReal: number): { values: number[]; source: "responses" | "seeds" } {
  return real.length >= minReal ? { values: real, source: "responses" } : { values: seeds, source: "seeds" };
}

const fmt = (n: number) => (Math.abs(n) >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));

function fill(template: string, scope: Scope, value: number): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k === "value" ? fmt(value) : String(scope[k] ?? "")));
}

export function computeBenchmark(study: Study, scope: Scope, peersByMetric: Record<string, number[]>): MetricResult[] {
  return (study.benchmark?.metrics ?? []).map((m) => {
    const value = evalFormula(m.formula, scope);
    const out: MetricResult = { id: m.id, value };
    if (value === null) return out;
    if (m.sentence) out.sentence = fill(m.sentence, scope, value);
    const med = median(peersByMetric[m.id] ?? []);
    if (m.headline && med !== null && med > 0) {
      const band = m.near_band ?? 0.15;
      out.headline = value > med * (1 + band) ? m.headline.above : value < med * (1 - band) ? m.headline.below : m.headline.near;
    }
    return out;
  });
}
