import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { notifyShiftCancelled } from '@/lib/notify';
import { DELETE as accountDelete } from '@/app/api/account/route';

const CLERK_ID = 'clerk_user_1';
const USER_ID = 'user-1';
const HH_ID = 'hh-1';

// Each test must use a distinct clerkUserId so the route's per-user
// rate limit (1 delete attempt per hour, keyed by userId) doesn't fire
// on the second-and-later test in the file.
function mockUser(clerkUserId: string = CLERK_ID) {
  vi.mocked(requireUser).mockResolvedValue({
    userId: clerkUserId,
  } as unknown as Awaited<ReturnType<typeof requireUser>>);
}

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
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

function makeDeleteChain(rows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain(rows: Row[] = []) {
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

function confirmReq() {
  return {
    nextUrl: { searchParams: { get: (k: string) => k === 'confirm' ? 'yes-delete-my-data' : null } },
    headers: { get: (k: string) => k === 'x-covey-confirm' ? 'yes-delete-my-data' : null },
  } as unknown as Parameters<typeof accountDelete>[0];
}

function setupDbForDeletion(futureShifts: Row[]) {
  let selectCall = 0;
  vi.mocked(db.select).mockImplementation(() => {
    selectCall += 1;
    // First call: users rows
    if (selectCall === 1) {
      return makeSelectChain([{
        id: USER_ID, clerkUserId: CLERK_ID, householdId: HH_ID,
      }]) as unknown as ReturnType<typeof db.select>;
    }
    // Subsequent calls: future whistles to cancel
    return makeSelectChain(futureShifts) as unknown as ReturnType<typeof db.select>;
  });

  vi.mocked(db.delete).mockReturnValue(makeDeleteChain([]) as unknown as ReturnType<typeof db.delete>);

  let updateCall = 0;
  vi.mocked(db.update).mockImplementation(() => {
    updateCall += 1;
    // 1st update: release claimed whistles (no returning)
    if (updateCall === 1) return makeUpdateChain([]) as unknown as ReturnType<typeof db.update>;
    // 2nd update: cancel future whistles
    if (updateCall === 2) return makeUpdateChain(futureShifts.map(s => ({ id: s.id }))) as unknown as ReturnType<typeof db.update>;
    // 3rd+: past shift anonymize or user update
    return makeUpdateChain([]) as unknown as ReturnType<typeof db.update>;
  });

  vi.mocked(db.$count).mockResolvedValue(1); // pastMineExist > 0 → anonymize path
}

describe('F-P3-G — account DELETE notifies shift claimers on bulk cancel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('two future claimed whistles → notifyShiftCancelled called twice', async () => {
    mockUser('clerk_user_obs_1');
    setupDbForDeletion([
      { id: 'shift-1', claimedByUserId: 'claimer-1' },
      { id: 'shift-2', claimedByUserId: 'claimer-2' },
    ]);

    const res = await accountDelete(confirmReq());
    expect(res.status).toBe(200);
    expect(notifyShiftCancelled).toHaveBeenCalledTimes(2);
    expect(notifyShiftCancelled).toHaveBeenCalledWith('shift-1', 'claimer-1');
    expect(notifyShiftCancelled).toHaveBeenCalledWith('shift-2', 'claimer-2');
  });

  it('future whistles with no claimer → notifyShiftCancelled not called', async () => {
    mockUser('clerk_user_obs_2');
    setupDbForDeletion([
      { id: 'shift-1', claimedByUserId: null },
      { id: 'shift-2', claimedByUserId: null },
    ]);

    const res = await accountDelete(confirmReq());
    expect(res.status).toBe(200);
    expect(notifyShiftCancelled).not.toHaveBeenCalled();
  });

  it('notifyShiftCancelled throwing does not abort deletion — still 200', async () => {
    mockUser('clerk_user_obs_3');
    setupDbForDeletion([{ id: 'shift-1', claimedByUserId: 'claimer-1' }]);
    vi.mocked(notifyShiftCancelled).mockRejectedValueOnce(new Error('push failed'));

    const res = await accountDelete(confirmReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('no future whistles → notifyShiftCancelled not called', async () => {
    mockUser('clerk_user_obs_4');
    setupDbForDeletion([]);

    const res = await accountDelete(confirmReq());
    expect(res.status).toBe(200);
    expect(notifyShiftCancelled).not.toHaveBeenCalled();
  });
});
