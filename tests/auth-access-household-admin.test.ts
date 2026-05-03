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

vi.mock('@/lib/format', () => ({
  looksLikeSlug: vi.fn().mockReturnValue(false),
}));

// Routes call requireHouseholdAdmin (or requireHousehold for the GET handler we
// don't exercise here). Mock both — the matrix assertion is "given the gate
// resolves admin → 200; throws NotAdminError → 403". The unit test below
// verifies the gate's own logic so the matrix doesn't double-test it.
vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
    requireHouseholdAdmin: vi.fn(),
    requireUser: vi.fn(),
  };
});

import {
  requireHouseholdAdmin,
  NotAdminError,
} from '@/lib/auth/household';
import { db } from '@/lib/db';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { PATCH as householdPATCH } from '@/app/api/household/route';
import { PATCH as memberPATCH, DELETE as memberDELETE } from '@/app/api/household/members/[id]/route';
import { PATCH as adminTransferPATCH } from '@/app/api/household/admin/route';

// ── Constants ────────────────────────────────────────────────────────────────

const HH_ID = 'hh-001';
const ADMIN_ID = 'user-admin-1';
const PARENT_NON_ADMIN_ID = 'user-parent-2';
const TARGET_MEMBER_ID = 'user-member-1';

const HOUSEHOLD = { id: HH_ID, clerkOrgId: 'org_1', name: 'Smith Family', glyph: '🏡' };

function row(overrides: Partial<{
  id: string;
  clerkUserId: string;
  name: string;
  isAdmin: boolean;
  role: 'keeper' | 'watcher';
}> = {}) {
  return {
    id: overrides.id ?? ADMIN_ID,
    clerkUserId: overrides.clerkUserId ?? 'clerk_admin',
    householdId: HH_ID,
    email: 'u@example.com',
    name: overrides.name ?? 'User',
    role: overrides.role ?? ('keeper' as const),
    villageGroup: 'covey' as const,
    isAdmin: overrides.isAdmin ?? false,
  };
}

function mockAdminGateOk(user: ReturnType<typeof row>) {
  vi.mocked(requireHouseholdAdmin).mockResolvedValue({
    household: HOUSEHOLD,
    user,
    userId: user.clerkUserId,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);
}

function mockAdminGateRejects(err: Error) {
  vi.mocked(requireHouseholdAdmin).mockRejectedValue(err);
}

// ── Drizzle chain stubs ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeUpdateChain(returningRows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(returningRows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t;
  chain['where'] = t;
  chain['limit'] = t;
  chain['orderBy'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['where'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(undefined); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeTxRunner(stubs: { selects: Row[][]; updates: Row[][] }) {
  let s = 0; let u = 0;
  return {
    select: vi.fn(() => makeSelectChain(stubs.selects[s++] ?? [])),
    update: vi.fn(() => makeUpdateChain(stubs.updates[u++] ?? [])),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof householdPATCH>[0];
}

function ctxWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Unit test: requireHouseholdAdmin gate logic ──────────────────────────────
//
// requireHouseholdAdmin calls requireHousehold via closure, so mocking the
// requireHousehold *export* doesn't intercept the in-module call. Instead,
// stub the real dependencies (auth() and db.select) and let the real
// requireHousehold + requireHouseholdAdmin both run end-to-end.

describe('requireHouseholdAdmin (gate logic — real implementation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function stageRealHouseholdResolution(user: ReturnType<typeof row>) {
    vi.mocked(auth).mockResolvedValue({
      userId: user.clerkUserId,
      orgId: 'org_1',
    } as unknown as Awaited<ReturnType<typeof auth>>);
    // requireHousehold calls db.select twice in the happy path: households
    // lookup, then users lookup. Stage both.
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return makeSelectChain([HOUSEHOLD]) as unknown as ReturnType<typeof db.select>;
      return makeSelectChain([user]) as unknown as ReturnType<typeof db.select>;
    });
  }

  it('admin caller → returns ctx', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
    stageRealHouseholdResolution(row({ id: ADMIN_ID, isAdmin: true, role: 'keeper' }));
    const ctx = await actual.requireHouseholdAdmin();
    expect(ctx.user.id).toBe(ADMIN_ID);
    expect(ctx.user.isAdmin).toBe(true);
  });

  it('parent without isAdmin → throws NotAdminError', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
    stageRealHouseholdResolution(row({ id: PARENT_NON_ADMIN_ID, isAdmin: false, role: 'keeper' }));
    await expect(actual.requireHouseholdAdmin()).rejects.toBeInstanceOf(NotAdminError);
  });

  it('caregiver → throws NotAdminError', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
    stageRealHouseholdResolution(row({ id: 'user-cg', isAdmin: false, role: 'watcher' }));
    await expect(actual.requireHouseholdAdmin()).rejects.toBeInstanceOf(NotAdminError);
  });

  it('unauthenticated → propagates "Not signed in"', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
    vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(actual.requireHouseholdAdmin()).rejects.toThrow('Not signed in');
  });

  it('no active household → propagates "No active household"', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_x', orgId: null } as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(actual.requireHouseholdAdmin()).rejects.toThrow('No active household');
  });
});

// ── Route matrix: every admin-gated route honors the gate ────────────────────
//
// Each route is asserted against the same matrix:
// - admin → 200 (route runs to completion against staged db)
// - parent without isAdmin → 403 { error: 'no_access' }
// - unauthenticated → 401 { error: 'not_signed_in' }
// - non-member (no active household) → 409 { error: 'no_household' }
//
// The 403 path is the L4 finding the audit closes.

describe('PATCH /api/household — admin authority matrix', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin → 200', async () => {
    mockAdminGateOk(row({ id: ADMIN_ID, isAdmin: true, role: 'keeper' }));
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([
      { ...HOUSEHOLD, name: 'Renamed' },
    ]) as unknown as ReturnType<typeof db.update>);
    vi.mocked(auth).mockResolvedValue({ orgId: null } as unknown as Awaited<ReturnType<typeof auth>>);
    const res = await householdPATCH(jsonReq({ name: 'Renamed' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.household.name).toBe('Renamed');
  });

  it('parent without isAdmin → 403 no_access', async () => {
    mockAdminGateRejects(new NotAdminError());
    const res = await householdPATCH(jsonReq({ name: 'X' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no_access' });
  });

  it('unauthenticated → 401 not_signed_in', async () => {
    mockAdminGateRejects(new Error('Not signed in'));
    const res = await householdPATCH(jsonReq({ name: 'X' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_signed_in' });
  });

  it('non-member (no active household) → 409 no_household', async () => {
    mockAdminGateRejects(new Error('No active household'));
    const res = await householdPATCH(jsonReq({ name: 'X' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'no_household' });
  });
});

describe('PATCH /api/household/members/[id] — admin authority matrix', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin → 200', async () => {
    mockAdminGateOk(row({ id: ADMIN_ID, isAdmin: true, role: 'keeper' }));
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([
      { id: TARGET_MEMBER_ID, role: 'watcher', villageGroup: 'field' },
    ]) as unknown as ReturnType<typeof db.update>);
    const res = await memberPATCH(
      jsonReq({ role: 'watcher' }),
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.id).toBe(TARGET_MEMBER_ID);
  });

  it('parent without isAdmin → 403 no_access', async () => {
    mockAdminGateRejects(new NotAdminError());
    const res = await memberPATCH(
      jsonReq({ role: 'watcher' }),
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no_access' });
  });

  it('unauthenticated → 401 not_signed_in', async () => {
    mockAdminGateRejects(new Error('Not signed in'));
    const res = await memberPATCH(
      jsonReq({ role: 'watcher' }),
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_signed_in' });
  });

  it('non-member → 409 no_household', async () => {
    mockAdminGateRejects(new Error('No active household'));
    const res = await memberPATCH(
      jsonReq({ role: 'watcher' }),
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'no_household' });
  });
});

describe('DELETE /api/household/members/[id] — admin authority matrix', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin → 200', async () => {
    mockAdminGateOk(row({ id: ADMIN_ID, isAdmin: true, role: 'keeper' }));
    vi.mocked(db.select).mockReturnValue(makeSelectChain([
      { id: TARGET_MEMBER_ID, householdId: HH_ID, clerkUserId: 'clerk_target' },
    ]) as unknown as ReturnType<typeof db.select>);
    vi.mocked(db.delete).mockReturnValue(makeDeleteChain() as unknown as ReturnType<typeof db.delete>);
    // Post-B3 the route calls tombstoneUser (which uses db.transaction). Stub
    // it to invoke the callback so the route reaches the Clerk-drop block.
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough
      return cb({
        select: db.select, update: db.update, delete: db.delete,
        insert: db.insert, $count: db.$count,
      });
    });
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain() as unknown as ReturnType<typeof db.update>,
    );
    vi.mocked(db.$count).mockResolvedValue(0);
    // Authority matrix doesn't assert Clerk specifically; let it succeed so the
    // happy-path response shape is { ok: true, clerkDropped: true }.
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: {
        getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: [] }),
        deleteOrganizationMembership: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);

    const res = await memberDELETE(
      {} as Parameters<typeof memberDELETE>[0],
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, clerkDropped: true });
  });

  it('parent without isAdmin → 403 no_access', async () => {
    mockAdminGateRejects(new NotAdminError());
    const res = await memberDELETE(
      {} as Parameters<typeof memberDELETE>[0],
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no_access' });
    // Critical: the gate must reject before the route reaches db.delete.
    expect(vi.mocked(db.delete)).not.toHaveBeenCalled();
  });

  it('unauthenticated → 401 not_signed_in', async () => {
    mockAdminGateRejects(new Error('Not signed in'));
    const res = await memberDELETE(
      {} as Parameters<typeof memberDELETE>[0],
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_signed_in' });
  });

  it('non-member → 409 no_household', async () => {
    mockAdminGateRejects(new Error('No active household'));
    const res = await memberDELETE(
      {} as Parameters<typeof memberDELETE>[0],
      ctxWithId(TARGET_MEMBER_ID),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'no_household' });
  });
});

describe('PATCH /api/household/admin (admin transfer) — gate matrix', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('parent without isAdmin → 403 no_access (gate fires before tx)', async () => {
    mockAdminGateRejects(new NotAdminError());
    const res = await adminTransferPATCH(jsonReq({ targetUserId: TARGET_MEMBER_ID }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no_access' });
    // Critical anchor: gate prevents the route from even opening a transaction.
    expect(vi.mocked(db.transaction)).not.toHaveBeenCalled();
  });

  it('admin → 200 (transfer succeeds via existing tx path)', async () => {
    mockAdminGateOk(row({ id: ADMIN_ID, isAdmin: true, role: 'keeper' }));
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = makeTxRunner({
        selects: [
          [{ id: ADMIN_ID, isAdmin: true }],
          [{
            id: TARGET_MEMBER_ID,
            clerkUserId: 'clerk_target',
            householdId: HH_ID,
            name: 'Bob',
            isAdmin: false,
          }],
        ],
        updates: [
          [],
          [{ id: TARGET_MEMBER_ID, name: 'Bob', isAdmin: true }],
        ],
      });
      return cb(tx);
    });
    const res = await adminTransferPATCH(jsonReq({ targetUserId: TARGET_MEMBER_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newAdmin.id).toBe(TARGET_MEMBER_ID);
  });
});
