import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { familyInvites, users } from '@/lib/db/schema';
import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

// GET /api/circle/invite-family/accept?token=... — side-effect-free token preview.
// Returns invite metadata for the accept page without mutating state.
// Callers must POST to consume the token (requires auth).
export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

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

    // Resolve the household the invite creator belongs to, to set acceptedHouseholdId.
    const [fromUser] = await db
      .select({ householdId: users.householdId })
      .from(users)
      .where(eq(users.id, invite.fromUserId))
      .limit(1);

    // Atomic consume: AND status = 'pending' guards against a concurrent accept.
    const [updated] = await db
      .update(familyInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedHouseholdId: fromUser?.householdId ?? null,
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
