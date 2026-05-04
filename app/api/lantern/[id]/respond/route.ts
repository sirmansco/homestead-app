import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns, lanternResponses, users, households } from '@/lib/db/schema';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyLanternResponse } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { escalateLantern } from '@/lib/lantern-escalation';
import { requireUUID } from '@/lib/validate/uuid';
import { normalizeVillageGroup } from '@/lib/village-group/normalize';

type ResponseBody = { response: 'on_my_way' | 'in_thirty' | 'cannot' };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const lanternId = requireUUID(rawId);
    if (!lanternId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const { userId } = await requireUser();
    const body = await req.json() as ResponseBody;
    const { response } = body;

    if (!['on_my_way', 'in_thirty', 'cannot'].includes(response)) {
      return NextResponse.json({ error: 'Invalid response' }, { status: 400 });
    }

    const [lantern] = await db.select().from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
    if (!lantern) return NextResponse.json({ error: `${getCopy().urgentSignal.noun} not found` }, { status: 404 });

    // Don't allow responses to lanterns that are no longer ringing
    if (lantern.status !== 'ringing') {
      return NextResponse.json({ error: `${getCopy().urgentSignal.noun} is no longer active` }, { status: 409 });
    }

    // Find this user's DB record for the lantern's household.
    // Auto-create it if missing (caregiver who was invited via link may not have a row yet).
    let [userRow] = await db.select().from(users)
      .where(and(eq(users.clerkUserId, userId), eq(users.householdId, lantern.householdId)))
      .limit(1);

    if (!userRow) {
      // Verify the user is actually a member of this household via Clerk org membership
      const [household] = await db.select().from(households).where(eq(households.id, lantern.householdId)).limit(1);
      if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

      const client = await clerkClient();
      const memberships = await client.users.getOrganizationMembershipList({ userId });
      const isMember = memberships.data.some(m => m.organization.id === household.clerkOrgId);
      if (!isMember) return NextResponse.json({ error: 'no_access' }, { status: 403 });

      const cu = await client.users.getUser(userId);
      const email = cu.primaryEmailAddress?.emailAddress ?? '';
      const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email;
      const meta = (cu.publicMetadata ?? {}) as { villageGroup?: 'covey' | 'field' | 'inner_circle' | 'sitter' };
      [userRow] = await db.insert(users).values({
        clerkUserId: userId,
        householdId: lantern.householdId,
        email,
        name,
        role: 'watcher',
        villageGroup: normalizeVillageGroup(meta.villageGroup || 'field'),
      }).returning();
    }

    // Upsert response (one per user per lantern)
    const existing = await db.select().from(lanternResponses)
      .where(and(eq(lanternResponses.lanternId, lanternId), eq(lanternResponses.userId, userRow.id)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(lanternResponses)
        .set({ response, respondedAt: new Date() })
        .where(and(eq(lanternResponses.lanternId, lanternId), eq(lanternResponses.userId, userRow.id)));
    } else {
      await db.insert(lanternResponses).values({
        lanternId: lanternId,
        userId: userRow.id,
        response,
      });
    }

    // If on_my_way, claim the lantern via CAS so two concurrent responders
    // can't both end up as the "handler". Only one UPDATE will see status
    // still 'ringing' AND handled_by_user_id still NULL — the other gets
    // zero rows and silently doesn't claim. The response row is still
    // recorded above, so the loser's "I'm coming" intent isn't lost.
    let claimedByThisCall = false;
    if (response === 'on_my_way') {
      const claimed = await db.update(lanterns)
        .set({ status: 'handled', handledByUserId: userRow.id, handledAt: new Date() })
        .where(and(
          eq(lanterns.id, lanternId),
          eq(lanterns.status, 'ringing'),
          isNull(lanterns.handledByUserId),
        ))
        .returning({ id: lanterns.id });
      claimedByThisCall = claimed.length > 0;
    }

    // Notify the keeper so they see the response immediately
    try {
      await notifyLanternResponse(lanternId, userRow.id, response);
    } catch (err) {
      console.error('[lantern:respond:notify]', err);
    }

    // Immediate escalation if all covey members have responded cannot
    if (response === 'cannot' && lantern.escalatedAt === null) {
      // Transitional read-compat: include legacy inner_circle rows alongside
      // covey. Remove after B4 backfill confirms zero inner_circle rows.
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
        .from(users)
        .where(and(
          eq(users.householdId, lantern.householdId),
          eq(users.role, 'watcher'),
          inArray(users.villageGroup, ['covey', 'inner_circle']),
        ));
      if (total > 0) {
        const [{ cannotCount }] = await db.select({ cannotCount: sql<number>`count(*)::int` })
          .from(lanternResponses)
          .innerJoin(users, eq(lanternResponses.userId, users.id))
          .where(and(
            eq(lanternResponses.lanternId, lanternId),
            eq(lanternResponses.response, 'cannot'),
            inArray(users.villageGroup, ['covey', 'inner_circle']),
          ));
        if (cannotCount >= total) {
          await escalateLantern(lanternId);
        }
      }
    }

    return NextResponse.json({ ok: true, claimed: claimedByThisCall });
  } catch (err) {
    return authError(err, 'lantern:respond', `Could not respond to ${getCopy().urgentSignal.noun.toLowerCase()}`);
  }
}
