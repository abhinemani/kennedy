import { describe, expect, it } from "vitest";
import { issueSession, verifySession } from "../src/lib/auth";

describe("the session cookie", () => {
  it("verifies only what it issued, and only while it is fresh", () => {
    const value = issueSession("secret");
    expect(verifySession(value, "secret")).toBe(true);
    expect(verifySession(value, "another secret")).toBe(false);
    expect(verifySession(value.slice(0, -1), "secret")).toBe(false);
    expect(verifySession(undefined, "secret")).toBe(false);
    expect(verifySession(value, null)).toBe(false);

    // An expired payload is refused even with a genuine signature on it.
    const signed = issueSession("secret").split(".").pop();
    expect(verifySession(`${Date.now() - 1000}.abc.${signed}`, "secret")).toBe(false);
  });
});
