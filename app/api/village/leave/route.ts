import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

// POST /api/village/leave
// Caregiver self-removal from the active household. Admin authority is NOT
// required — this is the *self* mutation path; admin-gated village DELETE is
// for *other-row* mutations (B2 / synthesis L2).
//
// FK behavior: a user with authored shifts/bells will currently 5xx via
// onDelete:'restrict'. L9 (synthesis Theme B) lands tombstone behavior here
// rather than threading it through the conflated village DELETE.
export async function POST() {
  try {
    const { household, user } = await requireHousehold();

    await db.delete(users).where(and(
      eq(users.id, user.id),
      eq(users.householdId, household.id),
    ));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'village:leave', 'Could not leave household');
  }
}
