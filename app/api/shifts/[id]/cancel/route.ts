import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyShiftCancelled } from '@/lib/notify';

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

    if (claimedByUserId) {
      try {
        await notifyShiftCancelled(id, claimedByUserId);
      } catch (err) {
        console.error('[shifts:cancel:notify]', err);
      }
    }

    return NextResponse.json({ shift: cancelled });
  } catch (err) {
    return authError(err, 'shifts:cancel', 'Could not cancel shift');
  }
}
