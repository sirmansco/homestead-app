import { NextResponse } from 'next/server';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { households, users, shifts, bells, pushSubscriptions } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { authError } from '@/lib/api-error';

const DEV_EMAILS = (process.env.NEXT_PUBLIC_DEV_EMAILS ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET() {
  try {
    const { userId } = await requireUser();
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses
      .find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress?.toLowerCase() ?? '';

    if (!DEV_EMAILS.includes(primaryEmail)) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    let dbOk = false;
    let rowCounts: Record<string, number> = {};
    try {
      await db.execute(sql`SELECT 1`);
      dbOk = true;

      const [userCount, shiftCount, bellCount, pushCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` }).from(shifts),
        db.select({ count: sql<number>`count(*)::int` }).from(bells),
        db.select({ count: sql<number>`count(*)::int` }).from(pushSubscriptions),
      ]);
      rowCounts = {
        users: userCount[0]?.count ?? 0,
        shifts: shiftCount[0]?.count ?? 0,
        bells: bellCount[0]?.count ?? 0,
        push_subscriptions: pushCount[0]?.count ?? 0,
      };
    } catch {
      // dbOk stays false
    }

    // Push (web-push) needs all three of: VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    // VAPID_SUBJECT. See lib/push.ts — it short-circuits with `vapid_not_configured` if any
    // are missing. The legacy `VAPID_PUBLIC_KEY` (no prefix) is unused; do not surface it
    // here, it caused stale "configured" reads while pushes were silently no-ops.
    const envVars = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      COVEY_BRAND_ACTIVE: process.env.COVEY_BRAND_ACTIVE ?? '(unset)',
    };

    // Lantern recipient diagnostic — mirrors notify.ts:notifyBellRing's WHERE clause exactly.
    // Reports who would receive a push if the caller lit the lantern right now. If
    // eligibleInnerCircle is 0, the silent no-op is "no one in this household is set up
    // to receive lantern pings" — not a delivery failure.
    let lanternRecipients: {
      householdId: string | null;
      householdMemberCount: number;
      callerIsInHousehold: boolean;
      eligibleInnerCircleCount: number;
      eligibleInnerCircleSubscriptions: number;
      verdict: string;
    } | null = null;
    try {
      const { orgId } = await auth();
      if (!orgId) {
        lanternRecipients = {
          householdId: null,
          householdMemberCount: 0,
          callerIsInHousehold: false,
          eligibleInnerCircleCount: 0,
          eligibleInnerCircleSubscriptions: 0,
          verdict: 'caller_has_no_active_org',
        };
      } else {
        const [household] = await db.select().from(households)
          .where(eq(households.clerkOrgId, orgId)).limit(1);
        if (!household) {
          lanternRecipients = {
            householdId: null,
            householdMemberCount: 0,
            callerIsInHousehold: false,
            eligibleInnerCircleCount: 0,
            eligibleInnerCircleSubscriptions: 0,
            verdict: 'no_household_row_for_org',
          };
        } else {
          const memberCount = await db.$count(users, eq(users.householdId, household.id));
          const callerInHousehold = await db.$count(users, and(
            eq(users.householdId, household.id),
            eq(users.clerkUserId, userId),
          ));
          // Transitional read-compat: include legacy inner_circle rows alongside
          // covey. Must mirror notify.ts:notifyBellRing exactly.
          // Remove after B4 backfill confirms zero inner_circle rows.
          const innerCircle = await db.select({ id: users.id }).from(users).where(and(
            eq(users.householdId, household.id),
            eq(users.role, 'watcher'),
            inArray(users.villageGroup, ['covey', 'inner_circle']),
            eq(users.notifyBellRinging, true),
          ));
          let subCount = 0;
          if (innerCircle.length > 0) {
            const subs = await db.select({ count: sql<number>`count(*)::int` })
              .from(pushSubscriptions)
              .where(inArray(pushSubscriptions.userId, innerCircle.map(u => u.id)));
            subCount = subs[0]?.count ?? 0;
          }
          let verdict: string;
          if (memberCount <= 1) verdict = 'household_has_only_one_member';
          else if (innerCircle.length === 0) verdict = 'no_eligible_inner_circle_caregivers';
          else if (subCount === 0) verdict = 'eligible_caregivers_have_no_push_subscriptions';
          else verdict = `would_attempt_push_to_${innerCircle.length}_user_${subCount}_subs`;
          lanternRecipients = {
            householdId: household.id,
            householdMemberCount: memberCount,
            callerIsInHousehold: callerInHousehold > 0,
            eligibleInnerCircleCount: innerCircle.length,
            eligibleInnerCircleSubscriptions: subCount,
            verdict,
          };
        }
      }
    } catch (err) {
      lanternRecipients = {
        householdId: null,
        householdMemberCount: 0,
        callerIsInHousehold: false,
        eligibleInnerCircleCount: 0,
        eligibleInnerCircleSubscriptions: 0,
        verdict: `error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return NextResponse.json({
      db: { ok: dbOk, rowCounts },
      env: envVars,
      lanternRecipients,
      appSha: process.env.NEXT_PUBLIC_APP_SHA ?? null,
    });
  } catch (err) {
    return authError(err, 'diagnostics');
  }
}
