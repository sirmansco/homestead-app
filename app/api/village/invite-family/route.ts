import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { familyInvites, users } from '@/lib/db/schema';
import { apiError } from '@/lib/api-error';
// Caregiver invites a parent of a new family to join Homestead
// Creates a pending invite; parent accepts via /accept-family-invite?token=...
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

    const body = await req.json() as {
      parentName?: string;
      parentEmail?: string;
      villageGroup?: 'inner_circle' | 'sitter';
      mode?: 'email' | 'link';
    };

    if (!body.parentEmail?.trim()) {
      return NextResponse.json({ error: 'Parent email required' }, { status: 400 });
    }

    // Use the caregiver's first users row for the from_user_id link
    const [me] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
    if (!me) return NextResponse.json({ error: 'No user record' }, { status: 404 });

    const token = crypto.randomUUID();
    await db.insert(familyInvites).values({
      token,
      fromUserId: me.id,
      parentEmail: body.parentEmail.trim(),
      parentName: body.parentName?.trim() || null,
      villageGroup: body.villageGroup || 'inner_circle',
      status: 'pending',
    });

    const origin = req.headers.get('origin') || new URL(req.url).origin;
    const inviteUrl = `${origin}/accept-family-invite?token=${token}`;

    return NextResponse.json({ ok: true, inviteUrl });
  } catch (err) {
    return apiError(err, 'Invite failed', 500, 'village:invite-family');
  }
}
