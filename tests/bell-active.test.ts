import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before the module under test is imported ──────────

// Clerk auth — returns a fixed Clerk user ID
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Drizzle db — replaced entirely with a controllable fake
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

// next/server — minimal NextResponse shim
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// api-error — passthrough so errors surface clearly in tests
vi.mock('@/lib/api-error', () => ({
  apiError: (_err: unknown, msg: string) => ({
    _body: { error: msg },
    status: 500,
    json: async () => ({ error: msg }),
  }),
  authError: (err: unknown, _tag?: string, fallback = 'Something went wrong') => {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw === 'Not signed in') return {
      _body: { error: 'not_signed_in' },
      status: 401,
      json: async () => ({ error: 'not_signed_in' }),
    };
    if (raw === 'No access') return {
      _body: { error: 'no_access' },
      status: 403,
      json: async () => ({ error: 'no_access' }),
    };
    if (raw === 'No active household') return {
      _body: { error: 'no_household' },
      status: 409,
      json: async () => ({ error: 'no_household' }),
    };
    return {
      _body: { error: fallback },
      status: 500,
      json: async () => ({ error: fallback }),
    };
  },
}));

// ── Import after mocks are wired ─────────────────────────────────────────────
import { GET } from '@/app/api/bell/active/route';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLERK_ID = 'clerk_parent_1';
const HOUSEHOLD_ID = 'hh-001';
const PARENT_USER_ID = 'user-parent-1';
const CAREGIVER_USER_ID = 'user-caregiver-1';
const CAREGIVER_NAME = 'Jane Smith';

const future = new Date(Date.now() + 3_600_000).toISOString(); // 1 hour from now
const past   = new Date(Date.now() - 3_600_000).toISOString(); // 1 hour ago

function makeBell(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bell-001',
    householdId: HOUSEHOLD_ID,
    createdByUserId: PARENT_USER_ID,
    reason: 'Sick kid',
    note: null,
    startsAt: new Date().toISOString(),
    endsAt: future,
    status: 'ringing',
    handledByUserId: null,
    handledAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Build a chainable Drizzle query stub that resolves to `rows`.
// Covers: db.select().from().where().orderBy()  and  db.select({...}).from().where()
// Returns a plain thenable (not a real Promise) so Symbol.toStringTag stays writable.
function makeSelectStub(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain['from']    = () => chain;
  chain['where']   = () => chain;
  chain['orderBy'] = () => chain;
  chain['limit']   = () => chain;
  chain['then']    = (resolve: (v: unknown) => void, _reject?: unknown) => {
    resolve(rows);
    return chain;
  };
  chain['catch']   = (_fn: unknown) => chain;
  chain['finally'] = (_fn: unknown) => chain;
  return chain;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/bell/active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: CLERK_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no household row', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub([]));

    const res = await GET();
    const body = await res.json();
    expect(body.bells).toEqual([]);
  });

  it('returns a ringing bell with no handledByName', async () => {
    const bell = makeBell({ status: 'ringing', handledByUserId: null });

    // Call order: (1) users, (2) bells, (3) bellResponses.
    // No handler-users call — handledByUserId is null so handlerIds is empty.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: PARENT_USER_ID, householdId: HOUSEHOLD_ID, role: 'parent' }]))
      .mockReturnValueOnce(makeSelectStub([bell]))
      .mockReturnValueOnce(makeSelectStub([]));

    const res = await GET();
    const body = await res.json();

    expect(body.bells).toHaveLength(1);
    expect(body.bells[0].status).toBe('ringing');
    expect(body.bells[0].handledByName).toBeNull();
  });

  // ── Regression: accepted Bell must remain visible ────────────────────────
  it('returns a handled bell with handledByName populated', async () => {
    const bell = makeBell({ status: 'handled', handledByUserId: CAREGIVER_USER_ID });

    // Call order: (1) users, (2) bells, (3) bellResponses, (4) handler-users.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: PARENT_USER_ID, householdId: HOUSEHOLD_ID, role: 'parent' }]))
      .mockReturnValueOnce(makeSelectStub([bell]))
      .mockReturnValueOnce(makeSelectStub([]))
      .mockReturnValueOnce(makeSelectStub([{ id: CAREGIVER_USER_ID, name: CAREGIVER_NAME }]));

    const res = await GET();
    const body = await res.json();

    expect(body.bells).toHaveLength(1);
    expect(body.bells[0].status).toBe('handled');
    expect(body.bells[0].handledByName).toBe(CAREGIVER_NAME);
  });

  it('excludes cancelled bells', async () => {
    // DB simulates the status IN ('ringing','handled') filter — cancelled bell not returned.
    // Empty bells path: (1) users, (2) bells. bellResponses + handler-users skipped (bellIds empty).
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: PARENT_USER_ID, householdId: HOUSEHOLD_ID, role: 'parent' }]))
      .mockReturnValueOnce(makeSelectStub([]));

    const res = await GET();
    const body = await res.json();
    expect(body.bells).toHaveLength(0);
  });

  it('excludes expired bells (endsAt in the past)', async () => {
    // DB simulates the gt(bells.endsAt, now()) filter — expired bell not returned.
    // Empty bells path: (1) users, (2) bells.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: PARENT_USER_ID, householdId: HOUSEHOLD_ID, role: 'parent' }]))
      .mockReturnValueOnce(makeSelectStub([]));

    const res = await GET();
    const body = await res.json();
    expect(body.bells).toHaveLength(0);
  });

  it('sorts ringing bells before handled bells', async () => {
    const ringing = makeBell({ id: 'bell-ringing', status: 'ringing', handledByUserId: null, createdAt: new Date(Date.now() - 1000).toISOString() });
    const handled = makeBell({ id: 'bell-handled', status: 'handled', handledByUserId: CAREGIVER_USER_ID, createdAt: new Date().toISOString() });

    // DB returns handled first (simulating createdAt DESC order); route sort must flip them.
    // Call order: (1) users, (2) bells, (3) bellResponses, (4) handler-users.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: PARENT_USER_ID, householdId: HOUSEHOLD_ID, role: 'parent' }]))
      .mockReturnValueOnce(makeSelectStub([handled, ringing]))
      .mockReturnValueOnce(makeSelectStub([]))
      .mockReturnValueOnce(makeSelectStub([{ id: CAREGIVER_USER_ID, name: CAREGIVER_NAME }]));

    const res = await GET();
    const body = await res.json();

    expect(body.bells).toHaveLength(2);
    expect(body.bells[0].id).toBe('bell-ringing');
    expect(body.bells[1].id).toBe('bell-handled');
  });
});
