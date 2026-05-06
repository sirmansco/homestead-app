import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
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
  notifyNewShift: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser } from '@/lib/auth/household';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { notifyNewShift } from '@/lib/notify';

const SHIFT_ID = '00000000-0000-4000-a000-000000000001';
const HOUSEHOLD_ID = '00000000-0000-4000-a000-000000000002';
const KEEPER_ID = '00000000-0000-4000-a000-000000000003';
const CO_KEEPER_ID = '00000000-0000-4000-a000-000000000004';
const WATCHER_ID = '00000000-0000-4000-a000-000000000005';

const makeChain = (rows: unknown[]) => {
  const c = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), returning: vi.fn(), set: vi.fn() };
  c.from.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  c.returning.mockResolvedValue(rows);
  c.set.mockReturnValue(c);
  return c;
};

const makeRequest = () =>
  new NextRequest(`http://localhost/api/whistles/${SHIFT_ID}/rebroadcast`, { method: 'POST' });

const mockClerk = (orgId: string | null) => ({
  users: {
    getOrganizationMembershipList: vi.fn().mockResolvedValue({
      data: orgId ? [{ organization: { id: orgId } }] : [],
    }),
  },
});

const releasedOpenShift = {
  id: SHIFT_ID,
  householdId: HOUSEHOLD_ID,
  status: 'open' as const,
  claimedByUserId: null,
  releasedAt: new Date('2026-05-06T11:00:00Z'),
  preferredCaregiverId: null,
  title: 'Test Shift',
};

const household = { id: HOUSEHOLD_ID, clerkOrgId: 'org-1', name: 'Test' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 5, resetAt: 0, retryAfterMs: 0 });
  vi.mocked(rateLimitResponse).mockReturnValue(null);
});

describe('POST /api/whistles/[id]/rebroadcast', () => {
  it('returns 200 when the original keeper rebroadcasts a released open whistle', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-keeper' });
    vi.mocked(clerkClient).mockResolvedValue(mockClerk('org-1') as never);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([releasedOpenShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: KEEPER_ID, clerkUserId: 'clerk-keeper', householdId: HOUSEHOLD_ID, role: 'keeper' }]) as ReturnType<typeof db.select>;
    });

    const updated = { ...releasedOpenShift, releasedAt: null };
    vi.mocked(db.update).mockReturnValue(makeChain([updated]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(200);
    expect(vi.mocked(notifyNewShift)).toHaveBeenCalledWith(SHIFT_ID, undefined);
  });

  it('returns 200 when a co-keeper (not the original creator) rebroadcasts', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-co-keeper' });
    vi.mocked(clerkClient).mockResolvedValue(mockClerk('org-1') as never);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([releasedOpenShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: CO_KEEPER_ID, clerkUserId: 'clerk-co-keeper', householdId: HOUSEHOLD_ID, role: 'keeper' }]) as ReturnType<typeof db.select>;
    });

    vi.mocked(db.update).mockReturnValue(makeChain([{ ...releasedOpenShift, releasedAt: null }]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(200);
  });

  it('returns 403 when caller is a watcher (not a keeper)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-watcher' });
    vi.mocked(clerkClient).mockResolvedValue(mockClerk('org-1') as never);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([releasedOpenShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: WATCHER_ID, clerkUserId: 'clerk-watcher', householdId: HOUSEHOLD_ID, role: 'watcher' }]) as ReturnType<typeof db.select>;
    });

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyNewShift)).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not in the shift household clerk org', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-outsider' });
    vi.mocked(clerkClient).mockResolvedValue(mockClerk('org-2') as never);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([releasedOpenShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([]) as ReturnType<typeof db.select>;
    });

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('returns 409 when the whistle is currently claimed (atomic gate blocks update)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-keeper' });
    vi.mocked(clerkClient).mockResolvedValue(mockClerk('org-1') as never);

    const claimedShift = { ...releasedOpenShift, status: 'claimed' as const, claimedByUserId: WATCHER_ID, releasedAt: null };

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([claimedShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: KEEPER_ID, clerkUserId: 'clerk-keeper', householdId: HOUSEHOLD_ID, role: 'keeper' }]) as ReturnType<typeof db.select>;
    });

    // Atomic gate fails: WHERE status='open' AND released_at IS NOT NULL → 0 rows
    vi.mocked(db.update).mockReturnValue(makeChain([]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(409);
    expect(vi.mocked(notifyNewShift)).not.toHaveBeenCalled();
  });

  it('returns 409 when the whistle is open but was never released (released_at IS NULL)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-keeper' });
    vi.mocked(clerkClient).mockResolvedValue(mockClerk('org-1') as never);

    const freshOpenShift = { ...releasedOpenShift, releasedAt: null };

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeChain([freshOpenShift]) as ReturnType<typeof db.select>;
      if (selectCall === 2) return makeChain([household]) as ReturnType<typeof db.select>;
      return makeChain([{ id: KEEPER_ID, clerkUserId: 'clerk-keeper', householdId: HOUSEHOLD_ID, role: 'keeper' }]) as ReturnType<typeof db.select>;
    });

    // Atomic gate fails because released_at IS NOT NULL is false
    vi.mocked(db.update).mockReturnValue(makeChain([]) as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(409);
    expect(vi.mocked(notifyNewShift)).not.toHaveBeenCalled();
  });

  it('returns 429 when rate-limited', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-keeper' });
    vi.mocked(rateLimitResponse).mockReturnValue(
      new Response(JSON.stringify({ error: 'too many requests' }), { status: 429 }) as never
    );

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(429);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it('returns 404 when the whistle does not exist', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-keeper' });

    vi.mocked(db.select).mockReturnValue(makeChain([]) as ReturnType<typeof db.select>);

    const { POST } = await import('@/app/api/whistles/[id]/rebroadcast/route');
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SHIFT_ID }) });

    expect(res.status).toBe(404);
  });
});
