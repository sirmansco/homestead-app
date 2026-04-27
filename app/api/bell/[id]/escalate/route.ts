import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyBellEscalated } from '@/lib/notify';

/**
 * Escalates a bell to the sitter tier. Safe to call concurrently — the UPDATE
 * uses AND escalated_at IS NULL as an atomic guard against double-escalation.
 */
export async function escalateBell(bellId: string): Promise<void> {
  const [current] = await db.select({ escalatedAt: bells.escalatedAt })
    .from(bells).where(eq(bells.id, bellId)).limit(1);
  if (!current || current.escalatedAt !== null) return;

  const updated = await db.update(bells)
    .set({ escalatedAt: new Date() })
    .where(and(eq(bells.id, bellId), isNull(bells.escalatedAt)))
    .returning({ id: bells.id });
  // If another process won the race, the update returns 0 rows — stop here
  if (updated.length === 0) return;

  // Recipient resolution + preference filter live in notify.ts.
  try {
    await notifyBellEscalated(bellId);
  } catch (err) {
    console.error('[bell:escalate:notify]', err);
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { household, user } = await requireHousehold();
    if (user.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can escalate bells' }, { status: 403 });
    }

    const { id: bellId } = await ctx.params;
    const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
    if (!bell) return NextResponse.json({ error: 'Bell not found' }, { status: 404 });
    if (bell.householdId !== household.id) {
      return NextResponse.json({ error: 'wrong household' }, { status: 403 });
    }
    if (bell.status !== 'ringing') {
      return NextResponse.json({ error: 'Bell is no longer ringing' }, { status: 409 });
    }
    if (bell.escalatedAt !== null) {
      return NextResponse.json({ error: 'Already escalated' }, { status: 409 });
    }

    await escalateBell(bellId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'bell:escalate', 'Could not escalate bell');
  }
}
