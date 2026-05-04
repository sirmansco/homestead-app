// B1 — CAS race: PATCH /api/lantern/[id] cancellation must be atomic against
// concurrent /respond on_my_way that already terminated the lantern. The
// route's UPDATE WHERE status='ringing' returns 0 rows when the snapshot is
// stale, and the route returns 409 instead of silently overwriting the
// winner's handled-state.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    constructor(public url: string, private init: RequestInit = {}) {}
    async json() { return JSON.parse(this.init.body as string); }
    headers = { get: () => null };
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body, status: init?.status ?? 200, json: async () => body,
    }),
  },
}));

vi.mock('@/lib/api-error', () => ({
  apiError: (_e: unknown, msg: string, s = 500) => ({ status: s, json: async () => ({ error: msg }) }),
  authError: () => ({ status: 401, json: async () => ({ error: 'auth_error' }) }),
}));

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn().mockResolvedValue({
    household: { id: 'hh-uuid-1', name: 'X' },
    user: { id: 'usr-1', role: 'keeper' },
  }),
}));

import { PATCH } from '@/app/api/lantern/[id]/route';
import { db } from '@/lib/db';

const HH_ID = 'hh-uuid-1';
const LANTERN_ID = '11111111-2222-3333-4444-555555555555';

function selectStub(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const t = () => c;
  c.from = t; c.where = t; c.limit = t;
  c.then = (r: (v: unknown) => void) => { r(rows); return c; };
  c.catch = () => c; c.finally = () => c;
  return c;
}

function updateChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const t = () => c;
  c.set = t; c.where = t;
  c.returning = () => Promise.resolve(rows);
  return c;
}

function req(body: unknown) {
  return { json: async () => body, headers: { get: () => null } } as unknown as Parameters<typeof PATCH>[0];
}

const params = Promise.resolve({ id: LANTERN_ID });

describe('B1 — PATCH /api/lantern/[id] CAS race', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cancel succeeds when CAS wins', async () => {
    vi.mocked(db.select).mockReturnValue(selectStub([{
      id: LANTERN_ID, householdId: HH_ID, status: 'ringing',
    }]) as unknown as ReturnType<typeof db.select>);

    vi.mocked(db.update).mockReturnValue(
      updateChain([{ id: LANTERN_ID }]) as unknown as ReturnType<typeof db.update>,
    );

    const res = await PATCH(req({ status: 'cancelled' }), { params });
    expect(res.status).toBe(200);
  });

  it('cancel returns 409 when CAS loses (concurrent handler already terminated lantern)', async () => {
    // Snapshot SELECT still says 'ringing' (stale read) — the race window —
    // but the UPDATE WHERE status='ringing' clause sees 0 rows because
    // another tx already flipped status='handled'. Route must return 409,
    // not silently mutate.
    vi.mocked(db.select).mockReturnValue(selectStub([{
      id: LANTERN_ID, householdId: HH_ID, status: 'ringing',
    }]) as unknown as ReturnType<typeof db.select>);

    vi.mocked(db.update).mockReturnValue(
      updateChain([]) as unknown as ReturnType<typeof db.update>,
    );

    const res = await PATCH(req({ status: 'cancelled' }), { params });
    expect(res.status).toBe(409);
  });

  it('PATCH on lantern from another household returns 403 before CAS attempt', async () => {
    vi.mocked(db.select).mockReturnValue(selectStub([{
      id: LANTERN_ID, householdId: 'other-hh', status: 'ringing',
    }]) as unknown as ReturnType<typeof db.select>);

    const res = await PATCH(req({ status: 'cancelled' }), { params });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });
});
