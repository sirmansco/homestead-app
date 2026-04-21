import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts, users, pushSubscriptions } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { household, user } = await requireHousehold();

    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (shift.householdId !== household.id) {
      return NextResponse.json({ error: 'wrong household' }, { status: 403 });
    }
    if (user.role !== 'parent' && shift.createdByUserId !== user.id) {
      return NextResponse.json({ error: 'only parents or the poster can cancel' }, { status: 403 });
    }

    if (shift.status === 'cancelled') {
      return NextResponse.json({ error: 'already cancelled' }, { status: 409 });
    }

    const claimedByUserId = shift.claimedByUserId;

    const [cancelled] = await db.update(shifts)
      .set({ status: 'cancelled' })
      .where(eq(shifts.id, id))
      .returning();
    if (!cancelled) return NextResponse.json({ error: 'cancel failed' }, { status: 500 });

    // Notify the caregiver who claimed this shift (if any)
    if (claimedByUserId) {
      import('@/lib/push').then(async ({ pushToHousehold: _ }) => {
        const webpush = await import('web-push');
        webpush.default.setVapidDetails(
          process.env.VAPID_SUBJECT!,
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!,
        );
        const subs = await db.select().from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, claimedByUserId));
        const payload = JSON.stringify({
          title: '❌ Shift cancelled',
          body: `"${shift.title}" has been cancelled.`,
          url: '/',
          tag: `cancel-${id}`,
        });
        await Promise.allSettled(subs.map(s =>
          webpush.default.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          ).catch(() => {})
        ));
      }).catch(() => {});
    }

    return NextResponse.json({ shift: cancelled });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
