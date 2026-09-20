export type SendStatus = "sent" | "delivered" | "bounced" | "complained" | "failed";

export type BreakerConfig = { bounceWindow: number; bounceRate: number; complaintWindow: number; complaintRate: number; minSends: number };
export const DEFAULT_BREAKER: BreakerConfig = { bounceWindow: 200, bounceRate: 0.03, complaintWindow: 1000, complaintRate: 0.003, minSends: 100 };

export type BreakerState = { paused: false } | { paused: true; reason: string };

/** `recent` is newest first. Pauses sending when bounces or complaints run hot. */
export function evaluateBreaker(recent: SendStatus[], cfg: BreakerConfig = DEFAULT_BREAKER): BreakerState {
  if (recent.length < cfg.minSends) return { paused: false };
  const rate = (window: number, s: SendStatus) => { const w = recent.slice(0, window); return w.filter((x) => x === s).length / w.length; };
  const b = rate(cfg.bounceWindow, "bounced");
  if (b > cfg.bounceRate) return { paused: true, reason: `Sending paused: ${(b * 100).toFixed(1)}% of the last ${Math.min(recent.length, cfg.bounceWindow)} emails bounced. Verify the list before resuming.` };
  const c = rate(cfg.complaintWindow, "complained");
  if (c > cfg.complaintRate) return { paused: true, reason: `Sending paused: ${(c * 100).toFixed(2)}% of recent emails were marked as spam. Review the message before resuming.` };
  return { paused: false };
}
