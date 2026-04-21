import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, kids } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function GET() {
  try {
    const { household } = await requireHousehold();

    const [adults, kidsList] = await Promise.all([
      db.select().from(users).where(eq(users.householdId, household.id)),
      db.select().from(kids).where(eq(kids.householdId, household.id)),
    ]);

    return NextResponse.json({ adults, kids: kidsList });
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
