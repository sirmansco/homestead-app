import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { tombstoneUser } from '@/lib/users/tombstone';

// POST /api/circle/leave
// Caregiver self-removal from the active household. Admin authority is NOT
// required — this is the *self* mutation path; admin-gated village DELETE is
// for *other-row* mutations (B2 / synthesis L2).
//
// Self-leave does not drop Clerk org membership. The user retains their Clerk
// identity for any other household they belong to; this is per-household
// removal, not account deletion.
export async function POST() {
  try {
    const { household, user } = await requireHousehold();

    const outcome = await tombstoneUser({ userId: user.id, householdId: household.id });
    console.log(JSON.stringify({
      event: 'village_leave',
      userId: user.id,
      householdId: household.id,
      outcome,
      at: new Date().toISOString(),
    }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'village:leave', 'Could not leave household');
  }
}
