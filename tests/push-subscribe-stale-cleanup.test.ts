import { describe, it, expect, vi, beforeEach } from 'vitest';

// B6 regression: subscribe route must DELETE same-(user, household) rows whose
// endpoint differs and was created >60s ago. Falsifiability: removing the
// db.delete chain in the route turns the "calls db.delete with the dedup
// predicate" assertion red.

const {
  mockInsert, mockValues, mockOnConflictDoUpdate,
  mockDelete, mockWhere,
} = vi.hoisted(() => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });
  return { mockInsert, mockValues, mockOnConflictDoUpdate, mockDelete, mockWhere };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    delete: mockDelete,
  },
}));

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    _body: unknown;
    constructor(_url: string, init?: { body?: string }) {
      this._body = init?.body ? JSON.parse(init.body) : {};
    }
    async json() { return this._body; }
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
  authError: (err: unknown, _tag?: string, fallback = 'Error') => {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      _body: { error: raw || fallback },
      status: 401,
      json: async () => ({ error: raw || fallback }),
    };
  },
}));

import { POST } from '@/app/api/push/subscribe/route';
import { requireHousehold } from '@/lib/auth/household';
import { pushSubscriptions } from '@/lib/db/schema';
import { NextRequest } from 'next/server';

const MOCK_USER = { id: 'user-uuid-1', householdId: 'hh-uuid-1' };
const VALID_BODY = {
  endpoint: 'https://fcm.example.com/push/abc',
  keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
};

function makeReq(body: unknown) {
  return new NextRequest('https://app.test/api/push/subscribe', {
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireHousehold).mockResolvedValue({ user: MOCK_USER } as Awaited<ReturnType<typeof requireHousehold>>);
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  mockOnConflictDoUpdate.mockResolvedValue(undefined);
  mockDelete.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue(undefined);
});

describe('POST /api/push/subscribe — B6 stale-endpoint cleanup', () => {
  it('calls db.delete(pushSubscriptions).where(...) after the upsert', async () => {
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);

    expect(mockDelete).toHaveBeenCalledWith(pushSubscriptions);
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it('passes a predicate object (drizzle SQL chunk) into where()', async () => {
    await POST(makeReq(VALID_BODY));
    const arg = mockWhere.mock.calls[0]?.[0];
    expect(arg, 'where() must receive a drizzle predicate, not undefined').toBeDefined();
    expect(typeof arg).toBe('object');
  });

  it('does NOT delete when requireHousehold rejects (auth gate fires before delete)', async () => {
    vi.mocked(requireHousehold).mockRejectedValueOnce(new Error('Not signed in'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does NOT delete when body validation fails (missing endpoint short-circuits before delete)', async () => {
    const res = await POST(makeReq({ keys: { p256dh: 'k', auth: 'a' } }));
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/push/subscribe — B6 source-grep falsifiability gate', () => {
  it('route source contains the 60-second cleanup interval and ne(endpoint) predicate', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/api/push/subscribe/route.ts'),
      'utf-8',
    );
    // Removing the cleanup block turns one of these red.
    expect(src).toMatch(/db\.delete\(pushSubscriptions\)/);
    expect(src).toMatch(/ne\(pushSubscriptions\.endpoint,\s*endpoint\)/);
    expect(src).toMatch(/interval\s*'60 seconds'/);
  });
});
