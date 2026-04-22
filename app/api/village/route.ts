import { NextRequest, NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, kids, households } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get('scope') || 'household';

    if (scope === 'all') {
      const { userId } = await auth();
      if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

      const myRows = await db.select().from(users).where(eq(users.clerkUserId, userId));
      const hhIds = myRows.map(r => r.householdId);
      if (hhIds.length === 0) return NextResponse.json({ families: [] });

      const [hhRows, allAdults, allKids] = await Promise.all([
        db.select().from(households).where(inArray(households.id, hhIds)),
        db.select().from(users).where(inArray(users.householdId, hhIds)),
        db.select().from(kids).where(inArray(kids.householdId, hhIds)),
      ]);

      const families = hhRows.map(h => ({
        household: { id: h.id, name: h.name, glyph: h.glyph },
        adults: allAdults.filter(a => a.householdId === h.id),
        kids: allKids.filter(k => k.householdId === h.id),
      }));

      return NextResponse.json({ families });
    }

    const { household } = await requireHousehold();
    const [adults, kidsList] = await Promise.all([
      db.select().from(users).where(eq(users.householdId, household.id)),
      db.select().from(kids).where(eq(kids.householdId, household.id)),
    ]);

    const normalised = adults.map(a => ({
      ...a,
      name: a.name.includes('@') ? a.name.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : a.name,
    }));
    return NextResponse.json({ adults: normalised, kids: kidsList });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { household } = await requireHousehold();
    const body = await req.json();

    if (body.type === 'kid') {
      const { name, birthday, notes } = body;
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      const [kid] = await db.insert(kids).values({
        householdId: household.id,
        name: name.trim(),
        birthday: birthday || null,
        notes: notes || null,
      }).returning();
      return NextResponse.json({ kid });
    }

    if (body.type === 'adult') {
      const { name, email, role, villageGroup, clerkUserId } = body;
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
      }
      const [user] = await db.insert(users).values({
        clerkUserId: clerkUserId || `placeholder_${crypto.randomUUID()}`,
        householdId: household.id,
        email: email.trim(),
        name: name.trim(),
        role: role || 'caregiver',
        villageGroup: villageGroup || 'family',
      }).returning();
      return NextResponse.json({ user });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { household } = await requireHousehold();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    if (!id || !type) return NextResponse.json({ error: 'id and type required' }, { status: 400 });

    if (type === 'kid') {
      await db.delete(kids).where(and(eq(kids.id, id), eq(kids.householdId, household.id)));
    } else if (type === 'adult') {
      await db.delete(users).where(and(eq(users.id, id), eq(users.householdId, household.id)));
    } else {
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
