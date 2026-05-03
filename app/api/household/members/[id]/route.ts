import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireHouseholdAdmin } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { tombstoneUser } from '@/lib/users/tombstone';
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { household } = await requireHouseholdAdmin();
    const body = await req.json() as {
      role?: 'keeper' | 'watcher';
      villageGroup?: 'covey' | 'field';
    };
    const patch: { role?: 'keeper' | 'watcher'; villageGroup?: 'covey' | 'field' } = {};
    if (body.role === 'keeper' || body.role === 'watcher') patch.role = body.role;
    if (body.villageGroup === 'covey' || body.villageGroup === 'field') {
      patch.villageGroup = body.villageGroup;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'no changes' }, { status: 400 });
    }
    const [updated] = await db.update(users)
      .set(patch)
      .where(and(eq(users.id, id), eq(users.householdId, household.id)))
      .returning();
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ member: updated });
  } catch (err) {
    return authError(err, 'household:member', 'Member action failed');
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { household, user } = await requireHouseholdAdmin();
    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }
    const [target] = await db.select().from(users).where(and(
      eq(users.id, id), eq(users.householdId, household.id),
    )).limit(1);
    if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (target.isAdmin) {
      const adminCount = await db.$count(
        users,
        and(eq(users.householdId, household.id), eq(users.isAdmin, true)),
      );
      if (adminCount === 1) {
        return NextResponse.json(
          { error: 'last_admin', message: 'Cannot remove the only admin. Transfer admin first.' },
          { status: 409 },
        );
      }
    }

    const outcome = await tombstoneUser({ userId: id, householdId: household.id });

    // DB first, Clerk last (BUILD-LESSONS Principle 6). Use cached clerkUserId
    // because anonymize rewrites it. Surfaces clerkDropped to the caller per
    // account/route.ts:148-156 parity so a Clerk-side failure isn't invisible.
    let clerkDropped = true;
    try {
      const client = await clerkClient();
      const memberships = await client.organizations.getOrganizationMembershipList({
        organizationId: household.clerkOrgId,
      });
      const membership = memberships.data.find(m => m.publicUserData?.userId === target.clerkUserId);
      if (membership) {
        await client.organizations.deleteOrganizationMembership({
          organizationId: household.clerkOrgId,
          userId: target.clerkUserId,
        });
      }
    } catch (clerkErr) {
      clerkDropped = false;
      console.error('[household:member:DELETE:clerk]', clerkErr);
    }

    console.log(JSON.stringify({
      event: 'household_member_delete',
      userId: id,
      householdId: household.id,
      outcome,
      clerkDropped,
      at: new Date().toISOString(),
    }));

    return NextResponse.json({ ok: true, clerkDropped });
  } catch (err) {
    return authError(err, 'household:member', 'Member action failed');
  }
}
