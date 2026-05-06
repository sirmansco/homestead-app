import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { whistles, users, households } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { notifyNewShift } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { requireUUID } from '@/lib/validate/uuid';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const id = requireUUID(rawId);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const { userId } = await requireUser();

    const rl = rateLimit({ key: `shift-rebroadcast:${userId}:${id}`, limit: 5, windowMs: 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const [shift] = await db.select().from(whistles).where(eq(whistles.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [household] = await db.select().from(households).where(eq(households.id, shift.householdId)).limit(1);
    if (!household) return NextResponse.json({ error: 'household missing' }, { status: 404 });

    // Any keeper in this household can rebroadcast a released whistle (not
    // restricted to the original creator). Verify Clerk org membership AND
    // role=keeper on the resolved users row.
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    const isMember = memberships.data.some(m => m.organization.id === household.clerkOrgId);
    if (!isMember) return NextResponse.json({ error: 'no_access' }, { status: 403 });

    const [actor] = await db.select().from(users).where(and(
      eq(users.clerkUserId, userId),
      eq(users.householdId, household.id),
    )).limit(1);
    if (!actor || actor.role !== 'keeper') {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    // Atomic gate: only rebroadcast a whistle that is currently open AND was
    // previously released (released_at IS NOT NULL). Prevents rebroadcasting
    // a freshly-posted whistle (no UI exposes that, but defense in depth) and
    // is a no-op race-loser if a watcher claims between read and update.
    const [rebroadcast] = await db.update(whistles)
      .set({ releasedAt: null })
      .where(and(
        eq(whistles.id, id),
        eq(whistles.status, 'open'),
        isNotNull(whistles.releasedAt),
      ))
      .returning();
    if (!rebroadcast) {
      return NextResponse.json({ error: 'not rebroadcastable' }, { status: 409 });
    }

    try {
      await notifyNewShift(rebroadcast.id, rebroadcast.preferredCaregiverId ?? undefined);
    } catch (err) {
      console.error('[whistles:rebroadcast:notify]', err);
    }

    return NextResponse.json({ shift: rebroadcast });
  } catch (err) {
    return authError(err, 'whistles:rebroadcast', `Could not resend ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}`);
  }
}
