import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { getCopy } from '@/lib/copy';
import { escalateLantern } from '@/lib/lantern-escalation';
import { requireUUID } from '@/lib/validate/uuid';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const lanternId = requireUUID(rawId);
    if (!lanternId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const { household, user } = await requireHousehold();
    if (user.role !== 'keeper') {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    const [lantern] = await db.select().from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
    if (!lantern) return NextResponse.json({ error: `${getCopy().urgentSignal.noun} not found` }, { status: 404 });
    if (lantern.householdId !== household.id) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }
    if (lantern.status !== 'ringing') {
      return NextResponse.json({ error: `${getCopy().urgentSignal.noun} is no longer ringing` }, { status: 409 });
    }
    if (lantern.escalatedAt !== null) {
      return NextResponse.json({ error: 'Already escalated' }, { status: 409 });
    }

    await escalateLantern(lanternId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'lantern:escalate', `Could not escalate ${getCopy().urgentSignal.noun.toLowerCase()}`);
  }
}
