import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
//
// We mock `@/lib/auth/household` to fail loudly. The whole point of B4 is that
// IP rate-limiting fires BEFORE the auth helpers — so for a flood from a
// single IP we should never reach requireHousehold/requireUser/etc.
// If the tests under "rate limit fires" ever invoke these mocks, the route is
// broken (rate limit is in the wrong order).

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn(),
  requireHouseholdAdmin: vi.fn(),
  requireUser: vi.fn(),
}));

// Clerk client must NEVER be called when the IP rate limit fires. That is the
// explicit B4 invariant: the flood must not amplify into Clerk quota burn.
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@/lib/notify', () => ({
  notifyNewShift: vi.fn().mockResolvedValue({ ok: true }),
  notifyBellRing: vi.fn().mockResolvedValue({ ok: true }),
}));

// ── Imports under test ──────────────────────────────────────────────────────

import { POST as whistlesPost } from '@/app/api/whistles/route';
import { POST as lanternPost } from '@/app/api/lantern/route';
import { POST as circleInvitePost } from '@/app/api/circle/invite/route';
import { requireHousehold, requireHouseholdAdmin } from '@/lib/auth/household';
import { clerkClient } from '@clerk/nextjs/server';

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildReq(opts: { ip: string; body?: unknown; url?: string }) {
  const headers = new Map<string, string>([
    ['x-forwarded-for', opts.ip],
  ]);
  return {
    url: opts.url ?? 'http://localhost/api/test',
    nextUrl: new URL(opts.url ?? 'http://localhost/api/test'),
    headers: { get: (k: string) => headers.get(k) ?? null },
    json: async () => opts.body ?? {},
  } as unknown as Parameters<typeof whistlesPost>[0];
}

// Drives a single endpoint POST handler N times from the same IP and reports
// counts. Returns { firstStatus, statuses, requireCalled, clerkCalled }.
async function flood(
  handler: (req: ReturnType<typeof buildReq>) => Promise<{ status: number }>,
  ip: string,
  count: number,
) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await handler(buildReq({ ip }));
    statuses.push(res.status);
  }
  return statuses;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Make every auth helper throw so that if the rate limit DOESN'T fire and the
  // route falls through to the auth call, we observe a 500/throw — not a quiet
  // pass. This is the falsifiability lever.
  vi.mocked(requireHousehold).mockRejectedValue(new Error('Not signed in'));
  vi.mocked(requireHouseholdAdmin).mockRejectedValue(new Error('Not signed in'));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('B4 — IP rate limit fires BEFORE Clerk on POST /api/whistles', () => {
  it('caps a single-IP flood at the configured limit (30/min) and never calls Clerk', async () => {
    const statuses = await flood(whistlesPost as never, '198.51.100.1', 35);

    // First 30 reach the auth helper (rate limit not yet exceeded). Auth then
    // throws "Not signed in" → routed to authError → 401.
    const inLimit = statuses.slice(0, 30);
    const overLimit = statuses.slice(30);

    expect(inLimit.every(s => s === 401)).toBe(true);
    expect(overLimit.every(s => s === 429)).toBe(true);

    // Auth helper count = 30 (one per request below the limit).
    expect(vi.mocked(requireHousehold)).toHaveBeenCalledTimes(30);
    // Clerk client must never be invoked from this route directly — it's
    // reached only via auth helpers. Confirms the IP gate is the correct
    // upstream guard.
    expect(vi.mocked(clerkClient)).not.toHaveBeenCalled();
  });
});

describe('B4 — IP rate limit fires BEFORE Clerk on POST /api/lantern', () => {
  it('caps a single-IP flood at 20/min and never calls Clerk', async () => {
    const statuses = await flood(lanternPost as never, '198.51.100.2', 25);

    const inLimit = statuses.slice(0, 20);
    const overLimit = statuses.slice(20);

    expect(inLimit.every(s => s === 401)).toBe(true);
    expect(overLimit.every(s => s === 429)).toBe(true);

    expect(vi.mocked(requireHousehold)).toHaveBeenCalledTimes(20);
    expect(vi.mocked(clerkClient)).not.toHaveBeenCalled();
  });
});

describe('B4 — IP rate limit fires BEFORE Clerk on POST /api/circle/invite', () => {
  it('caps a single-IP flood at 30/min and never calls Clerk', async () => {
    const statuses = await flood(circleInvitePost as never, '198.51.100.3', 35);

    const inLimit = statuses.slice(0, 30);
    const overLimit = statuses.slice(30);

    expect(inLimit.every(s => s === 401)).toBe(true);
    expect(overLimit.every(s => s === 429)).toBe(true);

    expect(vi.mocked(requireHouseholdAdmin)).toHaveBeenCalledTimes(30);
    expect(vi.mocked(clerkClient)).not.toHaveBeenCalled();
  });
});

describe('B4 — different IPs get independent buckets', () => {
  it('a flood from IP A does not affect a request from IP B', async () => {
    // First, exhaust IP A's whistles bucket (limit 30).
    await flood(whistlesPost as never, '198.51.100.40', 35);

    vi.clearAllMocks();
    vi.mocked(requireHousehold).mockRejectedValue(new Error('Not signed in'));

    // IP B's first request should still pass the IP gate.
    const res = await whistlesPost(buildReq({ ip: '198.51.100.41' }));
    expect(res.status).toBe(401); // reaches auth helper, which throws
    expect(vi.mocked(requireHousehold)).toHaveBeenCalledTimes(1);
  });
});
