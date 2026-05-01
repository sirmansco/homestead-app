import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, shifts, bells, pushSubscriptions } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { clerkClient } from '@clerk/nextjs/server';
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

    const envVars = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      COVEY_BRAND_ACTIVE: process.env.COVEY_BRAND_ACTIVE ?? '(unset)',
    };

    return NextResponse.json({
      db: { ok: dbOk, rowCounts },
      env: envVars,
      appSha: process.env.NEXT_PUBLIC_APP_SHA ?? null,
    });
  } catch (err) {
    return authError(err, 'diagnostics');
  }
}
