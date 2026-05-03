import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// L1 regression: GET /api/circle/invite-family/accept must not mutate state.
// The old code called db.update(familyInvites).set({ status: 'accepted' }) inside
// the GET handler — any anonymous requester (crawler, link preview bot, duplicate
// browser load) would consume the token and leave the real user with a "used" error.
//
// After fix: GET is read-only preview. POST (authenticated) consumes the token.

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/auth/household', () => ({
  requireUser: vi.fn(),
}));

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/household';

const makeSelectChain = (result: unknown[]) => {
  const chain = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
};

const makeUpdateChain = (result: unknown[]) => {
  const chain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(result);
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();
});

const pendingInvite = {
  id: 'inv-1',
  parentName: 'Alice',
  parentEmail: 'alice@example.com',
  villageGroup: 'covey',
  status: 'pending',
  fromName: 'Bob',
};

describe('GET /api/circle/invite-family/accept — side-effect-free', () => {
  it('returns invite metadata without calling db.update', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([pendingInvite]) as ReturnType<typeof db.select>);

    const { GET } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept?token=abc123');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.invite.fromName).toBe('Bob');
    // Critical: GET must not have called db.update
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('returns 410 for used invite without calling db.update', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ ...pendingInvite, status: 'accepted' }]) as ReturnType<typeof db.select>);

    const { GET } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept?token=used');
    const res = await GET(req);

    expect(res.status).toBe(410);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown token without calling db.update', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as ReturnType<typeof db.select>);

    const { GET } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept?token=unknown');
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });
});

describe('POST /api/circle/invite-family/accept — authenticated consume', () => {
  it('requires auth — returns 401/403 if not signed in', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error('Not signed in'));

    const { POST } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'abc123' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
    // Must NOT have tried to mutate the DB before auth resolved
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('consumes the invite token when authenticated', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-1' });
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ ...pendingInvite, acceptedHouseholdId: null }]) as ReturnType<typeof db.select>);
    const updateChain = makeUpdateChain([{ ...pendingInvite, status: 'accepted' }]);
    vi.mocked(db.update).mockReturnValue(updateChain as ReturnType<typeof db.update>);

    const { POST } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'abc123' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(db.update)).toHaveBeenCalled();
  });

  it('returns 410 if token already consumed by the time POST runs', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'clerk-1' });
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ ...pendingInvite, status: 'accepted' }]) as ReturnType<typeof db.select>);

    const { POST } = await import('@/app/api/circle/invite-family/accept/route');
    const req = new NextRequest('http://localhost/api/circle/invite-family/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'abc123' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
  });
});
