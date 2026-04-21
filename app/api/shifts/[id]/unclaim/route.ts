import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { shifts, users } from '@/lib/db/schema';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!shift) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (shift.status !== 'claimed' || !shift.claimedByUserId) {
      return NextResponse.json({ error: 'not claimed' }, { status: 409 });
    }

    const [claimer] = await db.select().from(users).where(eq(users.id, shift.claimedByUserId)).limit(1);
    if (!claimer || claimer.clerkUserId !== userId) {
      return NextResponse.json({ error: 'only the claimer can release' }, { status: 403 });
    }

    const [released] = await db.update(shifts)
      .set({ status: 'open', claimedByUserId: null, claimedAt: null })
      .where(and(eq(shifts.id, id), eq(shifts.status, 'claimed')))
      .returning();
    if (!released) return NextResponse.json({ error: 'race lost' }, { status: 409 });

    return NextResponse.json({ shift: released });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
