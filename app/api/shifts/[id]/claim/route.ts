import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { shifts, users, households } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { notifyShiftClaimed } from '@/lib/notify';
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { userId } = await requireUser();

    const rl = rateLimit({ key: `shift-claim:${userId}`, limit: 10, windowMs: 60 * 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

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

    try {
      await notifyShiftClaimed(claimed.id);
    } catch (err) {
      console.error('[shifts:claim:notify]', err);
    }

    return NextResponse.json({ shift: claimed });
  } catch (err) {
    return authError(err, 'shifts:claim', 'Could not claim shift');
  }
}
