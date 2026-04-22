import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { caregiverUnavailability, users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function GET() {
  try {
    const { user } = await requireHousehold();
    const rows = await db.select()
      .from(caregiverUnavailability)
      .where(and(
        eq(caregiverUnavailability.userId, user.id),
        gte(caregiverUnavailability.endsAt, new Date()),
      ))
      .orderBy(desc(caregiverUnavailability.startsAt));
    return NextResponse.json({ unavailability: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireHousehold();
    const body = await req.json() as { startsAt?: string; endsAt?: string; note?: string };
    if (!body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: 'startsAt and endsAt required' }, { status: 400 });
    }
    const starts = new Date(body.startsAt);
    const ends = new Date(body.endsAt);
    if (isNaN(+starts) || isNaN(+ends) || ends <= starts) {
      return NextResponse.json({ error: 'invalid time range' }, { status: 400 });
    }
    const [row] = await db.insert(caregiverUnavailability).values({
      userId: user.id,
      startsAt: starts,
      endsAt: ends,
      note: body.note?.trim() || null,
    }).returning();
    return NextResponse.json({ unavailability: row });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireHousehold();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db.delete(caregiverUnavailability).where(
      and(eq(caregiverUnavailability.id, id), eq(caregiverUnavailability.userId, user.id))
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
