import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { household, user } = await requireHousehold();
    if (user.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can change roles' }, { status: 403 });
    }
    const body = await req.json() as {
      role?: 'parent' | 'caregiver';
      villageGroup?: 'covey' | 'field';
    };
    const patch: { role?: 'parent' | 'caregiver'; villageGroup?: 'covey' | 'field' } = {};
    if (body.role === 'parent' || body.role === 'caregiver') patch.role = body.role;
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
    const { household, user } = await requireHousehold();
    if (user.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can remove members' }, { status: 403 });
    }
    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }
    const [target] = await db.select().from(users).where(and(
      eq(users.id, id), eq(users.householdId, household.id),
    )).limit(1);
    if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

    await db.delete(users).where(and(eq(users.id, id), eq(users.householdId, household.id)));

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
    } catch {
      // best-effort; the DB row is already gone
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'household:member', 'Member action failed');
  }
}
