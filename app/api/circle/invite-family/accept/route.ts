import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { familyInvites, users } from '@/lib/db/schema';
import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// GET /api/circle/invite-family/accept?token=... — side-effect-free token preview.
// Returns invite metadata for the accept page without mutating state.
// Callers must POST to consume the token (requires auth).
export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const ip = clientIp(req);
    const rl = rateLimit({ key: `invite-family-accept-preview:${ip}`, limit: 30, windowMs: 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const [invite] = await db
      .select({
        id: familyInvites.id,
        parentName: familyInvites.parentName,
        villageGroup: familyInvites.villageGroup,
        status: familyInvites.status,
        expiresAt: familyInvites.expiresAt,
        fromName: users.name,
      })
      .from(familyInvites)
      .innerJoin(users, eq(users.id, familyInvites.fromUserId))
      .where(eq(familyInvites.token, token))
      .limit(1);

    if (!invite) return NextResponse.json({ error: 'invite_not_found' }, { status: 404 });
    if (invite.status !== 'pending') return NextResponse.json({ error: 'invite_used' }, { status: 410 });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'invite_expired' }, { status: 410 });
    }

    return NextResponse.json({
      ok: true,
      invite: {
        fromName: invite.fromName,
        parentName: invite.parentName,
        villageGroup: invite.villageGroup,
      },
    });
  } catch (err) {
    return apiError(err, 'Could not validate invite', 500, 'village:invite-family:accept:get');
  }
}

// POST /api/circle/invite-family/accept — consume a pending invite token.
// Requires the caller to be signed in. Validates that the signed-in user's email
// matches the invite's parentEmail, checks expiry, then atomically marks accepted.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();

    const body = await req.json() as { token?: string };
    const token = body.token;
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const ip = clientIp(req);
    const rlIp = rateLimit({ key: `invite-family-accept-post:${ip}`, limit: 20, windowMs: 60_000 });
    const limitedIp = rateLimitResponse(rlIp);
    if (limitedIp) return limitedIp;

    const rlTok = rateLimit({ key: `invite-family-accept-token:${token}`, limit: 5, windowMs: 60_000 });
    const limitedTok = rateLimitResponse(rlTok);
    if (limitedTok) return limitedTok;

    const [invite] = await db
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.token, token))
      .limit(1);

    if (!invite) return NextResponse.json({ error: 'invite_not_found' }, { status: 404 });
    if (invite.status !== 'pending') return NextResponse.json({ error: 'invite_used' }, { status: 410 });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'invite_expired' }, { status: 410 });
    }

    // Verify the signed-in user's email matches the invite target.
    // requireUser() only returns the Clerk userId — fetch the full Clerk user to get email.
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);
    const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
    if (!primaryEmail || primaryEmail !== invite.parentEmail.toLowerCase()) {
      return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
    }

    // Branch on household_mode (added by 0018):
    //   join_existing → invitee joins inviter's household (today's behavior).
    //   create_new    → brand-new Clerk org for invitee; household row created
    //                   by requireHousehold() on first request from the new org.
    // Bug #3 (BUGS.md 2026-05-06): watcher-invited new families must NOT fold
    // into the watcher's household.

    let acceptedHouseholdId: string | null = null;

    if (invite.householdMode === 'create_new') {
      // Create a brand-new organization for the invitee. Clerk will assign
      // them as creator (and org admin) automatically. requireHousehold() on
      // their first authenticated request will see the new orgId and provision
      // the matching households row + users row (with isAdmin=true via the
      // first-user advisory-lock path in lib/auth/household.ts).
      const orgName = (invite.parentName?.trim() || clerkUser.firstName || 'Family');

      // Idempotency guard: if a previous accept attempt for this invite
      // succeeded at createOrganization but failed before the DB update below,
      // an orphan org exists with publicMetadata.inviteId === invite.id. On
      // retry, reuse it instead of creating a second org.
      let existingOrgId: string | null = null;
      try {
        const memberships = await clerk.users.getOrganizationMembershipList({ userId });
        for (const m of memberships.data) {
          const meta = m.organization.publicMetadata as { inviteId?: string } | null;
          if (meta?.inviteId === invite.id) {
            existingOrgId = m.organization.id;
            break;
          }
        }
      } catch (lookupErr) {
        // Non-fatal: if lookup fails we fall through to create. Worst case is
        // an extra orphan that the cleanup script catches.
        console.error('[invite-family:accept] org lookup failed', lookupErr);
      }

      if (!existingOrgId) {
        try {
          const newOrg = await clerk.organizations.createOrganization({
            name: orgName,
            createdBy: userId,
          });
          // Stamp the invite id immediately so a crash before DB update is
          // recoverable on the next accept attempt.
          try {
            await clerk.organizations.updateOrganization(newOrg.id, {
              publicMetadata: { inviteId: invite.id },
            });
          } catch (stampErr) {
            console.error('[invite-family:accept] inviteId stamp failed', stampErr);
          }
        } catch (orgErr) {
          console.error('[invite-family:accept] createOrganization failed', orgErr);
          return NextResponse.json({ error: 'household_create_failed' }, { status: 500 });
        }
      }

      // Stamp publicMetadata so requireHousehold() picks the right role on
      // first-user provision. appRole='keeper' is invariant for create_new
      // (set server-side at invite creation time; payload override is ignored
      // for watcher-initiated invites — see invite-family POST).
      try {
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: {
            appRole: 'keeper',
          },
        });
      } catch (metaErr) {
        // Non-fatal: requireHousehold() falls back to isFirstUser ? 'keeper'
        // for new orgs, so the user still lands as keeper-admin even if this
        // metadata write fails. Log loudly rather than swallow.
        console.error('[invite-family:accept] updateUserMetadata failed', metaErr);
      }
      // acceptedHouseholdId stays null — household row doesn't exist yet.
    } else {
      // join_existing — today's behavior preserved.
      const [fromUser] = await db
        .select({ householdId: users.householdId })
        .from(users)
        .where(eq(users.id, invite.fromUserId))
        .limit(1);
      acceptedHouseholdId = fromUser?.householdId ?? null;

      // Stamp the invite's appRole/villageGroup into Clerk publicMetadata so
      // requireHousehold() respects it on the invitee's first call. Without
      // this, meta.appRole is undefined and the user defaults to 'watcher'
      // (Bug #1's third root cause at lib/auth/household.ts:71).
      try {
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: {
            appRole: invite.appRole ?? 'watcher',
            villageGroup: invite.villageGroup,
          },
        });
      } catch (metaErr) {
        console.error('[invite-family:accept] updateUserMetadata failed', metaErr);
      }
    }

    // Atomic consume: AND status = 'pending' guards against a concurrent accept.
    const [updated] = await db
      .update(familyInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedHouseholdId,
      })
      .where(and(eq(familyInvites.id, invite.id), ne(familyInvites.status, 'accepted')))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'invite_used' }, { status: 410 });
    }

    return NextResponse.json({ ok: true, clerkUserId: userId });
  } catch (err) {
    return authError(err, 'village:invite-family:accept:post', 'Could not accept invite');
  }
}
