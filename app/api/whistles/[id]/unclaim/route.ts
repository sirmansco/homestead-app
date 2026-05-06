import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whistles, users } from '@/lib/db/schema';
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

    const [shift] = await db.select().from(whistles).where(eq(whistles.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (shift.status !== 'claimed' || !shift.claimedByUserId) {
      return NextResponse.json({ error: 'not claimed' }, { status: 409 });
    }

    const [claimer] = await db.select().from(users).where(eq(users.id, shift.claimedByUserId)).limit(1);
    if (!claimer || claimer.clerkUserId !== userId) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    const [released] = await db.update(whistles)
      .set({ status: 'open', claimedByUserId: null, claimedAt: null, releasedAt: sql`now()` })
      .where(and(eq(whistles.id, id), eq(whistles.status, 'claimed')))
      .returning();
    if (!released) return NextResponse.json({ error: 'race lost' }, { status: 409 });

    try {
      await notifyShiftReleased(id, claimer.id, reason);
    } catch (err) {
      console.error('[whistles:unclaim:notify]', err);
    }

    return NextResponse.json({ shift: released });
  } catch (err) {
    return authError(err, 'whistles:unclaim', `Could not unclaim ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}`);
  }
}
