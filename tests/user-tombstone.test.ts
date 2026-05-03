import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before route imports ──────────────────────────────

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    $count: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
    requireHouseholdAdmin: vi.fn(),
    requireUser: vi.fn(),
  };
});

import { db } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { requireHousehold, requireHouseholdAdmin } from '@/lib/auth/household';
import { tombstoneUser } from '@/lib/users/tombstone';
import { POST as villageLeavePOST } from '@/app/api/circle/leave/route';
import { DELETE as villageDELETE } from '@/app/api/circle/route';
import { DELETE as memberDELETE } from '@/app/api/household/members/[id]/route';

// ── Constants ────────────────────────────────────────────────────────────────

const HH_A = 'hh-a';
const USER_ID = 'user-target';
const CLERK_USER_ID = 'clerk_target';
const ADMIN_ID = 'user-admin';
const HOUSEHOLD_A = { id: HH_A, clerkOrgId: 'org_a', name: 'Smiths', glyph: '🏡' };

function targetRow(overrides: Partial<{ id: string; clerkUserId: string; householdId: string }> = {}) {
  return {
    id: overrides.id ?? USER_ID,
    clerkUserId: overrides.clerkUserId ?? CLERK_USER_ID,
    householdId: overrides.householdId ?? HH_A,
    email: 'u@example.com',
    name: 'Target',
    role: 'watcher' as const,
    villageGroup: 'covey' as const,
    isAdmin: false,
  };
}

function adminRow() {
  return {
    id: ADMIN_ID,
    clerkUserId: 'clerk_admin',
    householdId: HH_A,
    email: 'a@example.com',
    name: 'Admin',
    role: 'keeper' as const,
    villageGroup: 'covey' as const,
    isAdmin: true,
  };
}

// ── Drizzle chain stubs ──────────────────────────────────────────────────────

function makeSelectChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t;
  chain['where'] = t;
  chain['limit'] = () => Promise.resolve(rows);
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain['set'] = () => chain;
  chain['where'] = () => Promise.resolve(undefined);
  chain['returning'] = () => chain;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(undefined); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeDeleteChain(throwErr?: Error) {
  const chain: Record<string, unknown> = {};
  chain['where'] = () => throwErr ? Promise.reject(throwErr) : Promise.resolve(undefined);
  chain['then'] = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    if (throwErr && reject) reject(throwErr); else resolve(undefined);
    return chain;
  };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

// Build a tx-shaped object that delegates everything back to the shared db mock
// so a single set of stubs covers both code paths (direct db calls and tx calls).
function txShaped() {
  return {
    select: db.select,
    update: db.update,
    delete: db.delete,
    insert: db.insert,
    $count: db.$count,
  };
}

// ── Service unit tests ───────────────────────────────────────────────────────

describe('tombstoneUser — service unit tests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function setupTx() {
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough for the service's call sites
      return cb(txShaped());
    });
  }

  it('returns noop when target row is not found', async () => {
    setupTx();
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([]) as unknown as ReturnType<typeof db.select>,
    );

    const result = await tombstoneUser({ userId: USER_ID, householdId: HH_A });
    expect(result).toEqual({ kind: 'noop' });
    expect(vi.mocked(db.delete)).not.toHaveBeenCalled();
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('hard-deletes when authored history is zero', async () => {
    setupTx();
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.$count).mockResolvedValue(0);
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );

    const result = await tombstoneUser({ userId: USER_ID, householdId: HH_A });
    expect(result).toEqual({ kind: 'deleted' });
    expect(vi.mocked(db.delete)).toHaveBeenCalled();
  });

  it('anonymizes when authored whistles exist', async () => {
    setupTx();
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    // First $count = whistles (3), second = lanterns (0)
    vi.mocked(db.$count).mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    const result = await tombstoneUser({ userId: USER_ID, householdId: HH_A });
    expect(result).toEqual({
      kind: 'anonymized',
      reason: { authoredWhistles: 3, authoredLanterns: 0 },
    });
    // anonymize calls update on users; we asserted update was called via the chain.
    expect(vi.mocked(db.update)).toHaveBeenCalled();
  });

  it('anonymizes when authored lanterns exist', async () => {
    setupTx();
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    vi.mocked(db.$count).mockResolvedValueOnce(0).mockResolvedValueOnce(2);

    const result = await tombstoneUser({ userId: USER_ID, householdId: HH_A });
    expect(result).toEqual({
      kind: 'anonymized',
      reason: { authoredWhistles: 0, authoredLanterns: 2 },
    });
  });

  it('falls back to anonymize when hard-delete loses an FK race', async () => {
    setupTx();
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    // counts: pre-check both 0, recount (after FK error) whistles=1 lanterns=0
    vi.mocked(db.$count)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    // First delete (the hard-delete attempt) throws; subsequent deletes (pushSubs/availability) succeed.
    let firstDelete = true;
    vi.mocked(db.delete).mockImplementation(() => {
      if (firstDelete) {
        firstDelete = false;
        return makeDeleteChain(new Error('FK violation')) as unknown as ReturnType<typeof db.delete>;
      }
      return makeDeleteChain() as unknown as ReturnType<typeof db.delete>;
    });

    const result = await tombstoneUser({ userId: USER_ID, householdId: HH_A });
    expect(result).toEqual({
      kind: 'anonymized',
      reason: { authoredWhistles: 1, authoredLanterns: 0 },
    });
  });
});

// ── Route integration regression (L9 + B2 SHIPLOG follow-up) ─────────────────

describe('POST /api/circle/leave — tombstone integration', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns { ok: true } and never 5xx for caregiver with no authored history', async () => {
    vi.mocked(requireHousehold).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: targetRow(),
      userId: CLERK_USER_ID,
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHousehold>>);

    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb(txShaped());
    });
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    vi.mocked(db.$count).mockResolvedValue(0);

    const res = await villageLeavePOST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Self-leave does NOT call Clerk.
    expect(vi.mocked(clerkClient)).not.toHaveBeenCalled();
  });

  it('returns { ok: true } when authored history triggers anonymize (no 5xx)', async () => {
    vi.mocked(requireHousehold).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: targetRow(),
      userId: CLERK_USER_ID,
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHousehold>>);

    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb(txShaped());
    });
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    vi.mocked(db.$count).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res = await villageLeavePOST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('DELETE /api/circle (admin, type=adult) — tombstone + Clerk-membership drop', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function urlReq(url: string) {
    return {
      json: async () => ({}),
      nextUrl: new URL(url),
      url,
      headers: new Map(),
    } as unknown as Parameters<typeof villageDELETE>[0];
  }

  it('200 + drops Clerk org membership using cached clerkUserId', async () => {
    vi.mocked(requireHouseholdAdmin).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: adminRow(),
      userId: 'clerk_admin',
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);

    // Two selects happen in the route DELETE-adult path:
    //  1. route's pre-tombstone target read
    //  2. service's first select inside the tx
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>);
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb(txShaped());
    });
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    vi.mocked(db.$count).mockResolvedValue(0);

    const deleteOrganizationMembership = vi.fn().mockResolvedValue({});
    const getOrganizationMembershipList = vi.fn().mockResolvedValue({
      data: [{ publicUserData: { userId: CLERK_USER_ID } }],
    });
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { getOrganizationMembershipList, deleteOrganizationMembership },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    const res = await villageDELETE(urlReq('http://localhost/api/circle?id=user-target&type=adult'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, clerkDropped: true });
    expect(deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: 'org_a',
      userId: CLERK_USER_ID,
    });
  });

  it('Clerk-drop failure → 200 with clerkDropped: false (Principle 6 surfacing)', async () => {
    vi.mocked(requireHouseholdAdmin).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: adminRow(),
      userId: 'clerk_admin',
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>);
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb(txShaped());
    });
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    vi.mocked(db.$count).mockResolvedValue(0);

    vi.mocked(clerkClient).mockRejectedValue(new Error('Clerk API down'));

    const res = await villageDELETE(urlReq('http://localhost/api/circle?id=user-target&type=adult'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, clerkDropped: false });
  });

  it('returns 404 when target row not found pre-tombstone', async () => {
    vi.mocked(requireHouseholdAdmin).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: adminRow(),
      userId: 'clerk_admin',
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);

    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([]) as unknown as ReturnType<typeof db.select>,
    );

    const res = await villageDELETE(urlReq('http://localhost/api/circle?id=ghost&type=adult'));
    expect(res.status).toBe(404);
    expect(vi.mocked(db.transaction)).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/household/members/[id] — tombstone + Clerk drop + Hard Rule #3 logging', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('200 + drops Clerk org membership; tombstone runs through service', async () => {
    vi.mocked(requireHouseholdAdmin).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: adminRow(),
      userId: 'clerk_admin',
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);

    // Two selects: route's pre-read + service's tx select
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>);
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb(txShaped());
    });
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    vi.mocked(db.$count).mockResolvedValue(0);

    const deleteOrganizationMembership = vi.fn().mockResolvedValue({});
    const getOrganizationMembershipList = vi.fn().mockResolvedValue({
      data: [{ publicUserData: { userId: CLERK_USER_ID } }],
    });
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { getOrganizationMembershipList, deleteOrganizationMembership },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    const req = { url: 'http://localhost/api/household/members/user-target' } as Parameters<typeof memberDELETE>[0];
    const res = await memberDELETE(req, ctx(USER_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, clerkDropped: true });
    expect(deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: 'org_a',
      userId: CLERK_USER_ID,
    });
  });

  it('200 + anonymize-branch (history exists) — row tombstoned, Clerk dropped, no 5xx', async () => {
    vi.mocked(requireHouseholdAdmin).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: adminRow(),
      userId: 'clerk_admin',
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([targetRow()]) as unknown as ReturnType<typeof db.select>);
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb(txShaped());
    });
    const updateMock = vi.fn(() => makeUpdateChain());
    vi.mocked(db.update).mockImplementation(
      updateMock as unknown as typeof db.update,
    );
    vi.mocked(db.delete).mockReturnValue(
      makeDeleteChain() as unknown as ReturnType<typeof db.delete>,
    );
    // History present → service goes anonymize branch
    vi.mocked(db.$count).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const deleteOrganizationMembership = vi.fn().mockResolvedValue({});
    const getOrganizationMembershipList = vi.fn().mockResolvedValue({
      data: [{ publicUserData: { userId: CLERK_USER_ID } }],
    });
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { getOrganizationMembershipList, deleteOrganizationMembership },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    const req = { url: 'http://localhost/api/household/members/user-target' } as Parameters<typeof memberDELETE>[0];
    const res = await memberDELETE(req, ctx(USER_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, clerkDropped: true });
    // Service must have written the anonymize update (PII strip on users row).
    // db.update called: pre-cleanup null-claimed (1) + cancel-future-whistles (1) + anonymize users (1) = 3.
    expect(updateMock).toHaveBeenCalledTimes(3);
    // Clerk drop runs against the original (cached) clerkUserId, not the anonymized rewrite.
    expect(deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: 'org_a',
      userId: CLERK_USER_ID,
    });
  });

  it('admin removing self → 400, no tombstone, no Clerk call', async () => {
    vi.mocked(requireHouseholdAdmin).mockResolvedValue({
      household: HOUSEHOLD_A,
      user: adminRow(),
      userId: 'clerk_admin',
      orgId: 'org_a',
    } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);

    const req = { url: 'http://localhost/api/household/members/user-admin' } as Parameters<typeof memberDELETE>[0];
    const res = await memberDELETE(req, ctx(ADMIN_ID));
    expect(res.status).toBe(400);
    expect(vi.mocked(db.transaction)).not.toHaveBeenCalled();
    expect(vi.mocked(clerkClient)).not.toHaveBeenCalled();
  });
});
