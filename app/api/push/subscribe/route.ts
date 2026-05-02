import { NextRequest, NextResponse } from 'next/server';
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'push:subscribe', 'Could not register for notifications');
  }
}
