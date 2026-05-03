import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks must be declared before the module under test is imported ──────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/bell-escalation', () => ({
  escalateBell: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// ── Import after mocks are wired ─────────────────────────────────────────────

import { GET } from '@/app/api/lantern/cron/route';
import { db } from '@/lib/db';
import { escalateBell } from '@/lib/bell-escalation';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = 'test-cron-secret';

function makeRequest(authHeader: string | null) {
  const headers = new Map<string, string>();
  if (authHeader !== null) headers.set('authorization', authHeader);
  return {
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
  } as Parameters<typeof GET>[0];
}

// Drizzle chain stub: db.select().from().where().limit() resolves to `rows`.
// `limit` is a vi.fn so individual tests can assert it was called with the
// expected bound — the route must apply LIMIT at the SELECT layer, not just
// process whatever the DB returns. Without this assertion, a regression that
// drops `.limit(BATCH_LIMIT)` from the route would still pass any test that
// returns LIMIT rows from the stub.
function makeSelectStub(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain['from']  = () => chain;
  chain['where'] = () => chain;
  chain['limit'] = vi.fn(() => chain);
  chain['then']  = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeBell(id: string) {
  return {
    id,
    householdId: 'hh-1',
    createdByUserId: 'user-1',
    reason: 'Sick kid',
    note: null,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 3_600_000),
    status: 'ringing',
    handledByUserId: null,
    handledAt: null,
    escalatedAt: null,
    createdAt: new Date(Date.now() - 6 * 60_000),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/lantern/cron — auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(401);
    expect(escalateBell).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is wrong', async () => {
    const res = await GET(makeRequest('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(escalateBell).not.toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET env is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest('Bearer anything'));
    expect(res.status).toBe(401);
    expect(escalateBell).not.toHaveBeenCalled();
  });

  it('returns 200 when Bearer matches CRON_SECRET', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub([]));
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/lantern/cron — LIMIT enforcement', () => {
  it('applies .limit(50) at the SELECT layer and processes the bounded batch', async () => {
    // Two halves to this regression test:
    //  1. The route MUST call .limit(50) on the chain — without this, a
    //     regression that drops the bound would still pass any test that
    //     returns 50 rows from the stub.
    //  2. Whatever rows the bounded SELECT returns, the route processes all
    //     of them (no further drop on the application side).
    const bells = Array.from({ length: 50 }, (_, i) => makeBell(`bell-${i}`));
    const stub = makeSelectStub(bells);
    vi.mocked(db.select).mockReturnValueOnce(stub);
    vi.mocked(escalateBell).mockResolvedValue();

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(stub.limit).toHaveBeenCalledWith(50);
    expect(escalateBell).toHaveBeenCalledTimes(50);
    expect(body).toEqual({ processed: 50, failed: 0 });
  });

  it('emits a structured log line with batch_limit and concurrency', async () => {
    const bells = Array.from({ length: 3 }, (_, i) => makeBell(`bell-${i}`));
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub(bells));
    vi.mocked(escalateBell).mockResolvedValue();

    await GET(makeRequest(`Bearer ${SECRET}`));

    const logCalls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const cronLog = logCalls.find(args => {
      try { return JSON.parse(args[0] as string).event === 'bell_cron'; }
      catch { return false; }
    });
    expect(cronLog).toBeDefined();
    const parsed = JSON.parse(cronLog![0] as string);
    expect(parsed).toMatchObject({
      event: 'bell_cron',
      processed: 3,
      failed: 0,
      batch_limit: 50,
      concurrency: 10,
    });
  });
});

describe('GET /api/lantern/cron — concurrency cap', () => {
  it('never has more than CONCURRENCY (10) workers in flight at once', async () => {
    // The assertions here are bounds, not exact values — `≤10` and `>1`. CI
    // scheduler jitter cannot violate a bound, so this test is structurally
    // stable rather than empirically stable. A regression that removed the cap
    // would push highWater toward 30; cap=1 or any serial execution would pin
    // highWater at 1 and fail the `>1` assertion.
    const bells = Array.from({ length: 30 }, (_, i) => makeBell(`bell-${i}`));
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub(bells));

    let inFlight = 0;
    let highWater = 0;
    vi.mocked(escalateBell).mockImplementation(async () => {
      inFlight++;
      if (inFlight > highWater) highWater = inFlight;
      // Yield to the event loop so other workers can start before this one resolves
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
    });

    await GET(makeRequest(`Bearer ${SECRET}`));

    expect(highWater).toBeLessThanOrEqual(10);
    expect(highWater).toBeGreaterThan(1);
    expect(escalateBell).toHaveBeenCalledTimes(30);
  });
});

describe('GET /api/lantern/cron — per-bell failure isolation', () => {
  it('reports failed count without poisoning successful workers', async () => {
    const bells = Array.from({ length: 5 }, (_, i) => makeBell(`bell-${i}`));
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub(bells));

    vi.mocked(escalateBell).mockImplementation(async (id: string) => {
      if (id === 'bell-2') throw new Error('notify failed');
    });

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(escalateBell).toHaveBeenCalledTimes(5);
    expect(body).toEqual({ processed: 5, failed: 1 });

    // The error-detail log line fires when failures > 0.
    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const escalationErrors = errorCalls.find(args => args[0] === '[bell:cron] escalation errors');
    expect(escalationErrors).toBeDefined();
  });
});

describe('GET /api/lantern/cron — empty due-set', () => {
  it('returns 200 with zero counters and never calls escalateBell', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub([]));

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(body).toEqual({ processed: 0, failed: 0 });
    expect(escalateBell).not.toHaveBeenCalled();

    // No escalation-error console.error because failed=0
    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const escalationErrors = errorCalls.find(args => args[0] === '[bell:cron] escalation errors');
    expect(escalationErrors).toBeUndefined();
  });
});
