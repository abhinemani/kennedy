// Planning a study before anyone is asked: how many people can be reached, how many answers
// that should bring, and how sure the numbers will be. These are rules of thumb for the brief
// screen, stated once so the console and the study overview agree.

/** The share of people emailed who complete a survey, from the prototype's working assumption. */
export const COMPLETION_RATE = 0.034;

/** The share of completers who accept an interview when one is offered. */
export const INTERVIEW_RATE = 0.18;

/** Completed surveys to expect from a sample of this size. */
export function expectedCompletes(sampled: number): number {
  return Math.round(Math.max(0, sampled) * COMPLETION_RATE);
}

/** Interviews to expect, never more than the study offers. */
export function expectedInterviews(completes: number, max: number | null): number {
  const willing = Math.round(Math.max(0, completes) * INTERVIEW_RATE);
  return max === null ? willing : Math.min(max, willing);
}

/**
 * The 95 percent margin of error, in percentage points, for a share near one half at this
 * many answers: 1.96 × 50 / √n, which is 98 / √n. The worst case for a share, so a safe
 * promise. Null when there is nothing to divide by.
 */
export function marginAt(n: number): number | null {
  if (n <= 0) return null;
  return Math.round((98 / Math.sqrt(n)) * 10) / 10;
}

/** How many of the reachable people a study will actually draw: the band targets cap it. */
export function sampleSize(reachable: number, targets: number[]): number {
  const cap = targets.reduce((a, b) => a + Math.max(0, b), 0);
  return Math.max(0, Math.min(reachable, cap));
}
