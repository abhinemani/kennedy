// The stratified sample draw.
//
// Two things make this worth its own tested module. It must be reproducible, because a
// methods note that cannot be re-run is not evidence. And every contact it passes over must
// be passed over for a stated reason, because the operator signs off on those counts before
// a single email is queued.

export type SkipReason = "suppressed" | "invalid_email" | "recently_surveyed" | "license_scope" | "role_not_eligible";

export type Candidate = {
  contactId: string;
  stratumKey: string;
  role: string;
  suppressed: boolean;
  emailStatus: string;
  licenseScope: string;
  lastContactedAt: Date | null;
};

export type DrawInput = {
  candidates: Candidate[];
  /** Target completes, per stratum key, from the study file. */
  targets: Record<string, number>;
  eligibleRoles: string[];
  /** Roles that must make up most of each stratum, if the study names any. */
  primaryRoles?: string[];
  primaryShare?: number;
  allowedLicenseScopes: string[];
  historyWindowDays: number;
  pilotSize: number;
  seed: number;
  now: Date;
};

export type StratumReport = {
  key: string;
  target: number;
  eligible: number;
  picked: number;
  primaryPicked: number;
  shortBy: number;
};

export type DrawResult = {
  picked: { contactId: string; stratumKey: string; isPilot: boolean }[];
  skipped: Record<SkipReason, number>;
  /** Who was skipped and why, so the console can show examples rather than only totals. */
  skippedContacts: { contactId: string; reason: SkipReason }[];
  strata: StratumReport[];
};

/** A small deterministic generator. The same seed always draws the same sample. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function skipReasonFor(c: Candidate, input: DrawInput): SkipReason | null {
  if (!input.eligibleRoles.includes(c.role)) return "role_not_eligible";
  // The trust wall: a list licensed to the operator never feeds a study that may not use it.
  if (!input.allowedLicenseScopes.includes(c.licenseScope)) return "license_scope";
  if (c.suppressed) return "suppressed";
  if (c.emailStatus === "invalid") return "invalid_email";
  if (c.lastContactedAt) {
    const days = (input.now.getTime() - c.lastContactedAt.getTime()) / 86_400_000;
    if (days < input.historyWindowDays) return "recently_surveyed";
  }
  return null;
}

export function drawSample(input: DrawInput): DrawResult {
  const skipped: Record<SkipReason, number> = {
    suppressed: 0, invalid_email: 0, recently_surveyed: 0, license_scope: 0, role_not_eligible: 0,
  };
  const skippedContacts: { contactId: string; reason: SkipReason }[] = [];

  // Sorted first so the draw does not depend on the order the database happened to return.
  const ordered = [...input.candidates].sort((a, b) => a.contactId.localeCompare(b.contactId));

  const eligible: Candidate[] = [];
  for (const c of ordered) {
    const reason = skipReasonFor(c, input);
    if (reason) {
      skipped[reason] += 1;
      skippedContacts.push({ contactId: c.contactId, reason });
    } else {
      eligible.push(c);
    }
  }

  const random = seededRandom(input.seed);
  const primary = new Set(input.primaryRoles ?? []);
  const share = input.primaryShare ?? 0.7;

  const picked: { contactId: string; stratumKey: string; isPilot: boolean }[] = [];
  const strata: StratumReport[] = [];

  // Strata in a fixed order, so the same seed gives the same draw every time.
  const keys = Object.keys(input.targets).sort();

  for (const key of keys) {
    const target = input.targets[key] ?? 0;
    const inStratum = eligible.filter((c) => c.stratumKey === key);
    const pool = shuffle(inStratum, random);

    const chosen: Candidate[] = [];
    if (primary.size > 0) {
      // At least `share` of each stratum comes from the roles closest to the work, so the
      // numbers describe the people who actually handle it.
      const wantPrimary = Math.min(Math.ceil(target * share), pool.filter((c) => primary.has(c.role)).length);
      for (const c of pool) {
        if (chosen.length >= wantPrimary) break;
        if (primary.has(c.role)) chosen.push(c);
      }
    }
    for (const c of pool) {
      if (chosen.length >= target) break;
      if (!chosen.includes(c)) chosen.push(c);
    }

    for (const c of chosen) picked.push({ contactId: c.contactId, stratumKey: key, isPilot: false });

    strata.push({
      key,
      target,
      eligible: inStratum.length,
      picked: chosen.length,
      primaryPicked: chosen.filter((c) => primary.has(c.role)).length,
      shortBy: Math.max(0, target - chosen.length),
    });
  }

  // The pilot is drawn from the sample itself, spread across strata rather than taken off
  // the top, so a small first send still looks like the whole frame.
  if (input.pilotSize > 0) {
    const byStratum = new Map<string, typeof picked>();
    for (const p of picked) {
      const list = byStratum.get(p.stratumKey) ?? [];
      list.push(p);
      byStratum.set(p.stratumKey, list);
    }
    let remaining = Math.min(input.pilotSize, picked.length);
    const order = [...byStratum.keys()].sort();
    let round = 0;
    while (remaining > 0) {
      let placedThisRound = 0;
      for (const key of order) {
        if (remaining === 0) break;
        const list = byStratum.get(key)!;
        const next = list[round];
        if (!next) continue;
        next.isPilot = true;
        remaining -= 1;
        placedThisRound += 1;
      }
      if (placedThisRound === 0) break;
      round += 1;
    }
  }

  return { picked, skipped, skippedContacts, strata };
}

export const SKIP_WORDS: Record<SkipReason, string> = {
  suppressed: "unsubscribed or suppressed",
  invalid_email: "email known to be undeliverable",
  recently_surveyed: "asked by another study recently",
  license_scope: "list may not be used for this study",
  role_not_eligible: "role is not in this study's frame",
};
