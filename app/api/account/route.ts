import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, inArray, or } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  users, chicks, whistles, lanterns, pushSubscriptions, familyInvites,
  unavailability, lanternResponses,
} from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { notifyShiftCancelled } from '@/lib/notify';

/**
 * GET /api/account — export all data for the current user across all households.
 * Used for GDPR/COPPA data portability requests.
 */
export async function GET() {
  try {
    const { userId } = await requireUser();

    const myRows = await db.select().from(users).where(eq(users.clerkUserId, userId));
    if (myRows.length === 0) {
      return NextResponse.json({ user: null, households: [] });
    }

    const myUserIds = myRows.map(u => u.id);

    // Use inArray across all user IDs so multi-household users get complete exports
    const [myShifts, myBells, mySubs, myUnavail, myBellResponses] = await Promise.all([
      db.select().from(whistles).where(
        or(inArray(whistles.createdByUserId, myUserIds), inArray(whistles.claimedByUserId, myUserIds))
      ),
      db.select().from(lanterns).where(inArray(lanterns.createdByUserId, myUserIds)),
      db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, myUserIds)),
      db.select().from(unavailability).where(inArray(unavailability.userId, myUserIds)),
      db.select().from(lanternResponses).where(inArray(lanternResponses.userId, myUserIds)),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      clerkUserId: userId,
      profiles: myRows.map(r => ({
        userId: r.id, householdId: r.householdId, email: r.email,
        name: r.name, role: r.role, villageGroup: r.villageGroup,
        photoUrl: r.photoUrl, createdAt: r.createdAt,
      })),
      whistles: myShifts,
      lanterns: myBells,
      pushSubscriptions: mySubs.map(s => ({
        id: s.id, householdId: s.householdId, endpoint: s.endpoint.substring(0, 40) + '...',
        createdAt: s.createdAt,
      })),
      unavailability: myUnavail,
      lanternResponses: myBellResponses,
    });
  } catch (err) {
    return authError(err, 'account:GET', 'Could not export your data');
  }
}

/**
 * DELETE /api/account — fully remove the user: cancel future whistles they created
 * (required because whistles.createdByUserId is onDelete:'restrict'), delete their
 * DB rows, then delete their Clerk identity so sessions are invalidated.
 *
 * Order is deliberate: Clerk deletion runs LAST. If DB cleanup throws, we don't
 * orphan a live Clerk account with no data.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireUser();

    const confirm = req.nextUrl.searchParams.get('confirm');
    if (confirm !== 'yes-delete-my-data') {
      return NextResponse.json({
        error: 'Confirmation required. Send DELETE /api/account?confirm=yes-delete-my-data',
      }, { status: 400 });
    }

    const myRows = await db.select().from(users).where(eq(users.clerkUserId, userId));

    let deletedSubs = 0;
    let deletedUnavail = 0;
    let deletedInvites = 0;
    let cancelledShifts = 0;
    let deletedProfiles = 0;

    const now = new Date();

    for (const row of myRows) {
      const subs = await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, row.id)).returning({ id: pushSubscriptions.id });
      deletedSubs += subs.length;

      const un = await db.delete(unavailability)
        .where(eq(unavailability.userId, row.id)).returning({ id: unavailability.id });
      deletedUnavail += un.length;

      const inv = await db.delete(familyInvites)
        .where(and(eq(familyInvites.fromUserId, row.id), eq(familyInvites.status, 'pending')))
        .returning({ id: familyInvites.id });
      deletedInvites += inv.length;

      // Release whistles they claimed — onDelete:'set null' would do this too, but
      // doing it explicitly keeps the audit trail in lanternResponses-style logs clean.
      await db.update(whistles).set({ claimedByUserId: null })
        .where(eq(whistles.claimedByUserId, row.id));

      // Cancel future whistles they created so createdByUserId restrict doesn't block
      // the user-row delete. Past whistles stay as history; we can't delete them
      // without losing other users' participation records, so reassign to a tombstone.
      // Collect claimers before cancelling so we can notify them afterwards.
      const futureShiftsToCancel = await db.select({ id: whistles.id, claimedByUserId: whistles.claimedByUserId })
        .from(whistles)
        .where(and(
          eq(whistles.createdByUserId, row.id),
          gte(whistles.startsAt, now),
        ));
      const futureCancelled = await db.update(whistles)
        .set({ status: 'cancelled' })
        .where(and(
          eq(whistles.createdByUserId, row.id),
          gte(whistles.startsAt, now),
        ))
        .returning({ id: whistles.id });
      cancelledShifts += futureCancelled.length;

      for (const s of futureShiftsToCancel) {
        if (!s.claimedByUserId) continue;
        try {
          await notifyShiftCancelled(s.id, s.claimedByUserId);
        } catch (notifyErr) {
          console.error('[account:DELETE] notifyShiftCancelled failed', s.id, notifyErr);
        }
      }

      // Past whistles the user created still reference them via createdByUserId.
      // Rather than deleting those rows (destroying history for other members),
      // we leave the user row in place but strip PII. Sessions die via Clerk delete.
      const pastMineExist = await db.$count(whistles, eq(whistles.createdByUserId, row.id));
      const pastBellsExist = await db.$count(lanterns, eq(lanterns.createdByUserId, row.id));

      if (pastMineExist === 0 && pastBellsExist === 0) {
        await db.delete(users).where(eq(users.id, row.id));
      } else {
        await db.update(users)
          .set({
            name: '[deleted]',
            email: `deleted+${row.id}@covey.app`,
            photoUrl: null,
            clerkUserId: `deleted+${row.id}`,
          })
          .where(eq(users.id, row.id));
      }
      deletedProfiles++;
    }

    // Clerk deletion last — invalidates all sessions immediately.
    try {
      const client = await clerkClient();
      await client.users.deleteUser(userId);
    } catch (clerkErr) {
      console.error('[account:DELETE] Clerk deletion failed', clerkErr);
      // DB is already cleaned — return success but flag so the client can prompt.
      return NextResponse.json({
        ok: true,
        clerkDeleted: false,
        deleted: {
          profiles: deletedProfiles, pushSubscriptions: deletedSubs,
          unavailability: deletedUnavail, pendingInvites: deletedInvites,
          cancelledShifts,
        },
      });
    }

    console.log(JSON.stringify({
      event: 'account_deletion',
      clerkUserId: userId,
      deletedSubs, deletedUnavail, deletedInvites, deletedProfiles, cancelledShifts,
      at: new Date().toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      clerkDeleted: true,
      deleted: {
        profiles: deletedProfiles, pushSubscriptions: deletedSubs,
        unavailability: deletedUnavail, pendingInvites: deletedInvites,
        cancelledShifts,
      },
    });
  } catch (err) {
    return authError(err, 'account:DELETE', 'Could not delete your account');
  }
}
