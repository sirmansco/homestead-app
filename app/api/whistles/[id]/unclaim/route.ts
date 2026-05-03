import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyShiftReleased } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { requireUUID } from '@/lib/validate/uuid';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const id = requireUUID(rawId);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const { userId } = await requireUser();

    const body = await req.json().catch(() => ({})) as { reason?: string };
    const reason = body.reason?.trim() || null;

    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (shift.status !== 'claimed' || !shift.claimedByUserId) {
      return NextResponse.json({ error: 'not claimed' }, { status: 409 });
    }

    const [claimer] = await db.select().from(users).where(eq(users.id, shift.claimedByUserId)).limit(1);
    if (!claimer || claimer.clerkUserId !== userId) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    const [released] = await db.update(shifts)
      .set({ status: 'open', claimedByUserId: null, claimedAt: null })
      .where(and(eq(shifts.id, id), eq(shifts.status, 'claimed')))
      .returning();
    if (!released) return NextResponse.json({ error: 'race lost' }, { status: 409 });

    try {
      await notifyShiftReleased(id, claimer.id);
    } catch (err) {
      console.error('[shifts:unclaim:notify]', err);
    }

    return NextResponse.json({ shift: released });
  } catch (err) {
    return authError(err, 'shifts:unclaim', `Could not unclaim ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}`);
  }
}
