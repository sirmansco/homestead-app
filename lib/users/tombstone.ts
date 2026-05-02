import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users, shifts, bells, pushSubscriptions, caregiverUnavailability, familyInvites,
} from '@/lib/db/schema';

export type TombstoneOutcome =
  | { kind: 'noop' }
  | { kind: 'deleted' }
  | { kind: 'anonymized'; reason: { authoredShifts: number; authoredBells: number } };

// Removes a per-household users row safely against the ON DELETE restrict FKs
// on shifts.createdByUserId and bells.createdByUserId. Per spec NN #16b: if
// authored history exists, the row is anonymized in place using the canonical
// [deleted] placeholder pattern from app/api/account/route.ts; otherwise the
// row is hard-deleted (PG cascades pushSubscriptions, caregiverUnavailability,
// bellResponses, feedback, familyInvites.fromUserId).
//
// Clerk side-effects are caller-owned. The service touches the DB only.
//
// The (userId, householdId) pair is a redundant safety belt on top of structural
// per-household scoping (users.id is per-household). It prevents acting on the
// wrong row if a caller's scoping logic drifts.
export async function tombstoneUser(args: {
  userId: string;
  householdId: string;
}): Promise<TombstoneOutcome> {
  const { userId, householdId } = args;

  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(and(
      eq(users.id, userId),
      eq(users.householdId, householdId),
    )).limit(1);

    if (!target) {
      console.warn('[tombstone] no-op: row not found', { userId, householdId });
      return { kind: 'noop' };
    }

    // Pre-cleanup runs on both branches so the count is meaningful.
    await tx.update(shifts)
      .set({ claimedByUserId: null })
      .where(eq(shifts.claimedByUserId, userId));

    await tx.update(shifts)
      .set({ status: 'cancelled' })
      .where(and(
        eq(shifts.createdByUserId, userId),
        gte(shifts.startsAt, new Date()),
      ));

    const authoredShifts = await tx.$count(shifts, eq(shifts.createdByUserId, userId));
    const authoredBells = await tx.$count(bells, eq(bells.createdByUserId, userId));

    if (authoredShifts === 0 && authoredBells === 0) {
      try {
        await tx.delete(users).where(eq(users.id, userId));
        return { kind: 'deleted' };
      } catch (err) {
        // FK-restrict race: a concurrent insert between $count and delete.
        // Fall through to anonymize.
        console.warn('[tombstone] hard-delete lost a race, anonymizing', {
          userId, householdId, err: err instanceof Error ? err.message : String(err),
        });
        const recountShifts = await tx.$count(shifts, eq(shifts.createdByUserId, userId));
        const recountBells = await tx.$count(bells, eq(bells.createdByUserId, userId));
        await anonymize(tx, userId);
        return {
          kind: 'anonymized',
          reason: { authoredShifts: recountShifts, authoredBells: recountBells },
        };
      }
    }

    await anonymize(tx, userId);
    return {
      kind: 'anonymized',
      reason: { authoredShifts, authoredBells },
    };
  });
}

// Strips PII and clears Clerk-identifying columns. Preserves users.id so
// authored shifts/bells continue to resolve. Explicitly removes pushSubs,
// availability windows, and pending family-invites because the row no longer
// represents a household member.
async function anonymize(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<void> {
  await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await tx.delete(caregiverUnavailability).where(eq(caregiverUnavailability.userId, userId));
  await tx.delete(familyInvites).where(and(
    eq(familyInvites.fromUserId, userId),
    eq(familyInvites.status, 'pending'),
  ));
  await tx.update(users)
    .set({
      name: '[deleted]',
      email: `deleted+${userId}@homestead.app`,
      photoUrl: null,
      clerkUserId: `deleted+${userId}`,
    })
    .where(eq(users.id, userId));
}
