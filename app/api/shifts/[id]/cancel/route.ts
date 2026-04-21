import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts } from '@/lib/db/schema';
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

    const [cancelled] = await db.update(shifts)
      .set({ status: 'cancelled' })
      .where(and(eq(shifts.id, id), inArray(shifts.status, ['open', 'claimed'])))
      .returning();
    if (!cancelled) return NextResponse.json({ error: 'cannot cancel this shift' }, { status: 409 });

    return NextResponse.json({ shift: cancelled });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
