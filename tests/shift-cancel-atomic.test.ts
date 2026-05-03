import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before route imports ──────────────────────────────

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
  };
});

vi.mock('@/lib/notify', () => ({
  notifyShiftCancelled: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/copy', () => ({
  getCopy: vi.fn().mockReturnValue({
    request: { newLabel: 'New Request' },
  }),
}));

vi.mock('@/lib/validate/uuid', () => ({
  requireUUID: vi.fn((id: string) => id),
}));

import { requireHousehold } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { POST as cancelPost } from '@/app/api/whistles/[id]/cancel/route';

// ── Constants ────────────────────────────────────────────────────────────────

const HH_ID = 'hh-001';
const SHIFT_ID = 'shift-uuid-1';
const USER_ID = 'user-keeper-1';
const CLAIMER_ID = 'user-watcher-1';

const HOUSEHOLD = { id: HH_ID, clerkOrgId: 'org_1' };

function mockGate(overrides: { householdId?: string; role?: 'keeper' | 'watcher' } = {}) {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { ...HOUSEHOLD, id: overrides.householdId ?? HH_ID },
    user: {
      id: USER_ID,
      clerkUserId: 'clerk_1',
      householdId: HH_ID,
      role: overrides.role ?? 'keeper',
      isAdmin: false,
    },
    userId: 'clerk_1',
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
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

function makeReq(id: string) {
  return {
    nextUrl: { pathname: `/api/whistles/${id}/cancel` },
  } as unknown as Parameters<typeof cancelPost>[0];
}

function ctxWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/whistles/[id]/cancel — atomic status predicate (F-P1-E)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('open shift → 200, status becomes cancelled', async () => {
    mockGate();
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{
        id: SHIFT_ID, householdId: HH_ID, status: 'open',
        createdByUserId: USER_ID, claimedByUserId: null,
      }]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([{ id: SHIFT_ID, status: 'cancelled', householdId: HH_ID }]) as unknown as ReturnType<typeof db.update>,
    );

    const res = await cancelPost(makeReq(SHIFT_ID), ctxWithId(SHIFT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shift.status).toBe('cancelled');
  });

  it('already cancelled shift → 409 already cancelled (early-exit guard)', async () => {
    mockGate();
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{
        id: SHIFT_ID, householdId: HH_ID, status: 'cancelled',
        createdByUserId: USER_ID, claimedByUserId: null,
      }]) as unknown as ReturnType<typeof db.select>,
    );

    const res = await cancelPost(makeReq(SHIFT_ID), ctxWithId(SHIFT_ID));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('already cancelled');
    // Confirm the UPDATE was never reached
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('UPDATE returns 0 rows (status predicate mismatch) → 500 cancel failed', async () => {
    mockGate();
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{
        id: SHIFT_ID, householdId: HH_ID, status: 'open',
        createdByUserId: USER_ID, claimedByUserId: null,
      }]) as unknown as ReturnType<typeof db.select>,
    );
    // Simulate the status having changed between SELECT and UPDATE (e.g. claimed)
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([]) as unknown as ReturnType<typeof db.update>,
    );

    const res = await cancelPost(makeReq(SHIFT_ID), ctxWithId(SHIFT_ID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('cancel failed');
  });

  it('cross-household shift → 403', async () => {
    mockGate({ householdId: 'other-hh' });
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{
        id: SHIFT_ID, householdId: HH_ID, status: 'open',
        createdByUserId: USER_ID, claimedByUserId: null,
      }]) as unknown as ReturnType<typeof db.select>,
    );

    const res = await cancelPost(makeReq(SHIFT_ID), ctxWithId(SHIFT_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no_access');
  });

  it('claimed shift cancel → notifies claimer', async () => {
    const { notifyShiftCancelled } = await import('@/lib/notify');
    mockGate();
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{
        id: SHIFT_ID, householdId: HH_ID, status: 'open',
        createdByUserId: USER_ID, claimedByUserId: CLAIMER_ID,
      }]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([{ id: SHIFT_ID, status: 'cancelled', householdId: HH_ID }]) as unknown as ReturnType<typeof db.update>,
    );

    await cancelPost(makeReq(SHIFT_ID), ctxWithId(SHIFT_ID));
    expect(notifyShiftCancelled).toHaveBeenCalledWith(SHIFT_ID, CLAIMER_ID);
  });
});
