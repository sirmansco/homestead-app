import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, desc, asc, inArray, or, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { shifts, users, households } from '@/lib/db/schema';

const claimerUsers = alias(users, 'claimer');
import { requireHousehold } from '@/lib/auth/household';
import { apiError, authError } from '@/lib/api-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      // Show all non-cancelled upcoming shifts visible to this caregiver:
      // - Open shifts not targeted at someone else (null preferred OR targeted at me)
      // - Claimed shifts (so they know coverage), always visible
      const myUserIdForFilter = myUserIds[0] ?? null;
      where = and(
        inArray(shifts.householdId, hhIds),
        gte(shifts.endsAt, new Date()),
        or(
          // Claimed shifts always show
          eq(shifts.status, 'claimed'),
          // Open shifts: show if no preference, or preference is this caregiver
          and(
            eq(shifts.status, 'open'),
            or(
              isNull(shifts.preferredCaregiverId),
              ...(myUserIdForFilter ? [eq(shifts.preferredCaregiverId, myUserIdForFilter)] : []),
            ),
          ),
        ),
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
    } else if (scope === 'all') {
      // Unified view across all households:
      // - As parent: shifts in households where user has role=parent (created by anyone in that hh)
      // - As caregiver: open shifts in households where user has role=caregiver
      // - Always: shifts the user personally claimed (regardless of role)
      if (!hhIds.length) return NextResponse.json({ shifts: [], meClerkUserId: userId });
      const parentHhIds = myUserRows.filter(u => u.role === 'parent').map(u => u.householdId);
      const caregiverHhIds = myUserRows.filter(u => u.role === 'caregiver').map(u => u.householdId);
      const clauses = [];
      if (parentHhIds.length) clauses.push(inArray(shifts.householdId, parentHhIds));
      if (caregiverHhIds.length) clauses.push(and(inArray(shifts.householdId, caregiverHhIds), eq(shifts.status, 'open')));
      if (myUserIds.length) clauses.push(inArray(shifts.claimedByUserId, myUserIds));
      if (!clauses.length) return NextResponse.json({ shifts: [], meClerkUserId: userId });
      where = and(
        gte(shifts.endsAt, new Date()),
        or(...clauses as [typeof clauses[0], ...typeof clauses]),
      );
    } else {
      where = and(
        eq(shifts.householdId, household.id),
        gte(shifts.endsAt, new Date()),
      );
    }

    const orderBy = (scope === 'village' || scope === 'all') ? asc(shifts.startsAt) : desc(shifts.startsAt);

    const rows = await db.select({
      shift: shifts,
      household: households,
      creator: { id: users.id, name: users.name },
      claimer: { id: claimerUsers.id, name: claimerUsers.name },
    })
      .from(shifts)
      .leftJoin(households, eq(shifts.householdId, households.id))
      .leftJoin(users, eq(shifts.createdByUserId, users.id))
      .leftJoin(claimerUsers, eq(shifts.claimedByUserId, claimerUsers.id))
      .where(where)
      .orderBy(orderBy);

    const myUserIdSet = new Set(myUserIds);
    const enriched = rows.map(r => ({
      ...r,
      claimedByMe: r.shift.claimedByUserId ? myUserIdSet.has(r.shift.claimedByUserId) : false,
      createdByMe: myUserIdSet.has(r.shift.createdByUserId),
      requestedForMe: r.shift.preferredCaregiverId ? myUserIdSet.has(r.shift.preferredCaregiverId) : false,
    }));

    return NextResponse.json({ shifts: enriched, meClerkUserId: userId });
  } catch (err) {
    return authError(err, 'shifts:GET');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();
    if (user.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can post shifts' }, { status: 403 });
    }

    // Rate limit: 20 shifts per hour per user (generous — covers recurring batches)
    const { rateLimit, rateLimitResponse } = await import('@/lib/ratelimit');
    const rl = rateLimit({ key: `shift-post:${user.id}`, limit: 20, windowMs: 60 * 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;
    const body = await req.json() as {
      title?: string;
      forWhom?: string;
      notes?: string;
      startsAt?: string;
      endsAt?: string;
      rateCents?: number | null;
      preferredCaregiverId?: string;
      recurrence?: {
        daysOfWeek?: number[];
        endsBy?: string;
        occurrences?: number;
      };
    };

    if (!body.title || !body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: 'title, startsAt, endsAt required' }, { status: 400 });
    }

    const starts = new Date(body.startsAt);
    const ends = new Date(body.endsAt);
    if (isNaN(+starts) || isNaN(+ends) || ends <= starts) {
      return NextResponse.json({ error: 'invalid time range' }, { status: 400 });
    }

    // Coerce invalid/empty preferredCaregiverId to null so bad client state
    // doesn't cause a uuid cast failure in Postgres.
    const preferredCaregiverId =
      body.preferredCaregiverId && UUID_RE.test(body.preferredCaregiverId)
        ? body.preferredCaregiverId
        : null;

    const baseValues = {
      householdId: household.id,
      createdByUserId: user.id,
      title: body.title.trim().slice(0, 200),
      forWhom: body.forWhom?.trim().slice(0, 200) || null,
      notes: body.notes?.trim().slice(0, 2000) || null,
      rateCents: body.rateCents ?? null,
      preferredCaregiverId,
    };

    // If recurrence is provided, expand into N shifts matching the selected
    // weekdays starting from the initial starts/ends pair.
    const recurrence = body.recurrence;
    const valuesList: Array<typeof baseValues & {
      startsAt: Date;
      endsAt: Date;
      isRecurring: boolean;
      recurDayOfWeek: number | null;
      recurEndsAt: string | null;
      recurOccurrences: number | null;
    }> = [];

    if (recurrence && Array.isArray(recurrence.daysOfWeek) && recurrence.daysOfWeek.length > 0) {
      const days = [...new Set(recurrence.daysOfWeek)].filter(d => d >= 0 && d <= 6).sort();
      const maxOccurrences = Math.min(Math.max(recurrence.occurrences ?? 0, 0) || 52, 52);
      const endsBy = recurrence.endsBy ? new Date(recurrence.endsBy) : null;
      const durationMs = +ends - +starts;

      // Walk forward day-by-day from starts, emitting a shift when the weekday matches.
      const cursor = new Date(starts);
      let produced = 0;
      const hardStop = new Date(+starts + 366 * 86400000); // safety cap: 1 year
      while (produced < (maxOccurrences || 52) && cursor <= hardStop) {
        if (endsBy && cursor > endsBy) break;
        const dow = cursor.getDay();
        if (days.includes(dow)) {
          const instanceStart = new Date(cursor);
          const instanceEnd = new Date(+instanceStart + durationMs);
          valuesList.push({
            ...baseValues,
            startsAt: instanceStart,
            endsAt: instanceEnd,
            isRecurring: true,
            recurDayOfWeek: dow,
            recurEndsAt: endsBy ? endsBy.toISOString().slice(0, 10) : null,
            recurOccurrences: maxOccurrences || null,
          });
          produced++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      if (valuesList.length === 0) {
        return NextResponse.json({ error: 'recurrence produced no shifts' }, { status: 400 });
      }
    } else {
      valuesList.push({
        ...baseValues,
        startsAt: starts,
        endsAt: ends,
        isRecurring: false,
        recurDayOfWeek: null,
        recurEndsAt: null,
        recurOccurrences: null,
      });
    }

    const created = await db.insert(shifts).values(valuesList).returning();

    // Fire-and-forget notification for the first shift (avoids N-fold spam on recurring)
    if (created[0]) notifyShiftPosted(created[0].id, preferredCaregiverId ?? undefined).catch(() => {});

    return NextResponse.json({ shift: created[0], count: created.length });
  } catch (err) {
    return apiError(err, 'Could not post shift. Try again.', 500, 'shifts:POST');
  }
}

async function notifyShiftPosted(shiftId: string, preferredCaregiverId?: string) {
  const { notifyNewShift } = await import('@/lib/notify');
  await notifyNewShift(shiftId, preferredCaregiverId);
}
