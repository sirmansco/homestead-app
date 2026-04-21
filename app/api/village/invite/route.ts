import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { requireHousehold } from '@/lib/auth/household';

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    await requireHousehold();

    const body = await req.json();
    const { name, email, role, villageGroup, mode } = body as {
      name?: string;
      email?: string;
      role?: 'parent' | 'caregiver';
      villageGroup?: 'inner' | 'family' | 'sitter';
      mode?: 'email' | 'link';
    };

    if (!role || !villageGroup) {
      return NextResponse.json({ error: 'role and villageGroup required' }, { status: 400 });
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
        emailAddress: email?.trim() || `invite+${crypto.randomUUID()}@homestead.local`,
        publicMetadata: {
          name: name?.trim(),
          appRole: role,
          villageGroup,
          targetOrgId: orgId,
        },
        redirectUrl: `${origin}/accept-invite?org=${orgId}`,
        notify: false,
        ignoreExisting: true,
      });
      const url = `${origin}/sign-up?__clerk_ticket=${ticket.url?.split('__clerk_ticket=')[1] ?? ''}`;
      return NextResponse.json({ ok: true, inviteUrl: ticket.url || url });
    }

    return NextResponse.json({ error: 'mode must be "email" or "link"' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
