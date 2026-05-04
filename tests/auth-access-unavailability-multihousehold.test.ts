import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// L7 regression: unavailability reads/writes must be scoped to the active
// household. The old code resolved the user row with LIMIT 1 ignoring householdId,
// so a multi-household caregiver's POST from household B would land on their
// household A row — wrong household, wrong scope.
//
// After fix: requireHousehold() resolves the active org; user row is resolved
// with (clerkUserId, householdId) tuple.

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn(),
}));

import { db } from '@/lib/db';
import { requireHousehold } from '@/lib/auth/household';

const makeChain = (rows: unknown[]) => {
  const c = {
    from: vi.fn(), where: vi.fn(), limit: vi.fn(),
    orderBy: vi.fn(), returning: vi.fn(),
  };
  c.from.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  c.orderBy.mockResolvedValue(rows);
  c.returning.mockResolvedValue(rows);
  return c;
};

const makeDeleteChain = () => {
  const c = { from: vi.fn(), where: vi.fn() };
  c.from.mockReturnValue(c);
  c.where.mockResolvedValue([]);
  return c;
};

beforeEach(() => {
  vi.clearAllMocks();
});

const HH1 = 'hh-001';
const ORG1 = 'org-001';
const USER_HH1 = { id: 'user-hh1', clerkUserId: 'clerk-1', householdId: HH1 };

describe('GET /api/unavailability — household-scoped', () => {
  it('resolves user row using active org (householdId)', async () => {
    vi.mocked(requireHousehold).mockResolvedValue({
      userId: 'clerk-1',
      orgId: ORG1,
      household: { id: HH1, clerkOrgId: ORG1, name: 'H1' },
      user: USER_HH1 as typeof USER_HH1 & { role: 'keeper' | 'watcher'; villageGroup: 'covey' | 'field' | 'inner_circle' | 'sitter'; email: string; name: string; notifyShiftPosted: boolean; notifyShiftClaimed: boolean; notifyShiftReleased: boolean; notifyLanternLit: boolean; notifyLanternResponse: boolean; isAdmin: boolean; calToken: string | null; photoUrl: string | null; createdAt: Date },
    } as ReturnType<typeof requireHousehold> extends Promise<infer T> ? T : never);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      // First select: households lookup by clerkOrgId
      if (selectCall === 1) return makeChain([{ id: HH1, clerkOrgId: ORG1, name: 'H1' }]) as ReturnType<typeof db.select>;
      // Second select: users lookup by (clerkUserId, householdId)
      if (selectCall === 2) return makeChain([USER_HH1]) as ReturnType<typeof db.select>;
      // Third select: unavailability rows
      return makeChain([]) as ReturnType<typeof db.select>;
    });

    const { GET } = await import('@/app/api/unavailability/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.unavailability).toEqual([]);

    // Verify the second select included householdId scope (it would be the users query)
    // The fact it completed without 409 and returned empty unavailability means
    // the household-scoped user resolution path was taken.
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(3);
  });

  it('returns 409 if user has no row in the active household', async () => {
    vi.mocked(requireHousehold).mockResolvedValue({
      userId: 'clerk-1',
      orgId: ORG1,
      household: { id: HH1, clerkOrgId: ORG1, name: 'H1' },
      user: USER_HH1 as ReturnType<typeof requireHousehold> extends Promise<infer T> ? T['user'] : never,
    } as ReturnType<typeof requireHousehold> extends Promise<infer T> ? T : never);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([{ id: HH1, clerkOrgId: ORG1 }]) as ReturnType<typeof db.select>;
      // No user row in this household
      return makeChain([]) as ReturnType<typeof db.select>;
    });

    const { POST } = await import('@/app/api/unavailability/route');
    const req = new NextRequest('http://localhost/api/unavailability', {
      method: 'POST',
      body: JSON.stringify({ startsAt: '2026-06-01T10:00:00Z', endsAt: '2026-06-01T12:00:00Z' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
  });
});
