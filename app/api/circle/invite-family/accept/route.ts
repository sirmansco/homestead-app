import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
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
        parentEmail: familyInvites.parentEmail,
        villageGroup: familyInvites.villageGroup,
        status: familyInvites.status,
        fromName: users.name,
      })
      .from(familyInvites)
      .innerJoin(users, eq(users.id, familyInvites.fromUserId))
      .where(eq(familyInvites.token, token))
      .limit(1);

    if (!invite) return NextResponse.json({ error: 'invite_not_found' }, { status: 404 });
    if (invite.status !== 'pending') return NextResponse.json({ error: 'invite_used' }, { status: 410 });

    return NextResponse.json({
      ok: true,
      invite: {
        fromName: invite.fromName,
        parentName: invite.parentName,
        parentEmail: invite.parentEmail,
        villageGroup: invite.villageGroup,
      },
    });
  } catch (err) {
    return apiError(err, 'Could not validate invite', 500, 'village:invite-family:accept:get');
  }
}

// POST /api/circle/invite-family/accept — consume a pending invite token.
// Requires the caller to be signed in. Atomically marks the token as accepted
// and binds the signed-in Clerk user to the invite's parentEmail.
// The GET preview must be called first to validate the token before posting.
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

    // Atomic consume: only succeeds if status is still 'pending'.
    const [updated] = await db
      .update(familyInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedHouseholdId: invite.acceptedHouseholdId,
      })
      .where(eq(familyInvites.id, invite.id))
      .returning();

    if (!updated || updated.status !== 'accepted') {
      return NextResponse.json({ error: 'invite_used' }, { status: 410 });
    }

    return NextResponse.json({ ok: true, clerkUserId: userId });
  } catch (err) {
    return authError(err, 'village:invite-family:accept:post', 'Could not accept invite');
  }
}
