import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { familyInvites, users } from '@/lib/db/schema';
import { apiError } from '@/lib/api-error';

// GET /api/village/invite-family/accept?token=... — validate a family invite token
// Returns { ok, invite: { fromName, parentName, parentEmail, villageGroup } }
//
// Marks the invite as 'accepted' on first valid read so the token cannot be
// replayed. The accept page only calls this once — on load — before routing
// the user to sign-up. Marking consumed here is the only reliable gate since
// Clerk's sign-up flow has no callback that re-enters this app.
export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const [invite] = await db
      .select({
        id: familyInvites.id,
        token: familyInvites.token,
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

    // Consume the token atomically — only succeeds if status is still 'pending'.
    const updated = await db
      .update(familyInvites)
      .set({ status: 'accepted' })
      .where(eq(familyInvites.id, invite.id))
      .returning({ status: familyInvites.status });

    // If another request beat us here (race), treat as used.
    if (!updated[0] || updated[0].status !== 'accepted') {
      return NextResponse.json({ error: 'invite_used' }, { status: 410 });
    }

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
    return apiError(err, 'Could not validate invite', 500, 'village:invite-family:accept');
  }
}
