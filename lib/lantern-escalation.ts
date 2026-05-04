import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns } from '@/lib/db/schema';
import { notifyLanternEscalated } from '@/lib/notify';

/**
 * Escalates a lantern to the field tier. Safe to call concurrently — the UPDATE
 * uses AND escalated_at IS NULL as an atomic guard against double-escalation.
 */
export async function escalateLantern(lanternId: string): Promise<void> {
  const [current] = await db.select({ escalatedAt: lanterns.escalatedAt })
    .from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
  if (!current || current.escalatedAt !== null) return;

  const updated = await db.update(lanterns)
    .set({ escalatedAt: new Date() })
    .where(and(eq(lanterns.id, lanternId), isNull(lanterns.escalatedAt)))
    .returning({ id: lanterns.id });
  // If another process won the race, the update returns 0 rows — stop here
  if (updated.length === 0) return;

  console.log(JSON.stringify({ event: 'lantern_escalated', lanternId, at: new Date().toISOString() }));

  // Recipient resolution + preference filter live in notify.ts.
  try {
    await notifyLanternEscalated(lanternId);
  } catch (err) {
    console.error('[lantern:escalate:notify]', err);
  }
}
