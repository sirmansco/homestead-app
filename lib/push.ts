import webpush from 'web-push';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions, users } from '@/lib/db/schema';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Send push to all subscribers in a household except the sender
export async function pushToHousehold(
  householdId: string,
  exceptUserId: string,
  payload: PushPayload,
) {
  // Get all users in this household except sender
  const members = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.householdId, householdId), ne(users.id, exceptUserId)));

  if (members.length === 0) return;

  const memberIds = members.map(m => m.id);

  // Get all push subscriptions for those users
  const subs = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.householdId, householdId));

  const eligibleSubs = subs.filter(s => memberIds.includes(s.userId));
  if (eligibleSubs.length === 0) return;

  const message = JSON.stringify(payload);

  await Promise.allSettled(
    eligibleSubs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
      ).catch(() => {
        // Silently ignore failed pushes — expired subscriptions are expected
      })
    )
  );
}

// Send push to all caregivers across a set of household IDs (for bell alerts)
export async function pushToHouseholdCaregivers(
  householdId: string,
  exceptUserId: string,
  payload: PushPayload,
) {
  // Get all caregiver + parent users in household except sender
  const members = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.householdId, householdId), ne(users.id, exceptUserId)));

  const memberIds = members.map(m => m.id);

  const subs = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.householdId, householdId));

  const eligibleSubs = subs.filter(s => memberIds.includes(s.userId));
  if (eligibleSubs.length === 0) return;

  const message = JSON.stringify(payload);

  await Promise.allSettled(
    eligibleSubs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
      ).catch(() => {})
    )
  );
}
