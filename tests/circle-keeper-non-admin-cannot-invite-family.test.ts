/**
 * Matrix §2.1.2 (docs/plans/circle-invite-role-audit.md, 2026-05-06):
 * keeper-non-admin sees no Invite button in UI and is blocked server-side
 * in case the UI gate is bypassed. Only keeper-admins and watchers may use
 * /api/circle/invite-family.
 *
 * Note: keeper-admin invites use /api/circle/invite (gated with
 * requireHouseholdAdmin), so keeper-admin going through invite-family is
 * unusual but allowed (matches spec — admins have invite power on either
 * endpoint).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
    requireUser: vi.fn(),
  };
});

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ limited: false }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}));

import { requireHousehold } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { POST as invitePost } from '@/app/api/circle/invite-family/route';

const HH_ID = 'hh-1';

function mockKeeper(opts: { isAdmin: boolean }) {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_1' },
    user: { id: 'user-1', clerkUserId: 'clerk_1', householdId: HH_ID, role: 'keeper', isAdmin: opts.isAdmin },
    userId: 'clerk_1',
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function makeReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => 'http://localhost' },
    url: 'http://localhost/api/circle/invite-family',
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as Parameters<typeof invitePost>[0];
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['values'] = t; chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

describe('Matrix §2.1.2 — keeper-non-admin server gate on /api/circle/invite-family', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('keeper-non-admin POST → 403 no_access (UI hides the button; server enforces too)', async () => {
    mockKeeper({ isAdmin: false });
    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Alice',
      parentEmail: 'a@example.com',
      appRole: 'watcher',
      mode: 'link',
    }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no_access');
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  it('keeper-admin POST → 200 (allowed)', async () => {
    mockKeeper({ isAdmin: true });
    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Alice',
      parentEmail: 'a@example.com',
      appRole: 'watcher',
      mode: 'link',
    }));

    expect(res.status).toBe(200);
  });
});
