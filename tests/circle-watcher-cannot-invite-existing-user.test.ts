/**
 * Spec §2.1 row 3 / plan §file-map line 102 — Watcher inviter + invitee email
 * already has a Clerk user → 403.
 *
 * Watchers may only initiate the "create_new" flow (matrix §2.1). If the
 * target email already has a Clerk user, that person already has (or will
 * provision on next sign-in) their own household, and accepting the invite
 * would call createOrganization for them — producing a duplicate org and
 * leaving the existing household orphaned.
 *
 * Block before insert. Detection: clerkClient.users.getUserList({ emailAddress: [...] }).
 * Independent of the orphan-org rollback fix in the accept route — this is the
 * preventive guard at invite creation; that one is the safety net at accept.
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
import { clerkClient } from '@clerk/nextjs/server';
import { POST as invitePost } from '@/app/api/circle/invite-family/route';

const HH_ID = 'hh-watcher';
const WATCHER_USER_ID = 'watcher-1';
const KEEPER_USER_ID = 'keeper-1';
const EXISTING_EMAIL = 'already@example.com';
const NEW_EMAIL = 'fresh@example.com';

function mockWatcherHousehold() {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_w' },
    user: { id: WATCHER_USER_ID, clerkUserId: 'clerk_w', householdId: HH_ID, role: 'watcher', isAdmin: false },
    userId: 'clerk_w',
    orgId: 'org_w',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function mockKeeperAdminHousehold() {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_k' },
    user: { id: KEEPER_USER_ID, clerkUserId: 'clerk_k', householdId: HH_ID, role: 'keeper', isAdmin: true },
    userId: 'clerk_k',
    orgId: 'org_k',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function mockClerkUserList(users: { id: string; emailAddress: string }[]) {
  const getUserList = vi.fn().mockResolvedValue({
    data: users,
    totalCount: users.length,
  });
  vi.mocked(clerkClient).mockResolvedValue({
    users: { getUserList },
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  return getUserList;
}

function makeInsertCapture() {
  const captured: Record<string, unknown>[] = [];
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['values'] = (vals: Record<string, unknown>) => {
    captured.push(vals);
    return chain;
  };
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return { chain, captured };
}

function makeReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => 'http://localhost' },
    url: 'http://localhost/api/circle/invite-family',
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as Parameters<typeof invitePost>[0];
}

describe('Spec §2.1 row 3 — watcher cannot invite an email that already has a Clerk account', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 403 user_already_has_account when watcher invites an existing Clerk user', async () => {
    mockWatcherHousehold();
    const getUserList = mockClerkUserList([{ id: 'existing_user_1', emailAddress: EXISTING_EMAIL }]);

    const insertSpy = vi.fn();
    vi.mocked(db.insert).mockImplementation(insertSpy);

    const res = await invitePost(makeReq({
      parentName: 'Existing Person',
      parentEmail: EXISTING_EMAIL,
      mode: 'email',
    }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('user_already_has_account');

    // Clerk lookup uses the normalized (lowercased + trimmed) email
    expect(getUserList).toHaveBeenCalledWith({ emailAddress: [EXISTING_EMAIL] });

    // Critical: no invite row inserted when the guard fires
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('handles array-shaped getUserList response (older Clerk SDK contract)', async () => {
    mockWatcherHousehold();
    const getUserList = vi.fn().mockResolvedValue([
      { id: 'existing_user_2', emailAddress: EXISTING_EMAIL },
    ]);
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUserList },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    const insertSpy = vi.fn();
    vi.mocked(db.insert).mockImplementation(insertSpy);

    const res = await invitePost(makeReq({
      parentEmail: EXISTING_EMAIL,
      mode: 'link',
    }));

    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('proceeds normally when watcher invites a brand-new email (no Clerk user)', async () => {
    mockWatcherHousehold();
    mockClerkUserList([]);

    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Fresh Family',
      parentEmail: NEW_EMAIL,
      mode: 'email',
    }));

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].householdMode).toBe('create_new');
    expect(captured[0].appRole).toBe('keeper');
    expect(captured[0].parentEmail).toBe(NEW_EMAIL);
  });

  it('keeper-admin path is unaffected — existing Clerk user still allowed (matrix §2.1 row 1)', async () => {
    // Keepers may invite existing users into their household (per-household
    // identity model: a single Clerk user can have rows in multiple households).
    // The existing-user guard is watcher-specific; this asserts we did not
    // over-apply it.
    mockKeeperAdminHousehold();

    const clerkSpy = vi.fn();
    vi.mocked(clerkClient).mockImplementation(clerkSpy);

    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Existing Keeper',
      parentEmail: EXISTING_EMAIL,
      appRole: 'keeper',
      villageGroup: 'covey',
      mode: 'email',
    }));

    expect(res.status).toBe(200);
    // Keeper path must NOT call Clerk for existence check
    expect(clerkSpy).not.toHaveBeenCalled();
    expect(captured).toHaveLength(1);
    expect(captured[0].householdMode).toBe('join_existing');
  });

  it('normalizes invitee email (trim + lowercase) before Clerk lookup', async () => {
    mockWatcherHousehold();
    const getUserList = mockClerkUserList([{ id: 'u', emailAddress: EXISTING_EMAIL }]);

    const insertSpy = vi.fn();
    vi.mocked(db.insert).mockImplementation(insertSpy);

    const res = await invitePost(makeReq({
      parentEmail: `  ${EXISTING_EMAIL.toUpperCase()}  `,
      mode: 'email',
    }));

    expect(res.status).toBe(403);
    expect(getUserList).toHaveBeenCalledWith({ emailAddress: [EXISTING_EMAIL] });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
