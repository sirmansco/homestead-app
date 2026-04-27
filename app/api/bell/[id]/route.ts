import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

// PATCH /api/bell/[id] — { status: 'handled' | 'cancelled' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { household, user } = await requireHousehold();
    const { id: bellId } = await params;
    const { status } = await req.json() as { status: 'handled' | 'cancelled' };

    if (!['handled', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Verify this bell belongs to the caller's active household — prevents one
    // household from cancelling another household's bell by guessing the UUID.
    const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
    if (!bell) return NextResponse.json({ error: 'Bell not found' }, { status: 404 });
    if (bell.householdId !== household.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates: { status: 'handled' | 'cancelled'; handledByUserId?: string; handledAt?: Date } = { status };
    if (status === 'handled') {
      updates.handledByUserId = user.id;
      updates.handledAt = new Date();
    }

    await db.update(bells).set(updates).where(eq(bells.id, bellId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'bell:id', 'Bell action failed');
  }
}
