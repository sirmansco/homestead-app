import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// L6 regression: shift claim must reject:
// (a) non-caregiver callers (parents return 403)
// (b) callers who aren't the preferredCaregiverId (if set)

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/auth/household', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/notify', () => ({
  notifyShiftClaimed: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser } from '@/lib/auth/household';

const SHIFT_ID = '00000000-0000-4000-a000-000000000001';
const HOUSEHOLD_ID = '00000000-0000-4000-a000-000000000002';
const CAREGIVER_ID = '00000000-0000-4000-a000-000000000003';
const PARENT_ID = '00000000-0000-4000-a000-000000000004';
const OTHER_CAREGIVER_ID = '00000000-0000-4000-a000-000000000005';

const makeChain = (rows: unknown[]) => {
  const c = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), returning: vi.fn(), set: vi.fn() };
  c.from.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  c.returning.mockResolvedValue(rows);
  c.set.mockReturnValue(c);
  return c;
};

const makeRequest = (shiftId: string) =>
  new NextRequest(`http://localhost/api/whistles/${shiftId}/claim`, { method: 'POST' });

const mockClerk = {
  users: {
    getOrganizationMembershipList: vi.fn().mockResolvedValue({
      data: [{ organization: { id: 'org-1' } }],
    }),
    getUser: vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'c@example.com' },
      firstName: 'C',
      lastName: 'G',
      publicMetadata: {},
    }),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clerkClient).mockResolvedValue(mockClerk as ReturnType<typeof clerkClient> extends Promise<infer T> ? T : never);
});

const shift = {
  id: SHIFT_ID,
  householdId: HOUSEHOLD_ID,
  status: 'open',
  preferredCaregiverId: null,
  title: 'Test Shift',
};

const household = { id: HOUSEHOLD_ID, clerkOrgId: 'org-1', name: 'Test' };

describe('POST /api/whistles/[id]/claim — role gate (L6)', () => {
  it('returns 403 when caller is a parent (not caregiver)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-parent' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([shift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      // User row: role = 'keeper'
      return makeChain([{ id: PARENT_ID, clerkUserId: 'clerk-parent', householdId: HOUSEHOLD_ID, role: 'keeper', villageGroup: 'covey' }]) as ReturnType<typeof db.select>;
    });

    const { POST } = await import('@/app/api/whistles/[id]/claim/route');
    const res = await POST(makeRequest(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('returns 200 when caller is a caregiver with no preferredCaregiverId set', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-cg' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([shift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CAREGIVER_ID, clerkUserId: 'clerk-cg', householdId: HOUSEHOLD_ID, role: 'watcher', villageGroup: 'field' }]) as ReturnType<typeof db.select>;
    });

    const updateChain = makeChain([{ ...shift, status: 'claimed', claimedByUserId: CAREGIVER_ID }]);
    vi.mocked(db.update).mockReturnValue(updateChain as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/claim/route');
    const res = await POST(makeRequest(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(200);
  });

  it('returns 403 when preferredCaregiverId is set and caller is a different caregiver', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-other-cg' });

    const targetedShift = { ...shift, preferredCaregiverId: CAREGIVER_ID };

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([targetedShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      // Different caregiver
      return makeChain([{ id: OTHER_CAREGIVER_ID, clerkUserId: 'clerk-other-cg', householdId: HOUSEHOLD_ID, role: 'watcher', villageGroup: 'field' }]) as ReturnType<typeof db.select>;
    });

    const { POST } = await import('@/app/api/whistles/[id]/claim/route');
    const res = await POST(makeRequest(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('returns 200 when preferredCaregiverId is set and caller is the targeted caregiver', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-cg' });

    const targetedShift = { ...shift, preferredCaregiverId: CAREGIVER_ID };

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([targetedShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CAREGIVER_ID, clerkUserId: 'clerk-cg', householdId: HOUSEHOLD_ID, role: 'watcher', villageGroup: 'field' }]) as ReturnType<typeof db.select>;
    });

    const updateChain = makeChain([{ ...targetedShift, status: 'claimed', claimedByUserId: CAREGIVER_ID }]);
    vi.mocked(db.update).mockReturnValue(updateChain as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/claim/route');
    const res = await POST(makeRequest(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(200);
  });
});
