import { NextRequest, NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, kids, households } from '@/lib/db/schema';
import { requireHousehold, requireHouseholdAdmin, requireUser } from '@/lib/auth/household';
import { normaliseStoredName } from '@/lib/format';
import { authError } from '@/lib/api-error';
import { tombstoneUser } from '@/lib/users/tombstone';

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get('scope') || 'household';

    if (scope === 'all') {
      const { userId } = await requireUser();

      const myRows = await db.select().from(users).where(eq(users.clerkUserId, userId));
      const hhIds = myRows.map(r => r.householdId);
      if (hhIds.length === 0) return NextResponse.json({ families: [] });

      const [hhRows, allAdults, allKids] = await Promise.all([
        db.select().from(households).where(inArray(households.id, hhIds)),
        db.select().from(users).where(inArray(users.householdId, hhIds)),
        db.select().from(kids).where(inArray(kids.householdId, hhIds)),
      ]);

      const families = hhRows.map(h => ({
        household: { id: h.id, name: h.name, glyph: h.glyph },
        adults: allAdults.filter(a => a.householdId === h.id).map(a => ({ ...a, name: normaliseStoredName(a.name) })),
        kids: allKids.filter(k => k.householdId === h.id),
      }));

      return NextResponse.json({ families });
    }

    const { household } = await requireHousehold();
    const [adults, kidsList] = await Promise.all([
      db.select().from(users).where(eq(users.householdId, household.id)),
      db.select().from(kids).where(eq(kids.householdId, household.id)),
    ]);

    const normalised = adults.map(a => ({ ...a, name: normaliseStoredName(a.name) }));
    return NextResponse.json({ adults: normalised, kids: kidsList });
  } catch (err) {
    return authError(err, 'village');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { household } = await requireHouseholdAdmin();
    const body = await req.json();

    if (body.type === 'kid') {
      const { name, birthday, notes } = body;
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      const [kid] = await db.insert(kids).values({
        householdId: household.id,
        name: name.trim(),
        birthday: birthday || null,
        notes: notes || null,
      }).returning();
      return NextResponse.json({ kid });
    }

    if (body.type === 'adult') {
      const { name, email, role, villageGroup, clerkUserId } = body;
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
      }
      const [user] = await db.insert(users).values({
        clerkUserId: clerkUserId || `placeholder_${crypto.randomUUID()}`,
        householdId: household.id,
        email: email.trim(),
        name: name.trim(),
        role: role || 'caregiver',
        villageGroup: villageGroup || 'covey',
      }).returning();
      return NextResponse.json({ user });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    return authError(err, 'village:POST');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { household } = await requireHouseholdAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    if (!id || !type) return NextResponse.json({ error: 'id and type required' }, { status: 400 });

    if (type === 'kid') {
      await db.delete(kids).where(and(eq(kids.id, id), eq(kids.householdId, household.id)));
    } else if (type === 'adult') {
      // Cache target's clerkUserId before tombstone — anonymize rewrites it.
      const [target] = await db.select().from(users).where(and(
        eq(users.id, id), eq(users.householdId, household.id),
      )).limit(1);
      if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

      const outcome = await tombstoneUser({ userId: id, householdId: household.id });
      console.log(JSON.stringify({
        event: 'village_delete_adult',
        userId: id,
        householdId: household.id,
        outcome,
        at: new Date().toISOString(),
      }));

      // DB first, Clerk last (BUILD-LESSONS Principle 6). Drop org membership
      // using the cached clerkUserId so anonymize's rewrite doesn't lose it.
      try {
        const client = await clerkClient();
        const memberships = await client.organizations.getOrganizationMembershipList({
          organizationId: household.clerkOrgId,
        });
        const membership = memberships.data.find(
          m => m.publicUserData?.userId === target.clerkUserId,
        );
        if (membership) {
          await client.organizations.deleteOrganizationMembership({
            organizationId: household.clerkOrgId,
            userId: target.clerkUserId,
          });
        }
      } catch (clerkErr) {
        console.error('[village:DELETE:clerk]', clerkErr);
      }
    } else {
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'village:PATCH', 'Village action failed');
  }
}
