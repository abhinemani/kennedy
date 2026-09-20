// A small in-memory limiter for the sign-in form.
//
// It counts failures, not attempts. Counting every attempt would lock out an operator who
// simply signs in from a second tab, which is a worse outcome than the guessing it is meant
// to slow down. A success clears the count.
//
// It is per-instance, which is the honest limit of it: on a single long-lived server it
// holds, and behind several it slows a guesser rather than stopping one. Token routes get a
// database-backed limiter instead, in token-limit.ts.

type Bucket = { failures: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type Limit = { ok: true } | { ok: false; retryInSeconds: number };

/** Is this caller currently locked out? Checking does not count against them. */
export function checkLimit(key: string, maxFailures: number, windowMs: number, now = Date.now()): Limit {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return { ok: true };
  if (bucket.failures >= maxFailures) {
    return { ok: false, retryInSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

/** Record a failed attempt. The window starts at the first failure. */
export function noteFailure(key: string, windowMs: number, now = Date.now()): void {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { failures: 1, resetAt: now + windowMs });
    return;
  }
  bucket.failures += 1;
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}
