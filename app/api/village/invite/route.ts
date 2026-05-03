import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireHouseholdAdmin } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

// Allowlists are enforced before any Clerk metadata write so caller-supplied
// values cannot bleed back through requireHousehold()'s first-user provisioning
// (lib/auth/household.ts:43-58). Synthesis L3.
const ALLOWED_ROLES = ['parent', 'caregiver'] as const;
const ALLOWED_VILLAGE_GROUPS = ['covey', 'field'] as const;

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await requireHouseholdAdmin();

    // Rate limit: 10 invites per hour per user (prevents email spam)
    const { rateLimit, rateLimitResponse } = await import('@/lib/ratelimit');
    const rl = rateLimit({ key: `invite:${userId}`, limit: 10, windowMs: 60 * 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const body = await req.json();
    const { name, email, role, villageGroup, mode } = body as {
      name?: string;
      email?: string;
      role?: 'parent' | 'caregiver';
      villageGroup?: 'covey' | 'field';
      mode?: 'email' | 'link';
    };

    if (!role || !villageGroup) {
      return NextResponse.json({ error: 'role and villageGroup required' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role as typeof ALLOWED_ROLES[number])) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }
    if (!ALLOWED_VILLAGE_GROUPS.includes(villageGroup as typeof ALLOWED_VILLAGE_GROUPS[number])) {
      return NextResponse.json({ error: 'invalid villageGroup' }, { status: 400 });
    }

    const client = await clerkClient();
    const origin = req.headers.get('origin') || new URL(req.url).origin;

    if (mode === 'email') {
      if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 });
      const invitation = await client.organizations.createOrganizationInvitation({
        organizationId: orgId,
        inviterUserId: userId,
        emailAddress: email.trim(),
        role: 'org:member',
        publicMetadata: { name: name?.trim(), appRole: role, villageGroup },
        redirectUrl: `${origin}/`,
      });
      return NextResponse.json({ ok: true, invitationId: invitation.id });
    }

    if (mode === 'link') {
      const ticket = await client.invitations.createInvitation({
        emailAddress: email?.trim() || `invite+${crypto.randomUUID()}@covey.local`,
        publicMetadata: {
          name: name?.trim(),
          appRole: role,
          villageGroup,
          targetOrgId: orgId,
        },
        // Redirect to sign-up — Clerk will embed the ticket in the URL automatically.
        // After sign-up, Clerk redirects to NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL (/).
        redirectUrl: `${origin}/sign-up`,
        notify: false,
        ignoreExisting: true,
      });
      // ticket.url is the full sign-up URL with __clerk_ticket embedded
      return NextResponse.json({ ok: true, inviteUrl: ticket.url || `${origin}/sign-up` });
    }

    return NextResponse.json({ error: 'mode must be "email" or "link"' }, { status: 400 });
  } catch (err) {
    return authError(err, 'village:invite', 'Invite failed');
  }
}
