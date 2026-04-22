import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { familyInvites, users } from '@/lib/db/schema';
import { apiError } from '@/lib/api-error';

// GET /api/village/invite-family/accept?token=... — validate a family invite token
// Returns { ok, invite: { fromName, parentName, parentEmail, villageGroup } }
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
