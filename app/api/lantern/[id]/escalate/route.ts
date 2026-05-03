import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { getCopy } from '@/lib/copy';
import { escalateBell } from '@/lib/bell-escalation';
import { requireUUID } from '@/lib/validate/uuid';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const bellId = requireUUID(rawId);
    if (!bellId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const { household, user } = await requireHousehold();
    if (user.role !== 'keeper') {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
    if (!bell) return NextResponse.json({ error: `${getCopy().urgentSignal.noun} not found` }, { status: 404 });
    if (bell.householdId !== household.id) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }
    if (bell.status !== 'ringing') {
      return NextResponse.json({ error: `${getCopy().urgentSignal.noun} is no longer ringing` }, { status: 409 });
    }
    if (bell.escalatedAt !== null) {
      return NextResponse.json({ error: 'Already escalated' }, { status: 409 });
    }

    await escalateBell(bellId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'bell:escalate', `Could not escalate ${getCopy().urgentSignal.noun.toLowerCase()}`);
  }
}
