import { NextRequest, NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, chicks, households } from '@/lib/db/schema';
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
        db.select().from(chicks).where(inArray(chicks.householdId, hhIds)),
      ]);

      const families = hhRows.map(h => ({
        household: { id: h.id, name: h.name, glyph: h.glyph },
        adults: allAdults.filter(a => a.householdId === h.id).map(a => ({ ...a, name: normaliseStoredName(a.name) })),
        chicks: allKids.filter(k => k.householdId === h.id),
      }));

      return NextResponse.json({ families });
    }

    const { household, user: viewer } = await requireHousehold();
    const [adults, kidsList] = await Promise.all([
      db.select().from(users).where(eq(users.householdId, household.id)),
      db.select().from(chicks).where(eq(chicks.householdId, household.id)),
    ]);

    // Bug #2 (BUGS.md 2026-05-06): watcher viewers cannot see peer watchers.
    // Privacy filter — server-side, not UI. A watcher sees keepers, chicks,
    // and themselves. Other watchers are excluded from the response payload.
    // See docs/plans/circle-invite-role-audit.md §2.3 (Circle visibility).
    const visibleAdults = viewer.role === 'watcher'
      ? adults.filter(a => a.role === 'keeper' || a.id === viewer.id)
      : adults;

    const normalised = visibleAdults.map(a => ({ ...a, name: normaliseStoredName(a.name) }));
    return NextResponse.json({ adults: normalised, chicks: kidsList });
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
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return NextResponse.json({ error: 'Name required' }, { status: 400 });

      let validBirthday: string | null = null;
      if (birthday) {
        if (typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
          return NextResponse.json({ error: 'birthday must be YYYY-MM-DD' }, { status: 400 });
        }
        const d = new Date(birthday + 'T00:00:00Z');
        if (Number.isNaN(+d)) {
          return NextResponse.json({ error: 'birthday is not a valid date' }, { status: 400 });
        }
        const now = new Date();
        const minDate = new Date(now.getFullYear() - 25, now.getMonth(), now.getDate());
        const maxDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        if (d < minDate || d > maxDate) {
          return NextResponse.json({ error: 'birthday out of range' }, { status: 400 });
        }
        validBirthday = birthday;
      }

      const [kid] = await db.insert(chicks).values({
        householdId: household.id,
        name: trimmedName.slice(0, 100),
        birthday: validBirthday,
        notes: typeof notes === 'string' ? notes.trim().slice(0, 2000) || null : null,
      }).returning();
      return NextResponse.json({ kid });
    }

    if (body.type === 'adult') {
      const { name, email } = body;
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
      }
      const [user] = await db.insert(users).values({
        clerkUserId: `placeholder_${crypto.randomUUID()}`,
        householdId: household.id,
        email: email.trim(),
        name: name.trim(),
        role: 'watcher',
        villageGroup: 'covey',
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
      await db.delete(chicks).where(and(eq(chicks.id, id), eq(chicks.householdId, household.id)));
      return NextResponse.json({ ok: true });
    }

    if (type === 'adult') {
      // Cache target's clerkUserId before tombstone — anonymize rewrites it.
      const [target] = await db.select().from(users).where(and(
        eq(users.id, id), eq(users.householdId, household.id),
      )).limit(1);
      if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

      const outcome = await tombstoneUser({ userId: id, householdId: household.id });

      // DB first, Clerk last (BUILD-LESSONS Principle 6). Drop org membership
      // using the cached clerkUserId so anonymize's rewrite doesn't lose it.
      // Surfaces clerkDropped to the caller per account/route.ts:148-156 parity
      // so a Clerk-side failure isn't invisible.
      let clerkDropped = true;
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
        clerkDropped = false;
        console.error('[village:DELETE:clerk]', clerkErr);
      }

      console.log(JSON.stringify({
        event: 'village_delete_adult',
        userId: id,
        householdId: household.id,
        outcome,
        clerkDropped,
        at: new Date().toISOString(),
      }));

      return NextResponse.json({ ok: true, clerkDropped });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    return authError(err, 'village:PATCH', 'Village action failed');
  }
}
