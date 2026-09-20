import { describe, expect, it } from "vitest";
import { expectedCompletes, expectedInterviews, marginAt, sampleSize } from "../src/core/plan";

describe("planning a study", () => {
  it("expects about three or four completes per hundred people sampled", () => {
    expect(expectedCompletes(6400)).toBe(218);
    expect(expectedCompletes(0)).toBe(0);
  });

  it("caps interviews at what the study offers", () => {
    expect(expectedInterviews(218, 40)).toBe(39);
    expect(expectedInterviews(500, 40)).toBe(40);
    expect(expectedInterviews(500, null)).toBe(90);
  });

  it("gives the worst-case margin for a share, in points", () => {
    expect(marginAt(214)).toBe(6.7);
    expect(marginAt(0)).toBeNull();
  });

  it("draws no more than the band targets allow", () => {
    expect(sampleSize(9000, [2600, 2400, 1100, 300])).toBe(6400);
    expect(sampleSize(1000, [2600, 2400, 1100, 300])).toBe(1000);
  });
});
