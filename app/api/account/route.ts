import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, inArray, or } from 'drizzle-orm';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  users, kids, shifts, bells, pushSubscriptions, familyInvites,
  caregiverUnavailability, bellResponses,
} from '@/lib/db/schema';
import { apiError, authError } from '@/lib/api-error';

/**
 * GET /api/account — export all data for the current user across all households.
 * Used for GDPR/COPPA data portability requests.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

    const myRows = await db.select().from(users).where(eq(users.clerkUserId, userId));
    if (myRows.length === 0) {
      return NextResponse.json({ user: null, households: [] });
    }

    const myUserIds = myRows.map(u => u.id);

    // Use inArray across all user IDs so multi-household users get complete exports
    const [myShifts, myBells, mySubs, myUnavail, myBellResponses] = await Promise.all([
      db.select().from(shifts).where(
        or(inArray(shifts.createdByUserId, myUserIds), inArray(shifts.claimedByUserId, myUserIds))
      ),
      db.select().from(bells).where(inArray(bells.createdByUserId, myUserIds)),
      db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, myUserIds)),
      db.select().from(caregiverUnavailability).where(inArray(caregiverUnavailability.userId, myUserIds)),
      db.select().from(bellResponses).where(inArray(bellResponses.userId, myUserIds)),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      clerkUserId: userId,
      profiles: myRows.map(r => ({
        userId: r.id, householdId: r.householdId, email: r.email,
        name: r.name, role: r.role, villageGroup: r.villageGroup,
        photoUrl: r.photoUrl, createdAt: r.createdAt,
      })),
      shifts: myShifts,
      bells: myBells,
      pushSubscriptions: mySubs.map(s => ({
        id: s.id, householdId: s.householdId, endpoint: s.endpoint.substring(0, 40) + '...',
        createdAt: s.createdAt,
      })),
      unavailability: myUnavail,
      bellResponses: myBellResponses,
    });
  } catch (err) {
    return apiError(err, 'Could not export your data', 500, 'account:GET');
  }
}

/**
 * DELETE /api/account — fully remove the user: cancel future shifts they created
 * (required because shifts.createdByUserId is onDelete:'restrict'), delete their
 * DB rows, then delete their Clerk identity so sessions are invalidated.
 *
 * Order is deliberate: Clerk deletion runs LAST. If DB cleanup throws, we don't
 * orphan a live Clerk account with no data.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return authError(new Error('Not signed in'), 'account:DELETE');

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

      const un = await db.delete(caregiverUnavailability)
        .where(eq(caregiverUnavailability.userId, row.id)).returning({ id: caregiverUnavailability.id });
      deletedUnavail += un.length;

      const inv = await db.delete(familyInvites)
        .where(and(eq(familyInvites.fromUserId, row.id), eq(familyInvites.status, 'pending')))
        .returning({ id: familyInvites.id });
      deletedInvites += inv.length;

      // Release shifts they claimed — onDelete:'set null' would do this too, but
      // doing it explicitly keeps the audit trail in bellResponses-style logs clean.
      await db.update(shifts).set({ claimedByUserId: null })
        .where(eq(shifts.claimedByUserId, row.id));

      // Cancel future shifts they created so createdByUserId restrict doesn't block
      // the user-row delete. Past shifts stay as history; we can't delete them
      // without losing other users' participation records, so reassign to a tombstone.
      const futureCancelled = await db.update(shifts)
        .set({ status: 'cancelled' })
        .where(and(
          eq(shifts.createdByUserId, row.id),
          gte(shifts.startsAt, now),
        ))
        .returning({ id: shifts.id });
      cancelledShifts += futureCancelled.length;

      // Past shifts the user created still reference them via createdByUserId.
      // Rather than deleting those rows (destroying history for other members),
      // we leave the user row in place but strip PII. Sessions die via Clerk delete.
      const pastMineExist = await db.$count(shifts, eq(shifts.createdByUserId, row.id));
      const pastBellsExist = await db.$count(bells, eq(bells.createdByUserId, row.id));

      if (pastMineExist === 0 && pastBellsExist === 0) {
        await db.delete(users).where(eq(users.id, row.id));
      } else {
        await db.update(users)
          .set({
            name: '[deleted]',
            email: `deleted+${row.id}@homestead.app`,
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
    return apiError(err, 'Could not delete your account', 500, 'account:DELETE');
  }
}
