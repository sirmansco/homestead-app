import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { households, users } from '@/lib/db/schema';
import { looksLikeSlug } from '@/lib/format';

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error('Not signed in');
  return { userId };
}

export async function requireHousehold() {
  const { userId, orgId } = await auth();
  if (!userId) throw new Error('Not signed in');
  if (!orgId) throw new Error('No active household');

  const client = await clerkClient();

  let [household] = await db.select().from(households).where(eq(households.clerkOrgId, orgId)).limit(1);
  if (!household) {
    const org = await client.organizations.getOrganization({ organizationId: orgId });
    await db.insert(households).values({
      clerkOrgId: orgId,
      name: org.name,
    }).onConflictDoNothing();
    [household] = await db.select().from(households).where(eq(households.clerkOrgId, orgId)).limit(1);
    if (!household) throw new Error('Failed to resolve household');
  }

  let [user] = await db.select().from(users).where(and(
    eq(users.clerkUserId, userId),
    eq(users.householdId, household.id),
  )).limit(1);
  if (!user) {
    const clerkUser = await client.users.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email;

    const meta = (clerkUser.publicMetadata ?? {}) as {
      appRole?: 'parent' | 'caregiver';
      villageGroup?: 'inner_circle' | 'sitter';
      name?: string;
    };

    const memberCount = await db.$count(users, eq(users.householdId, household.id));
    const isFirstUser = memberCount === 0;

    await db.insert(users).values({
      clerkUserId: userId,
      householdId: household.id,
      email,
      name: meta.name || name,
      role: meta.appRole || (isFirstUser ? 'parent' : 'caregiver'),
      villageGroup: meta.villageGroup || (isFirstUser ? 'inner_circle' : 'sitter'),
      isAdmin: isFirstUser,
    }).onConflictDoNothing();
    [user] = await db.select().from(users).where(and(
      eq(users.clerkUserId, userId),
      eq(users.householdId, household.id),
    )).limit(1);
    if (!user) throw new Error('Failed to resolve user');
  } else if (looksLikeSlug(user.name)) {
    // Backfill: the row was seeded from email/username before Clerk collected a
    // real first/last. Re-sync when Clerk now has one so UI shows "First L."
    try {
      const clerkUser = await client.users.getUser(userId);
      const resolved = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim();
      if (resolved && resolved !== user.name && !looksLikeSlug(resolved)) {
        const [updated] = await db.update(users)
          .set({ name: resolved })
          .where(eq(users.id, user.id))
          .returning();
        if (updated) user = updated;
      }
    } catch { /* best-effort; don't fail the request on Clerk hiccup */ }
  }

  return { household, user, userId, orgId };
}
