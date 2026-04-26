import webpush, { WebPushError } from 'web-push';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions, users } from '@/lib/db/schema';

// Lazy VAPID init — called at runtime, not module evaluation.
// Calling setVapidDetails at the top level causes build failures because
// VAPID env vars are not available during Next.js "Collecting page data".
let vapidInitialised = false;
function ensureVapid() {
  if (vapidInitialised) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidInitialised = true;
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type PushResult = {
  attempted: number;
  delivered: number;
  stale: number;
  failed: number;
  errors: string[];
};

/**
 * Send to a list of subscription rows. Automatically deletes rows when the
 * push service reports the subscription as gone (404/410). All errors are
 * captured and returned — callers must log the result.
 */
async function sendBatch(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
  context: string,
): Promise<PushResult> {
  ensureVapid();
  const result: PushResult = { attempted: subs.length, delivered: 0, stale: 0, failed: 0, errors: [] };
  if (subs.length === 0) return result;

  const message = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
      );
      result.delivered++;
    } catch (err) {
      const wpe = err as WebPushError;
      if (wpe?.statusCode === 404 || wpe?.statusCode === 410) {
        // Subscription expired or invalid — mark for cleanup
        result.stale++;
        staleIds.push(sub.id);
      } else {
        result.failed++;
        const msg = wpe?.statusCode
          ? `HTTP ${wpe.statusCode}: ${wpe.body || wpe.message}`
          : (err instanceof Error ? err.message : String(err));
        result.errors.push(msg);
      }
    }
  }));

  // Clean up stale subscriptions in one query
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
