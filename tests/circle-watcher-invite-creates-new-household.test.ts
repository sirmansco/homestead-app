/**
 * Bug #3 (BUGS.md 2026-05-06) — Watcher-invited new family folds into watcher's
 * household. Should create a new household with the invitee as keeper+isAdmin.
 *
 * Accept-route behavior under household_mode='create_new':
 *  - Create a new Clerk organization for the invitee.
 *  - Add the invitee as a member (Clerk handles org-admin assignment).
 *  - Mark invite accepted; acceptedHouseholdId left null (the new household
 *    row is created by requireHousehold() on the invitee's first request,
 *    keyed by the new Clerk org ID — unknown until the org is created).
 *  - Stash appRole='keeper' + an "isFirstUserOfNewHousehold" intent in Clerk
 *    publicMetadata so requireHousehold() assigns isAdmin=true on provision.
 *  - Inviter is NOT added to the new household.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
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

import { requireUser } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { POST as acceptPost } from '@/app/api/circle/invite-family/accept/route';

const TOKEN = 'tok-watcher-invite';
const INVITE_ID = 'invite-watcher-1';
const INVITEE_CLERK_ID = 'clerk_invitee_1';
const INVITEE_EMAIL = 'newfam@example.com';
const WATCHER_USER_ID = 'watcher-user-1';
const NEW_ORG_ID = 'org_new_household';

type Row = Record<string, unknown>;

function mockUser() {
  vi.mocked(requireUser).mockResolvedValue({
    userId: INVITEE_CLERK_ID,
  } as unknown as Awaited<ReturnType<typeof requireUser>>);
}

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t; chain['where'] = t; chain['limit'] = t; chain['innerJoin'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain(rows: Row[] = [{ id: INVITE_ID, status: 'accepted' }]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t; chain['where'] = t; chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeAcceptReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => null },
    url: 'http://localhost/api/circle/invite-family/accept',
  } as unknown as Parameters<typeof acceptPost>[0];
}

function pendingInvite(overrides: Partial<Row> = {}): Row {
  return {
    id: INVITE_ID,
    token: TOKEN,
    parentEmail: INVITEE_EMAIL,
    status: 'pending',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    fromUserId: WATCHER_USER_ID,
    appRole: 'keeper',
    householdMode: 'create_new',
    villageGroup: 'covey',
    acceptedHouseholdId: null,
    ...overrides,
  };
}

describe('Bug #3 — watcher invite (create_new) produces new household', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('accept on create_new invite calls Clerk createOrganization with invitee as creator', async () => {
    mockUser();

    const createOrganization = vi.fn().mockResolvedValue({ id: NEW_ORG_ID, name: 'newfam' });
    const updateUserMetadata = vi.fn().mockResolvedValue({});
    const getUser = vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: INVITEE_EMAIL },
      firstName: 'New',
      lastName: 'Family',
    });
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser, updateUserMetadata },
      organizations: { createOrganization },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeSelectChain([pendingInvite()]) as unknown as ReturnType<typeof db.select>;
      // create_new path: no second select needed (we don't look up fromUser).
      return makeSelectChain([]) as unknown as ReturnType<typeof db.select>;
    });
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));

    expect(res.status).toBe(200);
    // Clerk org created with the invitee as creator
    expect(createOrganization).toHaveBeenCalledOnce();
    const orgCall = createOrganization.mock.calls[0][0];
    expect(orgCall.createdBy).toBe(INVITEE_CLERK_ID);
    // Clerk metadata stamped so requireHousehold() promotes invitee to admin keeper
    expect(updateUserMetadata).toHaveBeenCalledOnce();
    const metaCall = updateUserMetadata.mock.calls[0];
    expect(metaCall[0]).toBe(INVITEE_CLERK_ID);
    expect(metaCall[1].publicMetadata.appRole).toBe('keeper');
  });

  it('accept on create_new does NOT set acceptedHouseholdId to inviter household', async () => {
    mockUser();

    const createOrganization = vi.fn().mockResolvedValue({ id: NEW_ORG_ID, name: 'newfam' });
    const updateUserMetadata = vi.fn().mockResolvedValue({});
    const getUser = vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: INVITEE_EMAIL },
      firstName: 'New', lastName: 'Family',
    });
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser, updateUserMetadata },
      organizations: { createOrganization },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite()]) as unknown as ReturnType<typeof db.select>,
    );

    // Capture the UPDATE set() args to assert we didn't set acceptedHouseholdId
    // to a real ID (should be null on create_new — household row is created
    // later by requireHousehold() on the invitee's first request).
    const updateSetCalls: Record<string, unknown>[] = [];
    const chain: Record<string, unknown> = {};
    const t = () => chain;
    chain['set'] = (vals: Record<string, unknown>) => {
      updateSetCalls.push(vals);
      return chain;
    };
    chain['where'] = t; chain['returning'] = t;
    chain['then'] = (resolve: (v: unknown) => void) => { resolve([{ id: INVITE_ID, status: 'accepted' }]); return chain; };
    chain['catch'] = () => chain; chain['finally'] = () => chain;
    vi.mocked(db.update).mockReturnValue(chain as unknown as ReturnType<typeof db.update>);

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(updateSetCalls).toHaveLength(1);
    // create_new: acceptedHouseholdId is null until requireHousehold() resolves
    // the new org → household row.
    expect(updateSetCalls[0].acceptedHouseholdId).toBeNull();
  });

  it('join_existing path is unaffected — still sets acceptedHouseholdId to inviter household', async () => {
    mockUser();
    const getUser = vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: INVITEE_EMAIL },
    });
    const createOrganization = vi.fn();
    const updateUserMetadata = vi.fn();
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser, updateUserMetadata },
      organizations: { createOrganization },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return makeSelectChain([pendingInvite({ householdMode: 'join_existing', appRole: 'watcher' })]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([{ householdId: 'inviter-hh' }]) as unknown as ReturnType<typeof db.select>;
    });

    const updateSetCalls: Record<string, unknown>[] = [];
    const chain: Record<string, unknown> = {};
    const t = () => chain;
    chain['set'] = (vals: Record<string, unknown>) => {
      updateSetCalls.push(vals);
      return chain;
    };
    chain['where'] = t; chain['returning'] = t;
    chain['then'] = (resolve: (v: unknown) => void) => { resolve([{ id: INVITE_ID, status: 'accepted' }]); return chain; };
    chain['catch'] = () => chain; chain['finally'] = () => chain;
    vi.mocked(db.update).mockReturnValue(chain as unknown as ReturnType<typeof db.update>);

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(createOrganization).not.toHaveBeenCalled();
    expect(updateSetCalls[0].acceptedHouseholdId).toBe('inviter-hh');
  });
});
