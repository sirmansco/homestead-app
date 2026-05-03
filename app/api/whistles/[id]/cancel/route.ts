import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whistles } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyShiftCancelled } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { requireUUID } from '@/lib/validate/uuid';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const id = requireUUID(rawId);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const { household, user } = await requireHousehold();

    const [shift] = await db.select().from(whistles).where(eq(whistles.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (shift.householdId !== household.id) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }
    if (user.role !== 'keeper' && shift.createdByUserId !== user.id) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    if (shift.status === 'cancelled') {
      return NextResponse.json({ error: 'already cancelled' }, { status: 409 });
    }

    const claimedByUserId = shift.claimedByUserId;

    const [cancelled] = await db.update(whistles)
      .set({ status: 'cancelled' })
      .where(and(eq(whistles.id, id), ne(whistles.status, 'cancelled')))
      .returning();
    if (!cancelled) return NextResponse.json({ error: 'cancel failed' }, { status: 500 });

    if (claimedByUserId) {
      try {
        await notifyShiftCancelled(id, claimedByUserId);
      } catch (err) {
        console.error('[whistles:cancel:notify]', err);
      }
    }

    return NextResponse.json({ shift: cancelled });
  } catch (err) {
    return authError(err, 'whistles:cancel', `Could not cancel ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}`);
  }
}
