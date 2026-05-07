import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq, and, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db';
import { households, users } from '@/lib/db/schema';
import { looksLikeSlug } from '@/lib/format';
import { NotAdminError } from '@/lib/api-error';
import { normalizeVillageGroup } from '@/lib/village-group/normalize';

export { NotAdminError };

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
      appRole?: 'keeper' | 'watcher';
      villageGroup?: 'covey' | 'field' | 'inner_circle' | 'sitter';
      name?: string;
    };

    // Serialize first-user-for-household decisions across concurrent requests.
    // Without the advisory lock, two concurrent calls for different clerkUserIds
    // in the same household both observe memberCount === 0 and both insert with
    // isAdmin=true, leaving the household with two admins.
    user = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'covey:first-user:' + household.id}))`);

      const [existing] = await tx.select().from(users).where(and(
        eq(users.clerkUserId, userId),
        eq(users.householdId, household.id),
      )).limit(1);
      if (existing) return existing;

      const memberCount = await tx.$count(users, eq(users.householdId, household.id));
      const isFirstUser = memberCount === 0;

      await tx.insert(users).values({
        clerkUserId: userId,
        householdId: household.id,
        email,
        name: meta.name || name,
        role: meta.appRole || (isFirstUser ? 'keeper' : 'watcher'),
        villageGroup: normalizeVillageGroup(meta.villageGroup || (isFirstUser ? 'covey' : 'field')),
        isAdmin: isFirstUser,
      }).onConflictDoNothing();

      const [created] = await tx.select().from(users).where(and(
        eq(users.clerkUserId, userId),
        eq(users.householdId, household.id),
      )).limit(1);
      return created;
    });
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

  Sentry.setUser({ id: user.id.toString() });
  return { household, user, userId, orgId };
}

// Authorization gate for household-administration writes (household profile
// PATCH, member PATCH/DELETE, admin transfer, village CRUD, village invite).
// Re-reads the caller's `users` row inside the active household via
// requireHousehold() and throws NotAdminError unless `users.isAdmin === true`.
// `authError()` maps the throw to 403 `{ error: 'no_access' }`.
export async function requireHouseholdAdmin() {
  const ctx = await requireHousehold();
  if (!ctx.user.isAdmin) throw new NotAdminError();
  return ctx;
}
