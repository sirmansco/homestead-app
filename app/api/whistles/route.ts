import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, desc, asc, inArray, or, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { whistles, users, households } from '@/lib/db/schema';

const claimerUsers = alias(users, 'claimer');
import { requireHousehold, requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { notifyNewShift, type NotifyResult } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { parseTimeRange } from '@/lib/validate/time-range';
import { UUID_RE } from '@/lib/validate/uuid';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();

    const scope = req.nextUrl.searchParams.get('scope') || 'household';

    // scope=mine doesn't need an active org — just find all whistles claimed by
    // this user across every household they belong to.
    // All other scopes need requireHousehold() for the active household context.
    let activeHousehold: { id: string } | null = null;
    if (scope !== 'mine') {
      try {
        const { household } = await requireHousehold();
        activeHousehold = household;
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const status = raw === 'No active household' ? 409 : raw === 'Not signed in' ? 401 : 500;
        const error = raw === 'No active household' ? 'no_household' : raw === 'Not signed in' ? 'not_signed_in' : 'internal_error';
        return NextResponse.json({ error }, { status });
      }
    }

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
      if (!hhIds.length) return NextResponse.json({ whistles: [], meClerkUserId: userId });
      // Show all non-cancelled upcoming whistles visible to this caregiver:
      // - Open whistles not targeted at someone else (null preferred OR targeted at me)
      // - Claimed whistles (so they know coverage), always visible
      const myUserIdForFilter = myUserIds[0] ?? null;
      where = and(
        inArray(whistles.householdId, hhIds),
        gte(whistles.endsAt, new Date()),
        or(
          // Claimed whistles always show
          eq(whistles.status, 'claimed'),
          // Open whistles: show if no preference, or preference is this caregiver
          and(
            eq(whistles.status, 'open'),
            or(
              isNull(whistles.preferredCaregiverId),
              ...(myUserIdForFilter ? [eq(whistles.preferredCaregiverId, myUserIdForFilter)] : []),
            ),
          ),
        ),
      );
    } else if (scope === 'mine') {
      // Find all users rows for this Clerk user (across all households, not just active org)
      // so caregivers see whistles they claimed even before setting an active org.
      const allMyUserRows = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.clerkUserId, userId));
      const allMyUserIds = allMyUserRows.map(u => u.id);
      if (!allMyUserIds.length) return NextResponse.json({ whistles: [], meClerkUserId: userId });
      where = and(
        or(
          inArray(whistles.claimedByUserId, allMyUserIds),
          inArray(whistles.createdByUserId, allMyUserIds),
        ),
        gte(whistles.endsAt, new Date()),
      );
    } else if (scope === 'all') {
      // Unified view across all households:
      // - As keeper: whistles in households where user has role=keeper (created by anyone in that hh)
      // - As watcher: open whistles in households where user has role=watcher
      // - Always: whistles the user personally claimed (regardless of role)
      if (!hhIds.length) return NextResponse.json({ whistles: [], meClerkUserId: userId });
      const parentHhIds = myUserRows.filter(u => u.role === 'keeper').map(u => u.householdId);
      const caregiverHhIds = myUserRows.filter(u => u.role === 'watcher').map(u => u.householdId);
      const clauses = [];
      if (parentHhIds.length) clauses.push(inArray(whistles.householdId, parentHhIds));
      if (caregiverHhIds.length) clauses.push(and(inArray(whistles.householdId, caregiverHhIds), eq(whistles.status, 'open')));
      if (myUserIds.length) clauses.push(inArray(whistles.claimedByUserId, myUserIds));
      if (!clauses.length) return NextResponse.json({ whistles: [], meClerkUserId: userId });
      where = and(
        gte(whistles.endsAt, new Date()),
        or(...clauses as [typeof clauses[0], ...typeof clauses]),
      );
    } else {
      if (!activeHousehold) return NextResponse.json({ error: 'no_household' }, { status: 409 });
      where = and(
        eq(whistles.householdId, activeHousehold.id),
        gte(whistles.endsAt, new Date()),
      );
    }

    // village/all/mine = ascending (soonest first); household = descending (most recent first)
    const orderBy = (scope === 'village' || scope === 'all' || scope === 'mine') ? asc(whistles.startsAt) : desc(whistles.startsAt);

    const rows = await db.select({
      shift: whistles,
      household: households,
      creator: { id: users.id, name: users.name },
      claimer: { id: claimerUsers.id, name: claimerUsers.name },
    })
      .from(whistles)
      .leftJoin(households, eq(whistles.householdId, households.id))
      .leftJoin(users, eq(whistles.createdByUserId, users.id))
      .leftJoin(claimerUsers, eq(whistles.claimedByUserId, claimerUsers.id))
      .where(where)
      .orderBy(orderBy);

    // Always build enrichment set from ALL users rows for this Clerk user across every
    // household — not just the active org — so claimedByMe is correct for caregivers
    // who claimed a shift in a household different from their current active org.
    const allMyUserRowsForEnrich = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, userId));
    const myUserIdSet = new Set(allMyUserRowsForEnrich.map(u => u.id));
    const enriched = rows.map(r => ({
      ...r,
      claimedByMe: r.shift.claimedByUserId ? myUserIdSet.has(r.shift.claimedByUserId) : false,
      createdByMe: myUserIdSet.has(r.shift.createdByUserId),
      requestedForMe: r.shift.preferredCaregiverId ? myUserIdSet.has(r.shift.preferredCaregiverId) : false,
    }));

    return NextResponse.json({ whistles: enriched, meClerkUserId: userId });
  } catch (err) {
    return authError(err, 'whistles:GET');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();
    if (user.role !== 'keeper') {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

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

    const timeRange = parseTimeRange(body.startsAt, body.endsAt);
    if ('error' in timeRange) {
      return NextResponse.json({ error: timeRange.error }, { status: timeRange.status });
    }
    const { starts, ends } = timeRange;

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

    // If recurrence is provided, expand into N whistles matching the selected
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
        return NextResponse.json({ error: `recurrence produced no ${getCopy().request.tabLabel.toLowerCase()}` }, { status: 400 });
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

    // Rate limit by true cost: a recurrence producing N rows debits N from
    // the bucket so 20 calls of 52-row recurrences (1,040 rows) can't slip
    // past a per-call limit. Limit raised to 100 to accommodate one yearly
    // weekly recurrence (52) plus margin for typical one-off posts.
    const rl = rateLimit({
      key: `shift-post:${user.id}`,
      limit: 100,
      windowMs: 60 * 60_000,
      cost: valuesList.length,
    });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const created = await db.insert(whistles).values(valuesList).returning();

    let notify: NotifyResult = { kind: 'push_error', recipients: 0, error: 'notify_threw' };
    if (created[0]) {
      try {
        notify = await notifyNewShift(created[0].id, preferredCaregiverId ?? undefined);
      } catch (err) {
        console.error('[whistles:post:notify]', err);
      }
    }

    return NextResponse.json({ shift: created[0], count: created.length, notify });
  } catch (err) {
    return authError(err, 'whistles:POST', `Could not post ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}. Try again.`);
  }
}
