import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before route imports ──────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
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
  };
});

vi.mock('@/lib/users/tombstone', () => ({
  tombstoneUser: vi.fn().mockResolvedValue('deleted'),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    organizations: {
      getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: [] }),
      deleteOrganizationMembership: vi.fn().mockResolvedValue({}),
    },
  }),
}));

import { requireHousehold, requireHouseholdAdmin } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { POST as leavePost } from '@/app/api/circle/leave/route';
import { DELETE as memberDelete } from '@/app/api/household/members/[id]/route';

// ── Constants ────────────────────────────────────────────────────────────────

const HH_ID = 'hh-001';

const HOUSEHOLD = { id: HH_ID, clerkOrgId: 'org_1', name: 'Test Family' };

function user(overrides: { id?: string; isAdmin?: boolean } = {}) {
  return {
    id: overrides.id ?? 'user-1',
    clerkUserId: 'clerk_1',
    householdId: HH_ID,
    email: 'u@example.com',
    name: 'User',
    role: 'keeper' as const,
    villageGroup: 'covey' as const,
    isAdmin: overrides.isAdmin ?? false,
  };
}

function mockLeaveGate(u: ReturnType<typeof user>) {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: HOUSEHOLD,
    user: u,
    userId: u.clerkUserId,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function mockMemberDeleteGate(callerUser: ReturnType<typeof user>) {
  vi.mocked(requireHouseholdAdmin).mockResolvedValue({
    household: HOUSEHOLD,
    user: callerUser,
    userId: callerUser.clerkUserId,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);
}

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t;
  chain['where'] = t;
  chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain(rows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function ctxWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── POST /api/circle/leave — last-admin guard ─────────────────────────────────

describe('POST /api/circle/leave — last-admin guard (F-P2-H)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sole admin → 409 last_admin', async () => {
    mockLeaveGate(user({ id: 'admin-1', isAdmin: true }));
    vi.mocked(db.$count).mockResolvedValue(1);

    const res = await leavePost();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('last_admin');
    expect(vi.mocked(db.$count)).toHaveBeenCalledOnce();
  });

  it('one of two admins → 200 (not blocked)', async () => {
    mockLeaveGate(user({ id: 'admin-1', isAdmin: true }));
    vi.mocked(db.$count).mockResolvedValue(2);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);

    const res = await leavePost();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('non-admin → 200 (not blocked, $count not called for non-admin)', async () => {
    mockLeaveGate(user({ id: 'watcher-1', isAdmin: false }));

    const res = await leavePost();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ── DELETE /api/household/members/[id] — last-admin guard ─────────────────────

describe('DELETE /api/household/members/[id] — last-admin guard (F-P2-I)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const CALLER_ID = 'caller-admin';
  const TARGET_ID = 'target-admin';

  it('targeting sole admin → 409 last_admin', async () => {
    mockMemberDeleteGate(user({ id: CALLER_ID, isAdmin: true }));
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([user({ id: TARGET_ID, isAdmin: true })]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.$count).mockResolvedValue(1);

    const res = await memberDelete(
      {} as Parameters<typeof memberDelete>[0],
      ctxWithId(TARGET_ID),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('last_admin');
  });

  it('targeting one of two admins → 200', async () => {
    mockMemberDeleteGate(user({ id: CALLER_ID, isAdmin: true }));
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([user({ id: TARGET_ID, isAdmin: true })]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.$count).mockResolvedValue(2);
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      return (cb as (tx: unknown) => Promise<unknown>)({
        select: db.select, update: db.update, delete: db.delete,
        insert: vi.fn(), $count: db.$count,
      });
    });
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);

    const res = await memberDelete(
      {} as Parameters<typeof memberDelete>[0],
      ctxWithId(TARGET_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('targeting non-admin → 200 ($count not called for non-admin target)', async () => {
    mockMemberDeleteGate(user({ id: CALLER_ID, isAdmin: true }));
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([user({ id: TARGET_ID, isAdmin: false })]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      return (cb as (tx: unknown) => Promise<unknown>)({
        select: db.select, update: db.update, delete: db.delete,
        insert: vi.fn(), $count: db.$count,
      });
    });
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);

    const res = await memberDelete(
      {} as Parameters<typeof memberDelete>[0],
      ctxWithId(TARGET_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(vi.mocked(db.$count)).not.toHaveBeenCalled();
  });
});
