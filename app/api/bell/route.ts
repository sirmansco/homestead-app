import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells, users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { authError } from '@/lib/api-error';
import { pushToUsers } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();

    // Rate limit: max 3 bells per user per 5 minutes. Bell spam alerts every
    // phone in the village — this is the highest-impact endpoint to protect.
    const rl = rateLimit({ key: `bell:${user.id}`, limit: 3, windowMs: 5 * 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const body = await req.json();
    const { reason, note, startsAt, endsAt } = body as {
      reason: string;
      note?: string;
      startsAt: string;
      endsAt: string;
    };

    if (!reason || !startsAt || !endsAt) {
      return NextResponse.json({ error: 'reason, startsAt, endsAt required' }, { status: 400 });
    }

    const [bell] = await db.insert(bells).values({
      householdId: household.id,
      createdByUserId: user.id,
      reason,
      note: note || null,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      status: 'ringing',
    }).returning();

    // Notify inner_circle caregivers only (spec: Bell pings inner_circle first)
    const innerCircle = await db.select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.householdId, household.id),
        eq(users.role, 'caregiver'),
        eq(users.villageGroup, 'inner_circle'),
        eq(users.notifyBellRinging, true),
      ));
    try {
      await pushToUsers(innerCircle.map(u => u.id), household.id, {
        title: `🔔 ${household.name} needs help`,
        body: reason + (note ? ` — ${note}` : ''),
        url: '/?tab=bell',
        tag: `bell-${bell.id}`,
      });
    } catch (err) {
      console.error('[bell:ring:push]', err);
    }

    return NextResponse.json({ bell });
  } catch (err) {
    return authError(err, 'bell', 'Bell action failed');
  }
}

export async function GET() {
  try {
    const { household } = await requireHousehold();
    const activeBells = await db.select().from(bells)
      .where(and(eq(bells.householdId, household.id), eq(bells.status, 'ringing')))
      .orderBy(desc(bells.createdAt));
    return NextResponse.json({ bells: activeBells });
  } catch (err) {
    return authError(err, 'bell', 'Bell action failed');
  }
}
