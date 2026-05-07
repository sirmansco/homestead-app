import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Regression: the create_new branch of POST /api/circle/invite-family/accept
// used to call clerk.organizations.createOrganization and then update the
// family_invites row. If the DB update failed (network drop, Neon timeout)
// after the org was created, the row stayed 'pending', so a retry would
// create a SECOND Clerk org for the same invite — orphaning the first.
//
// Fix under test: before createOrganization, the route looks up the
// invitee's existing org memberships and reuses any org whose
// publicMetadata.inviteId matches the current invite. After createOrganization
// the route stamps publicMetadata.inviteId so the next retry can find it.

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

const createOrganization = vi.fn();
const updateOrganization = vi.fn();
const updateUserMetadata = vi.fn();
const getUser = vi.fn();
const getOrganizationMembershipList = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(async () => ({
    users: {
      getUser,
      getOrganizationMembershipList,
      updateUserMetadata,
    },
    organizations: {
      createOrganization,
      updateOrganization,
    },
  })),
}));

vi.mock('@/lib/auth/household', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(() => null),
}));

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/household';

const makeSelectChain = (result: unknown[]) => {
  const chain = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
};

const makeUpdateChain = (result: unknown[] | Error) => {
  const chain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  if (result instanceof Error) chain.returning.mockRejectedValue(result);
  else chain.returning.mockResolvedValue(result);
  return chain;
};

const pendingInvite = {
  id: 'inv-1',
  fromUserId: 'user-bob',
  parentEmail: 'alice@example.com',
  parentName: 'Alice',
  villageGroup: 'covey',
  appRole: 'keeper',
  householdMode: 'create_new',
  status: 'pending',
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ userId: 'user-alice' } as Awaited<ReturnType<typeof requireUser>>);
  getUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: 'alice@example.com' },
    firstName: 'Alice',
  });
  updateUserMetadata.mockResolvedValue({});
  updateOrganization.mockResolvedValue({});
});

describe('create_new accept — orphan org recovery on DB-update failure retry', () => {
  it('first attempt: DB update fails after org create → org is left stamped with inviteId', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite]) as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain(new Error('neon connection terminated')) as ReturnType<typeof db.update>,
    );

    // No prior membership — fresh org will be created.
    getOrganizationMembershipList.mockResolvedValue({ data: [] });
    createOrganization.mockResolvedValue({ id: 'org-new-1', name: 'Alice' });

    const { POST } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-1' }),
    });

    const res = await POST(req);
    // Outer try/catch surfaces the DB failure as a 500 — the user retries.
    expect(res.status).toBe(500);

    // What matters: the org WAS created and stamped before the failure, so the
    // next attempt's idempotency lookup will find it.
    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(updateOrganization).toHaveBeenCalledWith('org-new-1', {
      publicMetadata: { inviteId: 'inv-1' },
    });
  });

  it('second attempt: existing org with matching inviteId metadata is reused, no second create', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite]) as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([{ id: 'inv-1', status: 'accepted' }]) as ReturnType<typeof db.update>,
    );

    // The org left behind by the first failed attempt.
    getOrganizationMembershipList.mockResolvedValue({
      data: [
        {
          organization: {
            id: 'org-new-1',
            name: 'Alice',
            publicMetadata: { inviteId: 'inv-1' },
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-1' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, clerkUserId: 'user-alice' });
    // Critical: the existing org is reused; NO duplicate created.
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it('memberships without matching inviteId do not block create for a different invite', async () => {
    const otherInvite = { ...pendingInvite, id: 'inv-2' };
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([otherInvite]) as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([{ id: 'inv-2', status: 'accepted' }]) as ReturnType<typeof db.update>,
    );

    // User is a member of an unrelated org (e.g. they were a watcher elsewhere).
    getOrganizationMembershipList.mockResolvedValue({
      data: [
        {
          organization: {
            id: 'org-unrelated',
            name: 'Other Family',
            publicMetadata: { inviteId: 'inv-1' }, // different invite
          },
        },
      ],
    });
    createOrganization.mockResolvedValue({ id: 'org-new-2', name: 'Alice' });

    const { POST } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(updateOrganization).toHaveBeenCalledWith('org-new-2', {
      publicMetadata: { inviteId: 'inv-2' },
    });
  });
});
