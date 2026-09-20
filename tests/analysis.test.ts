import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStudy, type Study } from "../src/core/study-schema";
import {
  choiceShares, coverage, excluded, included, isEntityLevel, metricEstimates,
  type AnalysisResponse,
} from "../src/core/analysis";
import { methodsNote } from "../src/core/methods";

const parsed = parseStudy(readFileSync("templates/brandeis-records-2026/study.yaml", "utf8"));
if (!parsed.ok) throw new Error("the worked example must parse");
const study: Study = parsed.study;

const FRAME = { under_10k: 20_000, "10k_50k": 8_000, "50k_250k": 1_500, over_250k: 300 };

function response(over: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    responseId: `r${Math.random().toString(36).slice(2, 8)}`,
    entityId: `e${Math.random().toString(36).slice(2, 8)}`,
    role: "clerk",
    stratumKey: "10k_50k",
    completedAt: new Date("2026-09-20T12:00:00Z"),
    reviewStatus: "included",
    exclusionReason: null,
    answers: { volume: 800, hours: 2, repeats: 30, involvement: "process", ai_comfort: 3 },
    attributes: { population: 42_000, state: "MI", role: "clerk" },
    ...over,
  };
}

const many = (count: number, over: Partial<AnalysisResponse> = {}) =>
  Array.from({ length: count }, () => response(over));

describe("what counts as in the analysis", () => {
  it("keeps everything the operator has not excluded, flags and all", () => {
    const rows = [response(), response({ reviewStatus: "pending" }), response({ reviewStatus: "excluded" })];
    expect(included(rows)).toHaveLength(2);
    expect(excluded(rows)).toHaveLength(1);
  });
});

describe("one government, one voice", () => {
  it("counts a government once for a question about the office", () => {
    expect(isEntityLevel(study, "requests_per_1000")).toBe(true);
    expect(isEntityLevel(study, "hours_per_year")).toBe(true);
  });

  it("does not collapse two people from the same government into one", () => {
    const shared = "same-city";
    const rows = [
      response({ entityId: shared, role: "clerk", answers: { volume: 800, hours: 2 } }),
      response({ entityId: shared, role: "manager", answers: { volume: 2_000, hours: 2 } }),
    ];
    const [metric] = metricEstimates(study, rows, FRAME);
    // Both answered, but the government is one place, so n is one.
    expect(metric?.n).toBe(1);
  });

  it("prefers the role closest to the work when a government answers twice", () => {
    const shared = "same-city";
    const rows = [
      response({ entityId: shared, role: "manager", answers: { volume: 9_999, hours: 2 } }),
      response({ entityId: shared, role: "records_officer", answers: { volume: 800, hours: 2 } }),
    ];
    const [metric] = metricEstimates(study, rows, FRAME);
    // records_officer comes before manager in the study's role order.
    expect(metric?.estimate).toBeCloseTo((800 / 42_000) * 1000, 5);
  });
});

describe("weighted estimates", () => {
  it("reports an n, an effective n, and a margin of error", () => {
    const rows = many(40);
    const [metric] = metricEstimates(study, rows, FRAME);
    expect(metric?.n).toBe(40);
    expect(metric?.effectiveN).toBeGreaterThan(0);
    expect(metric?.moe).not.toBeNull();
  });

  it("gives an effective n no larger than the n, because weighting costs precision", () => {
    const rows = [...many(30, { stratumKey: "10k_50k" }), ...many(4, { stratumKey: "over_250k" })];
    const [metric] = metricEstimates(study, rows, FRAME);
    expect(metric!.effectiveN).toBeLessThanOrEqual(metric!.n);
  });

  it("leaves excluded responses out of the numbers entirely", () => {
    const honest = many(20, { answers: { volume: 800, hours: 2 } });
    const nonsense = many(5, {
      reviewStatus: "excluded",
      exclusionReason: "duplicate submission",
      answers: { volume: 900_000, hours: 2 },
    });
    const withThem = metricEstimates(study, [...honest, ...nonsense], FRAME)[0];
    const withoutThem = metricEstimates(study, honest, FRAME)[0];
    expect(withThem?.estimate).toBeCloseTo(withoutThem!.estimate!, 6);
    expect(withThem?.n).toBe(20);
  });

  it("gives a mean a margin in its own units, not a proportion's", () => {
    // "19 requests per 1,000, give or take 2" is a statement about request volumes. A
    // proportion's worst case has nothing to say about it, and reporting one as the other
    // produced a margin of plus or minus 1,789 percent.
    const rows = many(30, { answers: { volume: 800, hours: 2 } });
    const [metric] = metricEstimates(study, rows, FRAME);
    expect(metric?.moeKind).toBe("absolute");
    expect(metric?.estimate).toBeCloseTo((800 / 42_000) * 1000, 5);
    // Every response is identical, so there is no spread and the margin is nil.
    expect(metric?.moe).toBeCloseTo(0, 6);
  });

  it("widens the margin as the answers disagree with each other", () => {
    const tight = metricEstimates(study, many(30, { answers: { volume: 800, hours: 2 } }), FRAME)[0];
    const spread = metricEstimates(
      study,
      Array.from({ length: 30 }, (_, i) => response({ answers: { volume: 200 + i * 400, hours: 2 } })),
      FRAME,
    )[0];
    expect(spread!.moe!).toBeGreaterThan(tight!.moe!);
  });

  it("reports no margin from a single response, because one number has no spread", () => {
    const [metric] = metricEstimates(study, many(1), FRAME);
    expect(metric?.n).toBe(1);
    expect(metric?.moe).toBeNull();
  });

  it("returns nothing rather than a wrong number when a metric cannot be computed", () => {
    const rows = many(5, { answers: { hours: 2 } }); // no volume
    const [metric] = metricEstimates(study, rows, FRAME);
    expect(metric?.n).toBe(0);
    expect(metric?.estimate).toBeNull();
    expect(metric?.moe).toBeNull();
  });

  it("breaks each estimate out by band", () => {
    const rows = [...many(10, { stratumKey: "under_10k" }), ...many(10, { stratumKey: "10k_50k" })];
    const [metric] = metricEstimates(study, rows, FRAME);
    expect(metric?.byStratum).toHaveLength(study.sample.strata.bands.length);
    expect(metric?.byStratum.find((s) => s.key === "under_10k")?.n).toBe(10);
  });
});

describe("shares of a closed question", () => {
  it("weights each option and carries its own n", () => {
    const rows = [
      ...many(15, { answers: { volume: 800, hours: 2, tool: "manual" } }),
      ...many(5, { answers: { volume: 800, hours: 2, tool: "govqa" } }),
    ];
    const shares = choiceShares(study, rows, FRAME);
    const tool = shares.find((s) => s.questionId === "tool");
    const manual = tool?.options.find((o) => o.value === "manual");
    // Shares are in percentage points, and say so.
    expect(manual?.estimate).toBeCloseTo(75, 6);
    expect(manual?.moeKind).toBe("percentage_points");
    expect(manual?.n).toBe(20);
  });
});

describe("coverage", () => {
  it("flags a band that is answering well below its target", () => {
    const rows = [...many(60, { stratumKey: "10k_50k" }), ...many(2, { stratumKey: "over_250k" })];
    const bands = coverage(study, rows, FRAME);
    expect(bands.find((b) => b.key === "over_250k")?.under).toBe(true);
  });

  it("does not flag a band that is close enough to its target", () => {
    const target = study.sample.strata.bands.find((b) => b.key === "over_250k")!.target;
    const rows = many(target, { stratumKey: "over_250k" });
    expect(coverage(study, rows, FRAME).find((b) => b.key === "over_250k")?.under).toBe(false);
  });
});

describe("the methods note", () => {
  const base: Omit<Parameters<typeof methodsNote>[0], "rows" | "coverage" | "estimates"> = {
    study,
    version: 3,
    publishedAt: new Date("2026-09-01T12:00:00Z"),
    frameTotal: 29_800,
    drawn: 6_000,
    emailed: 5_800,
    fieldedFrom: new Date("2026-09-05T12:00:00Z"),
    fieldedTo: new Date("2026-09-26T12:00:00Z"),
    codingAgreement: null,
    generatedAt: new Date("2026-10-01T12:00:00Z"),
  };

  const noteFor = (rows: AnalysisResponse[], extra: Partial<typeof base> = {}) =>
    methodsNote({
      ...base,
      ...extra,
      rows,
      coverage: coverage(study, rows, FRAME),
      estimates: metricEstimates(study, rows, FRAME),
    });

  it("says which version was answered and when it was published", () => {
    const note = noteFor(many(30));
    expect(note).toContain("version 3");
    expect(note).toContain("September 1, 2026");
  });

  it("describes the frame, the seed, and that the draw can be re-run", () => {
    const note = noteFor(many(30));
    expect(note).toContain(String(study.sample.seed));
    expect(note).toContain("reproducible");
  });

  it("states the response rate against those emailed", () => {
    const note = noteFor(many(58));
    expect(note).toContain("response rate of 1 percent");
  });

  it("reports every exclusion, with its reason and a count", () => {
    const rows = [
      ...many(20),
      ...many(3, { reviewStatus: "excluded", exclusionReason: "answered about the wrong government" }),
      ...many(1, { reviewStatus: "excluded", exclusionReason: "duplicate submission" }),
    ];
    const note = noteFor(rows);
    expect(note).toContain("4 of 24 responses were excluded");
    expect(note).toContain("answered about the wrong government");
    expect(note).toContain("duplicate submission");
  });

  it("says plainly that flags never exclude anything by themselves", () => {
    const note = noteFor([...many(5), ...many(1, { reviewStatus: "excluded", exclusionReason: "speeder" })]);
    expect(note).toContain("never exclude a response on their own");
  });

  it("says no responses were excluded when none were", () => {
    expect(noteFor(many(10))).toContain("No responses were excluded.");
  });

  it("explains the weighting, the cap, and one government one voice", () => {
    const note = noteFor(many(30));
    expect(note).toContain("post-stratified");
    expect(note).toContain(`capped at ${study.quality.weight_cap}`);
    expect(note).toContain("each government counts once");
  });

  it("explains that the margin of error comes from the effective n", () => {
    expect(noteFor(many(30))).toContain("computed from the effective n, not the n");
  });

  it("never prints a mean's margin as a percentage", () => {
    const rows = Array.from({ length: 30 }, (_, i) => response({ answers: { volume: 200 + i * 400, hours: 2 } }));
    const note = noteFor(rows);
    expect(note).not.toMatch(/±[\d,.]+ percent/);
    expect(note).toMatch(/±[\d,.]+/);
  });

  it("names the under-represented bands", () => {
    const rows = [...many(60, { stratumKey: "10k_50k" }), ...many(1, { stratumKey: "over_250k" })];
    const note = noteFor(rows);
    expect(note).toContain("Under-represented relative to target");
    expect(note).toContain("Over 250,000");
  });

  it("reports the coding agreement when open text has been coded", () => {
    const note = noteFor(many(20), { codingAgreement: { sampled: 30, agreed: 27 } });
    expect(note).toContain("90 percent");
    expect(note).toContain("respondents, not mentions");
  });

  it("leaves the coding section out when nothing has been coded", () => {
    expect(noteFor(many(20))).not.toContain("How open answers were coded");
  });

  it("says what the study cannot tell you, rather than only what it can", () => {
    const note = noteFor(many(30));
    expect(note).toContain("not a census");
    expect(note).toContain("cannot correct for the difference between people who");
  });

  it("makes no claim that is not true of this study", () => {
    const note = noteFor(many(30));
    expect(note).not.toMatch(/SOC ?2|HIPAA|GDPR compliant|representative of all/i);
  });
});
