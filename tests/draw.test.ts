import { describe, expect, it } from "vitest";
import { drawSample, seededRandom, shuffle, type Candidate, type DrawInput } from "../src/core/draw";

const NOW = new Date("2026-09-20T12:00:00Z");

function candidate(i: number, over: Partial<Candidate> = {}): Candidate {
  return {
    contactId: `c${String(i).padStart(4, "0")}`,
    stratumKey: "10k_50k",
    role: "clerk",
    suppressed: false,
    emailStatus: "unverified",
    licenseScope: "owner_only",
    lastContactedAt: null,
    ...over,
  };
}

function input(over: Partial<DrawInput> = {}): DrawInput {
  return {
    candidates: Array.from({ length: 100 }, (_, i) => candidate(i)),
    targets: { "10k_50k": 10 },
    eligibleRoles: ["clerk", "records_officer", "manager"],
    allowedLicenseScopes: ["owner_only"],
    historyWindowDays: 90,
    pilotSize: 0,
    seed: 20260921,
    now: NOW,
    ...over,
  };
}

describe("the draw is reproducible", () => {
  it("returns the same sample for the same seed", () => {
    const a = drawSample(input());
    const b = drawSample(input());
    expect(a.picked).toEqual(b.picked);
  });

  it("returns a different sample for a different seed", () => {
    const a = drawSample(input({ seed: 1 }));
    const b = drawSample(input({ seed: 2 }));
    expect(a.picked).not.toEqual(b.picked);
  });

  it("does not depend on the order the database handed the rows over", () => {
    const rows = Array.from({ length: 100 }, (_, i) => candidate(i));
    const a = drawSample(input({ candidates: rows }));
    const b = drawSample(input({ candidates: [...rows].reverse() }));
    expect(a.picked).toEqual(b.picked);
  });

  it("shuffles without losing or duplicating anyone", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(items, seededRandom(7));
    expect(out).toHaveLength(50);
    expect(new Set(out).size).toBe(50);
    expect(out).not.toEqual(items);
  });
});

describe("who is passed over, and why", () => {
  it("counts every skip under a reason the operator can read", () => {
    const result = drawSample(
      input({
        candidates: [
          candidate(1, { suppressed: true }),
          candidate(2, { emailStatus: "invalid" }),
          candidate(3, { lastContactedAt: new Date("2026-08-01T00:00:00Z") }),
          candidate(4, { licenseScope: "client_only" }),
          candidate(5, { role: "fire" }),
          candidate(6),
        ],
        targets: { "10k_50k": 10 },
      }),
    );

    expect(result.skipped).toEqual({
      suppressed: 1,
      invalid_email: 1,
      recently_surveyed: 1,
      license_scope: 1,
      role_not_eligible: 1,
    });
    expect(result.picked).toHaveLength(1);
    expect(result.picked[0]?.contactId).toBe("c0006");
  });

  it("asks someone again once the contact-history window has passed", () => {
    const old = candidate(1, { lastContactedAt: new Date("2026-01-01T00:00:00Z") });
    const result = drawSample(input({ candidates: [old], targets: { "10k_50k": 5 } }));
    expect(result.skipped.recently_surveyed).toBe(0);
    expect(result.picked).toHaveLength(1);
  });

  it("never draws from a list a study is not licensed to use", () => {
    const result = drawSample(
      input({
        candidates: Array.from({ length: 20 }, (_, i) => candidate(i, { licenseScope: "power_almanac" })),
        allowedLicenseScopes: ["owner_only"],
      }),
    );
    expect(result.picked).toHaveLength(0);
    expect(result.skipped.license_scope).toBe(20);
  });

  it("names the skipped contacts, not only the totals", () => {
    const result = drawSample(input({ candidates: [candidate(1, { suppressed: true })] }));
    expect(result.skippedContacts).toEqual([{ contactId: "c0001", reason: "suppressed" }]);
  });
});

describe("hitting the targets per stratum", () => {
  const spread: Candidate[] = [
    ...Array.from({ length: 40 }, (_, i) => candidate(i, { stratumKey: "under_10k" })),
    ...Array.from({ length: 40 }, (_, i) => candidate(100 + i, { stratumKey: "10k_50k" })),
    ...Array.from({ length: 3 }, (_, i) => candidate(200 + i, { stratumKey: "over_250k" })),
  ];

  it("draws each stratum to its own target", () => {
    const result = drawSample(
      input({ candidates: spread, targets: { under_10k: 12, "10k_50k": 8, over_250k: 10 } }),
    );
    const per = Object.fromEntries(result.strata.map((s) => [s.key, s.picked]));
    expect(per).toEqual({ under_10k: 12, "10k_50k": 8, over_250k: 3 });
  });

  it("says how far short a thin stratum fell rather than quietly under-drawing", () => {
    const result = drawSample(
      input({ candidates: spread, targets: { under_10k: 12, "10k_50k": 8, over_250k: 10 } }),
    );
    const thin = result.strata.find((s) => s.key === "over_250k");
    expect(thin?.shortBy).toBe(7);
    expect(thin?.eligible).toBe(3);
  });

  it("never picks the same contact twice", () => {
    const result = drawSample(input({ candidates: spread, targets: { under_10k: 40, "10k_50k": 40 } }));
    expect(new Set(result.picked.map((p) => p.contactId)).size).toBe(result.picked.length);
  });
});

describe("the roles closest to the work", () => {
  const mixed: Candidate[] = [
    ...Array.from({ length: 30 }, (_, i) => candidate(i, { role: "clerk" })),
    ...Array.from({ length: 30 }, (_, i) => candidate(100 + i, { role: "manager" })),
  ];

  it("fills at least seven in ten of a stratum from the primary roles", () => {
    const result = drawSample(
      input({ candidates: mixed, targets: { "10k_50k": 10 }, primaryRoles: ["clerk"] }),
    );
    const stratum = result.strata[0]!;
    expect(stratum.picked).toBe(10);
    expect(stratum.primaryPicked).toBeGreaterThanOrEqual(7);
  });

  it("takes what it can when there are not enough of them, rather than under-filling", () => {
    const scarce: Candidate[] = [
      ...Array.from({ length: 2 }, (_, i) => candidate(i, { role: "clerk" })),
      ...Array.from({ length: 30 }, (_, i) => candidate(100 + i, { role: "manager" })),
    ];
    const result = drawSample(
      input({ candidates: scarce, targets: { "10k_50k": 10 }, primaryRoles: ["clerk"] }),
    );
    expect(result.strata[0]?.picked).toBe(10);
    expect(result.strata[0]?.primaryPicked).toBe(2);
  });
});

describe("the pilot", () => {
  const spread: Candidate[] = [
    ...Array.from({ length: 40 }, (_, i) => candidate(i, { stratumKey: "under_10k" })),
    ...Array.from({ length: 40 }, (_, i) => candidate(100 + i, { stratumKey: "10k_50k" })),
  ];

  it("marks the asked-for number", () => {
    const result = drawSample(
      input({ candidates: spread, targets: { under_10k: 20, "10k_50k": 20 }, pilotSize: 8 }),
    );
    expect(result.picked.filter((p) => p.isPilot)).toHaveLength(8);
  });

  it("spreads the pilot across strata instead of taking it off the top", () => {
    const result = drawSample(
      input({ candidates: spread, targets: { under_10k: 20, "10k_50k": 20 }, pilotSize: 8 }),
    );
    const bands = new Set(result.picked.filter((p) => p.isPilot).map((p) => p.stratumKey));
    expect(bands.size).toBe(2);
  });

  it("cannot mark more pilots than it drew", () => {
    const result = drawSample(input({ candidates: spread.slice(0, 5), targets: { under_10k: 5 }, pilotSize: 50 }));
    expect(result.picked.filter((p) => p.isPilot).length).toBeLessThanOrEqual(result.picked.length);
  });

  it("marks nobody when no pilot was asked for", () => {
    const result = drawSample(input({ candidates: spread, targets: { under_10k: 20 }, pilotSize: 0 }));
    expect(result.picked.some((p) => p.isPilot)).toBe(false);
  });
});
