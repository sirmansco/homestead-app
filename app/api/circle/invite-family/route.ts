import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { familyInvites } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';

// Allowlists are enforced before persistence — caller-supplied values cannot
// bleed back through requireHousehold()'s first-user provisioning. Mirrors the
// pattern in app/api/circle/invite/route.ts (synthesis L3).
const ALLOWED_ROLES = ['keeper', 'watcher'] as const;
const ALLOWED_VILLAGE_GROUPS = ['covey', 'field'] as const;

// POST /api/circle/invite-family
// Creates a pending invite under the Circle/invite/role audit matrix
// (docs/plans/circle-invite-role-audit.md, 2026-05-06).
//
// Inviter role determines two things:
//
//  1. household_mode — keeper-initiated invites set 'join_existing' (today's
//     behavior; invitee joins inviter's household). Watcher-initiated invites
//     set 'create_new' (invitee gets a brand-new household, keeper+isAdmin).
//
//  2. Allowed payload fields — keepers may pick appRole and villageGroup;
//     watchers cannot (server forces appRole='keeper', villageGroup unset).
//
// Bug #1 (BUGS.md 2026-05-06): keepers must persist appRole. Was omitted by
// caregiverMode UI and dropped server-side.
//
// Bug #5 (BUGS.md 2026-05-06): watchers must NOT pick role/villageGroup;
// server rejects payload overrides regardless of UI state.
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
      appRole?: 'keeper' | 'watcher';
      mode?: 'email' | 'link';
    };

    if (!body.parentEmail?.trim()) {
      return NextResponse.json({ error: 'Parent email required' }, { status: 400 });
    }

    // Matrix §2.1.2: keeper-non-admin sees no Invite button in UI and is
    // blocked here in case the UI gate is bypassed. Only watchers and
    // keeper-admins may use this endpoint.
    if (user.role === 'keeper' && !user.isAdmin) {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }

    const isWatcherInviter = user.role === 'watcher';

    // Server-side enforcement of the matrix:
    //   keeper inviter → must supply appRole; villageGroup defaults to 'covey'
    //   watcher inviter → appRole forced to 'keeper'; villageGroup forced to
    //                     'covey' (irrelevant for create_new, but the column
    //                     is NOT NULL so we set it). householdMode='create_new'.
    let appRole: 'keeper' | 'watcher';
    let villageGroup: 'covey' | 'field';
    let householdMode: 'join_existing' | 'create_new';

    if (isWatcherInviter) {
      // Ignore any payload role/villageGroup — watchers cannot pick.
      appRole = 'keeper';
      villageGroup = 'covey';
      householdMode = 'create_new';
    } else {
      // Keeper path — appRole required and validated against the enum.
      if (!body.appRole) {
        return NextResponse.json({ error: 'appRole required' }, { status: 400 });
      }
      if (!ALLOWED_ROLES.includes(body.appRole as typeof ALLOWED_ROLES[number])) {
        return NextResponse.json({ error: 'invalid appRole' }, { status: 400 });
      }
      const requestedGroup = body.villageGroup ?? 'covey';
      if (!ALLOWED_VILLAGE_GROUPS.includes(requestedGroup as typeof ALLOWED_VILLAGE_GROUPS[number])) {
        return NextResponse.json({ error: 'invalid villageGroup' }, { status: 400 });
      }
      appRole = body.appRole;
      villageGroup = requestedGroup;
      householdMode = 'join_existing';
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await db.insert(familyInvites).values({
      token,
      fromUserId: user.id,
      parentEmail: body.parentEmail.trim().toLowerCase(),
      parentName: body.parentName?.trim() || null,
      villageGroup,
      appRole,
      householdMode,
      status: 'pending',
      expiresAt,
    });

    // C4: derive from server env only. See app/api/circle/invite/route.ts:48 note.
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://joincovey.co';
    const inviteUrl = `${origin}/accept-family-invite?token=${token}`;

    return NextResponse.json({ ok: true, inviteUrl });
  } catch (err) {
    return authError(err, 'village:invite-family', 'Invite failed');
  }
}
