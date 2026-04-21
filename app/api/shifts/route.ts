import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, desc, asc, inArray, or } from 'drizzle-orm';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { shifts, users, households } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function GET(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

    const scope = req.nextUrl.searchParams.get('scope') || 'household';

    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    const orgIds = memberships.data.map(m => m.organization.id);
    const hhRows = orgIds.length
      ? await db.select().from(households).where(inArray(households.clerkOrgId, orgIds))
      : [];
    const hhIds = hhRows.map(h => h.id);

    // Collect every users row belonging to this Clerk user across their households
    const myUserRows = hhIds.length
      ? await db.select().from(users).where(and(
          eq(users.clerkUserId, userId),
          inArray(users.householdId, hhIds),
        ))
      : [];
    const myUserIds = myUserRows.map(u => u.id);

    let where;
    if (scope === 'village') {
      if (!hhIds.length) return NextResponse.json({ shifts: [], meClerkUserId: userId });
      where = and(
        inArray(shifts.householdId, hhIds),
        eq(shifts.status, 'open'),
        gte(shifts.endsAt, new Date()),
      );
    } else if (scope === 'mine') {
      if (!myUserIds.length) return NextResponse.json({ shifts: [], meClerkUserId: userId });
      where = and(
        or(
          inArray(shifts.claimedByUserId, myUserIds),
          inArray(shifts.createdByUserId, myUserIds),
        ),
        gte(shifts.endsAt, new Date()),
      );
    } else {
      where = and(
        eq(shifts.householdId, household.id),
        gte(shifts.endsAt, new Date()),
      );
    }

    const orderBy = scope === 'village' ? asc(shifts.startsAt) : desc(shifts.startsAt);

    const rows = await db.select({
      shift: shifts,
      household: households,
      creator: users,
    })
      .from(shifts)
      .leftJoin(households, eq(shifts.householdId, households.id))
      .leftJoin(users, eq(shifts.createdByUserId, users.id))
      .where(where)
      .orderBy(orderBy);

    const myUserIdSet = new Set(myUserIds);
    const enriched = rows.map(r => ({
      ...r,
      claimedByMe: r.shift.claimedByUserId ? myUserIdSet.has(r.shift.claimedByUserId) : false,
      createdByMe: myUserIdSet.has(r.shift.createdByUserId),
    }));

    return NextResponse.json({ shifts: enriched, meClerkUserId: userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();
    if (user.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can post shifts' }, { status: 403 });
    }
    const body = await req.json() as {
      title?: string;
      forWhom?: string;
      notes?: string;
      startsAt?: string;
      endsAt?: string;
      rateCents?: number | null;
    };

    if (!body.title || !body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: 'title, startsAt, endsAt required' }, { status: 400 });
    }

    const starts = new Date(body.startsAt);
    const ends = new Date(body.endsAt);
    if (isNaN(+starts) || isNaN(+ends) || ends <= starts) {
      return NextResponse.json({ error: 'invalid time range' }, { status: 400 });
    }

    const [created] = await db.insert(shifts).values({
      householdId: household.id,
      createdByUserId: user.id,
      title: body.title.trim().slice(0, 200),
      forWhom: body.forWhom?.trim().slice(0, 200) || null,
      notes: body.notes?.trim().slice(0, 2000) || null,
      startsAt: starts,
      endsAt: ends,
      rateCents: body.rateCents ?? null,
    }).returning();

    // Fire-and-forget notification
    notifyShiftPosted(created.id).catch(() => {});

    return NextResponse.json({ shift: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function notifyShiftPosted(shiftId: string) {
  const { notifyNewShift } = await import('@/lib/notify');
  await notifyNewShift(shiftId);
}
