/**
 * Simple in-memory rate limiter using a token-bucket variant.
 *
 * Trade-offs:
 * - Per-instance: if Vercel spawns multiple function instances, each has its
 *   own counter. For Covey's scale (low thousands of families) this is
 *   acceptable — a determined attacker could still burst a few × limit, but
 *   absolute abuse is prevented.
 * - Upgrade path: when you outgrow this, swap to @upstash/ratelimit. Same API.
 *
 * Usage:
 *   const rl = rateLimit({ key: `bell:${userId}`, limit: 5, windowMs: 60_000 });
 *   if (!rl.ok) return NextResponse.json({ error: 'too many requests' }, { status: 429 });
 */

type Bucket = { count: number; resetAt: number };

// Module-level store survives across requests within a single instance.
// In serverless this may get reset when the function cold-starts; that's okay.
const store = new Map<string, Bucket>();

// Cheap housekeeping to prevent unbounded growth. Runs on each check; O(n)
// only when the store is very large, which shouldn't happen under normal load.
function gc(now: number) {
  if (store.size < 1000) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  // Tokens to debit. Default 1. Use >1 when a single request produces N
  // units of downstream work (e.g., bulk insert, fan-out) so the limit
  // tracks true cost rather than call count.
  cost?: number;
}): RateLimitResult {
  const now = Date.now();
  gc(now);

  let bucket = store.get(opts.key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    store.set(opts.key, bucket);
  }

  bucket.count += opts.cost ?? 1;
  const ok = bucket.count <= opts.limit;
  const remaining = Math.max(0, opts.limit - bucket.count);
  const retryAfterMs = ok ? 0 : bucket.resetAt - now;

  return { ok, remaining, resetAt: bucket.resetAt, retryAfterMs };
}

/**
 * Convenience wrapper that returns a ready-to-use Response if limited.
 */
export function rateLimitResponse(result: RateLimitResult) {
  if (result.ok) return null;
  return new Response(
    JSON.stringify({
      error: 'Too many requests — please slow down.',
      retryAfterMs: result.retryAfterMs,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
        'X-RateLimit-Reset': String(result.resetAt),
      },
    },
  );
}
