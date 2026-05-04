import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { getCopy } from '@/lib/copy';
import { requireUUID } from '@/lib/validate/uuid';

// PATCH /api/lantern/[id] — { status: 'handled' | 'cancelled' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { household, user } = await requireHousehold();
    const { id: rawId } = await params;
    const lanternId = requireUUID(rawId);
    if (!lanternId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const { status } = await req.json() as { status: 'handled' | 'cancelled' };

    if (!['handled', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Verify this lantern belongs to the caller's active household — prevents one
    // household from cancelling another household's lantern by guessing the UUID.
    const [lantern] = await db.select().from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
    if (!lantern) return NextResponse.json({ error: `${getCopy().urgentSignal.noun} not found` }, { status: 404 });
    if (lantern.householdId !== household.id) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    const updates: { status: 'handled' | 'cancelled'; handledByUserId?: string; handledAt?: Date } = { status };
    if (status === 'handled') {
      updates.handledByUserId = user.id;
      updates.handledAt = new Date();
    }

    // CAS: only mutate if the lantern is still in 'ringing'. A second concurrent
    // PATCH or a /respond on_my_way that already terminated the lantern must not
    // overwrite the winner's status, handler, or handledAt.
    const result = await db.update(lanterns)
      .set(updates)
      .where(and(
        eq(lanterns.id, lanternId),
        eq(lanterns.householdId, household.id),
        eq(lanterns.status, 'ringing'),
      ))
      .returning({ id: lanterns.id });

    if (result.length === 0) {
      return NextResponse.json(
        { error: `${getCopy().urgentSignal.noun} is no longer active` },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'lantern:id', `${getCopy().urgentSignal.noun} action failed`);
  }
}
