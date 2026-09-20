export type Flag = "speeder" | "implausible_confirmed" | "duplicate_entity" | "role_not_involved" | "corrected_identity";

export type QualityInput = {
  durationSeconds: number;
  medianDurationSeconds: number | null;
  speederSeconds: number;
  confirmedImplausible: boolean;
  otherCompletesFromEntity: number;
  involvement: unknown;
  correctedIdentity: boolean;
};

/** Flags inform the operator's review. They never exclude a response by themselves. */
export function qualityFlags(i: QualityInput): Flag[] {
  const flags: Flag[] = [];
  const floor = Math.max(i.speederSeconds, i.medianDurationSeconds ? i.medianDurationSeconds / 3 : 0);
  if (i.durationSeconds < floor) flags.push("speeder");
  if (i.confirmedImplausible) flags.push("implausible_confirmed");
  if (i.otherCompletesFromEntity > 0) flags.push("duplicate_entity");
  if (i.involvement === "none") flags.push("role_not_involved");
  if (i.correctedIdentity) flags.push("corrected_identity");
  return flags;
}
