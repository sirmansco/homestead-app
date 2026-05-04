import { describe, it, expect, vi, beforeEach } from 'vitest';

// L18 regression: subscribe route must use onConflictDoUpdate instead of
// SELECT-then-INSERT. Reverting to the pre-B6 shape (adding back a db.select
// call before insert) must turn the "should not call db.select" assertion red.

const { mockInsert, mockValues, mockOnConflictDoUpdate, mockSelect, mockDelete, mockDeleteWhere } = vi.hoisted(() => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  const mockSelect = vi.fn();
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
  return { mockInsert, mockValues, mockOnConflictDoUpdate, mockSelect, mockDelete, mockDeleteWhere };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
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
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
  mockDeleteWhere.mockResolvedValue(undefined);
});

describe('POST /api/push/subscribe — L18 upsert correctness', () => {
  it('calls onConflictDoUpdate with target [userId, endpoint] and correct set', async () => {
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);

    expect(mockInsert).toHaveBeenCalledWith(pushSubscriptions);
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: MOCK_USER.id,
      householdId: MOCK_USER.householdId,
      endpoint: VALID_BODY.endpoint,
      p256dh: VALID_BODY.keys.p256dh,
      auth: VALID_BODY.keys.auth,
    }));
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: { p256dh: VALID_BODY.keys.p256dh, auth: VALID_BODY.keys.auth },
    }));
  });

  it('does NOT call db.select on pushSubscriptions (race-window-removal gate)', async () => {
    // Falsifiability gate: revert the route to SELECT-then-INSERT → this assertion goes red.
    await POST(makeReq(VALID_BODY));
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns 400 on missing endpoint', async () => {
    const res = await POST(makeReq({ keys: { p256dh: 'k', auth: 'a' } }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing keys', async () => {
    const res = await POST(makeReq({ endpoint: 'https://fcm.example.com/push/x' }));
    expect(res.status).toBe(400);
  });

  it('surfaces authError when requireHousehold throws', async () => {
    vi.mocked(requireHousehold).mockRejectedValueOnce(new Error('Not signed in'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });
});
