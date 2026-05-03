import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users, whistles, lanterns, pushSubscriptions, unavailability, familyInvites,
} from '@/lib/db/schema';

export type TombstoneOutcome =
  | { kind: 'noop' }
  | { kind: 'deleted' }
  | { kind: 'anonymized'; reason: { authoredWhistles: number; authoredLanterns: number } };

// Removes a per-household users row safely against the ON DELETE restrict FKs
// on whistles.createdByUserId and lanterns.createdByUserId. Per spec NN #16b: if
// authored history exists, the row is anonymized in place using the canonical
// [deleted] placeholder pattern from app/api/account/route.ts; otherwise the
// row is hard-deleted (PG cascades pushSubscriptions, unavailability,
// lanternResponses, feedback, familyInvites.fromUserId).
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
    await tx.update(whistles)
      .set({ claimedByUserId: null })
      .where(eq(whistles.claimedByUserId, userId));

    await tx.update(whistles)
      .set({ status: 'cancelled' })
      .where(and(
        eq(whistles.createdByUserId, userId),
        gte(whistles.startsAt, new Date()),
      ));

    const authoredWhistles = await tx.$count(whistles, eq(whistles.createdByUserId, userId));
    const authoredLanterns = await tx.$count(lanterns, eq(lanterns.createdByUserId, userId));

    if (authoredWhistles === 0 && authoredLanterns === 0) {
      try {
        await tx.delete(users).where(eq(users.id, userId));
        return { kind: 'deleted' };
      } catch (err) {
        // FK-restrict race: a concurrent insert between $count and delete.
        // Fall through to anonymize.
        console.warn('[tombstone] hard-delete lost a race, anonymizing', {
          userId, householdId, err: err instanceof Error ? err.message : String(err),
        });
        const recountWhistles = await tx.$count(whistles, eq(whistles.createdByUserId, userId));
        const recountLanterns = await tx.$count(lanterns, eq(lanterns.createdByUserId, userId));
        await anonymize(tx, userId);
        return {
          kind: 'anonymized',
          reason: { authoredWhistles: recountWhistles, authoredLanterns: recountLanterns },
        };
      }
    }

    await anonymize(tx, userId);
    return {
      kind: 'anonymized',
      reason: { authoredWhistles, authoredLanterns },
    };
  });
}

// Strips PII and clears Clerk-identifying columns. Preserves users.id so
// authored whistles/lanterns continue to resolve. Explicitly removes pushSubs,
// availability windows, and pending family-invites because the row no longer
// represents a household member.
async function anonymize(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<void> {
  await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await tx.delete(unavailability).where(eq(unavailability.userId, userId));
  await tx.delete(familyInvites).where(and(
    eq(familyInvites.fromUserId, userId),
    eq(familyInvites.status, 'pending'),
  ));
  await tx.update(users)
    .set({
      name: '[deleted]',
      email: `deleted+${userId}@covey.app`,
      photoUrl: null,
      clerkUserId: `deleted+${userId}`,
    })
    .where(eq(users.id, userId));
}
