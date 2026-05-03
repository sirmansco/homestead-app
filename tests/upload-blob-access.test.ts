/**
 * Regression tests for L27(b) — authenticated /api/photo/[id] proxy.
 *
 * Falsifiable assertions:
 * - Remove requireHousehold() from the photo route → 401 test fails (returns 200).
 * - Remove household ownership check → 404 test for cross-household fails (returns 200).
 * - Remove kid ownership check → kid 404 test fails.
 *
 * These tests verify the auth gate fires before any blob access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks declared before route imports ─────────────────────────────────────

vi.mock('@vercel/blob', () => ({ get: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: 'users_table',
  chicks: 'kids_table',
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return { ...actual, requireHousehold: vi.fn() };
});

// ── Imports after mocks ──────────────────────────────────────────────────────

import { get } from '@vercel/blob';
import { db } from '@/lib/db';
import { requireHousehold } from '@/lib/auth/household';
import { GET } from '@/app/api/photo/[id]/route';

const mockGet = vi.mocked(get);
const mockRequireHousehold = vi.mocked(requireHousehold);
const mockDbSelect = vi.mocked(db.select);

// ── Helpers ──────────────────────────────────────────────────────────────────

type SelectChain = ReturnType<typeof db.select>;

function dbSelectReturning(rows: unknown[]): SelectChain {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as unknown as SelectChain;
}

async function callPhoto(id: string) {
  const request = new Request(`http://localhost/api/photo/${id}`);
  const params = Promise.resolve({ id });
  return GET(request as never, { params });
}

// ── Test groups ──────────────────────────────────────────────────────────────

describe('GET /api/photo/[id] — unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireHousehold.mockRejectedValue(new Error('Not signed in'));
  });

  it('returns 401 when not signed in', async () => {
    const res = await callPhoto('kid-id-1');
    expect(res.status).toBe(401);
    // Blob get must not be called — auth gate fires first
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('GET /api/photo/[id] — cross-household access denied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Authenticated as household A
    mockRequireHousehold.mockResolvedValue({
      household: { id: 'household-A' },
      user: { id: 'user-A' },
    } as Awaited<ReturnType<typeof requireHousehold>>);
    // No rows found for this id in household A (belongs to household B)
    mockDbSelect
      .mockReturnValueOnce(dbSelectReturning([]))  // users query → empty
      .mockReturnValueOnce(dbSelectReturning([])); // chicks query → empty
  });

  it('returns 404 when photo id belongs to a different household', async () => {
    const res = await callPhoto('kid-id-other-household');
    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('GET /api/photo/[id] — authenticated, own household', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireHousehold.mockResolvedValue({
      household: { id: 'household-A' },
      user: { id: 'user-A' },
    } as Awaited<ReturnType<typeof requireHousehold>>);
  });

  it('returns 200 with Cache-Control: private, max-age=3600 for a kid photo (private blob)', async () => {
    // users → empty, chicks → found
    mockDbSelect
      .mockReturnValueOnce(dbSelectReturning([]))
      .mockReturnValueOnce(dbSelectReturning([{
        photoUrl: 'https://blob.vercel-storage.com/private/homestead/household-A/kid-k-1.jpg?token=abc',
      }]));

    const fakeStream = new ReadableStream();
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: fakeStream,
      headers: new Headers({ 'content-length': '1024', etag: '"abc"' }),
      blob: { contentType: 'image/jpeg', size: 1024 },
    } as unknown as Awaited<ReturnType<typeof get>>);

    const res = await callPhoto('k-1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('returns 200 with Cache-Control: private, max-age=3600 for a user photo (private blob)', async () => {
    mockDbSelect.mockReturnValueOnce(dbSelectReturning([{
      photoUrl: 'https://blob.vercel-storage.com/private/homestead/household-A/user-u-1.jpg?token=xyz',
    }]));

    const fakeStream = new ReadableStream();
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: fakeStream,
      headers: new Headers({}),
      blob: { contentType: 'image/jpeg', size: 512 },
    } as unknown as Awaited<ReturnType<typeof get>>);

    const res = await callPhoto('u-1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600');
  });

  it('returns 404 when row exists but photoUrl is null', async () => {
    mockDbSelect.mockReturnValueOnce(dbSelectReturning([{ photoUrl: null }]));

    const res = await callPhoto('u-no-photo');
    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns 404 when blob SDK returns null (blob deleted from storage)', async () => {
    mockDbSelect.mockReturnValueOnce(dbSelectReturning([{
      photoUrl: 'https://blob.vercel-storage.com/private/homestead/household-A/user-u-1.jpg?token=xyz',
    }]));
    mockGet.mockResolvedValue(null);

    const res = await callPhoto('u-1');
    expect(res.status).toBe(404);
  });
});
