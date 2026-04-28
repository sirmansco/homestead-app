import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { pushToUser } from '@/lib/push';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';

export async function POST() {
  try {
    const { user } = await requireHousehold();

    const rl = rateLimit({ key: `push-test:${user.id}`, limit: 10, windowMs: 3_600_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const subs = await db.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));

    const result = await pushToUser(user.id, {
      title: 'Homestead · push test',
      body: 'Push notifications are working.',
      tag: 'push-test',
    });

    return NextResponse.json({ subscriptionCount: subs.length, result });
  } catch (err) {
    return authError(err, 'push:test', 'Push test failed');
  }
}
