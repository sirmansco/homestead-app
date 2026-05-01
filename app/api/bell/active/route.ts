import { NextResponse } from 'next/server';
import { eq, inArray, and, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells, users, bellResponses } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { getCopy } from '@/lib/copy';

// GET /api/bell/active
// Returns active bells visible to this user — status 'ringing' or 'handled', endsAt in the future.
// Sorted so ringing bells appear before handled ones.
//   - parent: bells from own household
//   - caregiver/dual-role: bells from any household they belong to as caregiver
export async function GET() {
  try {
    const { userId } = await requireUser();

    // All households this Clerk user belongs to (across all orgs, no active-org requirement)
    const myRows = await db.select({
      householdId: users.householdId,
      role: users.role,
      id: users.id,
    }).from(users).where(eq(users.clerkUserId, userId));

    if (myRows.length === 0) return NextResponse.json({ bells: [] });

    const hhIds = myRows.map(r => r.householdId);

    // Fetch ringing and handled bells that haven't expired yet
    const activeBells = await db.select().from(bells)
      .where(and(
        inArray(bells.householdId, hhIds),
        inArray(bells.status, ['ringing', 'handled']),
        gt(bells.endsAt, new Date()),
      ))
      .orderBy(bells.createdAt);

    // Sort: ringing first, then handled
    activeBells.sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'ringing' ? -1 : 1;
    });

    // For each bell, attach who has responded
    const bellIds = activeBells.map(b => b.id);
    const responses = bellIds.length
      ? await db.select().from(bellResponses).where(inArray(bellResponses.bellId, bellIds))
      : [];

    // Resolve handler display names
    const handlerIds = activeBells
      .map(b => b.handledByUserId)
      .filter((id): id is string => id !== null);
    const handlerRows = handlerIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, handlerIds))
      : [];
    const handlerMap = new Map(handlerRows.map(u => [u.id, u.name]));

    // My user IDs across all households
    const myUserIds = new Set(myRows.map(r => r.id));

    const result = activeBells.map(b => ({
      ...b,
      handledByName: b.handledByUserId ? (handlerMap.get(b.handledByUserId) ?? null) : null,
      responses: responses.filter(r => r.bellId === b.id),
      myResponse: responses.find(r => r.bellId === b.id && myUserIds.has(r.userId))?.response ?? null,
    }));

    return NextResponse.json({ bells: result });
  } catch (err) {
    return authError(err, 'bell:active', `Could not load active ${getCopy().urgentSignal.noun.toLowerCase()}`);
  }
}
