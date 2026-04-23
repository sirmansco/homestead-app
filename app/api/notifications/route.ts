import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { apiError, authError } from '@/lib/api-error';

const PREF_KEYS = [
  'notifyShiftPosted',
  'notifyShiftClaimed',
  'notifyShiftReleased',
  'notifyBellRinging',
  'notifyBellResponse',
] as const;

type PrefKey = typeof PREF_KEYS[number];

/**
 * GET /api/notifications
 * Returns the current user's notification preferences for every household they
 * belong to. Each household entry has the same prefs (they are per user-row).
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return authError(new Error('Not signed in'), 'notifications:GET');

    const rows = await db.select({
      id: users.id,
      householdId: users.householdId,
      notifyShiftPosted: users.notifyShiftPosted,
      notifyShiftClaimed: users.notifyShiftClaimed,
      notifyShiftReleased: users.notifyShiftReleased,
      notifyBellRinging: users.notifyBellRinging,
      notifyBellResponse: users.notifyBellResponse,
    }).from(users).where(eq(users.clerkUserId, userId));

    if (rows.length === 0) {
      return NextResponse.json({ prefs: null });
    }

    // All rows should share the same prefs — return the first row's values plus
    // the list of household IDs this update will touch.
    const first = rows[0];
    return NextResponse.json({
      prefs: {
        notifyShiftPosted: first.notifyShiftPosted,
        notifyShiftClaimed: first.notifyShiftClaimed,
        notifyShiftReleased: first.notifyShiftReleased,
        notifyBellRinging: first.notifyBellRinging,
        notifyBellResponse: first.notifyBellResponse,
      },
    });
  } catch (err) {
    return apiError(err, 'Could not load notification preferences', 500, 'notifications:GET');
  }
}

/**
 * PATCH /api/notifications
 * Body: partial record of PrefKey → boolean.
 * Updates all user rows for this Clerk identity (covers multi-household users).
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return authError(new Error('Not signed in'), 'notifications:PATCH');

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

    await db.update(users).set(patch).where(eq(users.clerkUserId, userId));

    return NextResponse.json({ ok: true, updated: patch });
  } catch (err) {
    return apiError(err, 'Could not update notification preferences', 500, 'notifications:PATCH');
  }
}
