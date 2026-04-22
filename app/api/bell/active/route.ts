import { NextResponse } from 'next/server';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells, users, bellResponses } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';

// GET /api/bell/active
// Returns RINGING bells visible to this user:
//   - parent: bells from own household
//   - caregiver/dual-role: bells from any household they belong to as caregiver
// Only returns bells with status='ringing' — handled/cancelled bells are excluded.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // All households this Clerk user belongs to (across all orgs, no active-org requirement)
    const myRows = await db.select({
      householdId: users.householdId,
      role: users.role,
      id: users.id,
    }).from(users).where(eq(users.clerkUserId, userId));

    if (myRows.length === 0) return NextResponse.json({ bells: [] });

    const hhIds = myRows.map(r => r.householdId);

    // Only fetch ringing bells — do not surface handled/cancelled ones
    const activeBells = await db.select().from(bells)
      .where(and(inArray(bells.householdId, hhIds), eq(bells.status, 'ringing')))
      .orderBy(bells.createdAt);

    // For each bell, attach who has responded
    const bellIds = activeBells.map(b => b.id);
    const responses = bellIds.length
      ? await db.select().from(bellResponses).where(inArray(bellResponses.bellId, bellIds))
      : [];

    // My user IDs across all households
    const myUserIds = new Set(myRows.map(r => r.id));

    const result = activeBells.map(b => ({
      ...b,
      responses: responses.filter(r => r.bellId === b.id),
      myResponse: responses.find(r => r.bellId === b.id && myUserIds.has(r.userId))?.response ?? null,
    }));

    return NextResponse.json({ bells: result });
  } catch (err) {
    return apiError(err, 'Could not load active bell', 500, 'bell:active');
  }
}
