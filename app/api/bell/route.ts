import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();
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

    // Fire-and-forget push to all household members
    import('@/lib/push').then(({ pushToHousehold }) =>
      pushToHousehold(household.id, user.id, {
        title: `🔔 ${household.name} needs help`,
        body: reason + (note ? ` — ${note}` : ''),
        url: '/',
        tag: `bell-${bell.id}`,
      })
    ).catch(() => {});

    return NextResponse.json({ bell });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
