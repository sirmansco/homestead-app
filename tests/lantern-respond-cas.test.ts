// B1 — CAS race: two concurrent on_my_way responders against a single ringing
// lantern must produce exactly one claim. The losing UPDATE sees a WHERE
// status='ringing' AND handled_by_user_id IS NULL clause that no longer matches
// (because the winner's UPDATE has already mutated the row), so it returns 0
// rows from .returning(). The losing user's response row is still recorded —
// only the claim is mutually exclusive.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    constructor(public url: string, private init: RequestInit = {}) {}
    get nextUrl() { return new URL(this.url); }
    async json() { return JSON.parse(this.init.body as string); }
    headers = { get: () => null };
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

vi.mock('@/lib/api-error', () => ({
  apiError: (_e: unknown, msg: string, status = 500) => ({
    _body: { error: msg }, status, json: async () => ({ error: msg }),
  }),
  authError: () => ({
    _body: { error: 'auth_error' }, status: 401, json: async () => ({ error: 'auth_error' }),
  }),
}));

vi.mock('@/lib/notify', () => ({
  notifyLanternResponse: vi.fn().mockResolvedValue({ kind: 'sent' }),
}));

vi.mock('@/lib/auth/household', () => ({
  // C3: route now uses requireHousehold which returns user + household.
  requireHousehold: vi.fn().mockResolvedValue({
    user: { id: 'usr-a', clerkUserId: 'user_clerk_1', householdId: 'hh-uuid-1', role: 'watcher', villageGroup: 'covey' },
    household: { id: 'hh-uuid-1' },
    userId: 'user_clerk_1',
    orgId: 'org-1',
  }),
}));

vi.mock('@/lib/lantern-escalation', () => ({
  escalateLantern: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/lantern/[id]/respond/route';
import { db } from '@/lib/db';

const LANTERN_ID = '11111111-2222-3333-4444-555555555555';
const HH_ID      = 'hh-uuid-1';
const USER_A     = 'usr-a';

const ringingLantern = () => ({
  id: LANTERN_ID,
  householdId: HH_ID,
  status: 'ringing' as const,
  handledByUserId: null,
  escalatedAt: null,
  createdAt: new Date(),
});

function selectStub(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const t = () => c;
  c.from = t; c.where = t; c.limit = t; c.innerJoin = t;
  c.then = (r: (v: unknown) => void) => { r(rows); return c; };
  c.catch = () => c; c.finally = () => c;
  return c;
}

function updateChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const t = () => c;
  c.set = t; c.where = t;
  c.returning = () => Promise.resolve(rows);
  c.then = (r: (v: unknown) => void) => { r(rows); return c; };
  c.catch = () => c; c.finally = () => c;
  return c;
}

function reqWith(body: unknown) {
  return {
    url: `http://localhost/api/lantern/${LANTERN_ID}/respond`,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

const params = Promise.resolve({ id: LANTERN_ID });

describe('B1 — POST /api/lantern/[id]/respond CAS race', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('first on_my_way claims; second on_my_way records response but does not claim', async () => {
    // Each call: SELECT lantern (still appears ringing in cached snapshot)
    // → SELECT user row (exists) → SELECT existing response (none) → INSERT
    // response → UPDATE lanterns CAS → returning rows.
    let updateCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      // C3: requireHousehold provides the user row, so the route's own
      // SELECTs are: lantern → existing-response. We sequence by call count.
      const callIndex = vi.mocked(db.select).mock.calls.length;
      if (callIndex % 2 === 1) return selectStub([ringingLantern()]) as unknown as ReturnType<typeof db.select>;
      return selectStub([]) as unknown as ReturnType<typeof db.select>;
    });

    vi.mocked(db.insert).mockReturnValue({
      values: () => Promise.resolve(undefined),
    } as unknown as ReturnType<typeof db.insert>);

    // First UPDATE wins (returns 1 row). Second UPDATE loses (returns 0).
    vi.mocked(db.update).mockImplementation(() => {
      updateCall += 1;
      const winnerRows = updateCall === 1 ? [{ id: LANTERN_ID }] : [];
      return updateChain(winnerRows) as unknown as ReturnType<typeof db.update>;
    });

    const r1 = await POST(reqWith({ response: 'on_my_way' }), { params });
    const r2 = await POST(reqWith({ response: 'on_my_way' }), { params });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json();
    const b2 = await r2.json();

    expect(b1.claimed).toBe(true);
    expect(b2.claimed).toBe(false);

    // Both UPDATEs ran (CAS was attempted twice — second saw 0 rows).
    expect(updateCall).toBe(2);
  });

  it('on_my_way against already-handled lantern returns 409 before CAS attempt', async () => {
    // Snapshot SELECT shows lantern.status='handled' → route short-circuits
    // with 409 and never reaches the CAS UPDATE.
    vi.mocked(db.select).mockImplementation(() => {
      const callIndex = vi.mocked(db.select).mock.calls.length;
      if (callIndex === 1) return selectStub([{ ...ringingLantern(), status: 'handled', handledByUserId: USER_A }]) as unknown as ReturnType<typeof db.select>;
      return selectStub([]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await POST(reqWith({ response: 'on_my_way' }), { params });
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });
});
