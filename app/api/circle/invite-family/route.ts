import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { familyInvites } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';

// Caregiver invites a parent of a new family to join Covey
// Creates a pending invite; parent accepts via /accept-family-invite?token=...
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireHousehold();

    const rl = rateLimit({ key: `invite-family:${user.id}`, limit: 5, windowMs: 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const body = await req.json() as {
      parentName?: string;
      parentEmail?: string;
      villageGroup?: 'covey' | 'field';
      mode?: 'email' | 'link';
    };

    if (!body.parentEmail?.trim()) {
      return NextResponse.json({ error: 'Parent email required' }, { status: 400 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await db.insert(familyInvites).values({
      token,
      fromUserId: user.id,
      parentEmail: body.parentEmail.trim().toLowerCase(),
      parentName: body.parentName?.trim() || null,
      villageGroup: body.villageGroup || 'covey',
      status: 'pending',
      expiresAt,
    });

    const origin = req.headers.get('origin') || new URL(req.url).origin;
    const inviteUrl = `${origin}/accept-family-invite?token=${token}`;

    return NextResponse.json({ ok: true, inviteUrl });
  } catch (err) {
    return authError(err, 'village:invite-family', 'Invite failed');
  }
}
