// A small in-memory limiter. It is per-instance, which is the honest limit of it: on
// serverless it slows a guesser down rather than stopping one. Token routes get a
// database-backed limiter when they arrive in Milestone 2.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type Limit = { ok: true } | { ok: false; retryInSeconds: number };

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): Limit {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= max) {
    return { ok: false, retryInSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
