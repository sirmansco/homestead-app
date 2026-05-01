import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells } from '@/lib/db/schema';
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
