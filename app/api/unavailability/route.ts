import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { caregiverUnavailability, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

// Resolve the caller's primary users row without requiring an active Clerk org.
// Caregivers often have no active org yet but still need to manage their unavailability.
// We use the first users row found for this Clerk user across all households.
async function resolveUser(userId: string) {
  const [user] = await db.select()
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);
  return user ?? null;
}

export async function GET() {
  try {
    const { userId } = await requireUser();

    const user = await resolveUser(userId);
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
    const { userId } = await requireUser();

    const user = await resolveUser(userId);
    if (!user) return NextResponse.json({ error: 'No user profile found. Join a household first.' }, { status: 409 });

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
    return authError(err, 'unavailability', 'Request failed');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireUser();

    const user = await resolveUser(userId);
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
