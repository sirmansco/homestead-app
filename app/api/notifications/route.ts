import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

const PREF_KEYS = [
  'notifyShiftPosted',
  'notifyShiftClaimed',
  'notifyShiftReleased',
  'notifyBellRinging',
  'notifyBellResponse',
] as const;

type PrefKey = typeof PREF_KEYS[number];

// Notification preferences are per-household (spec docs/specs/homestead.md:50,
// 95, 169, 218 — "notification prefs are per-household"). Synthesis L5: bind
// reads and writes to (clerkUserId, householdId), not the bulk Clerk identity.
export async function GET() {
  try {
    const { user } = await requireHousehold();

    return NextResponse.json({
      prefs: {
        notifyShiftPosted: user.notifyShiftPosted,
        notifyShiftClaimed: user.notifyShiftClaimed,
        notifyShiftReleased: user.notifyShiftReleased,
        notifyBellRinging: user.notifyBellRinging,
        notifyBellResponse: user.notifyBellResponse,
      },
    });
  } catch (err) {
    return authError(err, 'notifications:GET', 'Could not load notification preferences');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { household, userId } = await requireHousehold();

    const body = await req.json().catch(() => ({}));
    const patch: Partial<Record<PrefKey, boolean>> = {};

    for (const key of PREF_KEYS) {
      if (key in body && typeof body[key] === 'boolean') {
        patch[key] = body[key] as boolean;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid preference fields supplied' }, { status: 400 });
    }

    await db.update(users).set(patch).where(and(
      eq(users.clerkUserId, userId),
      eq(users.householdId, household.id),
    ));

    return NextResponse.json({ ok: true, updated: patch });
  } catch (err) {
    return authError(err, 'notifications:PATCH', 'Could not update notification preferences');
  }
}
