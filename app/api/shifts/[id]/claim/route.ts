import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { shifts, users, households } from '@/lib/db/schema';
import { apiError } from '@/lib/api-error';
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [household] = await db.select().from(households).where(eq(households.id, shift.householdId)).limit(1);
    if (!household) return NextResponse.json({ error: 'household missing' }, { status: 404 });

    // Require the claimer to be a member of this shift's household (via Clerk org membership)
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    const isMember = memberships.data.some(m => m.organization.id === household.clerkOrgId);
    if (!isMember) return NextResponse.json({ error: 'not a member of this household' }, { status: 403 });

    // Ensure a users row exists for this claimer in the shift's household
    let [claimer] = await db.select().from(users).where(and(
      eq(users.clerkUserId, userId),
      eq(users.householdId, household.id),
    )).limit(1);
    if (!claimer) {
      const cu = await client.users.getUser(userId);
      const email = cu.primaryEmailAddress?.emailAddress ?? '';
      const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email;
      [claimer] = await db.insert(users).values({
        clerkUserId: userId,
        householdId: household.id,
        email,
        name,
        role: 'caregiver',
        villageGroup: 'sitter',
      }).returning();
    }

    // Atomic claim: only succeeds if still open
    const [claimed] = await db.update(shifts)
      .set({
        status: 'claimed',
        claimedByUserId: claimer.id,
        claimedAt: sql`now()`,
      })
      .where(and(eq(shifts.id, id), eq(shifts.status, 'open')))
      .returning();

    if (!claimed) {
      return NextResponse.json({ error: 'already claimed' }, { status: 409 });
    }

    const { notifyShiftClaimed } = await import('@/lib/notify');
    notifyShiftClaimed(claimed.id).catch(() => {});

    return NextResponse.json({ shift: claimed });
  } catch (err) {
    return apiError(err, 'Could not claim shift', 500, 'shifts:claim');
  }
}
