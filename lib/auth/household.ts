import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { households, users } from '@/lib/db/schema';

export async function requireHousehold() {
  const { userId, orgId } = await auth();
  if (!userId) throw new Error('Not signed in');
  if (!orgId) throw new Error('No active household');

  const client = await clerkClient();

  let [household] = await db.select().from(households).where(eq(households.clerkOrgId, orgId)).limit(1);
  if (!household) {
    const org = await client.organizations.getOrganization({ organizationId: orgId });
    [household] = await db.insert(households).values({
      clerkOrgId: orgId,
      name: org.name,
    }).returning();
  }

  let [user] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  if (!user) {
    const clerkUser = await client.users.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email;

    const meta = (clerkUser.publicMetadata ?? {}) as {
      appRole?: 'parent' | 'caregiver';
      villageGroup?: 'inner' | 'family' | 'sitter';
      name?: string;
    };

    const memberCount = await db.$count(users, eq(users.householdId, household.id));
    const isFirstUser = memberCount === 0;

    [user] = await db.insert(users).values({
      clerkUserId: userId,
      householdId: household.id,
      email,
      name: meta.name || name,
      role: meta.appRole || (isFirstUser ? 'parent' : 'caregiver'),
      villageGroup: meta.villageGroup || (isFirstUser ? 'inner' : 'family'),
    }).returning();
  }

  return { household, user };
}
