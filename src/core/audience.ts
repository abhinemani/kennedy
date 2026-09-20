export type Reason = "completed" | "suppressed" | "invalid_email" | "recently_surveyed" | "not_started" | "already_sent";

export type AudienceContact = {
  studyContactId: string;
  completed: boolean;
  started: boolean;
  suppressed: boolean;
  emailStatus: "unverified" | "valid" | "risky" | "invalid";
  lastContactedByOtherStudy: Date | null;
  touchesSent: number[];
};

export type AudienceResult = { send: string[]; excluded: Record<Reason, number> };

/** Who gets this touch, and why everyone else does not. Show this to the operator before queuing. */
export function touchAudience(
  contacts: AudienceContact[],
  opts: { touch: number; now: Date; historyWindowDays: number; audience?: "all" | "started_only" },
): AudienceResult {
  const excluded: Record<Reason, number> = { completed: 0, suppressed: 0, invalid_email: 0, recently_surveyed: 0, not_started: 0, already_sent: 0 };
  const send: string[] = [];
  const windowMs = opts.historyWindowDays * 86_400_000;
  for (const c of contacts) {
    const reason: Reason | null =
      c.completed ? "completed"
      : c.suppressed ? "suppressed"
      : c.emailStatus === "invalid" ? "invalid_email"
      : c.lastContactedByOtherStudy && opts.now.getTime() - c.lastContactedByOtherStudy.getTime() < windowMs ? "recently_surveyed"
      : c.touchesSent.includes(opts.touch) ? "already_sent"
      : opts.audience === "started_only" && !c.started ? "not_started"
      : null;
    if (reason) excluded[reason]++; else send.push(c.studyContactId);
  }
  return { send, excluded };
}
