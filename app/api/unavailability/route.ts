import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { caregiverUnavailability, households, users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { parseTimeRange } from '@/lib/validate/time-range';

// Resolve the caller's users row scoped to the active household.
// Unavailability is per-(user, household) — a caregiver in two households
// manages their schedule independently in each context.
async function resolveHouseholdUser(clerkUserId: string, clerkOrgId: string) {
  const [household] = await db.select()
    .from(households)
    .where(eq(households.clerkOrgId, clerkOrgId))
    .limit(1);
  if (!household) return null;

  const [user] = await db.select()
    .from(users)
    .where(and(
      eq(users.clerkUserId, clerkUserId),
      eq(users.householdId, household.id),
    ))
    .limit(1);
  return user ?? null;
}

export async function GET() {
  try {
    const { userId, orgId } = await requireHousehold();

    const user = await resolveHouseholdUser(userId, orgId);
    if (!user) return NextResponse.json({ unavailability: [] });

    const rows = await db.select()
      .from(caregiverUnavailability)
      .where(and(
        eq(caregiverUnavailability.userId, user.id),
        gte(caregiverUnavailability.endsAt, new Date()),
      ))
      .orderBy(desc(caregiverUnavailability.startsAt));
    return NextResponse.json({ unavailability: rows });
  } catch (err) {
    return authError(err, 'unavailability', 'Request failed');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await requireHousehold();

    const user = await resolveHouseholdUser(userId, orgId);
    if (!user) return NextResponse.json({ error: 'No user profile found. Join a household first.' }, { status: 409 });

    const body = await req.json() as { startsAt?: string; endsAt?: string; note?: string };
    if (!body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: 'startsAt and endsAt required' }, { status: 400 });
    }
    const timeRange = parseTimeRange(body.startsAt, body.endsAt);
    if ('error' in timeRange) {
      return NextResponse.json({ error: timeRange.error }, { status: timeRange.status });
    }
    const [row] = await db.insert(caregiverUnavailability).values({
      userId: user.id,
      startsAt: timeRange.starts,
      endsAt: timeRange.ends,
      note: body.note?.trim() || null,
    }).returning();
    return NextResponse.json({ unavailability: row });
  } catch (err) {
    return authError(err, 'unavailability', 'Request failed');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, orgId } = await requireHousehold();

    const user = await resolveHouseholdUser(userId, orgId);
    if (!user) return NextResponse.json({ error: 'No user profile found' }, { status: 409 });

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db.delete(caregiverUnavailability).where(
      and(eq(caregiverUnavailability.id, id), eq(caregiverUnavailability.userId, user.id))
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'unavailability', 'Request failed');
  }
}
