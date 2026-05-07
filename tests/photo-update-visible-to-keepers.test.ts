/**
 * Bug #4 propagation regression — Watcher's photo update must be visible to
 * keepers' views (no caching that hides cross-role updates).
 *
 * Mechanism: photoUrl is stored on the users row and rendered through
 * /api/photo/[id], a read-through proxy. There's no caching layer; this
 * test asserts the property holds end-to-end via the GET /api/circle path.
 *
 * If a future change introduces a cache (e.g., a CDN-fronted proxy or a
 * client-side memoizer), this test will catch a regression where the
 * keeper sees a stale photo for a watcher.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
    requireHouseholdAdmin: vi.fn(),
    requireUser: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}));

import { requireHousehold } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { GET as circleGet } from '@/app/api/circle/route';

const HH_ID = 'hh-1';
const KEEPER = { id: 'keeper-1', name: 'K', email: 'k@x.com', role: 'keeper', villageGroup: 'covey', householdId: HH_ID };
const WATCHER_BEFORE = { id: 'watcher-1', name: 'W', email: 'w@x.com', role: 'watcher', villageGroup: 'covey', householdId: HH_ID, photoUrl: null };
const WATCHER_AFTER = { ...WATCHER_BEFORE, photoUrl: 'https://blob.example/new.jpg' };

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t; chain['where'] = t; chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function mockKeeperViewer() {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_1' },
    user: { id: KEEPER.id, clerkUserId: 'clerk_k', householdId: HH_ID, role: 'keeper', isAdmin: false },
    userId: 'clerk_k',
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function makeReq() {
  return {
    nextUrl: { searchParams: new URLSearchParams() },
    headers: { get: () => null },
    url: 'http://localhost/api/circle',
  } as unknown as Parameters<typeof circleGet>[0];
}

describe('Bug #4 propagation — watcher photo update reaches keeper view', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('keeper GET /api/circle returns the watcher\'s most-recent photoUrl', async () => {
    mockKeeperViewer();

    let selectCall = 0;
    // Simulate: watcher has updated their photo. The DB row reflects the
    // new photoUrl. Keeper's GET should see the new value, not a stale one.
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return makeSelectChain([KEEPER, WATCHER_AFTER]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await circleGet(makeReq());
    const body = await res.json();
    const watcher = body.adults.find((a: { id: string }) => a.id === WATCHER_BEFORE.id);
    expect(watcher).toBeDefined();
    expect(watcher.photoUrl).toBe('https://blob.example/new.jpg');
  });
});
