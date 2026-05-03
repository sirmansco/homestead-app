import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns } from '@/lib/db/schema';
import { notifyBellEscalated } from '@/lib/notify';

/**
 * Escalates a bell to the sitter tier. Safe to call concurrently — the UPDATE
 * uses AND escalated_at IS NULL as an atomic guard against double-escalation.
 */
export async function escalateBell(bellId: string): Promise<void> {
  const [current] = await db.select({ escalatedAt: lanterns.escalatedAt })
    .from(lanterns).where(eq(lanterns.id, bellId)).limit(1);
  if (!current || current.escalatedAt !== null) return;

  const updated = await db.update(lanterns)
    .set({ escalatedAt: new Date() })
    .where(and(eq(lanterns.id, bellId), isNull(lanterns.escalatedAt)))
    .returning({ id: lanterns.id });
  // If another process won the race, the update returns 0 rows — stop here
  if (updated.length === 0) return;

  console.log(JSON.stringify({ event: 'bell_escalated', bellId, at: new Date().toISOString() }));

  // Recipient resolution + preference filter live in notify.ts.
  try {
    await notifyBellEscalated(bellId);
  } catch (err) {
    console.error('[bell:escalate:notify]', err);
  }
}
