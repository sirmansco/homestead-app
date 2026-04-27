import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
export async function GET() {
  try {
    const { household, user } = await requireHousehold();
    const rows = await db.select().from(users)
      .where(eq(users.householdId, household.id))
      .orderBy(asc(users.createdAt));
    return NextResponse.json({
      members: rows.map(r => ({
        id: r.id,
        clerkUserId: r.clerkUserId,
        name: r.name,
        email: r.email,
        role: r.role,
        villageGroup: r.villageGroup,
        isAdmin: r.isAdmin,
        isMe: r.clerkUserId === user.clerkUserId,
      })),
    });
  } catch (err) {
    return authError(err, 'household:members');
  }
}
