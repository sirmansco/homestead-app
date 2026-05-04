import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    $count: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return { ...actual, requireUser: vi.fn() };
});

vi.mock('@/lib/notify', () => ({
  notifyShiftCancelled: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: { deleteUser: vi.fn().mockResolvedValue({}) },
  }),
}));

import { requireUser } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { DELETE as accountDelete } from '@/app/api/account/route';

// ── Helpers ─────────────────────────────────────────────────────────────────

type Headers = Record<string, string | null>;

function buildReq(opts: {
  csrfHeader?: string | null;
  confirm?: string | null;
}) {
  const headers: Headers = {};
  if (opts.csrfHeader !== undefined) headers['x-covey-confirm'] = opts.csrfHeader;
  return {
    nextUrl: {
      searchParams: { get: (k: string) => k === 'confirm' ? (opts.confirm ?? null) : null },
    },
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as Parameters<typeof accountDelete>[0];
}

function mockUser(clerkUserId: string) {
  vi.mocked(requireUser).mockResolvedValue({
    userId: clerkUserId,
  } as unknown as Awaited<ReturnType<typeof requireUser>>);
}

function makeSelectChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t;
  chain['where'] = t;
  chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeDeleteChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

// Wires DB mocks deeply enough that the route can reach its happy path.
function wireHappyPathDb(clerkUserId: string) {
  let selectCall = 0;
  vi.mocked(db.select).mockImplementation(() => {
    selectCall += 1;
    if (selectCall === 1) {
      return makeSelectChain([{ id: 'usr-1', clerkUserId, householdId: 'hh-1' }]) as unknown as ReturnType<typeof db.select>;
    }
    return makeSelectChain([]) as unknown as ReturnType<typeof db.select>;
  });
  vi.mocked(db.delete).mockReturnValue(makeDeleteChain([]) as unknown as ReturnType<typeof db.delete>);
  vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as unknown as ReturnType<typeof db.update>);
  vi.mocked(db.$count).mockResolvedValue(0); // no past rows → user row deleted
}

describe('B3 — DELETE /api/account drive-by protections', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects with 403 when CSRF header is missing — drive-by form post', async () => {
    mockUser('clerk_user_b3_csrf_missing');
    const res = await accountDelete(buildReq({ csrfHeader: null, confirm: 'yes-delete-my-data' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/CSRF/i);
    // Critical: DB writes never executed.
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects with 403 when CSRF header value is wrong', async () => {
    mockUser('clerk_user_b3_csrf_wrong');
    const res = await accountDelete(buildReq({ csrfHeader: 'lol', confirm: 'yes-delete-my-data' }));
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('rate-limits a second delete attempt from the same user within 1 hour', async () => {
    const clerkUserId = 'clerk_user_b3_ratelimit';
    mockUser(clerkUserId);

    // First call: succeeds (full happy path).
    wireHappyPathDb(clerkUserId);
    const first = await accountDelete(buildReq({ csrfHeader: 'yes-delete-my-data', confirm: 'yes-delete-my-data' }));
    expect(first.status).toBe(200);

    // Second call: same userId, fresh DB mocks. Rate limit must fire.
    vi.clearAllMocks();
    mockUser(clerkUserId);
    wireHappyPathDb(clerkUserId);
    const second = await accountDelete(buildReq({ csrfHeader: 'yes-delete-my-data', confirm: 'yes-delete-my-data' }));
    expect(second.status).toBe(429);
    // DB writes must not have run on the rate-limited call.
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('still requires the ?confirm= query param even with the CSRF header set', async () => {
    mockUser('clerk_user_b3_no_confirm');
    const res = await accountDelete(buildReq({ csrfHeader: 'yes-delete-my-data', confirm: null }));
    expect(res.status).toBe(400);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('happy path: CSRF header + confirm param + first attempt → 200', async () => {
    const clerkUserId = 'clerk_user_b3_happy';
    mockUser(clerkUserId);
    wireHappyPathDb(clerkUserId);
    const res = await accountDelete(buildReq({ csrfHeader: 'yes-delete-my-data', confirm: 'yes-delete-my-data' }));
    expect(res.status).toBe(200);
  });
});
