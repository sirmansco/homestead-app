import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifyShiftReleased: vi.fn().mockResolvedValue(undefined),
  notifyNewShift: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/household';
import { notifyShiftReleased, notifyNewShift } from '@/lib/notify';

const SHIFT_ID = '00000000-0000-4000-a000-000000000001';
const CLAIMER_ID = '00000000-0000-4000-a000-000000000003';

const makeChain = (rows: unknown[]) => {
  const c = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), returning: vi.fn(), set: vi.fn() };
  c.from.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  c.returning.mockResolvedValue(rows);
  c.set.mockReturnValue(c);
  return c;
};

const makeRequest = (body?: unknown) =>
  new NextRequest(`http://localhost/api/whistles/${SHIFT_ID}/unclaim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const claimedShift = {
  id: SHIFT_ID,
  householdId: '00000000-0000-4000-a000-000000000002',
  status: 'claimed' as const,
  claimedByUserId: CLAIMER_ID,
  releasedAt: null,
  preferredCaregiverId: null,
  title: 'Test Shift',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/whistles/[id]/unclaim', () => {
  it('returns 200 and forwards reason to notifyShiftReleased', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-claimer' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([claimedShift]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CLAIMER_ID, clerkUserId: 'clerk-claimer' }]) as ReturnType<typeof db.select>;
    });

    const releasedShift = { ...claimedShift, status: 'open' as const, claimedByUserId: null, releasedAt: new Date() };
    vi.mocked(db.update).mockReturnValue(makeChain([releasedShift]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    const res = await POST(makeRequest({ reason: 'something came up' }), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(200);
    expect(vi.mocked(notifyShiftReleased)).toHaveBeenCalledWith(SHIFT_ID, CLAIMER_ID, 'something came up');
  });

  it('forwards null reason when body has no reason', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-claimer' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([claimedShift]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CLAIMER_ID, clerkUserId: 'clerk-claimer' }]) as ReturnType<typeof db.select>;
    });

    vi.mocked(db.update).mockReturnValue(makeChain([{ ...claimedShift, status: 'open' }]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(200);
    expect(vi.mocked(notifyShiftReleased)).toHaveBeenCalledWith(SHIFT_ID, CLAIMER_ID, null);
  });

  it('does NOT fan out to the watcher pool on unclaim (notifyNewShift never called)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-claimer' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([claimedShift]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CLAIMER_ID, clerkUserId: 'clerk-claimer' }]) as ReturnType<typeof db.select>;
    });

    vi.mocked(db.update).mockReturnValue(makeChain([{ ...claimedShift, status: 'open' }]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    await POST(makeRequest({}), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(vi.mocked(notifyNewShift)).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not the claimer', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-other' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([claimedShift]) as ReturnType<typeof db.select>;
      // Claimer row's clerkUserId does NOT match the caller
      return makeChain([{ id: CLAIMER_ID, clerkUserId: 'clerk-claimer' }]) as ReturnType<typeof db.select>;
    });

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyShiftReleased)).not.toHaveBeenCalled();
  });

  it('returns 409 when the shift is not currently claimed', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-claimer' });

    const openShift = { ...claimedShift, status: 'open' as const, claimedByUserId: null };
    vi.mocked(db.select).mockReturnValue(makeChain([openShift]) as ReturnType<typeof db.select>);

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(409);
  });

  it('returns 404 when the shift does not exist', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-claimer' });
    vi.mocked(db.select).mockReturnValue(makeChain([]) as ReturnType<typeof db.select>);

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(404);
  });

  it('atomic update sets released_at via sql`now()`', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-claimer' });

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([claimedShift]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CLAIMER_ID, clerkUserId: 'clerk-claimer' }]) as ReturnType<typeof db.select>;
    });

    const updateChain = makeChain([{ ...claimedShift, status: 'open', claimedByUserId: null, releasedAt: new Date() }]);
    vi.mocked(db.update).mockReturnValue(updateChain as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/unclaim/route');
    await POST(makeRequest({}), { params: Promise.resolve({ id: SHIFT_ID }) });

    // Verify the .set() call included status, claimedByUserId, claimedAt, releasedAt keys
    expect(updateChain.set).toHaveBeenCalled();
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).toHaveProperty('status', 'open');
    expect(setArg).toHaveProperty('claimedByUserId', null);
    expect(setArg).toHaveProperty('claimedAt', null);
    expect(setArg).toHaveProperty('releasedAt');
  });
});
