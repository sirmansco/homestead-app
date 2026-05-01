import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells, bellResponses, users, households } from '@/lib/db/schema';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyBellResponse } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { escalateBell } from '@/lib/bell-escalation';

type ResponseBody = { response: 'on_my_way' | 'in_thirty' | 'cannot' };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireUser();

    const { id: bellId } = await params;
    const body = await req.json() as ResponseBody;
    const { response } = body;

    if (!['on_my_way', 'in_thirty', 'cannot'].includes(response)) {
      return NextResponse.json({ error: 'Invalid response' }, { status: 400 });
    }

    const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
    if (!bell) return NextResponse.json({ error: `${getCopy().urgentSignal.noun} not found` }, { status: 404 });

    // Don't allow responses to bells that are no longer ringing
    if (bell.status !== 'ringing') {
      return NextResponse.json({ error: `${getCopy().urgentSignal.noun} is no longer active` }, { status: 409 });
    }

    // Find this user's DB record for the bell's household.
    // Auto-create it if missing (caregiver who was invited via link may not have a row yet).
    let [userRow] = await db.select().from(users)
      .where(and(eq(users.clerkUserId, userId), eq(users.householdId, bell.householdId)))
      .limit(1);

    if (!userRow) {
      // Verify the user is actually a member of this household via Clerk org membership
      const [household] = await db.select().from(households).where(eq(households.id, bell.householdId)).limit(1);
      if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

      const client = await clerkClient();
      const memberships = await client.users.getOrganizationMembershipList({ userId });
      const isMember = memberships.data.some(m => m.organization.id === household.clerkOrgId);
      if (!isMember) return NextResponse.json({ error: 'Not a member of this household' }, { status: 403 });

      const cu = await client.users.getUser(userId);
      const email = cu.primaryEmailAddress?.emailAddress ?? '';
      const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email;
      const meta = (cu.publicMetadata ?? {}) as { villageGroup?: 'covey' | 'field' | 'inner_circle' | 'sitter' };
      [userRow] = await db.insert(users).values({
        clerkUserId: userId,
        householdId: bell.householdId,
        email,
        name,
        role: 'caregiver',
        villageGroup: meta.villageGroup || 'field',
      }).returning();
    }

    // Upsert response (one per user per bell)
    const existing = await db.select().from(bellResponses)
      .where(and(eq(bellResponses.bellId, bellId), eq(bellResponses.userId, userRow.id)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(bellResponses)
        .set({ response, respondedAt: new Date() })
        .where(and(eq(bellResponses.bellId, bellId), eq(bellResponses.userId, userRow.id)));
    } else {
      await db.insert(bellResponses).values({
        bellId,
        userId: userRow.id,
        response,
      });
    }

    // If on_my_way, mark bell handled
    if (response === 'on_my_way') {
      await db.update(bells)
        .set({ status: 'handled', handledByUserId: userRow.id, handledAt: new Date() })
        .where(eq(bells.id, bellId));
    }

    // Notify the ringer so they see the response immediately
    try {
      await notifyBellResponse(bellId, userRow.id, response);
    } catch (err) {
      console.error('[bell:respond:notify]', err);
    }

    // Immediate escalation if all covey members have responded cannot
    if (response === 'cannot' && bell.escalatedAt === null) {
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
        .from(users)
        .where(and(
          eq(users.householdId, bell.householdId),
          eq(users.role, 'caregiver'),
          eq(users.villageGroup, 'covey'),
        ));
      if (total > 0) {
        const [{ cannotCount }] = await db.select({ cannotCount: sql<number>`count(*)::int` })
          .from(bellResponses)
          .innerJoin(users, eq(bellResponses.userId, users.id))
          .where(and(
            eq(bellResponses.bellId, bellId),
            eq(bellResponses.response, 'cannot'),
            eq(users.villageGroup, 'covey'),
          ));
        if (cannotCount >= total) {
          await escalateBell(bellId);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'bell:respond', `Could not respond to ${getCopy().urgentSignal.noun.toLowerCase()}`);
  }
}
