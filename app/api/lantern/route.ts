import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { authError } from '@/lib/api-error';
import { notifyBellRing, type NotifyResult } from '@/lib/notify';
import { getCopy } from '@/lib/copy';
import { parseTimeRange } from '@/lib/validate/time-range';

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();

    // Rate limit: max 3 lanterns per user per 5 minutes. Bell spam alerts every
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

    const timeRange = parseTimeRange(startsAt, endsAt, { maxWindowMs: 86_400_000 });
    if ('error' in timeRange) {
      return NextResponse.json({ error: timeRange.error }, { status: timeRange.status });
    }

    const [bell] = await db.insert(lanterns).values({
      householdId: household.id,
      createdByUserId: user.id,
      reason,
      note: note || null,
      startsAt: timeRange.starts,
      endsAt: timeRange.ends,
      status: 'ringing',
    }).returning();

    // Notify covey caregivers (spec: Bell pings covey first).
    // Recipient resolution + preference filter live in notify.ts.
    let notify: NotifyResult = { kind: 'push_error', recipients: 0, error: 'notify_threw' };
    try {
      notify = await notifyBellRing(bell.id);
    } catch (err) {
      console.error('[bell:ring:notify]', err);
    }

    return NextResponse.json({ bell, notify });
  } catch (err) {
    return authError(err, 'bell', `${getCopy().urgentSignal.noun} action failed`);
  }
}

export async function GET() {
  try {
    const { household } = await requireHousehold();
    const activeBells = await db.select().from(lanterns)
      .where(and(eq(lanterns.householdId, household.id), eq(lanterns.status, 'ringing')))
      .orderBy(desc(lanterns.createdAt));
    return NextResponse.json({ lanterns: activeBells });
  } catch (err) {
    return authError(err, 'bell', `${getCopy().urgentSignal.noun} action failed`);
  }
}
