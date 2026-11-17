/**
 * In-memory sliding-window rate limiter shared by public API routes.
 *
 * State is process-local: a restart or redeploy resets the windows. That is
 * acceptable for abuse protection (this is not an authorization boundary).
 * Keys are typically per-IP (see clientIp); other dimensions can be composed
 * into the key string.
 */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const attemptsByKey = new Map<string, number[]>();

/** Sliding-window check: allow up to `max` hits per key within `windowMs`. */
export function slidingWindowLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (attemptsByKey.size > MAX_TRACKED_KEYS) {
    for (const [trackedKey, timestamps] of attemptsByKey) {
      const fresh = timestamps.filter((ts) => ts > now - windowMs);
      if (fresh.length === 0) attemptsByKey.delete(trackedKey);
      else attemptsByKey.set(trackedKey, fresh);
    }
  }
  let attempts = attemptsByKey.get(key) ?? [];
  attempts = attempts.filter((ts) => ts > now - windowMs);
  if (attempts.length >= max) {
    attemptsByKey.set(key, attempts);
    const retryAfterSeconds = Math.max(1, Math.ceil((attempts[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  attempts.push(now);
  attemptsByKey.set(key, attempts);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** First hop of X-Forwarded-For (set by our proxy), then X-Real-Ip. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim().slice(0, 64);
  return "unknown";
}

export function __resetRateLimitsForTests(): void {
  attemptsByKey.clear();
}
