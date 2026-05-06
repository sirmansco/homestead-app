import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// C2 regression: manual escalation must apply both per-user (5/min) and
// per-lantern (1/min) rate limits BEFORE any DB read or escalation work.
// Falsifiability: removing either rateLimit call from the route turns the
// matching assertion red.

const { mockSelect, mockEscalateLantern, mockRateLimit, mockRateLimitResponse } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockEscalateLantern = vi.fn().mockResolvedValue(undefined);
  const mockRateLimit = vi.fn().mockReturnValue({ allowed: true });
  const mockRateLimitResponse = vi.fn().mockReturnValue(null);
  return { mockSelect, mockEscalateLantern, mockRateLimit, mockRateLimitResponse };
});

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn(),
}));

vi.mock('@/lib/lantern-escalation', () => ({
  escalateLantern: mockEscalateLantern,
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: mockRateLimit,
  rateLimitResponse: mockRateLimitResponse,
  clientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { POST } from '@/app/api/lantern/[id]/escalate/route';
import { requireHousehold } from '@/lib/auth/household';

const LANTERN_ID = '00000000-0000-4000-a000-000000000001';
const HOUSEHOLD_ID = '00000000-0000-4000-a000-000000000002';
const USER_ID = '00000000-0000-4000-a000-000000000003';

const householdAuth = {
  household: { id: HOUSEHOLD_ID },
  user: { id: USER_ID, role: 'keeper' },
};

const lanternRow = {
  id: LANTERN_ID,
  householdId: HOUSEHOLD_ID,
  status: 'ringing',
  escalatedAt: null,
};

function chainResolving(rows: unknown[]) {
  const c = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  c.from.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  return c;
}

const makeRequest = () =>
  new NextRequest(`http://localhost/api/lantern/${LANTERN_ID}/escalate`, { method: 'POST' });
const ctx = { params: Promise.resolve({ id: LANTERN_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireHousehold).mockResolvedValue(householdAuth as Awaited<ReturnType<typeof requireHousehold>>);
  mockRateLimit.mockReturnValue({ allowed: true });
  mockRateLimitResponse.mockReturnValue(null);
  mockSelect.mockReturnValue(chainResolving([lanternRow]));
  mockEscalateLantern.mockResolvedValue(undefined);
});

describe('POST /api/lantern/[id]/escalate — C2 rate limits', () => {
  it('calls rateLimit with the per-user key keyed on user.id (5/min)', async () => {
    await POST(makeRequest(), ctx);

    const userCall = mockRateLimit.mock.calls.find(c => typeof c[0] === 'object' && c[0] !== null && (c[0] as Record<string, unknown>).key === `lantern-escalate:user:${USER_ID}`);
    expect(userCall, 'must call rateLimit with per-user key').toBeTruthy();
    expect((userCall![0] as Record<string, unknown>).limit).toBe(5);
    expect((userCall![0] as Record<string, unknown>).windowMs).toBe(60_000);
  });

  it('calls rateLimit with the per-lantern key keyed on lanternId (1/min)', async () => {
    await POST(makeRequest(), ctx);

    const lanternCall = mockRateLimit.mock.calls.find(c => typeof c[0] === 'object' && c[0] !== null && (c[0] as Record<string, unknown>).key === `lantern-escalate:lantern:${LANTERN_ID}`);
    expect(lanternCall, 'must call rateLimit with per-lantern key').toBeTruthy();
    expect((lanternCall![0] as Record<string, unknown>).limit).toBe(1);
    expect((lanternCall![0] as Record<string, unknown>).windowMs).toBe(60_000);
  });

  it('returns 429 (does NOT escalate) when per-user rate limit fires', async () => {
    const limitedResponse = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    // First rateLimit call (per-user) → blocked.
    mockRateLimitResponse.mockImplementationOnce(() => limitedResponse).mockImplementation(() => null);

    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(429);
    expect(mockEscalateLantern).not.toHaveBeenCalled();
  });

  it('returns 429 (does NOT escalate) when per-lantern rate limit fires after per-user passes', async () => {
    const limitedResponse = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    // First call (per-user) passes; second (per-lantern) blocks.
    mockRateLimitResponse
      .mockImplementationOnce(() => null)
      .mockImplementationOnce(() => limitedResponse);

    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(429);
    expect(mockEscalateLantern).not.toHaveBeenCalled();
  });

  it('rate-limit gates fire BEFORE the DB lookup (no select on blocked requests)', async () => {
    const limitedResponse = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    mockRateLimitResponse.mockImplementationOnce(() => limitedResponse);

    await POST(makeRequest(), ctx);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('happy path: both gates pass, escalateLantern is called', async () => {
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(200);
    expect(mockEscalateLantern).toHaveBeenCalledWith(LANTERN_ID);
  });
});

