import { describe, expect, it } from "vitest";
import { checkLimit, clearFailures, noteFailure } from "../src/lib/rate-limit";

const WINDOW = 10 * 60 * 1000;

describe("the sign-in throttle", () => {
  it("lets a caller through when they have not failed", () => {
    expect(checkLimit("a", 3, WINDOW).ok).toBe(true);
  });

  it("does not count a check against the caller, so repeated successes never lock anyone out", () => {
    for (let i = 0; i < 50; i += 1) expect(checkLimit("b", 3, WINDOW).ok).toBe(true);
  });

  it("locks out after enough failures, and says how long to wait", () => {
    for (let i = 0; i < 3; i += 1) noteFailure("c", WINDOW);
    const limit = checkLimit("c", 3, WINDOW);
    expect(limit.ok).toBe(false);
    if (!limit.ok) expect(limit.retryInSeconds).toBeGreaterThan(0);
  });

  it("forgets the failures once the window has passed", () => {
    const start = Date.now();
    for (let i = 0; i < 5; i += 1) noteFailure("d", WINDOW, start);
    expect(checkLimit("d", 3, WINDOW, start).ok).toBe(false);
    expect(checkLimit("d", 3, WINDOW, start + WINDOW + 1).ok).toBe(true);
  });

  it("clears the count on a successful sign-in", () => {
    for (let i = 0; i < 5; i += 1) noteFailure("e", WINDOW);
    expect(checkLimit("e", 3, WINDOW).ok).toBe(false);
    clearFailures("e");
    expect(checkLimit("e", 3, WINDOW).ok).toBe(true);
  });

  it("keeps callers apart", () => {
    for (let i = 0; i < 5; i += 1) noteFailure("f", WINDOW);
    expect(checkLimit("f", 3, WINDOW).ok).toBe(false);
    expect(checkLimit("g", 3, WINDOW).ok).toBe(true);
  });
});
