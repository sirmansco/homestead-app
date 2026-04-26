import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells, users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { apiError } from '@/lib/api-error';
import { pushToUsers } from '@/lib/push';

/**
 * Escalates a bell to the sitter tier. Safe to call concurrently — the UPDATE
 * uses AND escalated_at IS NULL as an atomic guard against double-escalation.
 */
export async function escalateBell(bellId: string, householdId: string): Promise<void> {
  const [current] = await db.select({ escalatedAt: bells.escalatedAt })
    .from(bells).where(eq(bells.id, bellId)).limit(1);
  if (!current || current.escalatedAt !== null) return;

  const updated = await db.update(bells)
    .set({ escalatedAt: new Date() })
    .where(and(eq(bells.id, bellId), isNull(bells.escalatedAt)))
    .returning({ id: bells.id });
  // If another process won the race, the update returns 0 rows — stop here
  if (updated.length === 0) return;

  const sitters = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.householdId, householdId),
      eq(users.role, 'caregiver'),
      eq(users.villageGroup, 'sitter'),
      eq(users.notifyBellRinging, true),
    ));
  if (sitters.length === 0) return;

  const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
  if (!bell) return;

  try {
    await pushToUsers(sitters.map(s => s.id), householdId, {
      title: `🔔 Still needed — ${bell.reason}`,
      body: 'Inner circle unavailable. Can you help?',
      url: '/?tab=bell',
      tag: `bell-escalate-${bellId}`,
    });
  } catch (err) {
    console.error('[bell:escalate:push]', err);
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

    await escalateBell(bellId, household.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, 'Could not escalate bell', 500, 'bell:escalate');
  }
}
