import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
type PushSubBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireHousehold();
    const body = await req.json() as PushSubBody;
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    await db.insert(pushSubscriptions)
      .values({
        userId: user.id,
        householdId: user.householdId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: { p256dh: keys.p256dh, auth: keys.auth },
      });

    // PWA reinstall produces a new endpoint and orphans the previous one.
    // Drop same-(user, household) rows whose endpoint differs and was created
    // more than 60s ago — preserves a second device that registers in the same
    // minute (multi-browser / multi-tab) without leaving stale subs around.
    await db.delete(pushSubscriptions).where(
      and(
        eq(pushSubscriptions.userId, user.id),
        eq(pushSubscriptions.householdId, user.householdId),
        ne(pushSubscriptions.endpoint, endpoint),
        lt(pushSubscriptions.createdAt, sql`now() - interval '60 seconds'`),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'push:subscribe', 'Could not register for notifications');
  }
}
