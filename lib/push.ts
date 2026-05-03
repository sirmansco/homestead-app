import webpush, { WebPushError } from 'web-push';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions, users } from '@/lib/db/schema';

// Lazy VAPID init — called at runtime, not module evaluation.
// Calling setVapidDetails at the top level causes build failures because
// VAPID env vars are not available during Next.js "Collecting page data".
// Note: deliberately NOT cached — setVapidDetails is cheap and caching
// caused warm lambdas to keep a stale VAPID_SUBJECT after env-var changes.
//
// Server-side reads VAPID_PUBLIC_KEY (no prefix). NEXT_PUBLIC_ vars are
// inlined into the build bundle by Next.js, so a bad key set during a prior
// build stays frozen in the server chunk regardless of the current Vercel
// env. Reading the un-prefixed var means the value is fetched at runtime.
// The client (PushRegistrar.tsx) still uses NEXT_PUBLIC_VAPID_PUBLIC_KEY —
// it has to, because the browser cannot read non-public env vars.
function ensureVapid(): boolean {
  const missing = (
    ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const
  ).filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[push:vapid] missing env vars: ${missing.join(', ')} — push delivery disabled`);
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushResult = {
  attempted: number;
  delivered: number;
  stale: number;
  failed: number;
  errors: string[];
  reason?: string;
};

type WebPushDisposition =
  | { kind: 'prune'; reason: 'gone_404' | 'gone_410' | 'auth_403' | 'payload_413' }
  | { kind: 'retry'; reason: 'ratelimit_429' | 'server_5xx' | 'jwt_error' }
  | { kind: 'unknown'; reason: string };

// Apple push (web.push.apple.com) returns HTTP 403 with body {"reason":"BadJwtToken"}
// or {"reason":"ExpiredJwtToken"} when the VAPID JWT is signed against a key the
// subscription wasn't created with. After a VAPID key rotation, every existing
// Apple subscription returns this until the client resubscribes against the new
// public key.
//
// We prune on BadJwtToken/ExpiredJwtToken because:
//   1. ensureVapid() already validated our keys parse cleanly server-side, so the
//      JWT we send IS well-formed — Apple only rejects it for key mismatch.
//   2. The client (PushRegistrar) auto-resubscribes against the current public
//      key on next PWA open, so a pruned sub is replaced within minutes.
//   3. Retrying forever wastes resources and never recovers — at 10K+ users with
//      stale subs after rotation, retry-loops would melt the lambda budget.
//
// Only FCM/Mozilla 403 means the endpoint is permanently invalid (auth failure).
function classifyWebPushError(err: unknown): WebPushDisposition {
  const wpe = err as WebPushError;
  const code = wpe?.statusCode;
  if (code === 404) return { kind: 'prune', reason: 'gone_404' };
  if (code === 410) return { kind: 'prune', reason: 'gone_410' };
  if (code === 403) {
    const body = typeof wpe?.body === 'string' ? wpe.body : JSON.stringify(wpe?.body ?? '');
    if (body.includes('BadJwtToken') || body.includes('ExpiredJwtToken')) {
      // Key-rotation orphan — drop it, registrar will recreate on next PWA open.
      return { kind: 'prune', reason: 'jwt_error' };
    }
    return { kind: 'prune', reason: 'auth_403' };
  }
  if (code === 413) return { kind: 'prune', reason: 'payload_413' };
  if (code === 429) return { kind: 'retry', reason: 'ratelimit_429' };
  if (typeof code === 'number' && code >= 500 && code < 600) return { kind: 'retry', reason: 'server_5xx' };
  return { kind: 'unknown', reason: typeof code === 'number' ? `http_${code}` : 'no_status' };
}

/**
 * Send to a list of subscription rows. Automatically deletes rows when the
 * push service reports the subscription as permanently failed (404/410/403/413).
 * All errors are captured and returned — callers must log the result.
 */
async function sendBatch(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
  context: string,
): Promise<PushResult> {
  if (!ensureVapid()) {
    return { attempted: subs.length, delivered: 0, stale: 0, failed: subs.length, errors: [], reason: 'vapid_not_configured' };
  }
  const result: PushResult = { attempted: subs.length, delivered: 0, stale: 0, failed: 0, errors: [] };
  if (subs.length === 0) return result;

  const message = JSON.stringify(payload);
  const staleIds: string[] = [];
  let dispPrune = 0, dispRetry = 0, dispUnknown = 0;

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
      );
      result.delivered++;
    } catch (err) {
      const disp = classifyWebPushError(err);
      const wpe = err as WebPushError;
      const detail = wpe?.statusCode
        ? `HTTP ${wpe.statusCode}: ${wpe.body || wpe.message}`
        : (err instanceof Error ? err.message : String(err));
      if (disp.kind === 'prune') {
        result.stale++;
        staleIds.push(sub.id);
        result.errors.push(`${disp.reason}: ${detail}`);
        dispPrune++;
      } else if (disp.kind === 'retry') {
        result.failed++;
        result.errors.push(`${disp.reason}: ${detail}`);
        dispRetry++;
      } else {
        result.failed++;
        result.errors.push(`${disp.reason}: ${detail}`);
        dispUnknown++;
      }
    }
  }));

  // Clean up permanently-failed subscriptions in one query
  if (staleIds.length > 0) {
    try {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, staleIds));
    } catch (err) {
      // Non-fatal — stale rows will get cleaned up next time
      console.error(`[push:${context}] failed to delete stale subs`, err);
    }
  }

  // Structured log line for observability (scrape-able format)
  console.log(JSON.stringify({
    event: 'push_batch',
    context,
    attempted: result.attempted,
    delivered: result.delivered,
    stale: result.stale,
    failed: result.failed,
    dispositions: { prune: dispPrune, retry: dispRetry, unknown: dispUnknown },
    errors: result.errors.slice(0, 3),
  }));

  return result;
}

// Send push to all subscribers in a household except the sender
export async function pushToHousehold(
  householdId: string,
  exceptUserId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const members = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.householdId, householdId), ne(users.id, exceptUserId)));

  if (members.length === 0) {
    return { attempted: 0, delivered: 0, stale: 0, failed: 0, errors: [] };
  }

  const memberIds = new Set(members.map(m => m.id));
  const subs = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.householdId, householdId));

  return sendBatch(subs.filter(s => memberIds.has(s.userId)), payload, `household:${householdId}`);
}

// Send push to a single user by their users.id
export async function pushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const subs = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return sendBatch(subs, payload, `user:${userId}`);
}

// Send push to an explicit list of users.id values within a household
export async function pushToUsers(
  userIds: string[],
  householdId: string,
  payload: PushPayload,
): Promise<PushResult> {
  if (userIds.length === 0) {
    return { attempted: 0, delivered: 0, stale: 0, failed: 0, errors: [] };
  }
  const subs = await db.select().from(pushSubscriptions)
    .where(and(
      inArray(pushSubscriptions.userId, userIds),
      eq(pushSubscriptions.householdId, householdId),
    ));
  return sendBatch(subs, payload, `users:${userIds.length}@${householdId}`);
}

// Send push to all users in a household (parents + caregivers) except the sender
export async function pushToHouseholdCaregivers(
  householdId: string,
  exceptUserId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const members = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.householdId, householdId), ne(users.id, exceptUserId)));

  if (members.length === 0) {
    return { attempted: 0, delivered: 0, stale: 0, failed: 0, errors: [] };
  }

  const memberIds = new Set(members.map(m => m.id));
  const subs = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.householdId, householdId));

  return sendBatch(subs.filter(s => memberIds.has(s.userId)), payload, `hh-caregivers:${householdId}`);
}
